// @vitest-environment node
// Verifier probes: POST /expenses/:expenseId/attachments authorization, state, scoping and path rules.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ info: vi.fn(), soporteCreate: vi.fn(), soporteCount: vi.fn(), reread: vi.fn(), gastoFindFirst: vi.fn(), proyectoFindFirst: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ info: mocks.info }) } })) }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: mocks.proyectoFindFirst },
    gasto: { findFirst: mocks.gastoFindFirst },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ soporteProyecto: { create: mocks.soporteCreate, count: mocks.soporteCount }, gasto: { findFirstOrThrow: mocks.reread } }),
    ),
  },
}));

import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { POST } from "@/app/api/v1/projects/[id]/expenses/[expenseId]/attachments/route";

const U = (id: string, rol: string) => ({ id, rol }) as Usuario;
const reg = U("reg-1", "GERENCIA");
const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, fecha_inicio: new Date("2026-10-05"), fecha_fin: new Date("2027-01-29"), miembros: miembro ? [{ id: "m" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", expenseId: "gas-1" }) };
const enlace = { url_externa: "https://drive.example.com/f/1", nombre: "Carpeta" };
const KEY = "proyectos/pry-1/soportes/6f1c_factura.pdf";
const archivo = (storage_path = KEY) => ({ storage_path, nombre: "factura.pdf", tamano_bytes: 2048, tipo_mime: "application/pdf" });
const gasto = (d: Record<string, unknown> = {}) => ({
  id: "gas-1", proyecto_id: "pry-1", linea_id: "l", fecha_documento: new Date("2026-10-15"), periodo: "2026-10", tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "P", tercero_tipo_id: null, tercero_numero_id: null, tercero_id_norm: null, numero_documento: "1", numero_documento_norm: "1",
  descripcion: "d", monto_cop: new Prisma.Decimal("10"), estado: "REGISTRADO", alerta_sobregasto: false, registrado_por_id: "reg-1",
  created_at: new Date(), updated_at: new Date(), validado_por_id: null, validado_at: null, rechazado_por_id: null, rechazado_at: null,
  motivo_rechazo: null, anulado_por_id: null, anulado_at: null, motivo_anulacion: null,
  linea: { rubro: { id: "r", codigo: "R1", nombre: "T" } }, soportes: [] as unknown[], ...d,
});
const post = (body: unknown) => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const as = (u: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: u, supabaseUser: {} as never });

beforeEach(() => {
  as(reg);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.gastoFindFirst.mockResolvedValue(gasto());
  mocks.info.mockResolvedValue({ data: { size: 2048 }, error: null });
  mocks.soporteCount.mockResolvedValue(0);
  mocks.soporteCreate.mockResolvedValue({});
  mocks.reread.mockResolvedValue(gasto({ soportes: [] }));
});
afterEach(() => vi.clearAllMocks());

describe("attach: who may attach", () => {
  const cases: [string, Usuario, boolean, number][] = [
    ["registrant GERENCIA", reg, false, 201],
    ["other GERENCIA", U("g2", "GERENCIA"), false, 403],
    ["other ADMINISTRADOR", U("a1", "ADMINISTRADOR"), false, 403],
    ["COORDINADOR non-member", U("c1", "COORDINADOR"), false, 403],
    ["COORDINADOR member not registrant", U("c1", "COORDINADOR"), true, 403],
    ["COLABORADOR (registrant id)", U("reg-1", "COLABORADOR"), false, 403],
  ];
  for (const [name, user, miembro, status] of cases) {
    it(`${name} -> ${status}`, async () => {
      as(user);
      mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION", miembro));
      const res = await POST(post(enlace), ctx);
      expect(res.status).toBe(status);
      if (status !== 201) { expect(mocks.soporteCreate).not.toHaveBeenCalled(); expect(logChange).not.toHaveBeenCalled(); }
    });
  }
  it("registrant who lost membership (COORDINADOR, no longer member) -> 403", async () => {
    as(U("reg-1", "COORDINADOR"));
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION", false));
    expect((await POST(post(enlace), ctx)).status).toBe(403);
  });
  it("order: colaborador sees 403 before 404 for a missing expense (no existence leak)", async () => {
    as(U("c9", "COLABORADOR"));
    mocks.gastoFindFirst.mockResolvedValue(null);
    expect((await POST(post(enlace), ctx)).status).toBe(403);
  });
});

describe("attach: expense scoping and states", () => {
  it("looks the expense up scoped to the project (another project's expense id -> 404)", async () => {
    mocks.gastoFindFirst.mockImplementation(async ({ where }: { where: { proyecto_id?: string } }) => (where.proyecto_id === "pry-1" ? null : gasto({ proyecto_id: "pry-2" })));
    const res = await POST(post(enlace), ctx);
    expect(res.status).toBe(404);
    expect(mocks.gastoFindFirst.mock.calls[0][0].where).toMatchObject({ id: "gas-1", proyecto_id: "pry-1" });
  });
  for (const [estado, status] of [["REGISTRADO", 201], ["RECHAZADO", 201], ["VALIDADO", 409], ["ANULADO", 409]] as const) {
    it(`${estado} -> ${status}`, async () => {
      mocks.gastoFindFirst.mockResolvedValue(gasto({ estado }));
      expect((await POST(post(enlace), ctx)).status).toBe(status);
    });
  }
  for (const estado of ["SUSPENDIDO", "CERRADO", "BORRADOR", "CANCELADO"]) {
    it(`project ${estado} -> 409`, async () => {
      mocks.proyectoFindFirst.mockResolvedValue(proyecto(estado));
      expect((await POST(post(enlace), ctx)).status).toBe(409);
      expect(mocks.soporteCreate).not.toHaveBeenCalled();
    });
  }
  it("6th support refused (live count from include), and under the transaction", async () => {
    mocks.gastoFindFirst.mockResolvedValue(gasto({ soportes: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` })) }));
    expect((await POST(post(enlace), ctx)).status).toBe(400);
    mocks.gastoFindFirst.mockResolvedValue(gasto({ soportes: [] }));
    mocks.soporteCount.mockResolvedValue(5);
    expect((await POST(post(enlace), ctx)).status).toBe(400);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
    expect(logChange).not.toHaveBeenCalled();
  });
  it("4 live -> 5th accepted, audit 4 -> 5", async () => {
    mocks.soporteCount.mockResolvedValue(4);
    mocks.gastoFindFirst.mockResolvedValue(gasto({ soportes: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}` })) }));
    expect((await POST(post(enlace), ctx)).status).toBe(201);
    expect(logChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ valor_anterior: 4, valor_nuevo: 5, accion: "EDITAR", entidad: "gasto", campo: "soportes" }));
  });
});

