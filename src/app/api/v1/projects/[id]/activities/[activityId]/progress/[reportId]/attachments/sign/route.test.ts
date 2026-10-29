// POST .../progress/:reportId/attachments/sign (AJ-01, S11): ADR-13 signed direct-to-storage
// upload for a medio of an activity progress report. Mirrors the AJ-06 mediciones sign test,
// retargeted to `reporte_actividad_id` with the S9.5 responsable-only gate.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ createSignedUploadUrl: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) } })),
}));
vi.mock("@/lib/db", () => ({
  db: { proyecto: { findFirst: vi.fn() }, actividad: { findFirst: vi.fn() }, reporteActividad: { findFirst: vi.fn() } },
}));

import { db } from "@/lib/db";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { MAX_FILE_BYTES } from "@/lib/api/files";
import { POST } from "./route";

const responsable = { id: "resp-1", rol: "COORDINADOR" } as Usuario;
const otroCoordinador = { id: "coord-2", rol: "COORDINADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1", activityId: "act-1", reportId: "rep-1" }) };
const valido = { nombre: "Informe.pdf", tamano_bytes: 1024, tipo_mime: "application/pdf" };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/x/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(responsable);
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", miembros: [{ id: "m-1" }] } as never);
  vi.mocked(db.actividad.findFirst).mockResolvedValue({ id: "act-1", responsable_id: "resp-1" } as never);
  vi.mocked(db.reporteActividad.findFirst).mockResolvedValue({ id: "rep-1", anulado_at: null } as never);
  mocks.createSignedUploadUrl.mockResolvedValue({ data: { token: "tok", signedUrl: "https://s.example/up" }, error: null });
});
afterEach(() => vi.clearAllMocks());

describe("POST progress attachments/sign", () => {
  it("returns a signed upload for a key chosen by the server under the project's soportes prefix", async () => {
    const res = await POST(post(valido), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.storage_path).toMatch(/^proyectos\/pry-1\/soportes\//);
    expect(json).toMatchObject({ token: "tok", signed_url: "https://s.example/up", max_bytes: MAX_FILE_BYTES });
  });

  it("is responsable-only (403) and 409 on a voided report", async () => {
    authAs(otroCoordinador);
    expect((await POST(post(valido), ctx)).status).toBe(403);
    authAs(responsable);
    vi.mocked(db.reporteActividad.findFirst).mockResolvedValueOnce({ id: "rep-1", anulado_at: new Date() } as never);
    expect((await POST(post(valido), ctx)).status).toBe(409);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing project or activity, 409 in BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce({ id: "pry-1", estado: "BORRADOR", miembros: [{ id: "m-1" }] } as never);
    expect((await POST(post(valido), ctx)).status).toBe(409);
    vi.mocked(db.actividad.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
  });
});
