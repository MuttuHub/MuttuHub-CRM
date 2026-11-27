// GET /api/v1/reports/project/export (T9b, S15, S17): the project report as an Excel workbook, audited.
import ExcelJS from "exceljs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/api/audit-cambios", () => ({ logChange: vi.fn(async () => undefined) }))
vi.mock("@/lib/reportes/proyecto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reportes/proyecto")>()),
  cargarReporteProyecto: vi.fn(),
}))

import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/supabase/server"
import { logChange } from "@/lib/api/audit-cambios"
import { apiError } from "@/lib/api/errors"
import { cargarReporteProyecto, type ReporteProyecto } from "@/lib/reportes/proyecto"
import { ENCABEZADOS_PROHIBIDOS } from "@/lib/proyectos/export-xlsx"
import { buildOpenApiDocument } from "@/lib/openapi/document"
import * as NOTAS from "@/lib/reportes/proyecto-notas"
import { GET } from "./route"

const user = (rol: string) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const QS = "?proyecto_id=p1"
const get = (qs = QS) => new Request(`http://localhost/api/v1/reports/project/export${qs}`)

const tarea = (id: string, titulo: string, fecha: string | null) => ({
  id,
  titulo,
  estado: "POR_HACER" as const,
  fecha_entrega: fecha,
  responsable: { id: "u1", nombre: "Ana" },
})

const reporte = (overrides: Partial<ReporteProyecto> = {}): ReporteProyecto => ({
  corte: "2026-11-26",
  resumen: {
    proyecto: { id: "p1", codigo: "PRY-Fáb 01", nombre: "=Fábrica Milagro", estado: "EN_EJECUCION", origen: "POSICION_PROPIA" },
    cliente: "Posición propia · 2 aliados",
    responsable: { id: "r1", nombre: "Ana" },
    valor_total: "10000.00",
    financiero: { programado: "4000.00", ejecutado: "1500.50" },
    financiacion: { meta: "10000.00", comprometido: "6000.25", en_gestion: "2000.00", sin_cubrir: "1999.75" },
  },
  aliados: [
    {
      id: "a1",
      cliente: { id: "c1", nombre: "Acme" },
      rol: "FINANCIADOR",
      estado: "COMPROMETIDO",
      aporte_cop: 6000.25,
      ultima_interaccion: "2026-11-20",
    },
    {
      id: "a2",
      cliente: { id: "c2", nombre: "Beta" },
      rol: "ALIADO",
      estado: "EN_GESTION",
      aporte_cop: 2000,
      ultima_interaccion: null,
    },
  ],
  oportunidades: [
    {
      id: "o1",
      nombre: "Opo del proyecto",
      estado: "PRESENTADA",
      fase: "PROSPECCION",
      valor_estimado_cop: "500.00",
      cliente: { id: "c1", nombre: "Acme" },
      vinculo: "PROYECTO",
    },
    {
      id: "o2",
      nombre: "Opo de Beta",
      estado: "EN_REVISION",
      fase: "PROSPECCION",
      valor_estimado_cop: "250.50",
      cliente: { id: "c2", nombre: "Beta" },
      vinculo: "ALIADO",
    },
  ],
  bitacora: [
    {
      id: "b1",
      fecha: "2026-11-20",
      tipo: "REUNION",
      texto: "Reunión con Acme",
      proximo_paso: "Enviar propuesta",
      cliente: { id: "c1", nombre: "Acme" },
      autor: { id: "u1", nombre: "Ana" },
    },
  ],
  tareas: {
    resumen: { total: 5, completadas: 2, canceladas: 1, avance_pct: 50 },
    vencidas: [tarea("t1", "Enviar informe", "2026-11-10")],
    proximas: [tarea("t2", "Llamar", "2026-12-01"), tarea("t3", "Sin fecha", null)],
  },
  ...overrides,
})

async function abrir(res: Response) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never)
  return wb
}
const filas = (ws: ExcelJS.Worksheet) => ws.getSheetValues().flatMap((r) => (Array.isArray(r) ? [r.slice(1)] : []))
const columna = (ws: ExcelJS.Worksheet, encabezado: string) => (ws.getRow(1).values as unknown[]).indexOf(encabezado)

beforeEach(() => {
  auth(user("GERENCIA"))
  vi.mocked(cargarReporteProyecto).mockResolvedValue({ ok: true, value: reporte() })
})
afterEach(() => vi.clearAllMocks())

