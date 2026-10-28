// GET/POST /api/v1/projects/:id/expenses (S6 U3): register an expense against a budget line
// with at least one support, duplicate and early-overspend alerts, and the list with the
// third-party identification / supports redacted for actors without access (RNF-03, RNF-04).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  create: vi.fn(),
  soporteCreate: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => ({ storage: { from: () => ({ info: mocks.info }) } })),
}));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return { ...actual, canViewFinancialSupports: vi.fn(actual.canViewFinancialSupports) };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    lineaPresupuestal: { findFirst: vi.fn() },
    gasto: { findMany: vi.fn() },
    proyectoMiembro: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        gasto: { aggregate: mocks.aggregate, create: mocks.create },
        soporteProyecto: { create: mocks.soporteCreate },
      }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { canViewFinancialSupports } from "@/lib/permissions";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({
    id: "pry-1",
    estado,
    fecha_inicio: new Date("2026-10-05"),
    fecha_fin: new Date("2027-01-29"),
    miembros: miembro ? [{ id: "m-1" }] : [],
  }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const KEY = "proyectos/pry-1/soportes/6f1c_factura.pdf";
const archivo = { storage_path: KEY, nombre: "factura.pdf", tamano_bytes: 2048, tipo_mime: "application/pdf" };
const enlace = { url_externa: "https://drive.example.com/f/1", nombre: "Carpeta de soportes" };
const valido = {
  rubro_id: "rub-1",
  fecha_documento: "2026-10-15",
  tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: "NIT",
  tercero_numero_id: "900.123.456-7",
  numero_documento: "FE-0123",
  descripcion: "Tiquetes del equipo",
  subtotal: "1500000.50",
  iva: "0",
  soportes: [archivo],
};
const linea = (asignado = "24000000") => ({
  id: "lin-1",
  monto_proyectado_cop: new Prisma.Decimal(asignado),
  rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" },
});

const gastoRow = (data: Record<string, unknown> = {}) => ({
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
  subtotal_cop: new Prisma.Decimal("1500000.50"),
  iva_cop: new Prisma.Decimal("0"),
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
  ...data,
});
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

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function post(body: unknown): Request {
  return new Request("http://localhost/x/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/x/expenses");
const createdData = () => mocks.create.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValue(linea() as never);
  vi.mocked(db.gasto.findMany).mockResolvedValue([]);
  vi.mocked(db.proyectoMiembro.findMany).mockResolvedValue([]);
  mocks.info.mockResolvedValue({ data: { size: 2048 }, error: null });
  mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: null } });
  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => gastoRow(data));
  mocks.soporteCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => soporteRow(data));
});
afterEach(() => vi.clearAllMocks());

