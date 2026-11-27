// GET /api/v1/reports/tag/export (T3, S6): the tag report as an Excel workbook, audited.
import ExcelJS from "exceljs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/api/audit-cambios", () => ({ logChange: vi.fn(async () => undefined) }))
vi.mock("@/lib/reportes/etiqueta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reportes/etiqueta")>()),
  cargarReporteEtiqueta: vi.fn(),
}))

import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/supabase/server"
import { logChange } from "@/lib/api/audit-cambios"
import { apiError } from "@/lib/api/errors"
import { cargarReporteEtiqueta, type ReporteEtiqueta } from "@/lib/reportes/etiqueta"
import { ENCABEZADOS_PROHIBIDOS } from "@/lib/proyectos/export-xlsx"
import { buildOpenApiDocument } from "@/lib/openapi/document"
import { GET } from "./route"

const user = (rol: string) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const QS = "?etiqueta=F%C3%A1brica%20Milagro&desde=2026-10-01&hasta=2026-10-29"
const get = (qs = QS) => new Request(`http://localhost/api/v1/reports/tag/export${qs}`)

const FOOTNOTE =
  "Si un cliente tiene dos etiquetas, aparece en los dos reportes. Por eso los totales de distintas etiquetas no se deben sumar entre sí."

const proyecto = (id: string, nombre: string, valor: string | null, programado: string, ejecutado: string) =>
  ({
    id,
    codigo: `PRY-${id}`,
    nombre,
    estado: "EN_EJECUCION",
    cliente: { id: "c1", nombre: "Acme" },
    responsable: { id: "r1", nombre: "Ana" },
    semaforo_tecnico: "verde",
    semaforo_financiero: "rojo",
    kpis: { tecnico: { avance_real: 40, avance_programado: 50 }, financiero: { programado, ejecutado } },
    valor_total: valor,
  }) as unknown as ReporteEtiqueta["proyectos"][number]

const reporte = (comercial = true): ReporteEtiqueta => ({
  etiqueta: "Fábrica Milagro",
  periodo: { desde: "2026-10-01", hasta: "2026-10-29" },
  corte: "2026-10-29",
  confirmado: false,
  resumen: {
    clientes: 2,
    proyectos: 2,
    valor_total: "3000.50",
    financiero: { programado: "1500.00", ejecutado: "600.00" },
    pipeline: comercial ? { oportunidades: 2, valor: "700.00" } : null,
    tareas: { total: 2, completadas: 0, vencidas: 1 },
  },
  proyectos: [proyecto("1", "=SUMA(1;1)", "1000.25", "500.00", "100.00"), proyecto("2", "Dos", "2000.25", "1000.00", "500.00")],
  clientes: [
    {
      id: "c1",
      nombre: "Acme",
      proyectos: 2,
      ...(comercial && { oportunidades_abiertas: 1 }),
      ultima_interaccion: "2026-10-20",
      dias_sin_interaccion: 34,
      sin_interaccion_reciente: true,
    },
    {
      id: "c2",
      nombre: "Beta",
      proyectos: 1,
      ...(comercial && { oportunidades_abiertas: 1 }),
      ultima_interaccion: null,
      dias_sin_interaccion: null,
      sin_interaccion_reciente: true,
    },
  ],
  oportunidades: comercial
    ? [
        { id: "o1", nombre: "Opo 1", estado: "PRESENTADA", valor_estimado_cop: "500.00", cliente: { id: "c1", nombre: "Acme" } },
        { id: "o2", nombre: "Opo 2", estado: "EN_REVISION", valor_estimado_cop: "200.00", cliente: { id: "c2", nombre: "Beta" } },
      ]
    : null,
  bitacora: [
    {
      id: "b1",
      fecha: "2026-10-20",
      tipo: "REUNION",
      texto: "Reunión de arranque",
      proximo_paso: null,
      cliente: { id: "c1", nombre: "Acme" },
      autor: { id: "u1", nombre: "Ana" },
    },
  ],
  tareas: [
    {
      id: "t1",
      titulo: "Enviar informe",
      estado: "POR_HACER",
      fecha_entrega: "2026-10-10",
      vencida: true,
      responsable: { id: "u1", nombre: "Ana" },
      cliente: null,
    },
    {
      id: "t2",
      titulo: "Llamar",
      estado: "EN_CURSO",
      fecha_entrega: null,
      vencida: false,
      responsable: { id: "u1", nombre: "Ana" },
      cliente: { id: "c1", nombre: "Acme" },
    },
  ],
})

