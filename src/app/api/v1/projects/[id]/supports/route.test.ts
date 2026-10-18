// GET /api/v1/projects/:id/supports (v7 Soportes tab).
// POST — create a project-origin document (file after the signed upload, or an https link).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ info: vi.fn(), create: vi.fn() }));

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
    soporteProyecto: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ soporteProyecto: { create: mocks.create } })),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const get = () => new Request("http://localhost/api/v1/projects/pry-1/supports");

const proyecto = (miembro = false) =>
  ({ id: "pry-1", estado: "EN_EJECUCION", fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;

const base = {
  proyecto_id: "pry-1",
  avance_id: null,
  medicion_id: null,
  gasto_id: null,
  storage_path: null,
  url_externa: null,
  tipo_mime: null,
  tamano_bytes: null,
  subido_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  avance: null,
  medicion: null,
  gasto: null,
};

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: gerencia, supabaseUser: {} as never });
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.usuario.findMany).mockResolvedValue([{ id: "ger-1", nombre: "Ana Gerente" }] as never);
});
afterEach(() => vi.clearAllMocks());

describe("GET /projects/:id/supports", () => {
  it("404 when the project does not exist", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });

  it("403 for a collaborator who is not a member", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: colaborador, supabaseUser: {} as never });
    expect((await GET(get(), ctx)).status).toBe(403);
    expect(db.soporteProyecto.findMany).not.toHaveBeenCalled();
  });

  it("lists supports by origin without exposing the storage key", async () => {
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      {
        ...base,
        id: "s-1",
        nombre: "Listas taller 3.pdf",
        avance_id: "av-1",
        storage_path: "proyectos/pry-1/soportes/x.pdf",
        tipo_mime: "application/pdf",
        tamano_bytes: 2048,
        avance: { entregable: { codigo: "E1", descripcion: "Taller" } },
      },
      { ...base, id: "s-2", nombre: "Drive", medicion_id: "med-1", url_externa: "https://drive.google.com/x", medicion: { indicador: { codigo: "I1", nombre: "Satisfacción" } } },
    ] as never);

    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    const { soportes } = await res.json();
    expect(soportes).toHaveLength(2);
    expect(soportes[0]).toMatchObject({ origen: "avance", origen_id: "av-1", tipo: "archivo", vinculo: "E1 · Taller", subido_por: "Ana Gerente" });
    expect(soportes[1]).toMatchObject({ origen: "indicador", tipo: "enlace", url_externa: "https://drive.google.com/x" });
    expect(JSON.stringify(soportes)).not.toContain("storage_path");
    expect(JSON.stringify(soportes)).not.toContain("proyectos/pry-1/soportes");
  });

  it("hides expense supports from a viewer who only has the gerencial flag", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: { id: "v-1", rol: "COLABORADOR", puede_ver_tablero_gerencial: true } as Usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([] as never);

    expect((await GET(get(), ctx)).status).toBe(200);
    expect(vi.mocked(db.soporteProyecto.findMany).mock.lastCall?.[0]?.where).toMatchObject({ gasto_id: null });
  });

  it("does not filter expense supports for a coordinator member", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: { id: "c-1", rol: "COORDINADOR" } as Usuario, supabaseUser: {} as never });
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(true));
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([] as never);

    await GET(get(), ctx);
    expect(vi.mocked(db.soporteProyecto.findMany).mock.lastCall?.[0]?.where).not.toHaveProperty("gasto_id");
  });

  it("never exposes the link of an expense support", async () => {
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      { ...base, id: "s-3", nombre: "Factura", gasto_id: "g-1", url_externa: "https://x.test/f", gasto: { numero_documento: "F-9", descripcion: "Software" } },
    ] as never);
    const { soportes } = await (await GET(get(), ctx)).json();
    expect(soportes[0]).toMatchObject({ origen: "gasto", origen_id: "g-1", vinculo: "Gasto F-9 · Software", url_externa: null });
  });
});

describe("GET /projects/:id/supports: project-origin documents", () => {
  it("lists a parentless row as origin proyecto with its uploader id and link", async () => {
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      { ...base, id: "s-4", nombre: "Convenio", url_externa: "https://x.test/convenio" },
    ] as never);
    const { soportes } = await (await GET(get(), ctx)).json();
    expect(soportes[0]).toMatchObject({
      origen: "proyecto",
      origen_id: null,
      vinculo: null,
      url_externa: "https://x.test/convenio",
      subido_por_id: "ger-1",
      subido_por: "Ana Gerente",
    });
  });
});

