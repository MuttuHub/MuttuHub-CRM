// Excel workbook of the project report (T9b, S15, S17), built with exceljs from the same JSON as
// `GET /api/v1/reports/project`, so the file cannot contradict the screen. Same rules as the tag workbook
// (`lib/reportes/etiqueta-xlsx.ts`): no header that names a tercero or a soporte (`assertSinEncabezadosProhibidos`),
// every user text goes through `celdaTexto`, amounts are numbers and dates are real dates.
// The Oportunidades sheet exists only with commercial access (`oportunidades !== null`: hidden, not empty).

import ExcelJS from "exceljs"
import { ESTADO_OPORTUNIDAD_LABELS, ESTADO_TAREA_LABELS } from "@/lib/catalogs"
import { celdaTexto } from "@/lib/proyectos/export-xlsx"
import type { ReporteProyecto } from "@/lib/reportes/proyecto"
import {
  ETIQUETA_ESTADO_PROYECTO,
  ETIQUETA_TIPO_INTERACCION,
  FORMATO_DINERO,
  FORMATO_FECHA,
  FORMATO_PCT,
  type Celda,
  dinero,
  fecha,
  hoja,
  numero,
  siNo,
  sumaDinero,
} from "@/lib/reportes/xlsx-comun"
import { ESTADO_ALIADO_LABEL, ROL_ALIADO_LABEL } from "@/lib/proyectos/aliados-labels"
import { NOTA_COMPROMETIDO, NOTA_META, NOTA_OPORTUNIDADES, NOTA_SIN_CUBRIR } from "@/lib/reportes/proyecto-notas"


/** The L26/L27 assumptions behind the figures, printed in Resumen. */

const ETIQUETA_FASE: Record<string, string> = { PROSPECCION: "Prospección", EJECUCION: "Ejecución" }
const ETIQUETA_VINCULO: Record<string, string> = { PROYECTO: "Del proyecto", ALIADO: "De un aliado" }



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
      ROL_ALIADO_LABEL[a.rol] ?? a.rol,
      ESTADO_ALIADO_LABEL[a.estado] ?? a.estado,
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
