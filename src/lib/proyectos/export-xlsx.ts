/**
 * Excel workbooks of the project dashboards (S9 U5, RF-31): the portfolio table, the project ficha and the
 * financial ficha. Server-side, with exceljs, from the JSON payloads the KPI routes already answer, so a
 * workbook can never disagree with the screen.
 *
 * P04 / REQ-ACC-05: a workbook carries aggregates only. There is NO per-gasto, tercero or soporte data in
 * any sheet for any role, and `assertSinEncabezadosProhibidos` refuses to write a header that names one.
 * Text that comes from users (names, rubros, clients) goes through `celdaTexto`, which neutralizes cells a
 * spreadsheet would run as a formula; money and percentages are written as numbers.
 */

import ExcelJS from "exceljs"
import { diferenciaRealPlanPp } from "./avance"

export type ColorXlsx = "verde" | "amarillo" | "rojo"

/** Headers that would expose expense-level detail (a third party or a support). */
export const ENCABEZADOS_PROHIBIDOS = /tercero|soporte/i

export function assertSinEncabezadosProhibidos(encabezados: readonly string[]): void {
  const prohibido = encabezados.find((h) => ENCABEZADOS_PROHIBIDOS.test(h))
  if (prohibido) throw new Error(`Encabezado no permitido en una exportación: ${prohibido}`)
}

/** A cell a spreadsheet would execute as a formula when opened. */
const INICIO_FORMULA = /^[=+\-@\t\r\n ]/

/** Text for a cell: null becomes empty and a formula-looking start is prefixed with `'`. */
export function celdaTexto(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return ""
  return INICIO_FORMULA.test(valor) ? `'${valor}` : valor
}

const ETIQUETA_COLOR: Record<ColorXlsx, string> = { verde: "Verde", amarillo: "Amarillo", rojo: "Rojo" }
const ETIQUETA_ESTADO: Record<string, string> = {
  PLANIFICACION: "Planificación",
  BORRADOR: "Borrador",
  EN_EJECUCION: "En ejecución",
  SUSPENDIDO: "Suspendido",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
}
const estadoTexto = (estado: string) => ETIQUETA_ESTADO[estado] ?? estado
const colorTexto = (color: ColorXlsx | null | undefined) => (color ? ETIQUETA_COLOR[color] : "")
const sino = (valor: boolean | null | undefined) => (valor === null || valor === undefined ? "" : valor ? "Sí" : "No")
/** Decimal string of the API ("1234.50") to a numeric cell. */
const dinero = (valor: string | null | undefined): number | "" => (valor === null || valor === undefined ? "" : Number(valor))
const numero = (valor: number | null | undefined): number | "" => (valor === null || valor === undefined ? "" : valor)

const FORMATO_DINERO = "#,##0.00"
const FORMATO_PCT = "0.0"

// ---------------------------------------------------------------------------
// Payload shapes (structural: the JSON the routes answer)
// ---------------------------------------------------------------------------

export type KpisXlsx = {
  corte: string
  estado: string
  medible: boolean
  confirmado: boolean
  tecnico: { avance_real: number; avance_programado: number; desviacion_pp: number; color: ColorXlsx } | null
  cronograma: { vencidas: number; a_tiempo: number; valor: number | null } | null
  entregables: { programados: number; logrados: number; valor: number | null } | null
  indicadores: { valor: number | null; medidos: number; sin_medir: number } | null
  beneficiarios: { total: number; meta: number | null; valor: number | null } | null
  financiero: {
    asignado: string
    programado: string
    ejecutado: string
    ea: number | null
    ep: number | null
    color: ColorXlsx
    alerta_retraso: boolean
  } | null
}

export type FichaFinancieraXlsx = {
  base: string
  corte: string
  estado: string
  ejecucion_disponible: boolean
  alerta_retraso: boolean
  parametros: { confirmado: boolean }
  rubros: FilaFinancieraXlsx[]
  total: FilaFinancieraXlsx
}