describe("POST expenses: registration", () => {
  it("creates a REGISTRADO expense with the RF-20 fields, the soporte and an audit row", async () => {
    const res = await POST(post(valido), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.gasto).toMatchObject({
      id: "gas-1",
      estado: "REGISTRADO",
      periodo: "2026-10",
      valor: "1500000.50",
      fecha_documento: "2026-10-15",
      tipo_soporte: "FACTURA_PROVEEDOR",
      tercero_nombre: "Proveedor SAS",
      tercero_tipo_id: "NIT",
      tercero_numero_id: "900.123.456-7",
      numero_documento: "FE-0123",
      datos_incompletos: false,
      alerta_sobregasto: false,
      rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" },
    });
    expect(json.gasto.soportes).toHaveLength(1);
    expect(json.gasto).not.toHaveProperty("tercero_id_norm");
    expect(json.alertas).toEqual([]);
    expect(createdData()).toMatchObject({
      proyecto_id: "pry-1",
      linea_id: "lin-1",
      tercero_id_norm: "900123456",
      numero_documento_norm: "FE0123",
      registrado_por_id: "ger-1",
    });
    expect(createdData()).not.toHaveProperty("estado");
    expect(mocks.soporteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ proyecto_id: "pry-1", gasto_id: "gas-1", storage_path: KEY, tamano_bytes: 2048 }),
    });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "CREAR", entidad: "gasto", entidad_id: "gas-1", proyecto_id: "pry-1" }),
    );
  });

  it("never writes the third-party number to the audit ledger (RNF-04)", async () => {
    await POST(post(valido), ctx);
    expect(JSON.stringify(vi.mocked(logChange).mock.calls)).not.toContain("900.123.456-7");
    expect(JSON.stringify(vi.mocked(logChange).mock.calls)).not.toContain("900123456");
  });

  it("defaults the periodo to the month of the document date", async () => {
    await POST(post({ ...valido, fecha_documento: "2026-11-30" }), ctx);
    expect(createdData().periodo).toBe("2026-11");
  });

  it("accepts a link-only soporte without touching storage", async () => {
    const res = await POST(post({ ...valido, soportes: [enlace] }), ctx);
    expect(res.status).toBe(201);
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("rejects a link soporte that is not https (javascript:, data:, http:, ftp:) and stores nothing", async () => {
    for (const url_externa of ["javascript:alert(1)", "data:text/html,<b>x</b>", "http://example.com/x", "ftp://example.com/x", "no es una url"]) {
      const res = await POST(post({ ...valido, soportes: [{ ...enlace, url_externa }] }), ctx);
      expect(res.status, url_externa).toBe(400);
      expect((await res.json()).error).toContain("https");
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 400 without a soporte", async () => {
    for (const soportes of [undefined, []]) {
      const res = await POST(post({ ...valido, soportes }), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Adjunta al menos un soporte (archivo o enlace).");
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows at most five soportes", async () => {
    const res = await POST(post({ ...valido, soportes: Array.from({ length: 6 }, () => enlace) }), ctx);
    expect(res.status).toBe(400);
  });

  it("answers 400 for a rubro without a line or with a zero assigned amount", async () => {
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(400);
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValueOnce(linea("0") as never);
    const res = await POST(post(valido), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Solo puedes registrar gastos en rubros con valor asignado.");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 400 for a periodo outside the project months", async () => {
    expect((await POST(post({ ...valido, periodo: "2027-03" }), ctx)).status).toBe(400);
    expect((await POST(post({ ...valido, fecha_documento: "2027-03-10" }), ctx)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 400 for a non-positive, float-noise or non-numeric subtotal", async () => {
    for (const subtotal of ["0", "-5", "abc", "10.001", 0.1 + 0.2, null]) {
      expect((await POST(post({ ...valido, subtotal }), ctx)).status).toBe(400);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 400 for a negative, float-noise, non-numeric or missing IVA, and for the old valor field", async () => {
    for (const iva of ["-1", "abc", "10.001", 0.1 + 0.2, null, undefined]) {
      expect((await POST(post({ ...valido, iva }), ctx)).status, String(iva)).toBe(400);
    }
    const negativo = await POST(post({ ...valido, iva: "-1" }), ctx);
    expect((await negativo.json()).error).toBe("El IVA no puede ser negativo.");
    const sinMontos: Record<string, unknown> = { ...valido };
    delete sinMontos.subtotal;
    delete sinMontos.iva;
    expect((await POST(post({ ...sinMontos, valor: "1500000.50" }), ctx)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("stores Subtotal 1.000.000 + IVA 190.000 as a Total of 1.190.000 and shows the three amounts (S2)", async () => {
    const res = await POST(post({ ...valido, subtotal: "1000000", iva: "190000" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(createdData()).toMatchObject({
      subtotal_cop: new Prisma.Decimal("1000000"),
      iva_cop: new Prisma.Decimal("190000"),
      monto_cop: new Prisma.Decimal("1190000"),
    });
    expect(json.gasto).toMatchObject({ subtotal: "1000000.00", iva: "190000.00", valor: "1190000.00" });
    expect(vi.mocked(logChange).mock.calls[0][1]).toMatchObject({
      valor_nuevo: expect.objectContaining({ subtotal: "1000000.00", iva: "190000.00", valor: "1190000.00" }),
    });
  });

  it("accepts an IVA of 0 and stores the Total equal to the Subtotal (S1)", async () => {
    const res = await POST(post({ ...valido, subtotal: "250000", iva: 0 }), ctx);
    expect(res.status).toBe(201);
    expect(createdData()).toMatchObject({ iva_cop: new Prisma.Decimal("0"), monto_cop: new Prisma.Decimal("250000") });
  });

  it("rejects an unknown tipo_soporte and any attempt to choose the estado", async () => {
    expect((await POST(post({ ...valido, tipo_soporte: "RECIBO" }), ctx)).status).toBe(400);
    expect((await POST(post({ ...valido, estado: "VALIDADO" }), ctx)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a key of another project and a file missing from storage", async () => {
    const otro = { ...archivo, storage_path: "proyectos/pry-2/soportes/6f1c_factura.pdf" };
    expect((await POST(post({ ...valido, soportes: [otro] }), ctx)).status).toBe(400);
    mocks.info.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    expect((await POST(post(valido), ctx)).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("answers 409 when the stored object already backs another soporte", async () => {
    mocks.soporteCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
        meta: { target: "soportes_proyecto_storage_path_key" },
      }),
    );
    expect((await POST(post(valido), ctx)).status).toBe(409);
  });
});

describe("POST expenses: access and state", () => {
  it("allows ADM/GER and a member COORDINADOR; 403 for a non-member COORDINADOR and a COLABORADOR", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await POST(post(valido), ctx)).status).toBe(201);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", false));
    expect((await POST(post(valido), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await POST(post(valido), ctx)).status).toBe(403);
  });

  it("answers 404 for a missing project and 409 outside EN_EJECUCION", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(valido), ctx)).status).toBe(404);
    for (const estado of ["BORRADOR", "SUSPENDIDO", "CERRADO"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(proyecto(estado));
      expect((await POST(post(valido), ctx)).status).toBe(409);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("POST expenses: alerts", () => {
  it("flags the early overspend warning without blocking and without notifying", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("23500000") } });
    const res = await POST(post({ ...valido, subtotal: "1000000" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(createdData().alerta_sobregasto).toBe(true);
    expect(json.alertas).toEqual([expect.objectContaining({ tipo: "SOBREGASTO" })]);
    expect(mocks.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { linea_id: "lin-1", estado: "VALIDADO" } }),
    );
  });

  it("checks the overspend with the Total, IVA included", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("23500000") } });
    const res = await POST(post({ ...valido, subtotal: "400000", iva: "100001" }), ctx);
    expect(res.status).toBe(201);
    expect(createdData().alerta_sobregasto).toBe(true);
  });

  it("does not flag when reaching the assigned amount exactly", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("23500000") } });
    const res = await POST(post({ ...valido, subtotal: "500000" }), ctx);
    expect(createdData().alerta_sobregasto).toBe(false);
    expect((await res.json()).alertas).toEqual([]);
  });

  it("reports a duplicate (same normalized id and document) with the project code for a manager", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { id: "gas-9", proyecto_id: "pry-2", proyecto: { codigo: "PRY-2026-002" } },
    ] as never);
    const json = await (await POST(post(valido), ctx)).json();
    expect(json.alertas).toEqual([
      expect.objectContaining({ tipo: "DUPLICADO", gasto_id: "gas-9", proyecto_codigo: "PRY-2026-002" }),
    ]);
    expect(json.alertas[0].mensaje).toContain("PRY-2026-002");
    expect(db.gasto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tercero_id_norm: "900123456",
          numero_documento_norm: "FE0123",
          estado: { in: ["REGISTRADO", "VALIDADO"] },
          id: { not: "gas-1" },
        },
      }),
    );
  });

  it("hides the project code of a duplicate the actor cannot read", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { id: "gas-9", proyecto_id: "pry-2", proyecto: { codigo: "PRY-2026-002" } },
    ] as never);
    const json = await (await POST(post(valido), ctx)).json();
    expect(json.alertas[0]).toMatchObject({ tipo: "DUPLICADO", gasto_id: null, proyecto_codigo: null });
    expect(json.alertas[0].mensaje).toContain("(en otro proyecto)");
    expect(JSON.stringify(json)).not.toContain("PRY-2026-002");
  });

  it("shows the code when the coordinator belongs to that project", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { id: "gas-9", proyecto_id: "pry-2", proyecto: { codigo: "PRY-2026-002" } },
    ] as never);
    vi.mocked(db.proyectoMiembro.findMany).mockResolvedValue([{ proyecto_id: "pry-2" }] as never);
    const json = await (await POST(post(valido), ctx)).json();
    expect(json.alertas[0]).toMatchObject({ gasto_id: "gas-9", proyecto_codigo: "PRY-2026-002" });
  });

  it("skips the duplicate lookup when the third-party number is missing", async () => {
    const { tercero_numero_id: _omit, ...sinNumero } = valido;
    void _omit;
    const res = await POST(post(sinNumero), ctx);
    expect(res.status).toBe(201);
    expect(createdData().tercero_id_norm).toBeNull();
    expect(db.gasto.findMany).not.toHaveBeenCalled();
  });
});

