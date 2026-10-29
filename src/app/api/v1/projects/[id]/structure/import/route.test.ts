// @vitest-environment node
// POST /api/v1/projects/:id/structure/import — the PO's structure workbook (B3):
// gate order (same as the template import), file guards, the 400 report, the
// validate-only preview and the structure-only apply (D-A: budget untouched).
// The database is mocked; parsing, mapping and the writer are the real ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  historial: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  createMany: { objetivo: vi.fn(), actividad: vi.fn(), entregable: vi.fn(), indicador: vi.fn() },
  presupuesto: vi.fn(),
  proyectoUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => {
  const estructura = (tabla: keyof typeof mocks.createMany) => ({
    count: mocks.count,
    updateMany: mocks.updateMany,
    createMany: mocks.createMany[tabla],
  });
  const models = {
    $queryRaw: mocks.queryRaw,
    avanceEntregable: { count: mocks.historial },
    medicionIndicador: { count: mocks.historial },
    registroBeneficiario: { count: mocks.historial },
    objetivo: estructura("objetivo"),
    actividad: estructura("actividad"),
    entregable: estructura("entregable"),
    indicador: estructura("indicador"),
    lineaPresupuestal: { findMany: mocks.presupuesto, create: mocks.presupuesto, update: mocks.presupuesto },
    programacionPeriodo: { findMany: mocks.presupuesto, createMany: mocks.presupuesto, deleteMany: mocks.presupuesto },
    proyecto: { update: mocks.proyectoUpdate },
  };
  return {
    db: {
      ...models,
      proyecto: { findFirst: mocks.proyectoFindFirst, update: mocks.proyectoUpdate },
      $transaction: mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(models)),
    },
  };
});

import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { HISTORIAL_MESSAGE } from "@/lib/api/plantilla-import";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { ESTRUCTURA_PO_CON_ERRORES, ESTRUCTURA_PO_STATE_MESSAGE, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const IND = ["Objetivo especifico", "Resultados (indicador)", "Resultados (meta)"];
const ACT = ["Objetivo especifico", "Actividad", "Entregables", "Inicio (semana)", "Fin (semana)", "Cantidad", "Unidad"];
const OBJ1 = "Formalizar las unidades productivas.";
const OBJ2 = "Desarrollar el modelo de negocio.";

type Celdas = (string | number | null)[];

const VALIDO: Record<string, Celdas[]> = {
  Modelo1: [ACT],
  Ejemplo0: [IND, [OBJ1, "Asociaciones constituidas", 2]],
  Ejemplo1: [
    ACT,
    [OBJ1, "Levantar línea base", "Memorias", 1, 1, 2, "memorias"],
    [OBJ1, "Levantar línea base", "Informe", 1, 2, 1, "informe"],
    [OBJ2, "Estructurar el modelo", "Modelos", 3, 4, 2, "modelos"],
  ],
};

function proyecto(estado = "BORRADOR", over: object = {}) {
  return { id: "pry-1", estado, fecha_inicio: null, fecha_fin: null, miembros: [], ...over };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

async function libro(hojas: Record<string, Celdas[]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    for (const fila of filas) ws.addRow(fila);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function post(
  hojas: Record<string, Celdas[]> | Buffer,
  { modo, nombre = "proyecto.xlsx", mime = XLSX_MIME }: { modo?: string; nombre?: string; mime?: string } = {},
) {
  const bytes = Buffer.isBuffer(hojas) ? hojas : await libro(hojas);
  const form = new FormData();
  form.append("archivo", new File([new Uint8Array(bytes)], nombre, { type: mime }));
  if (modo) form.append("modo", modo);
  const request = new Request("http://localhost/api/v1/projects/pry-1/structure/import", { method: "POST", body: form });
  return POST(request, ctx);
}

function filasCreadas(tabla: keyof typeof mocks.createMany) {
  return mocks.createMany[tabla].mock.calls.flatMap(([arg]) => (arg as { data: Record<string, unknown>[] }).data);
}

function noEscribio() {
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
  for (const fn of Object.values(mocks.createMany)) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "20000000.00" }]);
  mocks.historial.mockResolvedValue(0);
  mocks.count.mockResolvedValue(3);
  mocks.updateMany.mockResolvedValue({ count: 3 });
  for (const fn of Object.values(mocks.createMany)) fn.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/projects/:id/structure/import — gates", () => {
  it("answers 404 for an unknown project before anything else", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    const res = await post(VALIDO);
    expect(res.status).toBe(404);
    noEscribio();
  });

  it("answers 403 for a COLABORADOR who is not a member", async () => {
    authAs(colaborador);
    const res = await post(VALIDO);
    expect(res.status).toBe(403);
    noEscribio();
  });

  it("lets a COORDINADOR member import, like the template import", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("BORRADOR", { miembros: [{ id: "m-1" }] }));
    const res = await post(VALIDO, { modo: "validar" });
    expect(res.status).toBe(200);
  });

  it("answers 409 outside BORRADOR", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION"));
    const res = await post(VALIDO);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(ESTRUCTURA_PO_STATE_MESSAGE);
    noEscribio();
  });

  it("rejects a file that is not .xlsx and one above 4 MB", async () => {
    const tipo = await post(VALIDO, { nombre: "proyecto.csv", mime: "text/csv" });
    expect(tipo.status).toBe(400);
    const grande = await post(Buffer.alloc(IMPORT_MAX_BYTES + 1));
    expect(grande.status).toBe(413);
    noEscribio();
  });

  it("rejects bytes that are not a workbook", async () => {
    const res = await post(Buffer.from("not a workbook"));
    expect(res.status).toBe(400);
    noEscribio();
  });
});

