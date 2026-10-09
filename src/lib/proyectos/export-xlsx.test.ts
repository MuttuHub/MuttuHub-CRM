// S9 U5: the Excel workbooks of the dashboards. They are opened back with exceljs; the financial total row
// must be the `computeFicha` total; no workbook may carry a tercero or soporte column (P04) and a user text
// that looks like a formula is neutralized.
import ExcelJS from "exceljs"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: {} }))
import { serializeRow } from "@/lib/api/financial-sheet"
import { computeFicha } from "./ficha-financiera"
import { celdaTexto, ENCABEZADOS_PROHIBIDOS, xlsxFichaFinanciera, xlsxFichaProyecto, xlsxPortafolio, type FichaProyectoXlsx, type PortafolioXlsx } from "./export-xlsx"
import { kpisProyecto } from "./kpis"
import { toCents } from "./money"
import { PARAMETROS_V2_DEFAULT } from "./semaforo-v2"

async function abrir(buffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as never)
  return wb
}
const filas = (ws: ExcelJS.Worksheet) => {
  const out: unknown[][] = []
  ws.eachRow((row) => out.push((row.values as unknown[]).slice(1)))
  return out
}
const encabezados = (wb: ExcelJS.Workbook) => wb.worksheets.flatMap((ws) => filas(ws).flat().filter((v): v is string => typeof v === "string"))

const ficha = computeFicha({
  corte: "2026-03",
  toleranciaBp: BigInt(1000),
  rubros: [
    { rubroId: "r1", codigo: "R1", nombre: "Personal", asignado: toCents("1000000.50"), programacion: [{ periodo: "2026-01", valor: toCents("400000") }], gastos: [{ periodo: "2026-02", valor: toCents("250000.25"), estado: "VALIDADO" }] },
    { rubroId: "r2", codigo: "R2", nombre: "=HYPERLINK(\"http://x\")", asignado: toCents("500000"), programacion: [{ periodo: "2026-03", valor: toCents("100000") }], gastos: [] },
  ],
})
const sheet = {
  base: "vigente" as const,
  corte: "2026-03",
  estado: "EN_EJECUCION",
  ejecucion_disponible: true,
  rubros: ficha.rubros.map((r) => serializeRow(r, true)),
  total: serializeRow(ficha.total, true),
  alerta_retraso: false,
  parametros: { tolerancia: 10, retraso: 70, confirmado: false },
}

describe("celdaTexto (formula guard)", () => {
  it.each(["=1+1", "+SUM(A1)", "-2", "@cmd", "\tx", " =x"])("prefixes %j", (v) => expect(celdaTexto(v).startsWith("'")).toBe(true))
  it("leaves normal text, numbers-as-text and null alone", () => {
    expect(celdaTexto("Proyecto 1")).toBe("Proyecto 1")
    expect(celdaTexto(null)).toBe("")
  })
})

describe("xlsxFichaFinanciera", () => {
  it("opens with exceljs, has the sheets and the total row equals computeFicha's", async () => {
    const wb = await abrir(await xlsxFichaFinanciera(sheet, { codigo: "PRY-2026-001", nombre: "Proyecto" }))
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Financiera", "Resumen"])
    const rows = filas(wb.getWorksheet("Financiera") as ExcelJS.Worksheet)
    expect(rows[0]).toEqual(["Código", "Rubro", "Asignado", "Programado", "Ejecutado", "Diferencia", "E/P (%)", "E/A (%)", "Umbral rojo", "Semáforo"])
    const total = rows[rows.length - 1]
    expect(total[1]).toBe("Total")
    expect(total.slice(2, 6)).toEqual([
      Number(ficha.total.asignado) / 100,
      Number(ficha.total.programado) / 100,
      Number(ficha.total.ejecutado) / 100,
      Number(ficha.total.diferencia) / 100,
    ])
    expect(rows).toHaveLength(1 + ficha.rubros.length + 1)
  })

  it("neutralizes a rubro name that starts like a formula", async () => {
    const wb = await abrir(await xlsxFichaFinanciera(sheet, { codigo: "PRY-1", nombre: "x" }))
    const rows = filas(wb.getWorksheet("Financiera") as ExcelJS.Worksheet)
    expect(rows[2][1]).toBe("'=HYPERLINK(\"http://x\")")
  })

  it("states that the execution is unavailable and leaves colors empty", async () => {
    const wb = await abrir(
      await xlsxFichaFinanciera({ ...sheet, ejecucion_disponible: false, rubros: ficha.rubros.map((r) => serializeRow(r, false)), total: serializeRow(ficha.total, false) }, { codigo: "P", nombre: "n" }),
    )
    const resumen = filas(wb.getWorksheet("Resumen") as ExcelJS.Worksheet)
    expect(resumen).toContainEqual(["Ejecución disponible", "No"])
    const rows = filas(wb.getWorksheet("Financiera") as ExcelJS.Worksheet)
    expect(rows[1][9]).toBe("")
  })

  it("has no tercero or soporte header anywhere", async () => {
    const wb = await abrir(await xlsxFichaFinanciera(sheet, { codigo: "P", nombre: "n" }))
    expect(encabezados(wb).filter((h) => ENCABEZADOS_PROHIBIDOS.test(h))).toEqual([])
  })
})