describe("GET expenses", () => {
  const filas = () => [
    {
      ...gastoRow({ id: "g1", estado: "REGISTRADO", monto_cop: new Prisma.Decimal("100.00") }),
      linea: { rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
      soportes: [soporteRow()],
    },
    {
      ...gastoRow({ id: "g2", estado: "VALIDADO", monto_cop: new Prisma.Decimal("200.50") }),
      linea: { rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
      soportes: [],
    },
    {
      ...gastoRow({ id: "g3", estado: "VALIDADO", monto_cop: new Prisma.Decimal("50") }),
      linea: { rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
      soportes: [],
    },
  ];

  beforeEach(() => {
    vi.mocked(db.gasto.findMany).mockResolvedValue(filas() as never);
  });

  it("lists the expenses newest first with totals by estado", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.gastos).toHaveLength(3);
    expect(json.totales).toMatchObject({
      REGISTRADO: { cantidad: 1, valor: "100.00" },
      VALIDADO: { cantidad: 2, valor: "250.50" },
      RECHAZADO: { cantidad: 0, valor: "0.00" },
      ANULADO: { cantidad: 0, valor: "0.00" },
    });
    expect(db.gasto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyecto_id: "pry-1" }, orderBy: [{ created_at: "desc" }, { id: "desc" }] }),
    );
    expect(json.gastos[0].tercero_numero_id).toBe("900.123.456-7");
    expect(json.gastos[0].soportes).toHaveLength(1);
  });

  it("reports the live support count of each expense", async () => {
    const json = await (await GET(get(), ctx)).json();
    expect(json.gastos.map((gasto: { soportes_count: number }) => gasto.soportes_count)).toEqual([1, 0, 0]);
  });

  it("summarizes live expenses, those with a live support and the observados (REGISTRADO with alert or incomplete data)", async () => {
    const fila = (data: Record<string, unknown>, soportes: unknown[]) => ({
      ...gastoRow(data),
      linea: { rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
      soportes,
    });
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      fila({ id: "a", estado: "REGISTRADO", monto_cop: new Prisma.Decimal("100"), alerta_sobregasto: true }, [soporteRow()]),
      fila({ id: "b", estado: "REGISTRADO", monto_cop: new Prisma.Decimal("40.50"), tercero_numero_id: null }, []),
      fila({ id: "c", estado: "REGISTRADO", monto_cop: new Prisma.Decimal("10") }, [soporteRow()]),
      fila({ id: "d", estado: "VALIDADO", monto_cop: new Prisma.Decimal("200"), alerta_sobregasto: true }, [soporteRow()]),
      fila({ id: "e", estado: "RECHAZADO", monto_cop: new Prisma.Decimal("5") }, [soporteRow()]),
      fila({ id: "f", estado: "ANULADO", monto_cop: new Prisma.Decimal("7") }, []),
    ] as never);
    const json = await (await GET(get(), ctx)).json();
    expect(json.resumen).toEqual({
      vigentes: 4,
      con_soporte: 3,
      observados: { cantidad: 2, valor: "140.50" },
    });
  });

  it("omits the with-support count (and the per-expense count) without financial-support access", async () => {
    vi.mocked(canViewFinancialSupports).mockReturnValue(false);
    const json = await (await GET(get(), ctx)).json();
    expect(json.resumen).not.toHaveProperty("con_soporte");
    expect(json.resumen.vigentes).toBe(3);
    for (const gasto of json.gastos) expect(gasto).not.toHaveProperty("soportes_count");
    vi.mocked(canViewFinancialSupports).mockReturnValue(true);
  });

  it("is readable in any estado and by a member COORDINADOR", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("CERRADO", true));
    const json = await (await GET(get(), ctx)).json();
    expect(json.gastos[0].tercero_numero_id).toBe("900.123.456-7");
  });

  it("omits the third-party number and the supports for an actor without financial-support access", async () => {
    vi.mocked(canViewFinancialSupports).mockReturnValue(false);
    const json = await (await GET(get(), ctx)).json();
    for (const gasto of json.gastos) {
      expect(gasto).not.toHaveProperty("tercero_numero_id");
      expect(gasto).not.toHaveProperty("soportes");
      expect(gasto).not.toHaveProperty("tercero_id_norm");
    }
    expect(JSON.stringify(json)).not.toContain("900.123.456-7");
  });

  it("answers 404 for a missing project and 403 for a COLABORADOR or a non-member COORDINADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    authAs(colaborador);
    expect((await GET(get(), ctx)).status).toBe(403);
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", false));
    expect((await GET(get(), ctx)).status).toBe(403);
  });
});
