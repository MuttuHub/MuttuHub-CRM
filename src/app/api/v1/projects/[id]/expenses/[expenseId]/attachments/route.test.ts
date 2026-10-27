// POST /api/v1/projects/:id/expenses/:expenseId/attachments (B8, S2): attach a support to an expense that
// already exists (imported expenses carry none). Same body as one item of `soportes[]` in POST /expenses
// (file confirmation after sign -> upload, or an https link), max 5 live supports, only the registrant
// and only while the expense is REGISTRADO or RECHAZADO.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  soporteCreate: vi.fn(),
  soporteCount: vi.fn(),
  reread: vi.fn(),
}));

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
    gasto: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        soporteProyecto: { create: mocks.soporteCreate, count: mocks.soporteCount },
        gasto: { findFirstOrThrow: mocks.reread },
      }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { MAX_SOPORTES_MESSAGE } from "@/lib/api/gastos";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const otraGerencia = { id: "ger-2", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: new Date("2026-10-05"), fecha_fin: new Date("2027-01-29"), miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", expenseId: "gas-1" }) };

const KEY = "proyectos/pry-1/soportes/6f1c_factura.pdf";
const archivo = { storage_path: KEY, nombre: "factura.pdf", tamano_bytes: 2048, tipo_mime: "application/pdf" };
const enlace = { url_externa: "https://drive.example.com/f/1", nombre: "Carpeta de soportes" };

const soporteRow = (data: Record<string, unknown> = {}) => ({
  id: "sop-1",
  proyecto_id: "pry-1",
  avance_id: null,
  gasto_id: "gas-1",
  nombre: "factura.pdf",
  storage_path: KEY,
  url_externa: null,
  tipo_mime: "application/pdf",
  tamano_bytes: 2048,
  subido_por_id: "ger-1",
  created_at: new Date("2026-10-16T12:00:00.000Z"),
  deleted_at: null,
  ...data,
});

const existente = (data: Record<string, unknown> = {}) => ({
  id: "gas-1",
  proyecto_id: "pry-1",
  linea_id: "lin-1",
  fecha_documento: new Date("2026-10-15"),
  periodo: "2026-10",
  tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: "NIT",
  tercero_numero_id: "900.123.456-7",
  tercero_id_norm: "900123456",
  numero_documento: "FE-0123",
  numero_documento_norm: "FE0123",
  descripcion: "Tiquetes del equipo",
  monto_cop: new Prisma.Decimal("1500000.50"),
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-16T12:00:00.000Z"),
  updated_at: new Date("2026-10-16T12:00:00.000Z"),
  validado_por_id: null,
  validado_at: null,
  rechazado_por_id: null,
  rechazado_at: null,
  motivo_rechazo: null,
  anulado_por_id: null,
  anulado_at: null,
  motivo_anulacion: null,
  linea: { rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
  soportes: [] as unknown[],
  ...data,
});

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/x/expenses/gas-1/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let current = existente();
let vivos = 0;

beforeEach(() => {
  current = existente();
  vivos = 0;
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.gasto.findFirst).mockImplementation((async () => current) as never);
  mocks.info.mockResolvedValue({ data: { size: 2048 }, error: null });
  mocks.soporteCount.mockImplementation(async () => vivos);
  mocks.soporteCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => soporteRow(data));
  mocks.reread.mockImplementation(async () => ({ ...current, soportes: [soporteRow()] }));
});
afterEach(() => vi.clearAllMocks());

