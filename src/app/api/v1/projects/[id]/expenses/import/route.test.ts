// @vitest-environment node
// POST /api/v1/projects/:id/expenses/import — one workbook, one row per expense, no supports (S2):
// the gate of "Registrar gasto", file guards, the 400 for file-level errors, the validate-only preview
// (every row valid or invalid with its reason) and the apply (only the valid rows, one transaction,
// one shared audit batch). The database is mocked; parsing, rules and the writer are the real ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  rubroFindMany: vi.fn(),
  lineaFindMany: vi.fn(),
  gastoFindMany: vi.fn(),
  proyectoMiembroFindMany: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  soporteCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => {
  const tx = { gasto: { aggregate: mocks.aggregate, create: mocks.create }, soporteProyecto: { create: mocks.soporteCreate } };
  return {
    db: {
      proyecto: { findFirst: mocks.proyectoFindFirst },
      rubro: { findMany: mocks.rubroFindMany },
      lineaPresupuestal: { findMany: mocks.lineaFindMany },
      gasto: { findMany: mocks.gastoFindMany, aggregate: mocks.aggregate },
      proyectoMiembro: { findMany: mocks.proyectoMiembroFindMany },
      $transaction: mocks.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    },
  };
});

import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { RUBRO_SIN_ASIGNADO_MESSAGE } from "@/lib/api/gastos";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { ENCABEZADOS_GASTOS, MAX_FILAS_GASTOS } from "@/lib/proyectos/gastos-import/parse";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({
    id: "pry-1",
    estado,
    fecha_inicio: new Date("2026-10-05"),
    fecha_fin: new Date("2027-01-29"),
    miembros: miembro ? [{ id: "m-1" }] : [],
  }) as never;

const rubroTransporte = { id: "rub-1", codigo: "R12", nombre: "Transporte" };
const rubroViaticos = { id: "rub-2", codigo: "R10", nombre: "Viáticos" };
const rubroSinAsignar = { id: "rub-3", codigo: "R99", nombre: "Sin asignar" };

type Celda = string | number | null;
const fila = (data: Partial<Record<(typeof ENCABEZADOS_GASTOS)[number], Celda>> = {}): Celda[] => {
  const base: Record<string, Celda> = {
    Rubro: "Transporte",
    "Fecha del documento": "2026-10-15",
    "Tipo de soporte": "Factura de proveedor",
    Tercero: "Proveedor SAS",
    "Tipo de identificación": "NIT",
    "Número de identificación": "900.123.456-7",
    "Número de documento": "FE-0123",
    Descripción: "Tiquetes del equipo",
    Subtotal: 1500000.5,
    IVA: 0,
    Total: null,
    Periodo: null,
    ...data,
  };
  return ENCABEZADOS_GASTOS.map((h) => base[h] ?? null);
};

