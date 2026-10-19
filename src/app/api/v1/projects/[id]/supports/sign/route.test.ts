// POST /api/v1/projects/:id/supports/sign: ADR-13 signed direct-to-storage upload for a
// project-origin document, gated like the document create (404 -> 403 -> 409).
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ createSignedUploadUrl: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }) } })),
}));
vi.mock("@/lib/db", () => ({ db: { proyecto: { findFirst: vi.fn() } } }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { MAX_FILE_BYTES } from "@/lib/api/files";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const valido = { nombre: "Contrato firmado.pdf", tamano_bytes: 1024, tipo_mime: "application/pdf" };

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
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  mocks.createSignedUploadUrl.mockResolvedValue({ data: { token: "tok", signedUrl: "https://s.example/up" }, error: null });
});
afterEach(() => vi.clearAllMocks());

describe("POST supports/sign", () => {
  it("returns a signed upload for a server-chosen key under the project's soportes prefix", async () => {
    const res = await POST(post(valido), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storage_path).toMatch(/^proyectos\/pry-1\/soportes\//);
    expect(body).toMatchObject({ token: "tok", signed_url: "https://s.example/up", max_bytes: MAX_FILE_BYTES });
  });

  it("never accepts a key from the client", async () => {
    expect((await POST(post({ ...valido, storage_path: "proyectos/pry-2/soportes/x.pdf" }), ctx)).status).toBe(400);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("is gated like the create: 404, 403 for a non-member or a collaborator, 409 in CERRADO and CANCELADO", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
    authAs(coordinador);
    expect((await POST(post(valido), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await POST(post(valido), ctx)).status).toBe(403);
    authAs(gerencia);
    for (const estado of ["CERRADO", "CANCELADO"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(estado));
      expect((await POST(post(valido), ctx)).status, estado).toBe(409);
    }
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("signs for a member COORDINADOR in BORRADOR and SUSPENDIDO", async () => {
    authAs(coordinador);
    for (const estado of ["BORRADOR", "SUSPENDIDO"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(estado, true));
      expect((await POST(post(valido), ctx)).status, estado).toBe(200);
    }
  });

  it("rejects a disallowed type and answers 413 for an oversize file", async () => {
    expect((await POST(post({ ...valido, nombre: "virus.exe" }), ctx)).status).toBe(400);
    expect((await POST(post({ ...valido, tamano_bytes: MAX_FILE_BYTES + 1 }), ctx)).status).toBe(413);
  });
});
