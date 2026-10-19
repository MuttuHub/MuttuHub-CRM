// POST /api/v1/projects/:id/beneficiaries/:beneficiaryId/void (S4 U4).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    registroBeneficiario: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ registroBeneficiario: { updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUnique } }),
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
  id: "ben-1",
  proyecto_id: "pry-1",
  actividad_id: null,
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  cantidad: 20,
  observacion: null,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
};
const ctx = { params: Promise.resolve({ id: "pry-1", beneficiaryId: "ben-1" }) };

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
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "SUSPENDIDO" } as never);
  vi.mocked(db.registroBeneficiario.findFirst).mockResolvedValue(fila as never);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue({ ...fila, anulado_at: new Date(), motivo_anulacion: "Duplicado" });
});
afterEach(() => vi.clearAllMocks());

describe("POST beneficiary void", () => {
  it("voids with a motivo in any estado and audits ANULAR on `beneficiarios`", async () => {
    const res = await POST(post({ motivo: "Duplicado" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).registro.motivo_anulacion).toBe("Duplicado");
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "ANULAR", entidad: "beneficiarios", entidad_id: "ben-1" }),
    );
  });

  it("answers 403 for a COORDINADOR, 404 for missing rows, 400 without motivo, 409 when voided", async () => {
    authAs(coordinador);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.registroBeneficiario.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(404);
    expect((await POST(post({}), ctx)).status).toBe(400);
    vi.mocked(db.registroBeneficiario.findFirst).mockResolvedValueOnce({ ...fila, anulado_at: new Date(), motivo_anulacion: "a" } as never);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(409);
  });
});
