// Libro de Excel del reporte semanal (S5), con exceljs y desde el mismo JSON de `GET /api/v1/reports/weekly`,
// así el archivo no puede contradecir la pantalla. Mismas reglas que los libros del portafolio
// (`lib/proyectos/export-xlsx.ts`): solo agregados, ningún encabezado que nombre un tercero o un soporte
// (`assertSinEncabezadosProhibidos`, P04) y todo texto de usuario pasa por `celdaTexto`, que neutraliza las
// celdas que una hoja de cálculo ejecutaría como fórmula. Montos y porcentajes se escriben como números.

import ExcelJS from "exceljs"
import { assertSinEncabezadosProhibidos, celdaTexto } from "@/lib/proyectos/export-xlsx"
import type { ReporteSemanal } from "@/lib/reportes/semanal"

type Celda = string | number | null

const FORMATO_DINERO = "#,##0.00"
const FORMATO_PCT = "0.0"

const ETIQUETA_COLOR: Record<string, string> = { verde: "Verde", amarillo: "Amarillo", rojo: "Rojo" }
const ETIQUETA_ESTADO: Record<string, string> = {
  PLANIFICACION: "Planificación",
  BORRADOR: "Borrador",
  EN_EJECUCION: "En ejecución",
  SUSPENDIDO: "Suspendido",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
}

const color = (valor: string | null) => (valor ? (ETIQUETA_COLOR[valor] ?? valor) : "Sin medir")
const numero = (valor: number | null | undefined): Celda => (valor === null || valor === undefined ? "" : valor)
const dinero = (valor: string | null | undefined): Celda => (valor === null || valor === undefined ? "" : Number(valor))

function hoja(wb: ExcelJS.Workbook, nombre: string, encabezados: readonly string[], filas: readonly Celda[][], formatos: Record<number, string> = {}) {
  assertSinEncabezadosProhibidos(encabezados)
  const ws = wb.addWorksheet(nombre)
  ws.addRow([...encabezados]).font = { bold: true }
  for (const fila of filas) ws.addRow(fila)
  for (const [columna, formato] of Object.entries(formatos)) ws.getColumn(Number(columna)).numFmt = formato
  ws.columns.forEach((c, i) => {
    c.width = Math.max(12, Math.min(48, String(encabezados[i] ?? "").length + 4))
  })
  return ws
}

export async function xlsxReporteSemanal(r: ReporteSemanal): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Muttu Hub"
  wb.created = new Date()

  const t = r.portafolio.total
  hoja(wb, "Resumen", ["Concepto", "Esta semana", "Semana anterior"], [
    ["Semana", `${r.semana.desde} a ${r.semana.hasta}`, `${r.semana_anterior.desde} a ${r.semana_anterior.hasta}`],
    ["Tareas cerradas", r.tareas.semana.cerradas, r.tareas.semana_anterior.cerradas],
    ["Tareas vencidas", r.tareas.semana.vencidas, r.tareas.semana_anterior.vencidas],
    ["Corte de los indicadores", r.corte, ""],
    ["Proyectos", r.portafolio.proyectos.length, ""],
    ["Avance real promedio (%)", numero(t.tecnico.avance_real), ""],
    ["Avance programado promedio (%)", numero(t.tecnico.avance_programado), ""],
    ["Asignado total", dinero(t.financiero.asignado), ""],
    ["Programado total", dinero(t.financiero.programado), ""],
    ["Ejecutado total", dinero(t.financiero.ejecutado), ""],
    ["Actividades atrasadas", t.atrasadas, ""],
    ...(r.gastos_por_validar
      ? ([
          ["Gastos por validar", r.gastos_por_validar.cantidad, ""],
          ["Monto por validar", dinero(r.gastos_por_validar.monto), ""],
        ] as Celda[][])
      : []),
    ...(r.confirmado ? [] : ([["Nota", "Los umbrales del semáforo son provisionales hasta que se confirmen.", ""]] as Celda[][])),
  ])

  hoja(
    wb,
    "Proyectos",
    [
      "Código", "Proyecto", "Cliente", "Estado", "Responsable", "Semáforo técnico", "Semáforo financiero",
      "Avance real (%)", "Avance programado (%)", "Asignado", "Programado", "Ejecutado", "Posible retraso", "Actividades atrasadas",
    ],
    r.portafolio.proyectos.map((p) => [
      p.codigo,
      celdaTexto(p.nombre),
      celdaTexto(p.cliente.nombre),
      ETIQUETA_ESTADO[p.estado] ?? p.estado,
      celdaTexto(p.responsable?.nombre),
      color(p.semaforo_tecnico),
      color(p.semaforo_financiero),
      numero(p.avance_real),
      numero(p.avance_programado),
      dinero(p.asignado),
      dinero(p.programado),
      dinero(p.ejecutado),
      p.alerta_retraso === null ? "" : p.alerta_retraso ? "Sí" : "No",
      numero(p.atrasadas),
    ]),
    { 8: FORMATO_PCT, 9: FORMATO_PCT, 10: FORMATO_DINERO, 11: FORMATO_DINERO, 12: FORMATO_DINERO },
  )

  hoja(
    wb,
    "Por cliente",
    [
      "Cliente", "Proyectos", "Avance real promedio (%)", "Avance programado promedio (%)", "Asignado", "Programado", "Ejecutado",
      "Técnico verde", "Técnico amarillo", "Técnico rojo", "Financiero verde", "Financiero amarillo", "Financiero rojo",
    ],
    r.portafolio.por_cliente.map((c) => [
      celdaTexto(c.cliente.nombre),
      c.proyectos,
      numero(c.tecnico.avance_real),
      numero(c.tecnico.avance_programado),
      dinero(c.financiero.asignado),
      dinero(c.financiero.programado),
      dinero(c.financiero.ejecutado),
      c.por_color_tecnico.verde,
      c.por_color_tecnico.amarillo,
      c.por_color_tecnico.rojo,
      c.por_color_financiero.verde,
      c.por_color_financiero.amarillo,
      c.por_color_financiero.rojo,
    ]),
    { 3: FORMATO_PCT, 4: FORMATO_PCT, 5: FORMATO_DINERO, 6: FORMATO_DINERO, 7: FORMATO_DINERO },
  )

  hoja(
    wb,
    "Actividades atrasadas",
    ["Código del proyecto", "Proyecto", "Actividad"],
    r.actividades_atrasadas.map((a) => [a.proyecto.codigo, celdaTexto(a.proyecto.nombre), celdaTexto(a.detalle)]),
  )

  hoja(
    wb,
    "Requiere atención",
    ["Código del proyecto", "Proyecto", "Tipo", "Detalle"],
    r.atencion.flatMap((p) => p.items.map((i) => [p.proyecto.codigo, celdaTexto(p.proyecto.nombre), i.titulo, celdaTexto(i.detalle)])),
  )

  if (r.gastos_por_validar) {
    hoja(
      wb,
      "Gastos por validar",
      ["Código del proyecto", "Proyecto", "Gastos por validar", "Monto", "Registrado desde"],
      r.gastos_por_validar.por_proyecto.map((g) => [g.proyecto.codigo, celdaTexto(g.proyecto.nombre), g.cantidad, dinero(g.monto), g.mas_antiguo]),
      { 4: FORMATO_DINERO },
    )
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}
