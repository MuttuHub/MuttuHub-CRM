// Excel workbook of the project report (T9b, S15, S17), built with exceljs from the same JSON as
// `GET /api/v1/reports/project`, so the file cannot contradict the screen. Same rules as the tag workbook
// (`lib/reportes/etiqueta-xlsx.ts`): no header that names a tercero or a soporte (`assertSinEncabezadosProhibidos`),
// every user text goes through `celdaTexto`, amounts are numbers and dates are real dates.
// The Oportunidades sheet exists only with commercial access (`oportunidades !== null`: hidden, not empty).

import ExcelJS from "exceljs"
import type { EstadoAliado, RolAliado } from "@prisma/client"
import { ESTADO_OPORTUNIDAD_LABELS, ESTADO_TAREA_LABELS } from "@/lib/catalogs"
import { assertSinEncabezadosProhibidos, celdaTexto } from "@/lib/proyectos/export-xlsx"
import { fromCents, sumCents, toCents } from "@/lib/proyectos/money"
import type { ReporteProyecto } from "@/lib/reportes/proyecto"
import { NOTA_COMPROMETIDO, NOTA_META, NOTA_OPORTUNIDADES, NOTA_SIN_CUBRIR } from "@/lib/reportes/proyecto-notas"

type Celda = string | number | Date | null

const FORMATO_DINERO = "#,##0.00"
const FORMATO_PCT = "0.0"
const FORMATO_FECHA = "yyyy-mm-dd"

/** The L26/L27 assumptions behind the figures, printed in Resumen. */

const ETIQUETA_ESTADO_PROYECTO: Record<string, string> = {
  PLANIFICACION: "Planificación",
  BORRADOR: "Borrador",
  EN_EJECUCION: "En ejecución",
  SUSPENDIDO: "Suspendido",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
}
const ETIQUETA_ROL_ALIADO: Record<RolAliado, string> = { FINANCIADOR: "Financiador", ALIADO: "Aliado", PROSPECTO: "Prospecto" }
const ETIQUETA_ESTADO_ALIADO: Record<EstadoAliado, string> = {
  COMPROMETIDO: "Comprometido",
  EN_GESTION: "En gestión",
  DESCARTADO: "Descartado",
}
const ETIQUETA_FASE: Record<string, string> = { PROSPECCION: "Prospección", EJECUCION: "Ejecución" }
const ETIQUETA_VINCULO: Record<string, string> = { PROYECTO: "Del proyecto", ALIADO: "De un aliado" }
const ETIQUETA_TIPO_INTERACCION: Record<string, string> = {
  REUNION: "Reunión",
  CORREO: "Correo",
  LLAMADA: "Llamada",
  VISITA: "Visita",
  OTRO: "Otro",
}

const numero = (valor: number | null | undefined): Celda => (valor === null || valor === undefined ? "" : valor)
const dinero = (valor: string | null | undefined): Celda => (valor === null || valor === undefined ? "" : Number(valor))
/** `AAAA-MM-DD` as a real date cell (UTC midnight, so the calendar day never shifts). */
const fecha = (valor: string | null | undefined): Celda => (valor ? new Date(`${valor}T00:00:00Z`) : "")
const siNo = (valor: boolean) => (valor ? "Sí" : "No")
/** Sums two-decimal amounts in cents, so the total never drifts from the rows. */
const sumaDinero = (valores: (string | number | null | undefined)[]) =>
  Number(
    fromCents(
      sumCents(
        valores
          .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
          .map((v) => toCents(typeof v === "number" ? v.toFixed(2) : v)),
      ),
    ),
  )

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

