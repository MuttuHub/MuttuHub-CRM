// Excel workbook of the tag report (T3, S6), built with exceljs from the same JSON as `GET /api/v1/reports/tag`,
// so the file cannot contradict the screen. Same rules as the portfolio and weekly workbooks
// (`lib/proyectos/export-xlsx.ts`): no header that names a tercero or a soporte (`assertSinEncabezadosProhibidos`)
// and every user text goes through `celdaTexto`. Amounts are numbers and dates are real dates.
// The Oportunidades sheet, the pipeline rows and the opportunities column exist only with commercial access
// (`oportunidades !== null`, S5: a hidden section is left out, not shown empty).

import ExcelJS from "exceljs"
import { ESTADO_OPORTUNIDAD_LABELS, ESTADO_TAREA_LABELS } from "@/lib/catalogs"
import { CONTACTO_DIAS_OPTIMO } from "@/lib/clientes/salud"
import { assertSinEncabezadosProhibidos, celdaTexto } from "@/lib/proyectos/export-xlsx"
import { fromCents, sumCents, toCents } from "@/lib/proyectos/money"
import type { ReporteEtiqueta } from "@/lib/reportes/etiqueta"
import { NOTA_DIAS_SIN_INTERACCION, NOTA_ETIQUETAS, NOTA_TAREAS_PERIODO } from "@/lib/reportes/etiqueta-notas"

type Celda = string | number | Date | null

const FORMATO_DINERO = "#,##0.00"
const FORMATO_PCT = "0.0"
const FORMATO_FECHA = "yyyy-mm-dd"

const NOTA_UMBRALES = "Los umbrales del semáforo son provisionales hasta que se confirmen."

const ETIQUETA_COLOR: Record<string, string> = { verde: "Verde", amarillo: "Amarillo", rojo: "Rojo" }
const ETIQUETA_ESTADO_PROYECTO: Record<string, string> = {
  PLANIFICACION: "Planificación",
  BORRADOR: "Borrador",
  EN_EJECUCION: "En ejecución",
  SUSPENDIDO: "Suspendido",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
}
const ETIQUETA_TIPO_INTERACCION: Record<string, string> = {
  REUNION: "Reunión",
  CORREO: "Correo",
  LLAMADA: "Llamada",
  VISITA: "Visita",
  OTRO: "Otro",
}

const color = (valor: string | null) => (valor ? (ETIQUETA_COLOR[valor] ?? valor) : "Sin medir")
const numero = (valor: number | null | undefined): Celda => (valor === null || valor === undefined ? "" : valor)
const dinero = (valor: string | null | undefined): Celda => (valor === null || valor === undefined ? "" : Number(valor))
/** `AAAA-MM-DD` as a real date cell (UTC midnight, so the calendar day never shifts). */
const fecha = (valor: string | null | undefined): Celda => (valor ? new Date(`${valor}T00:00:00Z`) : "")
const siNo = (valor: boolean) => (valor ? "Sí" : "No")
const sumaDinero = (valores: (string | null | undefined)[]) =>
  Number(fromCents(sumCents(valores.filter((v): v is string => typeof v === "string").map((v) => toCents(v)))))

function letraColumna(n: number): string {
  let letra = ""
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) letra = String.fromCharCode(65 + ((i - 1) % 26)) + letra
  return letra
}

/**
 * One table sheet: bold, frozen and filtered header row, then the rows and an optional totals row. The filter
 * covers the header and the data only, so sorting never moves the totals row.
 */
function hoja(
  wb: ExcelJS.Workbook,
  nombre: string,
  encabezados: readonly string[],
  filas: readonly Celda[][],
  opciones: { formatos?: Record<number, string>; total?: Celda[] } = {},
) {
  assertSinEncabezadosProhibidos(encabezados)
  const ws = wb.addWorksheet(nombre)
  ws.addRow([...encabezados]).font = { bold: true }
  ws.views = [{ state: "frozen", ySplit: 1 }]
  for (const fila of filas) ws.addRow(fila)
  ws.autoFilter = { from: "A1", to: `${letraColumna(encabezados.length)}${filas.length + 1}` }
  if (opciones.total) ws.addRow(opciones.total).font = { bold: true }
  for (const [col, formato] of Object.entries(opciones.formatos ?? {})) {
    ws.getColumn(Number(col)).eachCell((cell, fila) => {
      if (fila > 1) cell.numFmt = formato
    })
  }
  ws.columns.forEach((c, i) => {
    c.width = Math.max(12, Math.min(48, String(encabezados[i] ?? "").length + 4))
  })
  return ws
}

function periodoTexto({ desde, hasta }: ReporteEtiqueta["periodo"]): string {
  if (desde && hasta) return `${desde} a ${hasta}`
  if (desde) return `Desde ${desde}`
  if (hasta) return `Hasta ${hasta}`
  return "Todo el historial"
}

