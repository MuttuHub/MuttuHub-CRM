// POST /api/v1/projects/:id/deliverables/:deliverableId/progress/:progressId/void (S4 U2).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/settings", () => ({
  getSemaforoParametrosV2: vi.fn(async () => ({ avance_requiere_medio: { valor: true, confirmado: false } })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    avanceEntregable: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ avanceEntregable: { updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUnique } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const fila = {
  id: "av-1",
  proyecto_id: "pry-1",
  entregable_id: "ent-1",
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  cantidad: new Prisma.Decimal(2),
  observacion: null,
  justificacion_exceso: null,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
};
const ctx = { params: Promise.resolve({ id: "pry-1", deliverableId: "ent-1", progressId: "av-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/x/void", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION" } as never);
  vi.mocked(db.avanceEntregable.findFirst).mockResolvedValue(fila as never);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue({ ...fila, anulado_at: new Date("2026-10-08T13:00:00.000Z"), anulado_por_id: "ger-1", motivo_anulacion: "Error de digitación" });
});
afterEach(() => vi.clearAllMocks());

describe("POST progress void", () => {
  it("is manager-only (403 for a COORDINADOR) and 404 for an unknown project", async () => {
    authAs(coordinador);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(404);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("requires a non-empty motivo of at most 500 characters", async () => {
    for (const body of [{}, { motivo: "" }, { motivo: "   " }, { motivo: "x".repeat(501) }, { motivo: "x", extra: 1 }]) {
      expect((await POST(post(body), ctx)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 404 when the avance is not one of this deliverable and project", async () => {
    vi.mocked(db.avanceEntregable.findFirst).mockResolvedValue(null);
    expect((await POST(post({ motivo: "Error" }), ctx)).status).toBe(404);
    expect(db.avanceEntregable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "av-1", entregable_id: "ent-1", proyecto_id: "pry-1" } }),
    );
  });

  it("answers 409 when the avance is already void, without updating or auditing", async () => {
    vi.mocked(db.avanceEntregable.findFirst).mockResolvedValue({ ...fila, anulado_at: new Date(), motivo_anulacion: "x" } as never);
    const res = await POST(post({ motivo: "Otra vez" }), ctx);
    expect(res.status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(logChange).not.toHaveBeenCalled();
  });

  it("answers 409 when a concurrent void wins the race (updateMany count 0)", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await POST(post({ motivo: "Error" }), ctx)).status).toBe(409);
    expect(logChange).not.toHaveBeenCalled();
  });

  it("voids in any estado, keeps the row and audits ANULAR with the motivo", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "CERRADO" } as never);
    const res = await POST(post({ motivo: "  Error de digitación " }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.avance).toMatchObject({ id: "av-1", motivo_anulacion: "Error de digitación", cuenta: false });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "av-1", anulado_at: null },
      data: { anulado_at: expect.any(Date), anulado_por_id: "ger-1", motivo_anulacion: "Error de digitación" },
    });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accion: "ANULAR",
        entidad: "avance",
        entidad_id: "av-1",
        proyecto_id: "pry-1",
        valor_nuevo: expect.objectContaining({ motivo_anulacion: "Error de digitación" }),
      }),
    );
  });
});
