// GET /api/v1/reports/weekly/export (S5): the weekly report as an Excel workbook, audited, aggregates only (P04).
import ExcelJS from "exceljs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/api/audit-cambios", () => ({ logChange: vi.fn(async () => undefined) }))
vi.mock("@/lib/reportes/semanal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reportes/semanal")>()),
  cargarReporteSemanal: vi.fn(),
}))

import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/supabase/server"
import { logChange } from "@/lib/api/audit-cambios"
import { cargarReporteSemanal, type ReporteSemanal } from "@/lib/reportes/semanal"
import { ENCABEZADOS_PROHIBIDOS } from "@/lib/proyectos/export-xlsx"
import { GET } from "./route"

const user = (rol: string) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const get = (qs = "?semana=2026-10-21") => new Request(`http://localhost/api/v1/reports/weekly/export${qs}`)

const COLORES = { verde: 0, amarillo: 0, rojo: 0 }
const financiero = { proyectos: 1, asignado: "1000.00", programado: "500.00", ejecutado: "100.00", ea: 10, ep: 20 }
const reporte = (gastos: ReporteSemanal["gastos_por_validar"]): ReporteSemanal => ({
  semana: { desde: "2026-10-19", hasta: "2026-10-25" },
  semana_anterior: { desde: "2026-10-12", hasta: "2026-10-18" },
  corte: "2026-10-25",
  confirmado: false,
  portafolio: {
    proyectos: [
      {
        id: "p1",
        codigo: "PRY-1",
        nombre: "=SUMA(1;1)",
        estado: "EN_EJECUCION",
        cliente: { id: "c1", nombre: "Acme" },
        responsable: { id: "r1", nombre: "Ana" },
        semaforo_tecnico: "verde",
        semaforo_financiero: "rojo",
        alerta_retraso: false,
        avance_real: 40,
        avance_programado: 50,
        asignado: "1000.00",
        programado: "500.00",
        ejecutado: "100.00",
        atrasadas: 1,
      },
    ],
    total: {
      tecnico: { proyectos: 1, avance_real: 40, avance_programado: 50 },
      financiero,
      atrasadas: 1,
      por_color_tecnico: { ...COLORES, verde: 1 },
      por_color_financiero: { ...COLORES, rojo: 1 },
    },
    por_cliente: [
      {
        cliente: { id: "c1", nombre: "Acme" },
        proyectos: 1,
        tecnico: { proyectos: 1, avance_real: 40, avance_programado: 50 },
        financiero,
        atrasadas: 1,
        por_color_tecnico: { ...COLORES, verde: 1 },
        por_color_financiero: { ...COLORES, rojo: 1 },
      },
    ],
  },
  actividades_atrasadas: [{ proyecto: { id: "p1", codigo: "PRY-1", nombre: "Uno" }, actividad_id: "a1", detalle: "A1 Diagnóstico: vencida." }],
  tareas: { semana: { cerradas: 5, vencidas: 2 }, semana_anterior: { cerradas: 3, vencidas: 4 } },
  atencion: [
    { proyecto: { id: "p1", codigo: "PRY-1", nombre: "Uno" }, items: [{ tipo: "rubro_sobreejecucion", titulo: "Rubro sobreejecutado", detalle: "R01 Personal." }] },
  ],
  gastos_por_validar: gastos,
})
const GASTOS = {
  cantidad: 2,
  monto: "300.50",
  por_proyecto: [{ proyecto: { id: "p1", codigo: "PRY-1", nombre: "Uno" }, cantidad: 2, monto: "300.50", mas_antiguo: "2026-10-10" }],
}

async function abrir(res: Response) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never)
  return wb
}

beforeEach(() => {
  auth(user("GERENCIA"))
  vi.mocked(cargarReporteSemanal).mockResolvedValue({ ok: true, value: reporte(GASTOS) })
})
afterEach(() => vi.clearAllMocks())

describe("GET /api/v1/reports/weekly/export", () => {
  it("401 without a session and 403 outside the project dashboard, before the format check", async () => {
    vi.mocked(requireApiUser).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "No autenticado", code: "UNAUTHORIZED" }, { status: 401 }),
    })
    expect((await GET(get())).status).toBe(401)
    auth(user("INVITADO"))
    expect((await GET(get("?formato=pdf"))).status).toBe(403)
  })

  it("400 for formato=pdf", async () => {
    const res = await GET(get("?semana=2026-10-21&formato=pdf"))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Formato no disponible. Por ahora solo se exporta en Excel (xlsx).")
  })

  it("downloads an xlsx named after the week with one sheet per section", async () => {
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="reporte-semanal-2026-10-19.xlsx"')
    const wb = await abrir(res)
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "Resumen",
      "Proyectos",
      "Por cliente",
      "Actividades atrasadas",
      "Requiere atención",
      "Gastos por validar",
    ])
    const proyectos = wb.getWorksheet("Proyectos")!
    expect(proyectos.getRow(2).getCell(2).value).toBe("'=SUMA(1;1)")
    expect(proyectos.getRow(2).getCell(10).value).toBe(1000)
    const resumen = wb.getWorksheet("Resumen")!
    const filas = resumen.getSheetValues().flatMap((r) => (Array.isArray(r) ? [r.slice(1)] : []))
    expect(filas).toContainEqual(["Tareas cerradas", 5, 3])
    expect(filas).toContainEqual(["Tareas vencidas", 2, 4])
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "EXPORTAR", entidad_id: "reporte-semanal" }),
    )
  })

  it("never writes a tercero or soporte header and drops the queue sheet for a role that cannot validate", async () => {
    auth(user("COORDINADOR"))
    vi.mocked(cargarReporteSemanal).mockResolvedValue({ ok: true, value: reporte(null) })
    const wb = await abrir(await GET(get()))
    expect(wb.worksheets.map((ws) => ws.name)).not.toContain("Gastos por validar")
    for (const ws of wb.worksheets) {
      const cabecera = (ws.getRow(1).values as unknown[]).slice(1).map(String)
      expect(cabecera.some((h) => ENCABEZADOS_PROHIBIDOS.test(h))).toBe(false)
    }
  })
})