describe("POST /api/v1/projects/:id/structure/import — report and preview", () => {
  it("answers 400 with every error and writes nothing (the PO file without Cantidad/Unidad)", async () => {
    const res = await post({
      Ejemplo1: [ACT.slice(0, 5), [OBJ1, "Levantar línea base", "2 Memorias", 1, 1]],
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(ESTRUCTURA_PO_CON_ERRORES);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.reporte.errores.map((e: { mensaje: string }) => e.mensaje)).toEqual([
      "La hoja «Ejemplo1» no tiene la columna «Cantidad»: agrégala con la cantidad de cada entregable.",
      "La hoja «Ejemplo1» no tiene la columna «Unidad»: agrégala con la unidad de cada entregable.",
    ]);
    expect(body.reporte.truncado).toBe(false);
    noEscribio();
  });

  it("bounds the weeks by the project's dates", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(
      proyecto("BORRADOR", { fecha_inicio: new Date("2026-11-02T00:00:00Z"), fecha_fin: new Date("2026-11-22T00:00:00Z") }),
    );
    const res = await post(VALIDO, { modo: "validar" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reporte.errores).toEqual([
      {
        hoja: "Ejemplo1",
        fila: 4,
        columna: "E",
        mensaje: "La semana final no puede superar la duración del proyecto (3 semanas).",
      },
    ]);
  });

  it("previews the plan with its generated codes and what it replaces, without writing", async () => {
    const res = await post(VALIDO, { modo: "validar" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.importado).toBe(false);
    expect(body.valido).toBe(true);
    expect(body.resumen).toEqual({ objetivos: 2, indicadores: 1, actividades: 2, entregables: 3, errores: 0 });
    expect(body.plan.actividades.map((a: { codigo: string }) => a.codigo)).toEqual(["A1.1", "A2.1"]);
    expect(body.plan.entregables.map((e: { codigo: string }) => e.codigo)).toEqual(["E1.1.1", "E1.1.2", "E2.1.1"]);
    expect(body.reemplaza).toEqual({ objetivos: 3, actividades: 3, entregables: 3, indicadores: 3 });
    noEscribio();
  });
});

describe("POST /api/v1/projects/:id/structure/import — apply", () => {
  it("replaces only the structure, with generated codes and one audit lote (D-A)", async () => {
    const res = await post(VALIDO);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.importado).toBe(true);
    expect(body.resumen).toEqual({ objetivos: 2, actividades: 2, entregables: 3, indicadores: 1 });

    // Lock and history guard, then the soft-delete of the four live tables.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.historial).toHaveBeenCalledTimes(3);
    expect(mocks.updateMany).toHaveBeenCalledTimes(4);
    expect(mocks.updateMany.mock.calls[0][0]).toMatchObject({
      where: { proyecto_id: "pry-1", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });

    expect(filasCreadas("objetivo")).toEqual([
      expect.objectContaining({ proyecto_id: "pry-1", codigo: "O1", descripcion: OBJ1, orden: 1 }),
      expect.objectContaining({ proyecto_id: "pry-1", codigo: "O2", descripcion: OBJ2, orden: 2 }),
    ]);
    const [o1, o2] = filasCreadas("objetivo").map((o) => o.id);
    const actividades = filasCreadas("actividad");
    expect(actividades).toEqual([
      expect.objectContaining({ codigo: "A1.1", objetivo_id: o1, nombre: "Levantar línea base", semana_inicio: 1, semana_fin: 2, peso_manual: false, responsable_id: null }),
      expect.objectContaining({ codigo: "A2.1", objetivo_id: o2, nombre: "Estructurar el modelo", semana_inicio: 3, semana_fin: 4, peso_manual: false, responsable_id: null }),
    ]);
    expect(String(actividades[0].peso)).toBe("2");
    const entregables = filasCreadas("entregable");
    expect(entregables.map((e) => [e.codigo, e.actividad_id, String(e.cantidad_meta), e.unidad, e.tipo_medio_exigido])).toEqual([
      ["E1.1.1", actividades[0].id, "2", "memorias", ""],
      ["E1.1.2", actividades[0].id, "1", "informe", ""],
      ["E2.1.1", actividades[1].id, "2", "modelos", ""],
    ]);
    expect(filasCreadas("indicador")).toEqual([
      expect.objectContaining({ codigo: "IND-01", objetivo_id: o1, nombre: "Asociaciones constituidas", unidad: "", linea_base: null }),
    ]);

    // The budget, the programming and the project fields are never touched.
    expect(mocks.presupuesto).not.toHaveBeenCalled();
    expect(mocks.proyectoUpdate).not.toHaveBeenCalled();

    const lote = vi.mocked(logChanges).mock.calls[0][1];
    expect(lote).toHaveLength(2 + 2 + 3 + 1 + 1);
    expect(new Set(lote.map((c) => c.lote_id))).toEqual(new Set([body.lote_id]));
    expect(lote.every((c) => c.accion === "IMPORTAR")).toBe(true);
    expect(lote.at(-1)).toMatchObject({
      entidad: "proyecto",
      campo: "reemplazo",
      valor_anterior: { objetivos: 3, actividades: 3, entregables: 3, indicadores: 3 },
      valor_nuevo: { objetivos: 2, actividades: 2, entregables: 3, indicadores: 1 },
    });
  });

  it("refuses a project with execution history and creates nothing", async () => {
    mocks.historial.mockResolvedValueOnce(1);
    const res = await post(VALIDO);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(HISTORIAL_MESSAGE);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    for (const fn of Object.values(mocks.createMany)) expect(fn).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("re-checks BORRADOR under the row lock", async () => {
    mocks.queryRaw.mockResolvedValue([{ estado: "EN_EJECUCION", valor_total: null }]);
    const res = await post(VALIDO);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(ESTRUCTURA_PO_STATE_MESSAGE);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