export async function xlsxReporteProyecto(r: ReporteProyecto): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Muttu Hub"
  wb.created = new Date()
  const s = r.resumen
  const t = r.tareas

  // Resumen: column 2 mixes text, counts, amounts and dates, so the formats go per cell.
  const resumen: [string, Celda, string?][] = [
    ["Código", celdaTexto(s.proyecto.codigo)],
    ["Proyecto", celdaTexto(s.proyecto.nombre)],
    ["Cliente", celdaTexto(s.cliente)],
    ["Responsable", celdaTexto(s.responsable?.nombre)],
    ["Estado", ETIQUETA_ESTADO_PROYECTO[s.proyecto.estado] ?? s.proyecto.estado],
    ["Corte", fecha(r.corte), FORMATO_FECHA],
    ["Valor total", dinero(s.valor_total), FORMATO_DINERO],
    ...(s.financiero
      ? ([
          ["Presupuesto programado", dinero(s.financiero.programado), FORMATO_DINERO],
          ["Presupuesto ejecutado", dinero(s.financiero.ejecutado), FORMATO_DINERO],
        ] as [string, Celda, string?][])
      : []),
    ...(s.financiacion
      ? ([
          ["Meta", dinero(s.financiacion.meta), FORMATO_DINERO],
          ["Comprometido", dinero(s.financiacion.comprometido), FORMATO_DINERO],
          ["En gestión", dinero(s.financiacion.en_gestion), FORMATO_DINERO],
          ["Sin cubrir", dinero(s.financiacion.sin_cubrir), FORMATO_DINERO],
        ] as [string, Celda, string?][])
      : []),
    ["Tareas", t.resumen.total],
    ["Tareas completadas", t.resumen.completadas],
    ["Tareas canceladas", t.resumen.canceladas],
    ["Avance de tareas (%)", numero(t.resumen.avance_pct), FORMATO_PCT],
    ["Tareas vencidas", t.vencidas.length],
    ...(s.financiacion
      ? ([
          ["Nota", NOTA_META],
          ["Nota", NOTA_COMPROMETIDO],
          ["Nota", NOTA_SIN_CUBRIR],
        ] as [string, Celda][])
      : []),
    ...(r.oportunidades !== null ? ([["Nota", NOTA_OPORTUNIDADES]] as [string, Celda][]) : []),
  ]
  const wsResumen = hoja(wb, "Resumen", ["Concepto", "Valor"], resumen.map(([concepto, valor]) => [concepto, valor]))
  resumen.forEach(([, , formato], i) => {
    if (formato) wsResumen.getRow(i + 2).getCell(2).numFmt = formato
  })
  wsResumen.getColumn(2).width = 48

  hoja(
    wb,
    "Aliados",
    ["Aliado", "Rol", "Estado", "Aporte", "Última interacción"],
    r.aliados.map((a) => [
      celdaTexto(a.cliente.nombre),
      ETIQUETA_ROL_ALIADO[a.rol] ?? a.rol,
      ETIQUETA_ESTADO_ALIADO[a.estado] ?? a.estado,
      numero(a.aporte_cop),
      fecha(a.ultima_interaccion),
    ]),
    {
      formatos: { 4: FORMATO_DINERO, 5: FORMATO_FECHA },
      total: ["Total", "", "", sumaDinero(r.aliados.map((a) => a.aporte_cop)), ""],
    },
  )

  if (r.oportunidades !== null) {
    hoja(
      wb,
      "Oportunidades",
      ["Oportunidad", "Cliente", "Vínculo", "Estado", "Fase", "Valor estimado"],
      r.oportunidades.map((o) => [
        celdaTexto(o.nombre),
        celdaTexto(o.cliente.nombre),
        ETIQUETA_VINCULO[o.vinculo] ?? o.vinculo,
        ESTADO_OPORTUNIDAD_LABELS[o.estado]?.label ?? o.estado,
        ETIQUETA_FASE[o.fase] ?? o.fase,
        dinero(o.valor_estimado_cop),
      ]),
      {
        formatos: { 6: FORMATO_DINERO },
        total: ["Total", "", "", "", "", sumaDinero(r.oportunidades.map((o) => o.valor_estimado_cop))],
      },
    )
  }

  hoja(
    wb,
    "Bitácora",
    ["Fecha", "Aliado", "Tipo", "Texto", "Próximo paso", "Autor"],
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

  // Overdue first (oldest first), then upcoming (nearest first, undated last), as the loader orders them.
  const tareas = [...t.vencidas.map((x) => ({ x, vencida: true })), ...t.proximas.map((x) => ({ x, vencida: false }))]
  hoja(
    wb,
    "Tareas",
    ["Tarea", "Estado", "Fecha de entrega", "Vencida", "Responsable"],
    tareas.map(({ x, vencida }) => [
      celdaTexto(x.titulo),
      ESTADO_TAREA_LABELS[x.estado]?.label ?? x.estado,
      fecha(x.fecha_entrega),
      siNo(vencida),
      celdaTexto(x.responsable.nombre),
    ]),
    { formatos: { 3: FORMATO_FECHA } },
  )

  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** The project code as a file-name slug: no accents, lowercase, runs of anything else collapsed to `-`. */
export function slugCodigoProyecto(codigo: string): string {
  const slug = codigo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "proyecto"
}
