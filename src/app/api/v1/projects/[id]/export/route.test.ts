// GET /api/v1/projects/:id/export (S9 U5, E-29): Excel of the project ficha or the financial ficha.
import ExcelJS from "exceljs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/settings", async () => {
  const { PARAMETROS_V2_DEFAULT } = await import("@/lib/proyectos/semaforo-v2")
  return { getSemaforoParametrosV2: vi.fn(async () => PARAMETROS_V2_DEFAULT) }
})
vi.mock("@/lib/db", () => ({ db: { proyecto: { findFirst: vi.fn() }, versionProyecto: { findFirst: vi.fn() } } }))
vi.mock("@/lib/api/kpis-portafolio", () => ({ loadKpisPortafolio: vi.fn() }))
vi.mock("@/lib/api/financial-sheet", async (importOriginal) => ({ ...(await importOriginal<object>()), calcularFichaFinanciera: vi.fn() }))
vi.mock("@/lib/api/audit-cambios", () => ({ logChange: vi.fn(async () => undefined) }))

import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/supabase/server"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { calcularFichaFinanciera, serializeRow } from "@/lib/api/financial-sheet"
import { logChange } from "@/lib/api/audit-cambios"
import { computeFicha } from "@/lib/proyectos/ficha-financiera"
import { kpisProyecto } from "@/lib/proyectos/kpis"
import { toCents } from "@/lib/proyectos/money"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { ENCABEZADOS_PROHIBIDOS } from "@/lib/proyectos/export-xlsx"
import { apiError } from "@/lib/api/errors"
import { GET } from "./route"

const user = (rol: string, extra: object = {}) => ({ id: `${rol}-1`, rol, puede_ver_tablero_gerencial: false, ...extra }) as unknown as Usuario
const auth = (usuario: Usuario) => vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never })
const ctx = { params: Promise.resolve({ id: "pry-1" }) }
const get = (qs = "?ficha=proyecto&corte=2026-03-15") => new Request(`http://localhost/api/v1/projects/pry-1/export${qs}`)

const proyecto = (over: object = {}, miembro = false) =>
  ({
    id: "pry-1",
    codigo: "PRY-2026-001",
    nombre: "Proyecto =cmd",
    estado: "EN_EJECUCION",
    origen: null,
    cliente: { id: "c1", nombre: "Cliente" },
    responsable: { id: "r1", nombre: "Ana" },
    responsable_id: "r1",
    fecha_inicio: new Date("2026-01-05T00:00:00.000Z"),
    fecha_fin: new Date("2026-06-30T00:00:00.000Z"),
    valor_total: "3000000.00",
    diferencia_valor_oportunidad: null,
    beneficiarios_meta: 100,
    lineas: [{ principal: true, linea: { id: "l1", codigo: "LE01", nombre: "Línea" } }],
    municipios: [{ municipio: { id: "m1", nombre: "Barranquilla", departamento: "Atlántico" } }],
    _count: { objetivos: 2, actividades: 10, entregables: 30, indicadores: 4 },
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never

const kpis = kpisProyecto({
  corte: "2026-03-15",
  estado: "EN_EJECUCION",
  parametros: PARAMETROS_V2_DEFAULT,
  actividades: [],
  indicadores: [],
  beneficiarios: { total: 10, meta: 100 },
  financiero: { asignado: toCents("1000"), programado: toCents("500"), ejecutado: toCents("100") },
})

const ficha = computeFicha({
  corte: "2026-03",
  toleranciaBp: BigInt(1000),
  rubros: [{ rubroId: "r1", codigo: "R1", nombre: "Personal", asignado: toCents("1000"), programacion: [{ periodo: "2026-01", valor: toCents("400") }], gastos: [{ periodo: "2026-02", valor: toCents("250"), estado: "VALIDADO" }] }],
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

async function abrir(res: Response) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never)
  return wb
}

beforeEach(() => {
  auth(user("GERENCIA"))
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto())
  vi.mocked(loadKpisPortafolio).mockResolvedValue(new Map([["pry-1", kpis]]))
  vi.mocked(calcularFichaFinanciera).mockResolvedValue({ ok: true, value: sheet })
})
afterEach(() => vi.clearAllMocks())

describe("GET projects/:id/export: access and validation", () => {
  it("404 unknown project, 403 for a COLABORADOR and a non-member COORDINADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null)
    expect((await GET(get(), ctx)).status).toBe(404)
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto())
    auth(user("COLABORADOR"))
    expect((await GET(get(), ctx)).status).toBe(403)
    auth(user("COORDINADOR"))
    expect((await GET(get(), ctx)).status).toBe(403)
  })

  it("409 without dates, then 400 for formato=pdf and for an unknown ficha", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ fecha_fin: null }))
    expect((await GET(get("?formato=pdf"), ctx)).status).toBe(409)
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto())
    const pdf = await GET(get("?formato=pdf&ficha=proyecto"), ctx)
    expect(pdf.status).toBe(400)
    expect((await pdf.json()).error).toBe("Formato no disponible. Por ahora solo se exporta en Excel (xlsx).")
    expect((await GET(get("?ficha=otra"), ctx)).status).toBe(400)
    expect((await GET(get("?formato=csv"), ctx)).status).toBe(400)
  })
})