describe("POST attachments: attaching a support later", () => {
  it("attaches a file support to a REGISTRADO expense, returns it and audits the change", async () => {
    const res = await POST(post(archivo), ctx);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.gasto.soportes).toHaveLength(1);
    expect(json.gasto.soportes[0]).toMatchObject({ id: "sop-1", nombre: "factura.pdf", tipo: "archivo" });
    expect(json.gasto.soportes_count).toBe(1);
    expect(json.gasto.soportes[0]).not.toHaveProperty("storage_path");
    expect(mocks.soporteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proyecto_id: "pry-1",
        gasto_id: "gas-1",
        subido_por_id: "ger-1",
        storage_path: KEY,
        tamano_bytes: 2048,
        url_externa: null,
      }),
    });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "EDITAR",
        entidad: "gasto",
        entidad_id: "gas-1",
        proyecto_id: "pry-1",
        campo: "soportes",
        valor_anterior: 0,
        valor_nuevo: 1,
      }),
    );
  });

  it("attaches a link support", async () => {
    const res = await POST(post(enlace), ctx);
    expect(res.status).toBe(201);
    expect(mocks.soporteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ gasto_id: "gas-1", storage_path: null, url_externa: enlace.url_externa, nombre: enlace.nombre }),
    });
  });

  it("also attaches to a RECHAZADO expense (the registrant may correct it)", async () => {
    current = existente({ estado: "RECHAZADO" });
    expect((await POST(post(enlace), ctx)).status).toBe(201);
  });

  it("counts the existing live supports in the audit row", async () => {
    vivos = 2;
    current = existente({ soportes: [soporteRow({ id: "a" }), soporteRow({ id: "b", storage_path: null, url_externa: "https://x.co" })] });
    await POST(post(enlace), ctx);
    expect(logChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ valor_anterior: 2, valor_nuevo: 3 }));
  });

  it("answers 400 with the shared message when the expense already has 5 live supports", async () => {
    vivos = 5;
    current = existente({ soportes: Array.from({ length: 5 }, (_, i) => soporteRow({ id: `s-${i}` })) });
    const res = await POST(post(enlace), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(MAX_SOPORTES_MESSAGE);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
  });

  it("re-checks the limit under the transaction (a concurrent attach filled it)", async () => {
    vivos = 5;
    const res = await POST(post(enlace), ctx);
    expect(res.status).toBe(400);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
    expect(logChange).not.toHaveBeenCalled();
  });

  it("answers 409 when the stored object already backs another soporte", async () => {
    mocks.soporteCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
        meta: { target: "soportes_proyecto_storage_path_key" },
      }),
    );
    expect((await POST(post(archivo), ctx)).status).toBe(409);
  });

  it("rejects a malformed body, a key of another project and a file missing from storage", async () => {
    expect((await POST(post({}), ctx)).status).toBe(400);
    expect((await POST(post([enlace]), ctx)).status).toBe(400);
    expect((await POST(post({ url_externa: "javascript:alert(1)", nombre: "x" }), ctx)).status).toBe(400);
    const otro = { ...archivo, storage_path: "proyectos/pry-2/soportes/6f1c_factura.pdf" };
    expect((await POST(post(otro), ctx)).status).toBe(400);
    mocks.info.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    expect((await POST(post(archivo), ctx)).status).toBe(400);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
  });
});

describe("POST attachments: access and state", () => {
  it("answers 404 for a missing project or expense", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(enlace), ctx)).status).toBe(404);
    vi.mocked(db.gasto.findFirst).mockResolvedValueOnce(null as never);
    expect((await POST(post(enlace), ctx)).status).toBe(404);
  });

  it("answers 403 to a non-member COORDINADOR and to anyone who did not register the expense", async () => {
    authAs(coordinador);
    expect((await POST(post(enlace), ctx)).status).toBe(403);
    authAs(otraGerencia);
    const res = await POST(post(enlace), ctx);
    expect(res.status).toBe(403);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
  });

  it("lets the registrant be a member COORDINADOR", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    current = existente({ registrado_por_id: "coord-1" });
    expect((await POST(post(enlace), ctx)).status).toBe(201);
  });

  it("answers 409 when the project is not EN_EJECUCION", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("CERRADO"));
    expect((await POST(post(enlace), ctx)).status).toBe(409);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
  });

  it("answers 409 for a VALIDADO or ANULADO expense", async () => {
    for (const estado of ["VALIDADO", "ANULADO"]) {
      current = existente({ estado });
      const res = await POST(post(enlace), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("INVALID_STATE");
    }
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
  });
});
