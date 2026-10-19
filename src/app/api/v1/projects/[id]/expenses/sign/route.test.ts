// POST /api/v1/projects/:id/expenses/sign (S6 U3): signed direct-to-storage upload for an
// expense support. Same policy as the avance medios sign route, but it exists BEFORE the expense.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ createSignedUploadUrl: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) },
  })),
}));
vi.mock("@/lib/db", () => ({ db: { proyecto: { findFirst: vi.fn() } } }));

import { db } from "@/lib/db";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { MAX_FILE_BYTES } from "@/lib/api/files";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const valido = { nombre: "Factura 123.pdf", tamano_bytes: 1024, tipo_mime: "application/pdf" };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/x/expenses/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  mocks.createSignedUploadUrl.mockResolvedValue({ data: { token: "tok", signedUrl: "https://s.example/up" }, error: null });
});
afterEach(() => vi.clearAllMocks());

describe("POST expenses/sign", () => {
  it("returns a server-chosen key under the project soportes prefix", async () => {
    const res = await POST(post(valido), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.storage_path).toMatch(/^proyectos\/pry-1\/soportes\/[0-9a-f-]{36}_Factura_123\.pdf$/);
    expect(json).toMatchObject({ token: "tok", signed_url: "https://s.example/up", max_bytes: MAX_FILE_BYTES });
    expect(json.allowed_extensions).toContain("pdf");
  });

  it("follows the registration gate: 404, 403 (COLABORADOR, non-member COORDINADOR), 409 outside EN_EJECUCION", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    authAs(colaborador);
    expect((await POST(post(valido), ctx)).status).toBe(403);
    authAs(coordinador);
    expect((await POST(post(valido), ctx)).status).toBe(403);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await POST(post(valido), ctx)).status).toBe(200);
    for (const estado of ["BORRADOR", "SUSPENDIDO", "CERRADO"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(estado, true));
      expect((await POST(post(valido), ctx)).status).toBe(409);
    }
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("rejects a disallowed type with 400 and an oversized file with 413", async () => {
    expect((await POST(post({ ...valido, nombre: "x.exe" }), ctx)).status).toBe(400);
    const big = await POST(post({ ...valido, tamano_bytes: MAX_FILE_BYTES + 1 }), ctx);
    expect(big.status).toBe(413);
    expect((await big.json()).code).toBe("FILE_TOO_LARGE");
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
