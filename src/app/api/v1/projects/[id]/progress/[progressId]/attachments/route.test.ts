// GET/POST /api/v1/projects/:id/progress/:progressId/attachments (S4 U3):
// confirm an uploaded file or link an external https URL as a medio of an avance.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
  requiereMedio: { valor: true, confirmado: false },
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ info: mocks.info }) } })),
}));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/settings", () => ({
  getSemaforoParametrosV2: vi.fn(async () => ({ avance_requiere_medio: mocks.requiereMedio })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    avanceEntregable: { findFirst: vi.fn() },
    soporteProyecto: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ soporteProyecto: { create: mocks.create, count: mocks.count } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const avance = { id: "av-1", anulado_at: null };
const ctx = { params: Promise.resolve({ id: "pry-1", progressId: "av-1" }) };
const KEY = "proyectos/pry-1/soportes/6f1c_acta.pdf";
const archivo = { storage_path: KEY, nombre: "acta.pdf", tamano_bytes: 2048, tipo_mime: "application/pdf" };
const enlace = { url_externa: "https://drive.example.com/f/1", nombre: "Carpeta de evidencias" };

const medioRow = (over: object = {}) => ({
  id: "med-1",
  proyecto_id: "pry-1",
  avance_id: "av-1",
  medicion_id: null,
  nombre: "acta.pdf",
  storage_path: KEY,
  url_externa: null,
  tipo_mime: "application/pdf",
  tamano_bytes: 2048,
  subido_por_id: "ger-1",
  created_at: new Date("2026-10-08T12:00:00.000Z"),
  deleted_at: null,
  ...over,
});

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
  mocks.requiereMedio = { valor: true, confirmado: false };
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.avanceEntregable.findFirst).mockResolvedValue(avance as never);
  mocks.info.mockResolvedValue({ data: { size: 2048 }, error: null });
  mocks.create.mockImplementation(async ({ data }: { data: object }) => medioRow(data));
  mocks.count.mockResolvedValue(1);
});
afterEach(() => vi.clearAllMocks());

