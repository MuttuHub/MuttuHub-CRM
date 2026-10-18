// GET /api/v1/projects/:id/supports/:supportId/download: opens a project-origin document. A file
// answers a 60 s signed URL, a link its https URL. Same audience as the supports list; every
// issuance is logged in the append-only `acceso_soportes` (fail closed), like expense supports.
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ createSignedUrl: vi.fn(), accesoCreate: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) } })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    soporteProyecto: { findFirst: vi.fn() },
    accesoSoporte: { create: mocks.accesoCreate },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const gerencial = { id: "v-1", rol: "COLABORADOR", puede_ver_tablero_gerencial: true } as Usuario;
const proyecto = (miembro = false, estado = "CERRADO") =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", supportId: "doc-1" }) };
const req = () => new Request("http://localhost/x/download");
const KEY = "proyectos/pry-1/soportes/u_contrato.pdf";

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue({ id: "doc-1", storage_path: KEY, url_externa: null } as never);
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://s.example/dl" }, error: null });
  mocks.accesoCreate.mockResolvedValue({ id: "acc-1" });
});
afterEach(() => vi.clearAllMocks());

describe("GET project document download", () => {
  it("signs a 60 s URL for a live project-origin document of THIS project, then logs the access", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tipo: "archivo", url: "https://s.example/dl", expires_in: 60 });
    expect(db.soporteProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-1", proyecto_id: "pry-1", deleted_at: null, avance_id: null, medicion_id: null, gasto_id: null },
      }),
    );
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(KEY, 60);
    expect(mocks.accesoCreate).toHaveBeenCalledWith({ data: { soporte_id: "doc-1", proyecto_id: "pry-1", usuario_id: "ger-1" } });
    expect(mocks.createSignedUrl.mock.invocationCallOrder[0]).toBeLessThan(mocks.accesoCreate.mock.invocationCallOrder[0]);
  });

  it("answers a link document with its URL and logs it too", async () => {
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue({ id: "doc-1", storage_path: null, url_externa: "https://x.test/a" } as never);
    expect(await (await GET(req(), ctx)).json()).toEqual({ tipo: "enlace", url: "https://x.test/a", expires_in: null });
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.accesoCreate).toHaveBeenCalledTimes(1);
  });

  it("has the audience of the supports list, in any estado: managers, a member COORDINADOR, the gerencial flag", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(true));
    expect((await GET(req(), ctx)).status).toBe(200);
    authAs(gerencial);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(false));
    expect((await GET(req(), ctx)).status).toBe(200);
  });

  it("answers 403 to a non-member COORDINADOR and a COLABORADOR without signing or logging", async () => {
    authAs(coordinador);
    expect((await GET(req(), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await GET(req(), ctx)).status).toBe(403);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.accesoCreate).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown project, or a support of another project or another origin", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("fails closed: no URL leaves the server when the access log cannot be written", async () => {
    mocks.accesoCreate.mockRejectedValue(new Error("db down"));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("https://s.example/dl");
  });

  it("answers 500 when storage cannot sign, writing no log row", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await GET(req(), ctx)).status).toBe(500);
    expect(mocks.accesoCreate).not.toHaveBeenCalled();
  });
});
