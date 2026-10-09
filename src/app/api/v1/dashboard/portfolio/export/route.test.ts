// GET /api/v1/dashboard/portfolio/export (S9 U5): Excel of the portfolio table, capped and audited.
import ExcelJS from "exceljs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async () => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({ db: { proyecto: { findMany: vi.fn() } } }))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))
vi.mock("@/lib/api/audit-cambios", () => ({ logChange: vi.fn(async () => undefined) }))

import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { logChange } from "@/lib/api/audit-cambios"
import { kpisProyecto } from "@/lib/proyectos/kpis"
import { toCents } from "@/lib/proyectos/money"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { ENCABEZADOS_PROHIBIDOS } from "@/lib/proyectos/export-xlsx"
import { GET } from "./route"

const user = (rol: string, extra: object = {}) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false, ...extra }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const get = (qs = "?corte=2026-03-15") => new Request(`http://localhost/api/v1/dashboard/portfolio/export${qs}`)

const fila = (n: number) => ({
  id: `p${n}`,
  codigo: `PRY-${String(n).padStart(4, "0")}`,
  nombre: n === 1 ? "=SUMA(1;1)" : `Proyecto ${n}`,
  estado: "EN_EJECUCION",
  fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
  fecha_fin: new Date("2026-06-30T00:00:00.000Z"),
  beneficiarios_meta: 100,
  cliente: { id: "c1", nombre: "Cliente" },
  responsable: { id: "r1", nombre: "Ana" },
  lineas: [{ principal: true, linea: { id: "l1", codigo: "LE01", nombre: "Línea" } }],
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
const serve = (n: number) => {
  vi.mocked(db.proyecto.findMany).mockResolvedValue(Array.from({ length: n }, (_, i) => fila(i + 1)) as never)
  vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map(Array.from({ length: n }, (_, i) => [`p${i + 1}`, kpis] as const)))
}
async function abrir(res: Response) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never)
  return wb
}

beforeEach(() => {
  auth(user("GERENCIA"))
  serve(2)
})
afterEach(() => vi.clearAllMocks())

describe("GET dashboard/portfolio/export", () => {
  it("403 for an unflagged COLABORADOR even with formato=pdf, and no audit row", async () => {
    auth(user("COLABORADOR"))
    expect((await GET(get("?formato=pdf"))).status).toBe(403)
    expect((await GET(get())).status).toBe(403)
    expect(logChange).not.toHaveBeenCalled()
  })

  it("400 for formato=pdf and for a bad corte", async () => {
    const pdf = await GET(get("?formato=pdf"))
    expect(pdf.status).toBe(400)
    expect((await pdf.json()).error).toBe("Formato no disponible. Por ahora solo se exporta en Excel (xlsx).")
    expect((await GET(get("?corte=mañana"))).status).toBe(400)
  })

  it.each([
    ["GERENCIA", user("GERENCIA")],
    ["COORDINADOR", user("COORDINADOR")],
    ["COLABORADOR con la bandera", user("COLABORADOR", { puede_ver_tablero_gerencial: true })],
  ])("%s downloads the workbook", async (_n, usuario) => {
    auth(usuario)
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="portafolio-2026-03-15.xlsx"')
    const wb = await abrir(res)
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Portafolio", "Resumen"])
    const ws = wb.getWorksheet("Portafolio") as ExcelJS.Worksheet
    expect(ws.rowCount).toBe(3)
    expect(ws.getRow(2).getCell(2).value).toBe("'=SUMA(1;1)")
    const textos: string[] = []
    wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => typeof c.value === "string" && textos.push(c.value))))
    expect(textos.filter((t) => ENCABEZADOS_PROHIBIDOS.test(t))).toEqual([])
  })

  it("caps the export at 500 rows and says so", async () => {
    serve(501)
    const wb = await abrir(await GET(get()))
    expect((wb.getWorksheet("Portafolio") as ExcelJS.Worksheet).rowCount).toBe(501)
    const resumen: unknown[][] = []
    ;(wb.getWorksheet("Resumen") as ExcelJS.Worksheet).eachRow((r) => resumen.push((r.values as unknown[]).slice(1)))
    expect(resumen.some((r) => r[0] === "Nota")).toBe(true)
    expect(vi.mocked(logChange).mock.calls[0][1].valor_nuevo).toMatchObject({ filas: 500, truncado: true })
  })

  it("audits EXPORTAR as the portfolio, without a project, and survives an audit failure", async () => {
    await GET(get("?corte=2026-03-15&estado=EN_EJECUCION"))
    expect(vi.mocked(logChange).mock.calls[0][1]).toMatchObject({
      usuario_id: "GERENCIA-1",
      accion: "EXPORTAR",
      entidad: "proyecto",
      entidad_id: "portafolio",
      proyecto_id: null,
      campo: "portafolio",
      valor_nuevo: { corte: "2026-03-15", filas: 2, filtros: { estado: "EN_EJECUCION" } },
    })
    vi.mocked(logChange).mockRejectedValueOnce(new Error("db down"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect((await GET(get())).status).toBe(200)
    spy.mockRestore()
  })
})