const kpis = kpisProyecto({
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  parametros: PARAMETROS_V2_DEFAULT,
  actividades: [],
  indicadores: [],
  beneficiarios: { total: 10, meta: 100 },
  financiero: { asignado: toCents("1000"), programado: toCents("500"), ejecutado: toCents("100") },
})
const proyecto: FichaProyectoXlsx = {
  codigo: "PRY-2026-001",
  nombre: "+Proyecto de prueba",
  cliente: "Cliente SAS",
  estado: "EN_EJECUCION",
  responsable: "Ana",
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-06-30",
  duracion_semanas: 26,
  valor_total: "3000000.00",
  beneficiarios_meta: 100,
  lineas: ["LE01 Línea"],
  municipios: ["Barranquilla"],
  conteos: { objetivos: 2, actividades: 10, entregables: 30, indicadores: 4 },
  base: "vigente",
  kpis: {
    ...kpis,
    financiero: kpis.financiero && { ...kpis.financiero, asignado: "1000.00", programado: "500.00", ejecutado: "100.00" },
  } as FichaProyectoXlsx["kpis"],
}

describe("xlsxFichaProyecto", () => {
  it("has Proyecto, Estructura and KPIs sheets with the project data", async () => {
    const wb = await abrir(await xlsxFichaProyecto(proyecto))
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Proyecto", "Estructura", "KPIs"])
    const general = filas(wb.getWorksheet("Proyecto") as ExcelJS.Worksheet)
    expect(general).toContainEqual(["Código", "PRY-2026-001"])
    expect(general).toContainEqual(["Nombre", "'+Proyecto de prueba"])
    expect(general).toContainEqual(["Cliente", "Cliente SAS"])
    const estructura = filas(wb.getWorksheet("Estructura") as ExcelJS.Worksheet)
    expect(estructura).toContainEqual(["Actividades", 10])
    const k = filas(wb.getWorksheet("KPIs") as ExcelJS.Worksheet)
    expect(k.find((r) => r[0] === "Beneficiarios vs meta (%)")?.[1]).toBe(10)
    expect(k.find((r) => r[0] === "Asignado")?.[1]).toBe(1000)
  })

  it("a non-measurable project still exports, with empty KPI values", async () => {
    const wb = await abrir(await xlsxFichaProyecto({ ...proyecto, kpis: { ...proyecto.kpis, medible: false, tecnico: null, financiero: null, cronograma: null, entregables: null, indicadores: null, beneficiarios: null } }))
    const k = filas(wb.getWorksheet("KPIs") as ExcelJS.Worksheet)
    expect(k[0]).toEqual(["Indicador", "Valor", "Detalle"])
    const sinMedir = k.filter((r) => r[2] === "No medible")
    expect(sinMedir).toHaveLength(15)
    expect(sinMedir.every((r) => r[1] === "" || r[1] === undefined || r[1] === null)).toBe(true)
  })

  it("has no tercero or soporte header", async () => {
    expect(encabezados(await abrir(await xlsxFichaProyecto(proyecto))).filter((h) => ENCABEZADOS_PROHIBIDOS.test(h))).toEqual([])
  })
})

const portafolio: PortafolioXlsx = {
  corte: "2026-03-15",
  confirmado: false,
  truncado: false,
  proyectos: [
    {
      codigo: "PRY-1", nombre: "@malo", cliente: "C", estado: "EN_EJECUCION", responsable: "Ana", linea_principal: "LE01", semaforo_tecnico: "rojo", semaforo_financiero: "verde", alerta_retraso: true,
      kpis: proyecto.kpis,
    },
    {
      codigo: "PRY-2", nombre: "Borrador", cliente: "C", estado: "BORRADOR", responsable: null, linea_principal: null, semaforo_tecnico: null, semaforo_financiero: null, alerta_retraso: null,
      kpis: { ...proyecto.kpis, medible: false, tecnico: null, financiero: null, cronograma: null, entregables: null, indicadores: null, beneficiarios: null },
    },
  ],
  agregado: {
    tecnico: { proyectos: 1, avance_real: 40, avance_programado: 50 },
    financiero: { proyectos: 1, asignado: "1000.00", programado: "500.00", ejecutado: "100.00", ea: 10, ep: 20 },
  },
  por_estado: { EN_EJECUCION: 1, BORRADOR: 1 },
}

describe("xlsxPortafolio", () => {
  it("has the Portafolio and Resumen sheets, one row per project", async () => {
    const wb = await abrir(await xlsxPortafolio(portafolio))
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Portafolio", "Resumen"])
    const rows = filas(wb.getWorksheet("Portafolio") as ExcelJS.Worksheet)
    expect(rows).toHaveLength(3)
    expect(rows[0].slice(0, 4)).toEqual(["Código", "Proyecto", "Cliente", "Estado"])
    expect(rows[1][1]).toBe("'@malo")
    expect(rows[2][0]).toBe("PRY-2")
    const resumen = filas(wb.getWorksheet("Resumen") as ExcelJS.Worksheet)
    expect(resumen).toContainEqual(["Corte", "2026-03-15"])
    expect(resumen).toContainEqual(["Ejecutado total", 100])
    expect(resumen).toContainEqual(["En ejecución", 1])
  })

  it("has no tercero or soporte header", async () => {
    expect(encabezados(await abrir(await xlsxPortafolio(portafolio))).filter((h) => ENCABEZADOS_PROHIBIDOS.test(h))).toEqual([])
  })

  it("refuses to write a forbidden header (defense in depth)", async () => {
    const { assertSinEncabezadosProhibidos } = await import("./export-xlsx")
    expect(() => assertSinEncabezadosProhibidos(["Código", "Tercero NIT"])).toThrow()
    expect(() => assertSinEncabezadosProhibidos(["Soporte URL"])).toThrow()
    expect(() => assertSinEncabezadosProhibidos(["Código", "Rubro"])).not.toThrow()
  })
})