export type FilaFinancieraXlsx = {
  codigo: string | null
  nombre: string
  asignado: string
  programado: string
  ejecutado: string
  diferencia: string
  ep_decimas: number | null
  ea_decimas: number | null
  umbral_rojo: string
  color: ColorXlsx | null
}

export type FichaProyectoXlsx = {
  codigo: string
  nombre: string
  cliente: string
  estado: string
  responsable: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  duracion_semanas: number | null
  valor_total: string | null
  beneficiarios_meta: number | null
  lineas: string[]
  municipios: string[]
  conteos: { objetivos: number; actividades: number; entregables: number; indicadores: number }
  base: string
  kpis: KpisXlsx
}

export type PortafolioXlsx = {
  corte: string
  confirmado: boolean
  /** True when the export was cut at the row cap. */
  truncado: boolean
  proyectos: {
    codigo: string
    nombre: string
    cliente: string
    estado: string
    responsable: string | null
    linea_principal: string | null
    semaforo_tecnico: ColorXlsx | null
    semaforo_financiero: ColorXlsx | null
    alerta_retraso: boolean | null
    kpis: KpisXlsx
  }[]
  agregado: {
    tecnico: { proyectos: number; avance_real: number | null; avance_programado: number | null }
    financiero: { proyectos: number; asignado: string; programado: string; ejecutado: string; ea: number | null; ep: number | null }
  }
  por_estado: Record<string, number>
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

type Celda = string | number | boolean | null

function libro(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Muttu Hub"
  wb.created = new Date()
  return wb
}

function hojaTabla(wb: ExcelJS.Workbook, nombre: string, encabezados: readonly string[], filas: readonly Celda[][], formatos: Record<number, string> = {}) {
  assertSinEncabezadosProhibidos(encabezados)
  const ws = wb.addWorksheet(nombre)
  const cabecera = ws.addRow([...encabezados])
  cabecera.font = { bold: true }
  for (const fila of filas) ws.addRow(fila)
  for (const [columna, formato] of Object.entries(formatos)) ws.getColumn(Number(columna)).numFmt = formato
  ws.columns.forEach((c, i) => {
    c.width = Math.max(12, Math.min(40, String(encabezados[i] ?? "").length + 4))
  })
  return ws
}

function hojaClaveValor(wb: ExcelJS.Workbook, nombre: string, filas: readonly (readonly [string, Celda])[]) {
  assertSinEncabezadosProhibidos(filas.map(([clave]) => clave))
  const ws = wb.addWorksheet(nombre)
  for (const [clave, valor] of filas) ws.addRow([clave, valor])
  ws.getColumn(1).font = { bold: true }
  ws.getColumn(1).width = 34
  ws.getColumn(2).width = 40
  return ws
}

async function buffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const decimasAPct = (decimas: number | null): number | "" => (decimas === null ? "" : decimas / 10)

function filasKpis(k: KpisXlsx): Celda[][] {
  const t = k.tecnico
  const f = k.financiero
  const detalle = (texto: string | null) => texto ?? ""
  return [
    ["Avance real (%)", numero(t?.avance_real), ""],
    ["Avance programado (%)", numero(t?.avance_programado), ""],
    ["Desviación (pp, real − programado)", numero(t && diferenciaRealPlanPp(t.desviacion_pp)), ""],
    ["Semáforo técnico", colorTexto(t?.color), ""],
    ["Cumplimiento del cronograma (%)", numero(k.cronograma?.valor), detalle(k.cronograma && `${k.cronograma.a_tiempo} a tiempo de ${k.cronograma.vencidas} vencidas`)],
    ["Entregables logrados (%)", numero(k.entregables?.valor), detalle(k.entregables && `${k.entregables.logrados} de ${k.entregables.programados} programados`)],
    ["Cumplimiento de indicadores (%)", numero(k.indicadores?.valor), detalle(k.indicadores && `${k.indicadores.medidos} medidos, ${k.indicadores.sin_medir} sin medir`)],
    ["Beneficiarios vs meta (%)", numero(k.beneficiarios?.valor), detalle(k.beneficiarios && `${k.beneficiarios.total} de ${k.beneficiarios.meta ?? "sin meta"}`)],
    ["Avance financiero E/A (%)", numero(f?.ea), ""],
    ["Ejecución vs programado E/P (%)", numero(f?.ep), ""],
    ["Semáforo financiero", colorTexto(f?.color), ""],
    ["Alerta de retraso", sino(f?.alerta_retraso), ""],
    ["Asignado", dinero(f?.asignado), ""],
    ["Programado", dinero(f?.programado), ""],
    ["Ejecutado", dinero(f?.ejecutado), ""],
  ]
}

const NOTA_CONFIRMADO = "Los umbrales del semáforo son provisionales hasta que se confirmen."

// ---------------------------------------------------------------------------
// Workbooks
// ---------------------------------------------------------------------------

/** The financial ficha: one row per rubro and the total row (the same numbers as `computeFicha`). */
export async function xlsxFichaFinanciera(sheet: FichaFinancieraXlsx, proyecto: { codigo: string; nombre: string }): Promise<Buffer> {
  const wb = libro()
  const fila = (r: FilaFinancieraXlsx, nombre: string): Celda[] => [
    celdaTexto(r.codigo),
    celdaTexto(nombre),
    dinero(r.asignado),
    dinero(r.programado),
    dinero(r.ejecutado),
    dinero(r.diferencia),
    decimasAPct(r.ep_decimas),
    decimasAPct(r.ea_decimas),
    dinero(r.umbral_rojo),
    colorTexto(r.color),
  ]
  hojaTabla(
    wb,
    "Financiera",
    ["Código", "Rubro", "Asignado", "Programado", "Ejecutado", "Diferencia", "E/P (%)", "E/A (%)", "Umbral rojo", "Semáforo"],
    [...sheet.rubros.map((r) => fila(r, r.nombre)), fila(sheet.total, "Total")],
    { 3: FORMATO_DINERO, 4: FORMATO_DINERO, 5: FORMATO_DINERO, 6: FORMATO_DINERO, 7: FORMATO_PCT, 8: FORMATO_PCT, 9: FORMATO_DINERO },
  )
  hojaClaveValor(wb, "Resumen", [
    ["Proyecto", celdaTexto(`${proyecto.codigo} ${proyecto.nombre}`)],
    ["Corte", sheet.corte],
    ["Base", sheet.base],
    ["Estado", estadoTexto(sheet.estado)],
    ["Ejecución disponible", sino(sheet.ejecucion_disponible)],
    ["Alerta de retraso", sino(sheet.alerta_retraso)],
    ["Parámetros confirmados", sino(sheet.parametros.confirmado)],
    ...(sheet.parametros.confirmado ? [] : ([["Nota", NOTA_CONFIRMADO]] as const)),
  ])
  return buffer(wb)
}

/** The project ficha: general data, structure counts and the KPI block. */
export async function xlsxFichaProyecto(p: FichaProyectoXlsx): Promise<Buffer> {
  const wb = libro()
  hojaClaveValor(wb, "Proyecto", [
    ["Código", p.codigo],
    ["Nombre", celdaTexto(p.nombre)],
    ["Cliente", celdaTexto(p.cliente)],
    ["Estado", estadoTexto(p.estado)],
    ["Responsable", celdaTexto(p.responsable)],
    ["Fecha de inicio", p.fecha_inicio ?? ""],
    ["Fecha de fin", p.fecha_fin ?? ""],
    ["Duración (semanas)", numero(p.duracion_semanas)],
    ["Valor total", dinero(p.valor_total)],
    ["Meta de beneficiarios", numero(p.beneficiarios_meta)],
    ["Líneas estratégicas", celdaTexto(p.lineas.join("; "))],
    ["Municipios", celdaTexto(p.municipios.join("; "))],
  ])
  hojaClaveValor(wb, "Estructura", [
    ["Objetivos", p.conteos.objetivos],
    ["Actividades", p.conteos.actividades],
    ["Entregables", p.conteos.entregables],
    ["Indicadores", p.conteos.indicadores],
  ])
  const filas = p.kpis.medible ? filasKpis(p.kpis) : filasKpis(p.kpis).map(([nombre]) => [nombre, "", "No medible"] as Celda[])
  const ws = hojaTabla(wb, "KPIs", ["Indicador", "Valor", "Detalle"], filas, { 2: FORMATO_PCT })
  ws.addRow([])
  ws.addRow(["Corte", p.kpis.corte])
  ws.addRow(["Base", p.base])
  if (!p.kpis.confirmado) ws.addRow(["Nota", NOTA_CONFIRMADO])
  return buffer(wb)
}

/** The portfolio table plus its summary sheet. */
export async function xlsxPortafolio(p: PortafolioXlsx): Promise<Buffer> {
  const wb = libro()
  hojaTabla(
    wb,
    "Portafolio",
    [
      "Código", "Proyecto", "Cliente", "Estado", "Responsable", "Línea principal",
      "Avance real (%)", "Avance programado (%)", "Desviación (pp)", "Semáforo técnico",
      "Asignado", "Programado", "Ejecutado", "E/A (%)", "E/P (%)", "Semáforo financiero", "Alerta de retraso",
      "Cumplimiento del cronograma (%)", "Entregables logrados (%)", "Cumplimiento de indicadores (%)", "Beneficiarios vs meta (%)",
    ],
    p.proyectos.map((r) => [
      r.codigo,
      celdaTexto(r.nombre),
      celdaTexto(r.cliente),
      estadoTexto(r.estado),
      celdaTexto(r.responsable),
      celdaTexto(r.linea_principal),
      numero(r.kpis.tecnico?.avance_real),
      numero(r.kpis.tecnico?.avance_programado),
      numero(r.kpis.tecnico?.desviacion_pp),
      colorTexto(r.semaforo_tecnico),
      dinero(r.kpis.financiero?.asignado),
      dinero(r.kpis.financiero?.programado),
      dinero(r.kpis.financiero?.ejecutado),
      numero(r.kpis.financiero?.ea),
      numero(r.kpis.financiero?.ep),
      colorTexto(r.semaforo_financiero),
      sino(r.alerta_retraso),
      numero(r.kpis.cronograma?.valor),
      numero(r.kpis.entregables?.valor),
      numero(r.kpis.indicadores?.valor),
      numero(r.kpis.beneficiarios?.valor),
    ]),
    { 7: FORMATO_PCT, 8: FORMATO_PCT, 9: FORMATO_PCT, 11: FORMATO_DINERO, 12: FORMATO_DINERO, 13: FORMATO_DINERO, 14: FORMATO_PCT, 15: FORMATO_PCT },
  )
  const t = p.agregado.tecnico
  const f = p.agregado.financiero
  hojaClaveValor(wb, "Resumen", [
    ["Corte", p.corte],
    ["Parámetros confirmados", sino(p.confirmado)],
    ["Proyectos listados", p.proyectos.length],
    ...(p.truncado ? ([["Nota", "La exportación se cortó en el máximo de filas."]] as const) : []),
    ["Avance real promedio (%)", numero(t.avance_real)],
    ["Avance programado promedio (%)", numero(t.avance_programado)],
    ["Asignado total", dinero(f.asignado)],
    ["Programado total", dinero(f.programado)],
    ["Ejecutado total", dinero(f.ejecutado)],
    ["E/A ponderado (%)", numero(f.ea)],
    ["E/P ponderado (%)", numero(f.ep)],
    ...Object.entries(p.por_estado).map(([estado, cantidad]) => [estadoTexto(estado), cantidad] as const),
  ])
  return buffer(wb)
}