describe("GET /api/v1/reports/project/export", () => {
  it("401 without a session", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "No autenticado", code: "UNAUTHORIZED" }, { status: 401 }),
    })
    expect((await GET(get())).status).toBe(401)
    expect(cargarReporteProyecto).not.toHaveBeenCalled()
  })

  it("403 for a project the user cannot read, before the format check and without an audit row", async () => {
    vi.mocked(cargarReporteProyecto).mockResolvedValueOnce({
      ok: false,
      response: apiError("No tienes permisos sobre este proyecto.", 403, "FORBIDDEN"),
    })
    const res = await GET(get(`${QS}&formato=pdf`))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("No tienes permisos sobre este proyecto.")
    expect(logChange).not.toHaveBeenCalled()
  })

  it("404 for a missing project, without an audit row", async () => {
    vi.mocked(cargarReporteProyecto).mockResolvedValueOnce({
      ok: false,
      response: apiError("El proyecto no existe.", 404, "NOT_FOUND"),
    })
    const res = await GET(get())
    expect(res.status).toBe(404)
    expect(logChange).not.toHaveBeenCalled()
  })

  it("passes the loader's 400 through when the project is missing from the query", async () => {
    vi.mocked(cargarReporteProyecto).mockResolvedValueOnce({
      ok: false,
      response: apiError("Elige un proyecto.", 400, "VALIDATION_ERROR"),
    })
    const res = await GET(get("?formato=xlsx"))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Elige un proyecto.")
  })

  it("400 for formato=pdf on a readable project, without an audit row", async () => {
    const res = await GET(get(`${QS}&formato=pdf`))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Formato no disponible. Por ahora solo se exporta en Excel (xlsx).")
    expect(logChange).not.toHaveBeenCalled()
  })

  it("downloads an xlsx named after the project code slug and the cut-off", async () => {
    const res = await GET(get(`${QS}&formato=xlsx`))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="reporte-proyecto-pry-fab-01-2026-11-26.xlsx"')
  })

  it("has the sheets Resumen, Aliados, Oportunidades, Bitácora and Tareas, in that order", async () => {
    const wb = await abrir(await GET(get()))
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Resumen", "Aliados", "Oportunidades", "Bitácora", "Tareas"])
  })

  it("leaves the Oportunidades sheet out when opportunities are hidden (null)", async () => {
    vi.mocked(cargarReporteProyecto).mockResolvedValue({ ok: true, value: reporte({ oportunidades: null }) })
    const wb = await abrir(await GET(get()))
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Resumen", "Aliados", "Bitácora", "Tareas"])
    const textos = filas(wb.getWorksheet("Resumen")!).flat().map(String)
    expect(textos.some((t) => /oportunidad/i.test(t))).toBe(false)
  })

  it("writes amounts as numbers and dates as real dates", async () => {
    const wb = await abrir(await GET(get()))
    const aliados = wb.getWorksheet("Aliados")!
    const aporte = aliados.getRow(2).getCell(columna(aliados, "Aporte"))
    expect(aporte.value).toBe(6000.25)
    expect(aporte.numFmt).toBe("#,##0.00")
    const ultima = aliados.getRow(2).getCell(columna(aliados, "Última interacción"))
    expect(ultima.value).toEqual(new Date("2026-11-20T00:00:00Z"))
    expect(ultima.numFmt).toBe("yyyy-mm-dd")
    expect(aliados.getRow(3).getCell(columna(aliados, "Última interacción")).value).toBe("")
    const oportunidades = wb.getWorksheet("Oportunidades")!
    expect(oportunidades.getRow(3).getCell(columna(oportunidades, "Valor estimado")).value).toBe(250.5)
    const bitacora = wb.getWorksheet("Bitácora")!
    expect(bitacora.getRow(2).getCell(columna(bitacora, "Fecha")).value).toEqual(new Date("2026-11-20T00:00:00Z"))
    const tareas = wb.getWorksheet("Tareas")!
    expect(tareas.getRow(2).getCell(columna(tareas, "Fecha de entrega")).value).toEqual(new Date("2026-11-10T00:00:00Z"))
    expect(tareas.getRow(2).getCell(columna(tareas, "Vencida")).value).toBe("Sí")
    expect(tareas.getRow(3).getCell(columna(tareas, "Vencida")).value).toBe("No")
    expect(tareas.getRow(4).getCell(columna(tareas, "Fecha de entrega")).value).toBe("")
    const resumen = filas(wb.getWorksheet("Resumen")!)
    expect(resumen).toContainEqual(["Corte", new Date("2026-11-26T00:00:00Z")])
    expect(resumen).toContainEqual(["Valor total", 10000])
  })

  it("shows meta, comprometido, en gestión, sin cubrir, programado, ejecutado and task progress in Resumen", async () => {
    const resumen = filas((await abrir(await GET(get()))).getWorksheet("Resumen")!)
    expect(resumen).toContainEqual(["Proyecto", "'=Fábrica Milagro"])
    expect(resumen).toContainEqual(["Cliente", "Posición propia · 2 aliados"])
    expect(resumen).toContainEqual(["Meta", 10000])
    expect(resumen).toContainEqual(["Comprometido", 6000.25])
    expect(resumen).toContainEqual(["En gestión", 2000])
    expect(resumen).toContainEqual(["Sin cubrir", 1999.75])
    expect(resumen).toContainEqual(["Presupuesto programado", 4000])
    expect(resumen).toContainEqual(["Presupuesto ejecutado", 1500.5])
    expect(resumen).toContainEqual(["Avance de tareas (%)", 50])
    expect(resumen).toContainEqual(["Tareas vencidas", 1])
  })

  it("leaves the financing and budget rows out when the report has none", async () => {
    const base = reporte()
    vi.mocked(cargarReporteProyecto).mockResolvedValue({
      ok: true,
      value: { ...base, resumen: { ...base.resumen, financiacion: null, financiero: null } },
    })
    const conceptos = filas((await abrir(await GET(get()))).getWorksheet("Resumen")!).map((f) => String(f[0]))
    for (const c of ["Meta", "Comprometido", "En gestión", "Sin cubrir", "Presupuesto programado", "Presupuesto ejecutado"]) {
      expect(conceptos).not.toContain(c)
    }
  })

  // The same notes as the «Proyecto» tab and its print view (shared `proyecto-notas.ts`).
  it("prints the assumption notes in Resumen", async () => {
    const textos = filas((await abrir(await GET(get()))).getWorksheet("Resumen")!).flat().map(String)
    for (const nota of Object.values(NOTAS)) expect(textos).toContain(nota)
  })

  it("adds totals rows to Aliados (aporte) and Oportunidades (valor)", async () => {
    const wb = await abrir(await GET(get()))
    const aliados = wb.getWorksheet("Aliados")!
    const totalA = aliados.getRow(aliados.rowCount)
    expect(totalA.getCell(1).value).toBe("Total")
    expect(totalA.getCell(columna(aliados, "Aporte")).value).toBe(8000.25)
    const oportunidades = wb.getWorksheet("Oportunidades")!
    const totalO = oportunidades.getRow(oportunidades.rowCount)
    expect(totalO.getCell(1).value).toBe("Total")
    expect(totalO.getCell(columna(oportunidades, "Valor estimado")).value).toBe(750.5)
  })

  it("freezes and filters the header row of every sheet", async () => {
    const wb = await abrir(await GET(get()))
    for (const ws of wb.worksheets) {
      expect(ws.views[0]).toEqual(expect.objectContaining({ state: "frozen", ySplit: 1 }))
      expect(ws.autoFilter).toBeTruthy()
      expect(ws.getRow(1).font?.bold).toBe(true)
    }
  })

  it("never writes a tercero or soporte header", async () => {
    const wb = await abrir(await GET(get()))
    for (const ws of wb.worksheets) {
      const cabecera = (ws.getRow(1).values as unknown[]).slice(1).map(String)
      expect(cabecera.some((h) => ENCABEZADOS_PROHIBIDOS.test(h))).toBe(false)
    }
  })

  it("writes an EXPORTAR audit row on the project", async () => {
    await GET(get())
    expect(logChange).toHaveBeenCalledWith(expect.anything(), {
      usuario_id: "GERENCIA-1",
      accion: "EXPORTAR",
      entidad: "proyecto",
      entidad_id: "p1",
      proyecto_id: "p1",
      campo: "reporte_proyecto",
      valor_nuevo: { formato: "xlsx", corte: "2026-11-26", aliados: 2, oportunidades: 2, bitacora: 1 },
    })
  })

  it("still downloads when the audit write fails", async () => {
    vi.mocked(logChange).mockRejectedValueOnce(new Error("db down"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect((await GET(get())).status).toBe(200)
  })

  it("is registered in the OpenAPI document", () => {
    const paths = buildOpenApiDocument().paths ?? {}
    expect(paths["/api/v1/reports/project/export"]).toEqual(expect.objectContaining({ get: expect.anything() }))
  })
})
