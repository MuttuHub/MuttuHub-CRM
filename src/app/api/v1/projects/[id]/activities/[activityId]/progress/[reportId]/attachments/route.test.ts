// GET/POST /api/v1/projects/:id/activities/:activityId/progress/:reportId/attachments (AJ-01, S11).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ create: vi.fn(), info: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ info: mocks.info }) } })),
}));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findFirst: vi.fn() },
    reporteActividad: { findFirst: vi.fn() },
    soporteProyecto: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ soporteProyecto: { create: mocks.create } })),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const responsable = { id: "resp-1", rol: "COORDINADOR" } as Usuario;
const otroCoordinador = { id: "coord-2", rol: "COORDINADOR" } as Usuario;

const reporte = { id: "rep-1", anulado_at: null as Date | null };
const ctx = { params: Promise.resolve({ id: "pry-1", activityId: "act-1", reportId: "rep-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/x/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/x/attachments");

beforeEach(() => {
  authAs(responsable);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", miembros: [{ id: "m-1" }] } as never);
  vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-1", responsable_id: "resp-1" } as never);
  vi.mocked(db.reporteActividad.findFirst).mockResolvedValue(reporte as never);
  mocks.info.mockResolvedValue({ data: { size: 100 }, error: null });
  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "med-1",
    proyecto_id: "pry-1",
    reporte_actividad_id: "rep-1",
    nombre: "x",
    storage_path: null,
    url_externa: null,
    tipo_mime: null,
    tamano_bytes: null,
    subido_por_id: "resp-1",
    created_at: new Date("2026-10-08T12:00:00.000Z"),
    ...data,
  }));
});
afterEach(() => vi.clearAllMocks());

describe("POST attachments", () => {
  it("attaches a confirmed file", async () => {
    const res = await POST(
      post({ storage_path: "proyectos/pry-1/soportes/x.pdf", nombre: "informe.pdf", tamano_bytes: 100, tipo_mime: "application/pdf" }),
      ctx,
    );
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.medio).toMatchObject({ id: "med-1", tipo: "archivo" });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proyecto_id: "pry-1", reporte_actividad_id: "rep-1" }) }),
    );
  });

  it("attaches an external link", async () => {
    const res = await POST(post({ url_externa: "https://example.com/doc", nombre: "Enlace" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.medio).toMatchObject({ tipo: "enlace", url_externa: "https://example.com/doc" });
  });

  it("is responsable-only (403 for another COORDINADOR) and 409 on a voided report", async () => {
    authAs(otroCoordinador);
    expect((await POST(post({ url_externa: "https://example.com/doc", nombre: "Enlace" }), ctx)).status).toBe(403);
    authAs(responsable);
    vi.mocked(db.reporteActividad.findFirst).mockResolvedValue({ id: "rep-1", anulado_at: new Date() } as never);
    expect((await POST(post({ url_externa: "https://example.com/doc", nombre: "Enlace" }), ctx)).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("GET attachments", () => {
  it("lists the live medios of the report", async () => {
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      { id: "med-1", nombre: "x", storage_path: "p", url_externa: null, tipo_mime: null, tamano_bytes: 1, subido_por_id: "resp-1", created_at: new Date(), proyecto_id: "pry-1", reporte_actividad_id: "rep-1" },
    ] as never);
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.medios).toHaveLength(1);
  });
});
