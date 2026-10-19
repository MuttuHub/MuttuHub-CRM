// GET /api/v1/projects/:id/progress/:progressId/attachments/:attachmentId/download (S4 U3):
// 60-second signed download URL for a stored medio, or the https link of a link medio.
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) } })),
}));
vi.mock("@/lib/db", () => ({
  db: { proyecto: { findFirst: vi.fn() }, soporteProyecto: { findFirst: vi.fn() } },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const proyecto = (miembro = false) =>
  ({ id: "pry-1", estado: "CERRADO", fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", progressId: "av-1", attachmentId: "med-1" }) };
const req = () => new Request("http://localhost/x/download");

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue({
    id: "med-1",
    storage_path: "proyectos/pry-1/soportes/u_a.pdf",
    url_externa: null,
  } as never);
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://s.example/dl" }, error: null });
});
afterEach(() => vi.clearAllMocks());

describe("GET attachment download", () => {
  it("returns a 60 s signed URL for a stored file, scoped to project, avance and live rows", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tipo: "archivo", url: "https://s.example/dl", expires_in: 60 });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("proyectos/pry-1/soportes/u_a.pdf", 60);
    expect(db.soporteProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "med-1", avance_id: "av-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
  });

  it("returns the https link of a link medio without touching storage", async () => {
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue({ id: "med-1", storage_path: null, url_externa: "https://x.example/1" } as never);
    const json = await (await GET(req(), ctx)).json();
    expect(json).toEqual({ tipo: "enlace", url: "https://x.example/1", expires_in: null });
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("is readable by a member COORDINADOR, 403 for a non-member and a COLABORADOR, 404 when missing", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(true));
    expect((await GET(req(), ctx)).status).toBe(200);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(false));
    expect((await GET(req(), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await GET(req(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
  });

  it("answers 500 when storage cannot sign", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await GET(req(), ctx)).status).toBe(500);
  });
});