async function abrir(res: Response) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never)
  return wb
}
const filas = (ws: ExcelJS.Worksheet) => ws.getSheetValues().flatMap((r) => (Array.isArray(r) ? [r.slice(1)] : []))
const columna = (ws: ExcelJS.Worksheet, encabezado: string) =>
  (ws.getRow(1).values as unknown[]).indexOf(encabezado)

beforeEach(() => {
  auth(user("GERENCIA"))
  vi.mocked(cargarReporteEtiqueta).mockResolvedValue({ ok: true, value: reporte() })
})
afterEach(() => vi.clearAllMocks())

describe("GET /api/v1/reports/tag/export", () => {
  it("401 without a session", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "No autenticado", code: "UNAUTHORIZED" }, { status: 401 }),
    })
    expect((await GET(get())).status).toBe(401)
    expect(cargarReporteEtiqueta).not.toHaveBeenCalled()
  })

  it("403 outside the project dashboard, before the format check", async () => {
    auth(user("INVITADO"))
    expect((await GET(get(`${QS}&formato=pdf`))).status).toBe(403)
    expect(cargarReporteEtiqueta).not.toHaveBeenCalled()
  })

  it("400 for formato=pdf, without loading the report", async () => {
    const res = await GET(get(`${QS}&formato=pdf`))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Formato no disponible. Por ahora solo se exporta en Excel (xlsx).")
    expect(cargarReporteEtiqueta).not.toHaveBeenCalled()
  })

  it("passes the loader's error response through (400 without a tag)", async () => {
    vi.mocked(cargarReporteEtiqueta).mockResolvedValueOnce({
      ok: false,
      response: apiError("Elige una etiqueta.", 400, "VALIDATION_ERROR"),
    })
    const res = await GET(get("?formato=xlsx"))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Elige una etiqueta.")
    expect(logChange).not.toHaveBeenCalled()
  })

  it("downloads an xlsx named after the tag slug and the cut-off", async () => {
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="reporte-etiqueta-fabrica-milagro-2026-10-29.xlsx"')
  })

  it("has one sheet per section with commercial access", async () => {
    const wb = await abrir(await GET(get()))
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Resumen", "Proyectos", "Clientes", "Oportunidades", "Bitácora", "Tareas"])
  })

  it("hides the Oportunidades sheet, the pipeline rows and the opportunities column without commercial access", async () => {
    vi.mocked(cargarReporteEtiqueta).mockResolvedValue({ ok: true, value: reporte(false) })
    const wb = await abrir(await GET(get()))
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Resumen", "Proyectos", "Clientes", "Bitácora", "Tareas"])
    const conceptos = filas(wb.getWorksheet("Resumen")!).map((f) => String(f[0]))
    expect(conceptos.some((c) => /pipeline|oportunidad/i.test(c))).toBe(false)
    expect(columna(wb.getWorksheet("Clientes")!, "Oportunidades abiertas")).toBe(-1)
  })

  it("writes amounts as numbers and dates as real dates", async () => {
    const wb = await abrir(await GET(get()))
    const proyectos = wb.getWorksheet("Proyectos")!
    const valor = proyectos.getRow(2).getCell(columna(proyectos, "Valor total"))
    expect(valor.value).toBe(1000.25)
    expect(valor.numFmt).toBe("#,##0.00")
    const clientes = wb.getWorksheet("Clientes")!
    const ultima = clientes.getRow(2).getCell(columna(clientes, "Última interacción"))
    expect(ultima.value).toEqual(new Date("2026-10-20T00:00:00Z"))
    expect(ultima.numFmt).toBe("yyyy-mm-dd")
    const tareas = wb.getWorksheet("Tareas")!
    expect(tareas.getRow(2).getCell(columna(tareas, "Fecha de entrega")).value).toEqual(new Date("2026-10-10T00:00:00Z"))
    expect(tareas.getRow(2).getCell(columna(tareas, "Vencida")).value).toBe("Sí")
    expect(tareas.getRow(3).getCell(columna(tareas, "Fecha de entrega")).value).toBe("")
    const bitacora = wb.getWorksheet("Bitácora")!
    expect(bitacora.getRow(2).getCell(columna(bitacora, "Fecha")).value).toEqual(new Date("2026-10-20T00:00:00Z"))
    const resumen = wb.getWorksheet("Resumen")!
    expect(filas(resumen)).toContainEqual(["Valor total de los proyectos", 3000.5])
    expect(filas(resumen)).toContainEqual(["Corte", new Date("2026-10-29T00:00:00Z")])
  })

  it("freezes and filters the header row of every table sheet", async () => {
    const wb = await abrir(await GET(get()))
    for (const ws of wb.worksheets) {
      expect(ws.views[0]).toEqual(expect.objectContaining({ state: "frozen", ySplit: 1 }))
      expect(ws.autoFilter).toBeTruthy()
      expect(ws.getRow(1).font?.bold).toBe(true)
    }
  })

  it("adds totals rows to Proyectos, Clientes and Oportunidades", async () => {
    const wb = await abrir(await GET(get()))
    const proyectos = wb.getWorksheet("Proyectos")!
    const totalP = proyectos.getRow(proyectos.rowCount)
    expect(totalP.getCell(1).value).toBe("Total")
    expect(totalP.getCell(columna(proyectos, "Valor total")).value).toBe(3000.5)
    expect(totalP.getCell(columna(proyectos, "Programado")).value).toBe(1500)
    expect(totalP.getCell(columna(proyectos, "Ejecutado")).value).toBe(600)
    const clientes = wb.getWorksheet("Clientes")!
    const totalC = clientes.getRow(clientes.rowCount)
    expect(totalC.getCell(1).value).toBe("Total")
    expect(totalC.getCell(columna(clientes, "Proyectos")).value).toBe(3)
    expect(totalC.getCell(columna(clientes, "Oportunidades abiertas")).value).toBe(2)
    const oportunidades = wb.getWorksheet("Oportunidades")!
    const totalO = oportunidades.getRow(oportunidades.rowCount)
    expect(totalO.getCell(1).value).toBe("Total")
    expect(totalO.getCell(columna(oportunidades, "Valor estimado")).value).toBe(700)
  })

  it("S12 (T6b): the Cliente column reads «Posición propia · N aliados» without a client, the client's name with one", async () => {
    const base = reporte()
    // `aliados_count` comes from the portfolio rows, which already leave DESCARTADO allies out.
    const propia = { ...base.proyectos[0], cliente: null, aliados_count: 2 } as unknown as ReporteEtiqueta["proyectos"][number]
    vi.mocked(cargarReporteEtiqueta).mockResolvedValue({ ok: true, value: { ...base, proyectos: [propia, base.proyectos[1]] } })
    const proyectos = (await abrir(await GET(get()))).getWorksheet("Proyectos")!
    expect(proyectos.getRow(2).getCell(columna(proyectos, "Cliente")).value).toBe("Posición propia · 2 aliados")
    expect(proyectos.getRow(3).getCell(columna(proyectos, "Cliente")).value).toBe("Acme")
  })

  it("neutralizes user text that a spreadsheet would run as a formula", async () => {
    const wb = await abrir(await GET(get()))
    const proyectos = wb.getWorksheet("Proyectos")!
    expect(proyectos.getRow(2).getCell(columna(proyectos, "Proyecto")).value).toBe("'=SUMA(1;1)")
  })

  it("never writes a tercero or soporte header", async () => {
    const wb = await abrir(await GET(get()))
    for (const ws of wb.worksheets) {
      const cabecera = (ws.getRow(1).values as unknown[]).slice(1).map(String)
      expect(cabecera.some((h) => ENCABEZADOS_PROHIBIDOS.test(h))).toBe(false)
    }
  })

  it("prints the S2 footnote, the period notes and the unconfirmed-thresholds note in Resumen", async () => {
    const wb = await abrir(await GET(get()))
    const textos = filas(wb.getWorksheet("Resumen")!).flat().map(String)
    expect(textos).toContain(FOOTNOTE)
    expect(textos).toContain("Las tareas con fecha de entrega anterior al inicio del período no se incluyen.")
    expect(textos).toContain("Los días sin interacción se cuentan hasta hoy, no hasta el corte.")
    expect(textos).toContain("Los umbrales del semáforo son provisionales hasta que se confirmen.")
  })

  it("writes an EXPORTAR audit row", async () => {
    await GET(get())
    expect(logChange).toHaveBeenCalledWith(expect.anything(), {
      usuario_id: "GERENCIA-1",
      accion: "EXPORTAR",
      entidad: "proyecto",
      entidad_id: "reporte-etiqueta",
      proyecto_id: null,
      campo: "reporte_etiqueta",
      valor_nuevo: {
        formato: "xlsx",
        etiqueta: "Fábrica Milagro",
        desde: "2026-10-01",
        hasta: "2026-10-29",
        corte: "2026-10-29",
        proyectos: 2,
        clientes: 2,
      },
    })
  })

  it("still downloads when the audit write fails", async () => {
    vi.mocked(logChange).mockRejectedValueOnce(new Error("db down"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect((await GET(get())).status).toBe(200)
  })

  it("is registered in the OpenAPI document", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    expect(paths["/api/v1/reports/tag/export"]).toEqual(expect.objectContaining({ get: expect.anything() }))
  })
})