describe("GET projects/:id/export: workbooks", () => {
  it("ficha=proyecto (default) answers an xlsx with the project, structure and KPI sheets", async () => {
    const res = await GET(get("?corte=2026-03-15"), ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="PRY-2026-001-proyecto.xlsx"')
    const wb = await abrir(res)
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Proyecto", "Estructura", "KPIs"])
    const nombre = (wb.getWorksheet("Proyecto") as ExcelJS.Worksheet).getRow(2).getCell(2).value
    expect(nombre).toBe("Proyecto =cmd")
    expect((wb.getWorksheet("Estructura") as ExcelJS.Worksheet).getRow(2).getCell(2).value).toBe(10)
  })

  it("ficha=financiera answers the total row of the ficha and passes base and corte through", async () => {
    const res = await GET(get("?ficha=financiera&corte=2026-03&base=original"), ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="PRY-2026-001-financiera.xlsx"')
    expect(vi.mocked(calcularFichaFinanciera).mock.calls[0][0]).toMatchObject({ id: "pry-1", baseParam: "original", corteParam: "2026-03" })
    const wb = await abrir(res)
    const ws = wb.getWorksheet("Financiera") as ExcelJS.Worksheet
    const total = ws.getRow(ws.rowCount)
    expect(total.getCell(2).value).toBe("Total")
    expect(total.getCell(3).value).toBe(Number(ficha.total.asignado) / 100)
    expect(total.getCell(5).value).toBe(Number(ficha.total.ejecutado) / 100)
  })

  it("passes a failure of the financial ficha (bad corte, no original version) straight through", async () => {
    vi.mocked(calcularFichaFinanciera).mockResolvedValue({ ok: false, response: apiError("El corte no es válido.", 400, "VALIDATION_ERROR") })
    expect((await GET(get("?ficha=financiera&corte=2030-01"), ctx)).status).toBe(400)
  })

  it("ficha=proyecto with base=original feeds the frozen version to the loader", async () => {
    vi.mocked(db.versionProyecto.findFirst).mockResolvedValue({ snapshot: { schema: 1 } } as never)
    expect((await GET(get("?ficha=proyecto&base=original&corte=2026-03-15"), ctx)).status).toBe(200)
    expect(vi.mocked(loadKpisPortafolio).mock.calls[0][0].original).toEqual({ proyectoId: "pry-1", snapshot: { schema: 1 } })
  })

  it.each([
    ["ADMINISTRADOR", user("ADMINISTRADOR"), false],
    ["COORDINADOR integrante", user("COORDINADOR"), true],
    ["VISUALIZADOR con la bandera", user("VISUALIZADOR", { puede_ver_tablero_gerencial: true }), false],
  ])("no tercero or soporte header for %s, in either ficha", async (_nombre, usuario, miembro) => {
    auth(usuario)
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({}, miembro))
    for (const ficha of ["proyecto", "financiera"]) {
      const res = await GET(get(`?ficha=${ficha}&corte=2026-03-15`), ctx)
      expect(res.status).toBe(200)
      const wb = await abrir(res)
      const textos = wb.worksheets.flatMap((ws) => {
        const out: string[] = []
        ws.eachRow((row) => row.eachCell((c) => typeof c.value === "string" && out.push(c.value)))
        return out
      })
      expect(textos.filter((t) => ENCABEZADOS_PROHIBIDOS.test(t))).toEqual([])
    }
  })
})

describe("GET projects/:id/export: audit", () => {
  it("writes an EXPORTAR row for the project", async () => {
    await GET(get("?ficha=proyecto&corte=2026-03-15"), ctx)
    expect(logChange).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logChange).mock.calls[0][1]).toMatchObject({
      usuario_id: "GERENCIA-1",
      accion: "EXPORTAR",
      entidad: "proyecto",
      entidad_id: "pry-1",
      proyecto_id: "pry-1",
      campo: "ficha_proyecto",
    })
  })

  it("an audit failure never fails the download", async () => {
    vi.mocked(logChange).mockRejectedValueOnce(new Error("db down"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect((await GET(get(), ctx)).status).toBe(200)
    spy.mockRestore()
  })

  it("writes no audit row when the request is refused", async () => {
    auth(user("COLABORADOR"))
    await GET(get(), ctx)
    await GET(get("?formato=pdf"), ctx)
    expect(logChange).not.toHaveBeenCalled()
  })
})
