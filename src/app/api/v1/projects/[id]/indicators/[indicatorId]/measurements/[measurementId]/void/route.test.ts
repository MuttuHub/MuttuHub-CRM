// POST /api/v1/projects/:id/indicators/:indicatorId/measurements/:measurementId/void (S4 U4).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    medicionIndicador: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ medicionIndicador: { updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUnique } }),
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
  id: "med-1",
  proyecto_id: "pry-1",
  indicador_id: "ind-1",
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  valor: new Prisma.Decimal(10),
  observacion: null,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
};
const ctx = { params: Promise.resolve({ id: "pry-1", indicatorId: "ind-1", measurementId: "med-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "CERRADO" } as never);
  vi.mocked(db.medicionIndicador.findFirst).mockResolvedValue(fila as never);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue({ ...fila, anulado_at: new Date(), motivo_anulacion: "Error" });
});
afterEach(() => vi.clearAllMocks());

describe("POST measurement void", () => {
  it("voids with a motivo in any estado, keeps the row and audits ANULAR", async () => {
    const res = await POST(post({ motivo: "Error" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).medicion.motivo_anulacion).toBe("Error");
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ motivo_anulacion: "Error" }) }),
    );
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "ANULAR", entidad: "medicion", entidad_id: "med-1" }),
    );
  });

  it("answers 403 for a COORDINADOR, 404 for a missing project or measurement", async () => {
    authAs(coordinador);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(404);
    vi.mocked(db.medicionIndicador.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(404);
  });

  it("requires a non-empty motivo (400) and answers 409 when already voided", async () => {
    for (const body of [{}, { motivo: "  " }, { motivo: "x".repeat(501) }]) {
      expect((await POST(post(body), ctx)).status).toBe(400);
    }
    vi.mocked(db.medicionIndicador.findFirst).mockResolvedValueOnce({ ...fila, anulado_at: new Date(), motivo_anulacion: "a" } as never);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(409);
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(409);
  });
});