const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const KEY = "proyectos/pry-1/soportes/6f1c_contrato.pdf";
const archivo = { storage_path: KEY, nombre: "contrato.pdf", tamano_bytes: 2048, tipo_mime: "application/pdf" };
const enlace = { url_externa: "https://drive.example.com/f/1", nombre: "Acta de inicio" };
const conEstado = (estado: string, miembro = false) =>
  ({ id: "pry-1", estado, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/supports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const docRow = (data: object) => ({
  id: "doc-1",
  proyecto_id: "pry-1",
  avance_id: null,
  medicion_id: null,
  gasto_id: null,
  storage_path: null,
  url_externa: null,
  tipo_mime: null,
  tamano_bytes: null,
  created_at: new Date("2026-10-17T12:00:00.000Z"),
  deleted_at: null,
  ...data,
});

describe("POST /projects/:id/supports", () => {
  beforeEach(() => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(conEstado("EN_EJECUCION"));
    mocks.info.mockResolvedValue({ data: { size: 2048 }, error: null });
    mocks.create.mockImplementation(async ({ data }: { data: object }) => docRow(data));
  });

  it("allows ADMINISTRADOR, GERENCIA and a member COORDINADOR", async () => {
    for (const [usuario, miembro] of [[admin, false], [gerencia, false], [coordinador, true]] as const) {
      authAs(usuario);
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(conEstado("EN_EJECUCION", miembro));
      expect((await POST(post(enlace), ctx)).status, usuario.rol).toBe(201);
    }
  });

  it("answers 403 to a non-member COORDINADOR and a COLABORADOR, and 404 for an unknown project", async () => {
    authAs(coordinador);
    expect((await POST(post(enlace), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await POST(post(enlace), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    expect((await POST(post(enlace), ctx)).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts BORRADOR, EN_EJECUCION and SUSPENDIDO; answers 409 in CERRADO, CANCELADO and PLANIFICACION", async () => {
    for (const estado of ["BORRADOR", "EN_EJECUCION", "SUSPENDIDO"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(conEstado(estado));
      expect((await POST(post(enlace), ctx)).status, estado).toBe(201);
    }
    mocks.create.mockClear();
    for (const estado of ["CERRADO", "CANCELADO", "PLANIFICACION"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(conEstado(estado));
      const res = await POST(post(enlace), ctx);
      expect(res.status, estado).toBe(409);
      expect((await res.json()).code).toBe("INVALID_STATE");
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("stores a link as a parentless row owned by the caller", async () => {
    const res = await POST(post(enlace), ctx);
    expect(res.status).toBe(201);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ proyecto_id: "pry-1", subido_por_id: "ger-1", url_externa: enlace.url_externa, nombre: "Acta de inicio" });
    expect(data.storage_path).toBeNull();
    expect(data).not.toHaveProperty("avance_id");
    expect(data).not.toHaveProperty("medicion_id");
    expect(data).not.toHaveProperty("gasto_id");
    const { soporte } = await res.json();
    expect(soporte).toMatchObject({ id: "doc-1", origen: "proyecto", tipo: "enlace", subido_por_id: "ger-1" });
  });

  it("confirms a stored object under this project's prefix with the REAL size and never echoes the key", async () => {
    mocks.info.mockResolvedValue({ data: { size: 1500 }, error: null });
    const res = await POST(post(archivo), ctx);
    expect(res.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ storage_path: KEY, tamano_bytes: 1500, tipo_mime: "application/pdf" });
    expect(JSON.stringify(await res.json())).not.toContain(KEY);
  });

  it("rejects keys not bound to this project, bad types, missing or oversize objects and bad links", async () => {
    for (const storage_path of ["proyectos/pry-2/soportes/u_a.pdf", "proyectos/pry-1/soportes/../../pry-2/soportes/u_a.pdf", "tareas/t-1/u_a.pdf"]) {
      expect((await POST(post({ ...archivo, storage_path }), ctx)).status, storage_path).toBe(400);
    }
    expect((await POST(post({ ...archivo, nombre: "virus.exe", storage_path: "proyectos/pry-1/soportes/u_v.exe" }), ctx)).status).toBe(400);
    expect((await POST(post({ ...archivo, tipo_mime: "text/html" }), ctx)).status).toBe(400);
    mocks.info.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect((await POST(post(archivo), ctx)).status).toBe(400);
    mocks.info.mockResolvedValue({ data: { size: 999_999_999 }, error: null });
    expect((await POST(post({ ...archivo, tamano_bytes: 999_999_999 }), ctx)).status).toBe(400);
    for (const url_externa of ["http://x.test/a", "javascript:alert(1)"]) {
      expect((await POST(post({ ...enlace, url_externa }), ctx)).status, url_externa).toBe(400);
    }
    expect((await POST(post({ url_externa: enlace.url_externa, nombre: "" }), ctx)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("maps a second confirmation of the same object to 409 CONFLICT", async () => {
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { driverAdapterError: { cause: { originalMessage: 'violates unique constraint "soportes_proyecto_storage_path_key"' } } },
      }),
    );
    const res = await POST(post(archivo), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("audits the new document against the project in the same transaction", async () => {
    await POST(post(enlace), ctx);
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "proyecto",
        entidad_id: "pry-1",
        proyecto_id: "pry-1",
        campo: "documento",
        valor_nuevo: expect.objectContaining({ documento_id: "doc-1", nombre: "Acta de inicio", tipo: "enlace" }),
      }),
    );
  });
});
