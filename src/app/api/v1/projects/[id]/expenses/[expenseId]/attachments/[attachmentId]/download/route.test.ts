// GET /api/v1/projects/:id/expenses/:expenseId/attachments/:attachmentId/download (S6 U5):
// 60 s signed URL of an expense support, restricted to actors who can view financial supports
// (RNF-03), with one append-only `acceso_soportes` row per issuance (RNF-04).
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
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const proyecto = (miembro = false) =>
  ({ id: "pry-1", estado: "CERRADO", fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", expenseId: "gas-1", attachmentId: "sop-1" }) };
const req = () => new Request("http://localhost/x/download");

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue({
    id: "sop-1",
    storage_path: "proyectos/pry-1/soportes/u_factura.pdf",
    url_externa: null,
  } as never);
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://s.example/dl" }, error: null });
  mocks.accesoCreate.mockResolvedValue({ id: "acc-1" });
});
afterEach(() => vi.clearAllMocks());

describe("GET expense support download", () => {
  it("signs a 60 s URL scoped to project, expense and live rows, then logs the access", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tipo: "archivo", url: "https://s.example/dl", expires_in: 60 });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("proyectos/pry-1/soportes/u_factura.pdf", 60);
    expect(db.soporteProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sop-1", gasto_id: "gas-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
    expect(mocks.accesoCreate).toHaveBeenCalledWith({
      data: { soporte_id: "sop-1", proyecto_id: "pry-1", usuario_id: "ger-1" },
    });
    expect(mocks.createSignedUrl.mock.invocationCallOrder[0]).toBeLessThan(mocks.accesoCreate.mock.invocationCallOrder[0]);
  });

  it("writes one row per issuance (two downloads, two rows)", async () => {
    await GET(req(), ctx);
    await GET(req(), ctx);
    expect(mocks.accesoCreate).toHaveBeenCalledTimes(2);
  });

  it("answers ADMINISTRADOR, GERENCIA and a member COORDINADOR", async () => {
    authAs(admin);
    expect((await GET(req(), ctx)).status).toBe(200);
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(true));
    expect((await GET(req(), ctx)).status).toBe(200);
  });

  it("answers 403 to a non-member COORDINADOR and a COLABORADOR, writing no log row", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(false));
    expect((await GET(req(), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await GET(req(), ctx)).status).toBe(403);
    expect(mocks.accesoCreate).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing project or a support of another expense or project, with no log row", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(mocks.accesoCreate).not.toHaveBeenCalled();
  });

  it("returns the https link of a link support and logs that access too", async () => {
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue({ id: "sop-1", storage_path: null, url_externa: "https://x.example/1" } as never);
    const json = await (await GET(req(), ctx)).json();
    expect(json).toEqual({ tipo: "enlace", url: "https://x.example/1", expires_in: null });
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.accesoCreate).toHaveBeenCalledTimes(1);
  });

  it("fails closed: answers 500 and no URL when the access log insert fails", async () => {
    mocks.accesoCreate.mockRejectedValueOnce(new Error("insert failed"));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("s.example");
  });

  it("answers 500 and logs nothing when signing fails", async () => {
    mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await GET(req(), ctx)).status).toBe(500);
    expect(mocks.accesoCreate).not.toHaveBeenCalled();
  });
});