describe("attach: support body rules", () => {
  const bad = [
    "proyectos/pry-1/soportes/../../pry-2/soportes/x.pdf",
    "proyectos/pry-2/soportes/x.pdf",
    "proyectos/pry-10/soportes/x.pdf",
    "proyectos/pry-1evil/soportes/x.pdf",
    "/proyectos/pry-1/soportes/x.pdf",
    "proyectos/pry-1/soportes/",
    "proyectos/pry-1/soportes",
    "proyectos/pry-1//soportes/x.pdf",
    "proyectos/pry-1/avances/x.pdf",
    "soportes/x.pdf",
    "proyectos/pry-1/soportes/./x.pdf",
  ];
  for (const p of bad) it(`rejects storage_path ${p}`, async () => {
    const res = await POST(post(archivo(p)), ctx);
    expect(res.status).toBe(400);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
  });
  for (const u of ["http://x.co/f", "javascript:alert(1)", "ftp://x.co", "data:text/html,hi", "https://", "//x.co", "HTTPS://x.co/f"]) {
    it(`link ${u}`, async () => {
      const res = await POST(post({ url_externa: u, nombre: "n" }), ctx);
      expect([201, 400]).toContain(res.status);
      if (!/^https:\/\/[^/]/i.test(u)) expect(res.status).toBe(400);
    });
  }
  it("a body with both url_externa and storage_path is a link, never stores a path", async () => {
    await POST(post({ ...enlace, storage_path: KEY }), ctx);
    const call = mocks.soporteCreate.mock.calls[0]?.[0];
    if (call) expect(call.data.storage_path).toBeNull();
  });
  it("client cannot override gasto_id/proyecto_id/subido_por_id through the body", async () => {
    await POST(post({ ...enlace, gasto_id: "otro", proyecto_id: "pry-2", subido_por_id: "x" }), ctx);
    const d = mocks.soporteCreate.mock.calls[0]?.[0]?.data;
    if (d) expect(d).toMatchObject({ gasto_id: "gas-1", proyecto_id: "pry-1", subido_por_id: "reg-1" });
  });
  it("invalid JSON -> 400, object missing in storage -> 400, unique violation -> 409", async () => {
    expect((await POST(new Request("http://x", { method: "POST", body: "{" }), ctx)).status).toBe(400);
    mocks.info.mockResolvedValueOnce({ data: null, error: { message: "nf" } });
    expect((await POST(post(archivo()), ctx)).status).toBe(400);
    mocks.soporteCreate.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("d", { code: "P2002", clientVersion: "x", meta: { target: "soportes_proyecto_storage_path_key" } }));
    expect((await POST(post(archivo()), ctx)).status).toBe(409);
    expect(logChange).not.toHaveBeenCalled();
  });
});