describe("POST attachments: access and state", () => {
  it("allows ADM/GER and a member COORDINADOR; 403 for a non-member COORDINADOR and a COLABORADOR", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await POST(post(enlace), ctx)).status).toBe(201);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", false));
    expect((await POST(post(enlace), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await POST(post(enlace), ctx)).status).toBe(403);
  });

  it("answers 404 for a missing project or avance and 409 in BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(enlace), ctx)).status).toBe(404);
    vi.mocked(db.avanceEntregable.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(enlace), ctx)).status).toBe(404);
    expect(db.avanceEntregable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "av-1", proyecto_id: "pry-1" } }),
    );
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto("BORRADOR"));
    expect((await POST(post(enlace), ctx)).status).toBe(409);
  });

  it("answers 409 for a voided avance and never inserts", async () => {
    vi.mocked(db.avanceEntregable.findFirst).mockResolvedValue({ id: "av-1", anulado_at: new Date() } as never);
    expect((await POST(post(enlace), ctx)).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("POST attachments: external link", () => {
  it("stores an https link with no file metadata and answers 201 with cuenta true", async () => {
    const res = await POST(post(enlace), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.cuenta).toBe(true);
    expect(json.medio).toMatchObject({ id: "med-1", avance_id: "av-1" });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      proyecto_id: "pry-1",
      avance_id: "av-1",
      url_externa: enlace.url_externa,
      nombre: enlace.nombre,
      subido_por_id: "ger-1",
    });
    expect(mocks.create.mock.calls[0][0].data.storage_path ?? null).toBeNull();
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("rejects http, javascript, malformed and over-long links, and mixed bodies", async () => {
    for (const body of [
      { ...enlace, url_externa: "http://example.com/x" },
      { ...enlace, url_externa: "javascript:alert(1)" },
      { ...enlace, url_externa: "no es una url" },
      { ...enlace, url_externa: "https://example.com/" + "a".repeat(2000) },
      { ...enlace, storage_path: KEY },
      { url_externa: enlace.url_externa },
      {},
      "texto",
    ]) {
      expect((await POST(post(body), ctx)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("POST attachments: uploaded file", () => {
  it("confirms an object under this project's soportes prefix using the REAL stored size", async () => {
    mocks.info.mockResolvedValue({ data: { size: 1500 }, error: null });
    const res = await POST(post(archivo), ctx);
    expect(res.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      storage_path: KEY,
      nombre: "acta.pdf",
      tamano_bytes: 1500,
      tipo_mime: "application/pdf",
    });
    expect(mocks.create.mock.calls[0][0].data.url_externa ?? null).toBeNull();
  });

  it("rejects keys of another project, sibling prefixes, other targets and traversal", async () => {
    for (const storage_path of [
      "proyectos/pry-2/soportes/u_a.pdf",
      "proyectos/pry-1evil/soportes/u_a.pdf",
      "proyectos/pry-1/soportes-evil/u_a.pdf",
      "tareas/task-1/u_a.pdf",
      "proyectos/pry-1/soportes/../../pry-2/soportes/u_a.pdf",
      "/proyectos/pry-1/soportes/u_a.pdf",
    ]) {
      expect((await POST(post({ ...archivo, storage_path }), ctx)).status, storage_path).toBe(400);
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("rejects a disallowed extension or MIME, a missing object and an oversize or understated object", async () => {
    expect((await POST(post({ ...archivo, nombre: "virus.exe", storage_path: "proyectos/pry-1/soportes/u_v.exe" }), ctx)).status).toBe(400);
    expect((await POST(post({ ...archivo, tipo_mime: "text/html" }), ctx)).status).toBe(400);
    mocks.info.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect((await POST(post(archivo), ctx)).status).toBe(400);
    mocks.info.mockResolvedValue({ data: { size: 999_999_999 }, error: null });
    expect((await POST(post({ ...archivo, tamano_bytes: 999_999_999 }), ctx)).status).toBe(400);
    mocks.info.mockResolvedValue({ data: { size: 5000 }, error: null });
    expect((await POST(post(archivo), ctx)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects non-positive or non-integer sizes", async () => {
    for (const tamano_bytes of [0, -5, 1.5, "10"]) {
      expect((await POST(post({ ...archivo, tamano_bytes }), ctx)).status).toBe(400);
    }
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
});

describe("POST attachments: cuenta and audit", () => {
  it("reports cuenta true because the avance now has a live medio", async () => {
    mocks.count.mockResolvedValue(1);
    expect((await (await POST(post(enlace), ctx)).json()).cuenta).toBe(true);
  });

  it("audits the new medio against the avance in the same transaction", async () => {
    await POST(post(enlace), ctx);
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "avance",
        entidad_id: "av-1",
        proyecto_id: "pry-1",
        campo: "medio",
        valor_nuevo: expect.objectContaining({ nombre: enlace.nombre, url_externa: enlace.url_externa }),
      }),
    );
  });
});

describe("GET attachments", () => {
  it("lists live medios without exposing the storage key, readable in any estado", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("CERRADO"));
    vi.mocked(db.soporteProyecto.findMany).mockResolvedValue([
      medioRow(),
      medioRow({ id: "med-2", storage_path: null, url_externa: "https://x.example/1", tipo_mime: null, tamano_bytes: null, nombre: "Enlace" }),
    ] as never);
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.medios).toHaveLength(2);
    expect(json.medios[0]).toMatchObject({ id: "med-1", tipo: "archivo", nombre: "acta.pdf" });
    expect(json.medios[1]).toMatchObject({ id: "med-2", tipo: "enlace", url_externa: "https://x.example/1" });
    expect(JSON.stringify(json)).not.toContain("proyectos/pry-1/soportes");
    expect(db.soporteProyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { avance_id: "av-1", proyecto_id: "pry-1", deleted_at: null } }),
    );
  });

  it("is 403 for a stranger and 404 for an unknown project or avance", async () => {
    authAs(coordinador);
    expect((await GET(get(), ctx)).status).toBe(403);
    authAs(gerencia);
    vi.mocked(db.avanceEntregable.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