async function libro(filas: Celda[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Gastos");
  hoja.addRow([...ENCABEZADOS_GASTOS]);
  for (const f of filas) hoja.addRow(f);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function subida(
  contenido: Buffer | string,
  opciones: { nombre?: string; tipo?: string; campo?: string; modo?: string; headers?: Record<string, string> } = {},
): Request {
  const form = new FormData();
  form.set(
    opciones.campo ?? "archivo",
    new File([typeof contenido === "string" ? contenido : new Uint8Array(contenido)], opciones.nombre ?? "gastos.xlsx", {
      type: opciones.tipo ?? XLSX_MIME,
    }),
  );
  if (opciones.modo) form.set("modo", opciones.modo);
  return new Request("http://localhost/api/v1/projects/pry-1/expenses/import", {
    method: "POST",
    body: form,
    headers: opciones.headers,
  });
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

let creados = 0;
beforeEach(() => {
  creados = 0;
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.rubroFindMany.mockResolvedValue([rubroTransporte, rubroViaticos, rubroSinAsignar]);
  mocks.lineaFindMany.mockResolvedValue([
    { id: "lin-1", monto_proyectado_cop: new Prisma.Decimal("24000000"), rubro: rubroTransporte },
    { id: "lin-2", monto_proyectado_cop: new Prisma.Decimal("5000000"), rubro: rubroViaticos },
    { id: "lin-3", monto_proyectado_cop: new Prisma.Decimal("0"), rubro: rubroSinAsignar },
  ]);
  mocks.gastoFindMany.mockResolvedValue([]);
  mocks.proyectoMiembroFindMany.mockResolvedValue([]);
  mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: null } });
  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: `gas-${++creados}`,
    estado: "REGISTRADO",
    created_at: new Date("2026-10-16T12:00:00.000Z"),
    ...data,
  }));
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("POST expenses/import — gate and file guards", () => {
  it("404 for an unknown project, 403 for a non-member COORDINADOR and a COLABORADOR", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await POST(subida(await libro([fila()])), ctx)).status).toBe(404);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto());
    authAs(coordinador);
    expect((await POST(subida(await libro([fila()])), ctx)).status).toBe(403);
    authAs(colaborador);
    expect((await POST(subida(await libro([fila()])), ctx)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("409 when the project is not EN_EJECUCION", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("BORRADOR"));
    const res = await POST(subida(await libro([fila()])), ctx);
    expect(res.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("lets a member COORDINADOR import", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await POST(subida(await libro([fila()]), { modo: "validar" }), ctx)).status).toBe(200);
  });

  it("413 over the size cap (declared and real)", async () => {
    const declarada = await POST(
      subida(await libro([fila()]), { headers: { "content-length": String(IMPORT_MAX_BYTES + 1_000_000) } }),
      ctx,
    );
    expect(declarada.status).toBe(413);
    expect((await declarada.json()).code).toBe("FILE_TOO_LARGE");
    const real = await POST(subida(Buffer.alloc(IMPORT_MAX_BYTES + 1)), ctx);
    expect(real.status).toBe(413);
  });

  it("400 without the `archivo` field, with a non-xlsx name and with bytes that are not a zip", async () => {
    expect((await POST(subida(await libro([fila()]), { campo: "otro" }), ctx)).status).toBe(400);
    const csv = await POST(subida("a,b", { nombre: "gastos.csv", tipo: "text/csv" }), ctx);
    expect(csv.status).toBe(400);
    expect((await csv.json()).error).toContain(".xlsx");
    const falso = await POST(subida("no es un zip"), ctx);
    expect(falso.status).toBe(400);
    expect((await falso.json()).error).toBe("El archivo no es un Excel válido.");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("POST expenses/import — file-level errors reject the whole file (S5)", () => {
  it("400 with the report when the headers are missing", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Hoja1").addRow(["Rubro", "Subtotal"]);
    const res = await POST(subida(Buffer.from(await workbook.xlsx.writeBuffer())), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.reporte.errores).toEqual([{ fila: null, rubro: null, mensaje: expect.stringContaining("Fecha del documento") }]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("400 with the single old-template message when the file only has «Valor (COP)» (S4)", async () => {
    const workbook = new ExcelJS.Workbook();
    const hoja = workbook.addWorksheet("Gastos");
    hoja.addRow(["Rubro", "Fecha del documento", "Tipo de soporte", "Tercero", "Número de documento", "Descripción", "Valor (COP)"]);
    hoja.addRow(["Transporte", "2026-10-15", "Otro", "Proveedor SAS", "FE-1", "Tiquetes", 1190000]);
    const res = await POST(subida(Buffer.from(await workbook.xlsx.writeBuffer())), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reporte.errores).toEqual([
      { fila: null, rubro: null, mensaje: "Esta plantilla es anterior: descarga la nueva, que separa Subtotal e IVA." },
    ]);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("400 when the file has no rows, and when it has more than the cap", async () => {
    const sinFilas = await POST(subida(await libro([])), ctx);
    expect(sinFilas.status).toBe(400);
    expect((await sinFilas.json()).reporte.errores).toHaveLength(1);
    const muchas = await POST(subida(await libro(Array.from({ length: MAX_FILAS_GASTOS + 1 }, () => fila()))), ctx);
    expect(muchas.status).toBe(400);
    expect((await muchas.json()).reporte.errores[0].mensaje).toContain(String(MAX_FILAS_GASTOS));
  });
});

describe("POST expenses/import — validate-only preview", () => {
  it("lists every row as valid or invalid with its reason and writes nothing", async () => {
    const libroMixto = await libro([
      fila(),
      fila({ Rubro: "Sin asignar", "Número de documento": "FE-2" }),
      fila({ Subtotal: 0, "Número de documento": "FE-3" }),
      fila({ Rubro: "Viáticos", "Número de documento": "FE-4", Subtotal: 200000 }),
    ]);
    const res = await POST(subida(libroMixto, { modo: "validar" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.importado).toBe(false);
    expect(body.resumen).toEqual({ total: 4, validas: 2, invalidas: 2, valor_validas: "1700000.50" });
    expect(body.filas.map((f: { fila: number; valida: boolean; mensaje: string | null }) => [f.fila, f.valida, f.mensaje])).toEqual([
      [2, true, null],
      [3, false, RUBRO_SIN_ASIGNADO_MESSAGE],
      [4, false, "«Subtotal»: El subtotal debe ser mayor que cero."],
      [5, true, null],
    ]);
    expect(body.filas[0]).toMatchObject({
      rubro: "Transporte",
      tercero: "Proveedor SAS",
      numero_documento: "FE-0123",
      valor: "1500000.50",
      periodo: "2026-10",
      alertas: [],
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("flags the second row of an in-file duplicate as invalid", async () => {
    const res = await POST(subida(await libro([fila(), fila()]), { modo: "validar" }), ctx);
    const body = await res.json();
    expect(body.filas.map((f: { valida: boolean }) => f.valida)).toEqual([true, false]);
    expect(body.filas[1].mensaje).toContain("Duplicado dentro del archivo");
  });

  it("adds a non-blocking DUPLICADO alert when a live expense already has the same id and document number", async () => {
    mocks.gastoFindMany.mockResolvedValue([{ id: "gas-viejo", proyecto_id: "pry-1", proyecto: { codigo: "P-001" } }]);
    const body = await (await POST(subida(await libro([fila()]), { modo: "validar" }), ctx)).json();
    expect(body.filas[0].valida).toBe(true);
    expect(body.filas[0].alertas).toEqual([expect.objectContaining({ tipo: "DUPLICADO", gasto_id: "gas-viejo" })]);
  });

  it("adds the SOBREGASTO alert like a single expense", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("23000000") } });
    const body = await (await POST(subida(await libro([fila()]), { modo: "validar" }), ctx)).json();
    expect(body.filas[0].alertas).toEqual([expect.objectContaining({ tipo: "SOBREGASTO" })]);
  });
});

describe("POST expenses/import — apply", () => {
  it("creates only the valid rows in one transaction, as REGISTRADO with no supports, and returns the rejected ones", async () => {
    const res = await POST(
      subida(await libro([fila(), fila({ Rubro: "Inventado", "Número de documento": "FE-2" }), fila({ "Número de documento": "FE-3", Descripción: "Otro viaje" })])),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      importado: true,
      creados: 2,
      gastos: [
        { fila: 2, id: "gas-1" },
        { fila: 4, id: "gas-2" },
      ],
      rechazadas: [{ fila: 3, rubro: "Inventado", mensaje: "No encontramos el rubro «Inventado» en el catálogo." }],
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      proyecto_id: "pry-1",
      linea_id: "lin-1",
      periodo: "2026-10",
      tipo_soporte: "FACTURA_PROVEEDOR",
      tercero_nombre: "Proveedor SAS",
      tercero_tipo_id: "NIT",
      tercero_numero_id: "900.123.456-7",
      tercero_id_norm: "900123456",
      numero_documento: "FE-0123",
      numero_documento_norm: "FE0123",
      descripcion: "Tiquetes del equipo",
      alerta_sobregasto: false,
      registrado_por_id: "ger-1",
    });
    expect(String(mocks.create.mock.calls[0][0].data.monto_cop)).toBe("1500000.5");
    expect(mocks.create.mock.calls[0][0].data.estado).toBeUndefined();
  });

  it("stores Subtotal 1.000.000 + IVA 190.000 as a Total of 1.190.000 and audits the three amounts (S2)", async () => {
    const res = await POST(subida(await libro([fila({ Subtotal: 1000000, IVA: 190000 })])), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.valor_total).toBe("1190000.00");
    const data = mocks.create.mock.calls[0][0].data;
    expect([String(data.subtotal_cop), String(data.iva_cop), String(data.monto_cop)]).toEqual(["1000000", "190000", "1190000"]);
    expect(vi.mocked(logChanges).mock.calls[0][1][0].valor_nuevo).toMatchObject({
      subtotal: "1000000.00",
      iva: "190000.00",
      valor: "1190000.00",
    });
  });

  it("rejects the row Subtotal 500.000, IVA 95.000, Total 600.000 with its row and column, and keeps the valid ones (S2)", async () => {
    const res = await POST(
      subida(await libro([fila(), fila({ "Número de documento": "FE-2", Subtotal: 500000, IVA: 95000, Total: 600000 })])),
      ctx,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.creados).toBe(1);
    expect(body.rechazadas).toEqual([
      { fila: 3, rubro: "Transporte", mensaje: "«Total»: no coincide con Subtotal + IVA ($ 595.000). Corrígelo o deja la columna vacía." },
    ]);
  });

  it("logs one CREAR/gasto row per expense, all in ONE shared batch id that the response returns", async () => {
    const body = await (await POST(subida(await libro([fila(), fila({ "Número de documento": "FE-2" })])), ctx)).json();
    expect(logChanges).toHaveBeenCalledTimes(1);
    const filas = vi.mocked(logChanges).mock.calls[0][1];
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => [f.usuario_id, f.accion, f.entidad, f.entidad_id, f.proyecto_id])).toEqual([
      ["ger-1", "CREAR", "gasto", "gas-1", "pry-1"],
      ["ger-1", "CREAR", "gasto", "gas-2", "pry-1"],
    ]);
    const lotes = new Set(filas.map((f) => f.lote_id));
    expect(lotes.size).toBe(1);
    expect([...lotes][0]).toBe(body.lote_id);
    expect(typeof body.lote_id).toBe("string");
    expect(filas[0].valor_nuevo).toMatchObject({
      rubro_id: "rub-1",
      tercero_numero_id: "***567",
      valor: "1500000.50",
      estado: "REGISTRADO",
      soportes: 0,
    });
  });

  it("computes alerta_sobregasto like a single create and returns the per-row alerts", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("23000000") } });
    mocks.gastoFindMany.mockResolvedValue([{ id: "gas-viejo", proyecto_id: "pry-1", proyecto: { codigo: "P-001" } }]);
    const body = await (await POST(subida(await libro([fila()])), ctx)).json();
    expect(mocks.create.mock.calls[0][0].data.alerta_sobregasto).toBe(true);
    expect(body.alertas).toEqual([
      {
        fila: 2,
        alertas: [expect.objectContaining({ tipo: "SOBREGASTO" }), expect.objectContaining({ tipo: "DUPLICADO", gasto_id: "gas-viejo" })],
      },
    ]);
  });

  it("answers 400 with the row report and writes nothing when no row is valid", async () => {
    const res = await POST(subida(await libro([fila({ Rubro: "Inventado" }), fila({ Subtotal: 0, "Número de documento": "FE-2" })])), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.reporte.errores.map((e: { fila: number }) => e.fila)).toEqual([2, 3]);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("does not notify anyone: the transaction only creates gastos and the audit rows", async () => {
    await POST(subida(await libro([fila()])), ctx);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
