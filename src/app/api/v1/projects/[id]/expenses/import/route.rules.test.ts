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
import { ENCABEZADOS_GASTOS, MAX_FILAS_GASTOS } from "@/lib/proyectos/gastos-import/parse";
import { ZIP_MAX_DESCOMPRIMIDO, ZIP_MAX_ENTRADAS } from "@/lib/api/plantilla-import";
import { POST } from "@/app/api/v1/projects/[id]/expenses/import/route";

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
    "Valor (COP)": 1500000.5,
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

import JSZip from "jszip";

const ok = (o: Record<string, Celda> = {}) => fila(o);

describe("VERIFIER import", () => {
  it("gate matrix on the real handler: admin/gerencia ok, member coord ok, non-member coord 403, colaborador 403 (even member), CERRADO 409, 404", async () => {
    const buf = await libro([ok()]);
    for (const [u, miembro, st] of [
      [U("a", "ADMINISTRADOR"), false, 200], [gerencia, false, 200], [coordinador, true, 200],
      [coordinador, false, 403], [colaborador, false, 403],
    ] as [Usuario, boolean, number][]) {
      authAs(u);
      mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION", miembro));
      expect((await POST(subida(buf, { modo: "validar" }), ctx)).status, `${u.rol} miembro=${miembro}`).toBe(st);
    }
    authAs(gerencia);
    for (const e of ["BORRADOR", "SUSPENDIDO", "CERRADO", "CANCELADO"]) {
      mocks.proyectoFindFirst.mockResolvedValue(proyecto(e));
      expect((await POST(subida(buf), ctx)).status, e).toBe(409);
    }
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await POST(subida(buf), ctx)).status).toBe(404);
  });

  it("gate precedes file parsing: a colaborador with garbage gets 403 not 400", async () => {
    authAs(colaborador);
    expect((await POST(subida("garbage", { nombre: "x.csv" }), ctx)).status).toBe(403);
  });

  it("preview writes nothing (no transaction, no create, no audit)", async () => {
    const res = await POST(subida(await libro([ok(), ok({ "Número de documento": "FE-2", "Valor (COP)": -5 })]), { modo: "validar" }), ctx);
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.importado).toBe(false);
    expect(j.resumen).toMatchObject({ total: 2, validas: 1, invalidas: 1 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });


  it("apply: one transaction, only valid rows written, one shared lote_id, registrant = importer, estado default, zero supports", async () => {
    const buf = await libro([
      ok(),
      ok({ "Número de documento": "FE-2", "Valor (COP)": 0 }),
      ok({ Rubro: "Viáticos", "Número de documento": "FE-3", "Valor (COP)": 200000 }),
      ok({ Rubro: "Sin asignar", "Número de documento": "FE-4" }),
      ok({ "Fecha del documento": "2025-01-01", "Número de documento": "FE-5" }),
      ok({ "Fecha del documento": "2030-01-01", "Número de documento": "FE-6" }),
      ok({ Rubro: "Inexistente", "Número de documento": "FE-7" }),
      ok({ "Valor (COP)": 10.123, "Número de documento": "FE-8" }),
    ]);
    const res = await POST(subida(buf), ctx);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.creados).toBe(2);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.soporteCreate).not.toHaveBeenCalled();
    for (const [a] of mocks.create.mock.calls) expect(a.data).toMatchObject({ registrado_por_id: "ger-1", proyecto_id: "pry-1" });
    expect(logChanges).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(logChanges).mock.calls[0][1] as unknown as { lote_id: string }[];
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.lote_id)).size).toBe(1);
    expect(rows[0].lote_id).toBe(j.lote_id);
    expect(j.rechazadas.map((r: { fila: number }) => r.fila)).toEqual([3, 5, 6, 7, 8, 9]);
  });

  it("transaction failure rolls everything back and surfaces 500 (nothing reported imported)", async () => {
    mocks.create.mockImplementationOnce(async () => ({ id: "g1", estado: "REGISTRADO", created_at: new Date() })).mockRejectedValueOnce(new Error("boom"));
    const res = await POST(subida(await libro([ok(), ok({ "Número de documento": "FE-2" })])), ctx);
    expect(res.status).toBe(500);
    expect(logChanges).not.toHaveBeenCalled();
    mocks.create.mockReset();
  });

  it("in-file duplicates (same tercero id + doc number, formatting variants) -> second invalid", async () => {
    const res = await POST(subida(await libro([ok(), ok({ "Número de identificación": "900123456", "Número de documento": "fe 0123" }), ok({ "Número de identificación": "900.123.456-7", "Número de documento": "FE-0123", Rubro: "Viáticos" })]), { modo: "validar" }), ctx);
    const j = await res.json();
    expect(j.filas[0].valida).toBe(true);
    expect(j.filas[1].valida).toBe(false);
  });

  it("duplicate without third-party id is NOT flagged (documented), different doc numbers fine", async () => {
    const res = await POST(subida(await libro([ok({ "Número de identificación": null, "Tipo de identificación": null }), ok({ "Número de identificación": null, "Tipo de identificación": null })]), { modo: "validar" }), ctx);
    const j = await res.json();
    expect(j.filas.map((f: { valida: boolean }) => f.valida)).toEqual([true, true]);
  });

  it("200 rows ok, 201 rows -> whole file rejected 400, nothing written", async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ok({ "Número de documento": `D-${i}`, "Número de identificación": `${1000 + i}` }));
    const r200 = await POST(subida(await libro(mk(200)), { modo: "validar" }), ctx);
    expect(r200.status).toBe(200);
    expect(MAX_FILAS_GASTOS).toBe(200);
    const r201 = await POST(subida(await libro(mk(201))), ctx);
    expect(r201.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("zero valid rows on apply -> 400 and no write; empty sheet -> 400", async () => {
    const r = await POST(subida(await libro([ok({ "Valor (COP)": -1 })])), ctx);
    expect(r.status).toBe(400);
    expect((await POST(subida(await libro([])), ctx)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  // Just past the limits of inspeccionarZip; compressing the bomb is slow under coverage, hence the timeout.
  it("zip bomb (uncompressed size over the limit) rejected before parsing", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<x/>");
    zip.file("xl/big.xml", Buffer.alloc(ZIP_MAX_DESCOMPRIMIDO + 1, 0x61), { compression: "DEFLATE" });
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const res = await POST(subida(buf), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("El archivo no es un Excel válido.");
    expect(mocks.rubroFindMany).not.toHaveBeenCalled();
  }, 30_000);

  it("zip with too many entries rejected before parsing", async () => {
    const zip = new JSZip();
    for (let i = 0; i <= ZIP_MAX_ENTRADAS; i++) zip.file(`f${i}.xml`, "a");
    const res = await POST(subida(await zip.generateAsync({ type: "nodebuffer" })), ctx);
    expect(res.status).toBe(400);
    expect(mocks.rubroFindMany).not.toHaveBeenCalled();
  });

  it("mime/extension guards: .xls, .xlsm, double extension, wrong mime", async () => {
    const b = await libro([ok()]);
    for (const nombre of ["g.xls", "g.xlsm", "g.xlsx.exe", "g"]) expect((await POST(subida(b, { nombre }), ctx)).status, nombre).toBe(400);
    expect((await POST(subida(b, { tipo: "text/html" }), ctx)).status).toBe(400);
  });

  it("overspend flag computed like single create: value > assigned flags alerta_sobregasto and still imports", async () => {
    mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("23500000") } });
    const res = await POST(subida(await libro([ok({ "Valor (COP)": 1000000 })])), ctx);
    expect(res.status).toBe(200);
    expect(mocks.create.mock.calls[0][0].data.alerta_sobregasto).toBe(true);
  });

  it("template route gate: colaborador non-member 403, unknown 404 (read gate)", async () => {
    const { GET } = await import("@/app/api/v1/projects/[id]/expenses/template/route");
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(new Request("http://x"), ctx)).status).toBe(404);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto());
    authAs(gerencia);
    const r = await GET(new Request("http://x"), ctx);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
  });
});

function U(id: string, rol: string) { return { id, rol } as Usuario; }
