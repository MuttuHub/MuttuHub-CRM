// POST /api/v1/projects/:id/activities/:activityId/progress/:reportId/void (AJ-01, S10).

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
  getSemaforoParametrosV2: vi.fn(async () => ({
    avance_requiere_medio: { valor: true, confirmado: false },
    tope_en_curso: { valor: 90, confirmado: false },
  })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findFirst: vi.fn() },
    reporteActividad: { findFirst: vi.fn() },
    soporteProyecto: { groupBy: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ reporteActividad: { updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUnique } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { POST } from "./route";

const responsable = { id: "resp-1", rol: "COORDINADOR" } as Usuario;
const otroCoordinador = { id: "coord-2", rol: "COORDINADOR" } as Usuario;
const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;

const fila = {
  id: "rep-1",
  proyecto_id: "pry-1",
  actividad_id: "act-1",
  fecha: new Date("2026-10-06T00:00:00.000Z"),
  porcentaje: new Prisma.Decimal(70),
  observacion: "Se ejecutó la fase 2",
  registrado_por_id: "resp-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  anulado_at: null,
  anulado_por_id: null,
  motivo_anulacion: null,
};
const ctx = { params: Promise.resolve({ id: "pry-1", activityId: "act-1", reportId: "rep-1" }) };

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
  authAs(responsable);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", miembros: [{ id: "m-1" }] } as never);
  vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-1", responsable_id: "resp-1" } as never);
  vi.mocked(db.reporteActividad.findFirst)
    .mockResolvedValueOnce(fila as never) // the "existente" lookup
    .mockResolvedValueOnce(fila as never); // the "ultimo" lookup
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue({ ...fila, anulado_at: new Date("2026-10-08T13:00:00.000Z"), anulado_por_id: "resp-1", motivo_anulacion: "Error de digitación" });
});
afterEach(() => vi.clearAllMocks());

describe("POST progress void", () => {
  it("is responsable-only (403 for another COORDINADOR), 404 for an unknown project", async () => {
    authAs(otroCoordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", miembros: [{ id: "m-1" }] } as never);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(403);
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(404);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("allows an ADMINISTRADOR/GERENCIA override even when not the responsable", async () => {
    authAs(gerencia);
    expect((await POST(post({ motivo: "Error" }), ctx)).status).toBe(200);
  });

  it("requires a non-empty motivo of at most 500 characters", async () => {
    for (const body of [{}, { motivo: "" }, { motivo: "   " }, { motivo: "x".repeat(501) }]) {
      vi.mocked(db.reporteActividad.findFirst).mockResolvedValueOnce(fila as never).mockResolvedValueOnce(fila as never);
      expect((await POST(post(body), ctx)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 404 when the report is not one of this activity and project", async () => {
    vi.mocked(db.reporteActividad.findFirst).mockReset().mockResolvedValueOnce(null);
    expect((await POST(post({ motivo: "Error" }), ctx)).status).toBe(404);
  });

  it("answers 409 when the report is already voided, without updating or auditing", async () => {
    vi.mocked(db.reporteActividad.findFirst).mockReset().mockResolvedValueOnce({ ...fila, anulado_at: new Date(), motivo_anulacion: "x" } as never);
    const res = await POST(post({ motivo: "Otra vez" }), ctx);
    expect(res.status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(logChange).not.toHaveBeenCalled();
  });

  it("answers 409 when the report is not the last one registered for the activity", async () => {
    vi.mocked(db.reporteActividad.findFirst)
      .mockReset()
      .mockResolvedValueOnce(fila as never) // existente
      .mockResolvedValueOnce({ ...fila, id: "rep-2" } as never); // a more recent one exists
    const res = await POST(post({ motivo: "Error" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/último/i);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("voids the last report, keeps the row and audits ANULAR with the motivo", async () => {
    const res = await POST(post({ motivo: "  Error de digitación " }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reporte).toMatchObject({ id: "rep-1", motivo_anulacion: "Error de digitación" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "rep-1", anulado_at: null },
      data: { anulado_at: expect.any(Date), anulado_por_id: "resp-1", motivo_anulacion: "Error de digitación" },
    });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accion: "ANULAR",
        entidad: "reporte_actividad",
        entidad_id: "rep-1",
        proyecto_id: "pry-1",
      }),
    );
  });

  it("answers 409 when a concurrent void wins the race (updateMany count 0)", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await POST(post({ motivo: "Error" }), ctx)).status).toBe(409);
    expect(logChange).not.toHaveBeenCalled();
  });
});