export async function xlsxReporteEtiqueta(r: ReporteEtiqueta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Muttu Hub"
  wb.created = new Date()
  const comercial = r.oportunidades !== null

  // Resumen: column 2 mixes text, counts, amounts and dates, so the formats go per cell.
  const s = r.resumen
  const resumen: [string, Celda, string?][] = [
    ["Etiqueta", celdaTexto(r.etiqueta)],
    ["Período", periodoTexto(r.periodo)],
    ["Corte", fecha(r.corte), FORMATO_FECHA],
    ["Clientes", s.clientes],
    ["Proyectos", s.proyectos],
    ["Valor total de los proyectos", dinero(s.valor_total), FORMATO_DINERO],
    ["Presupuesto programado", dinero(s.financiero.programado), FORMATO_DINERO],
    ["Presupuesto ejecutado", dinero(s.financiero.ejecutado), FORMATO_DINERO],
    ...(s.pipeline
      ? ([
          ["Oportunidades abiertas", s.pipeline.oportunidades],
          ["Pipeline abierto", dinero(s.pipeline.valor), FORMATO_DINERO],
        ] as [string, Celda, string?][])
      : []),
    ["Tareas", s.tareas.total],
    ["Tareas completadas", s.tareas.completadas],
    ["Tareas vencidas", s.tareas.vencidas],
    ["Nota", NOTA_ETIQUETAS],
    ["Nota", NOTA_TAREAS_PERIODO],
    ["Nota", NOTA_DIAS_SIN_INTERACCION],
    ...(r.confirmado ? [] : ([["Nota", NOTA_UMBRALES]] as [string, Celda][])),
  ]
  const wsResumen = hoja(wb, "Resumen", ["Concepto", "Valor"], resumen.map(([concepto, valor]) => [concepto, valor]))
  resumen.forEach(([, , formato], i) => {
    if (formato) wsResumen.getRow(i + 2).getCell(2).numFmt = formato
  })
  wsResumen.getColumn(2).width = 48

  const proyectos = r.proyectos.map((p) => ({
    p,
    programado: p.kpis.financiero?.programado ?? null,
    ejecutado: p.kpis.financiero?.ejecutado ?? null,
  }))
  hoja(
    wb,
    "Proyectos",
    [
      "Código", "Proyecto", "Cliente", "Estado", "Avance real (%)", "Avance programado (%)", "Valor total", "Programado",
      "Ejecutado", "Semáforo técnico", "Semáforo financiero",
    ],
    proyectos.map(({ p, programado, ejecutado }) => [
      celdaTexto(p.codigo),
      celdaTexto(p.nombre),
      celdaTexto(p.cliente.nombre),
      ETIQUETA_ESTADO_PROYECTO[p.estado] ?? p.estado,
      numero(p.kpis.tecnico?.avance_real),
      numero(p.kpis.tecnico?.avance_programado),
      dinero(p.valor_total),
      dinero(programado),
      dinero(ejecutado),
      color(p.semaforo_tecnico),
      color(p.semaforo_financiero),
    ]),
    {
      formatos: { 5: FORMATO_PCT, 6: FORMATO_PCT, 7: FORMATO_DINERO, 8: FORMATO_DINERO, 9: FORMATO_DINERO },
      total: [
        "Total", "", "", "", "", "",
        sumaDinero(proyectos.map(({ p }) => p.valor_total)),
        sumaDinero(proyectos.map((x) => x.programado)),
        sumaDinero(proyectos.map((x) => x.ejecutado)),
        "", "",
      ],
    },
  )

  hoja(
    wb,
    "Clientes",
    [
      "Cliente", "Proyectos", ...(comercial ? ["Oportunidades abiertas"] : []), "Última interacción", "Días sin interacción",
      `Más de ${CONTACTO_DIAS_OPTIMO} días sin interacción`,
    ],
    r.clientes.map((c) => [
      celdaTexto(c.nombre),
      c.proyectos,
      ...(comercial ? [c.oportunidades_abiertas ?? 0] : []),
      fecha(c.ultima_interaccion),
      numero(c.dias_sin_interaccion),
      siNo(c.sin_interaccion_reciente),
    ]),
    {
      formatos: { [comercial ? 4 : 3]: FORMATO_FECHA },
      total: [
        "Total",
        r.clientes.reduce((n, c) => n + c.proyectos, 0),
        ...(comercial ? [r.clientes.reduce((n, c) => n + (c.oportunidades_abiertas ?? 0), 0)] : []),
        "", "", "",
      ],
    },
  )

  if (r.oportunidades !== null) {
    hoja(
      wb,
      "Oportunidades",
      ["Oportunidad", "Cliente", "Estado", "Valor estimado"],
      r.oportunidades.map((o) => [
        celdaTexto(o.nombre),
        celdaTexto(o.cliente.nombre),
        ESTADO_OPORTUNIDAD_LABELS[o.estado as keyof typeof ESTADO_OPORTUNIDAD_LABELS]?.label ?? o.estado,
        dinero(o.valor_estimado_cop),
      ]),
      { formatos: { 4: FORMATO_DINERO }, total: ["Total", "", "", sumaDinero(r.oportunidades.map((o) => o.valor_estimado_cop))] },
    )
  }

  hoja(
    wb,
    "Bitácora",
    ["Fecha", "Cliente", "Tipo", "Texto", "Próximo paso", "Autor"],
    r.bitacora.map((b) => [
      fecha(b.fecha),
      celdaTexto(b.cliente.nombre),
      ETIQUETA_TIPO_INTERACCION[b.tipo] ?? b.tipo,
      celdaTexto(b.texto),
      celdaTexto(b.proximo_paso),
      celdaTexto(b.autor.nombre),
    ]),
    { formatos: { 1: FORMATO_FECHA } },
  )

  hoja(
    wb,
    "Tareas",
    ["Tarea", "Estado", "Fecha de entrega", "Vencida", "Responsable", "Cliente"],
    r.tareas.map((t) => [
      celdaTexto(t.titulo),
      ESTADO_TAREA_LABELS[t.estado as keyof typeof ESTADO_TAREA_LABELS]?.label ?? t.estado,
      fecha(t.fecha_entrega),
      siNo(t.vencida),
      celdaTexto(t.responsable.nombre),
      celdaTexto(t.cliente?.nombre),
    ]),
    { formatos: { 3: FORMATO_FECHA } },
  )

  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** The tag as a file-name slug: no accents, lowercase, runs of anything else collapsed to `-` («etiqueta» if empty). */
export function slugEtiqueta(etiqueta: string): string {
  const slug = etiqueta
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "etiqueta"
}
