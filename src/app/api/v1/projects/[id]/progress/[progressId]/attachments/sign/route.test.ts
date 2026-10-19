// POST /api/v1/projects/:id/progress/:progressId/attachments/sign (S4 U3):
// ADR-13 signed direct-to-storage upload for a medio of an avance.
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ createSignedUploadUrl: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) } })),
}));
vi.mock("@/lib/db", () => ({
  db: { proyecto: { findFirst: vi.fn() }, avanceEntregable: { findFirst: vi.fn() } },
}));

import { db } from "@/lib/db";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { MAX_FILE_BYTES } from "@/lib/api/files";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", progressId: "av-1" }) };
const valido = { nombre: "Acta de entrega.pdf", tamano_bytes: 1024, tipo_mime: "application/pdf" };

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
  authAs(gerencia);
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.avanceEntregable.findFirst).mockResolvedValue({ id: "av-1", anulado_at: null } as never);
  mocks.createSignedUploadUrl.mockResolvedValue({ data: { token: "tok", signedUrl: "https://s.example/up" }, error: null });
});
afterEach(() => vi.clearAllMocks());

describe("POST attachments/sign", () => {
  it("returns a signed upload for a key chosen by the server under the project's soportes prefix", async () => {
    const res = await POST(post(valido), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.storage_path).toMatch(/^proyectos\/pry-1\/soportes\/[0-9a-f-]{36}_Acta_de_entrega\.pdf$/);
    expect(json).toMatchObject({ token: "tok", signed_url: "https://s.example/up", max_bytes: MAX_FILE_BYTES });
    expect(json.allowed_extensions).toContain("pdf");
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(json.storage_path);
  });

  it("never accepts a key from the client", async () => {
    const res = await POST(post({ ...valido, storage_path: "proyectos/pry-2/soportes/x.pdf" }), ctx);
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect((await res.json()).storage_path).toContain("proyectos/pry-1/soportes/");
    }
  });

  it("is gated like a write: 404, 403, 409 in BORRADOR, 409 for a voided avance", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    authAs(coordinador);
    expect((await POST(post(valido), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto("BORRADOR"));
    expect((await POST(post(valido), ctx)).status).toBe(409);
    vi.mocked(db.avanceEntregable.findFirst).mockResolvedValueOnce({ id: "av-1", anulado_at: new Date() } as never);
    expect((await POST(post(valido), ctx)).status).toBe(409);
    vi.mocked(db.avanceEntregable.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a disallowed type, a bad size, and 413 for an oversize file", async () => {
    expect((await POST(post({ ...valido, nombre: "x.exe" }), ctx)).status).toBe(400);
    expect((await POST(post({ ...valido, tipo_mime: "text/html" }), ctx)).status).toBe(400);
    for (const tamano_bytes of [0, -1, 1.5, "9"]) {
      expect((await POST(post({ ...valido, tamano_bytes }), ctx)).status).toBe(400);
    }
    const big = await POST(post({ ...valido, tamano_bytes: MAX_FILE_BYTES + 1 }), ctx);
    expect(big.status).toBe(413);
    expect((await big.json()).code).toBe("FILE_TOO_LARGE");
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("answers 500 when storage cannot sign", async () => {
    mocks.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(post(valido), ctx)).status).toBe(500);
  });
});
