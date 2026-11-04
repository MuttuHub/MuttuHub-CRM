/**
 * S7 U1 (RF-03) — build the official nine-sheet Excel template.
 *
 * Node-only (`exceljs` must never reach a `"use client"` module). The workbook
 * is written from a pure `PlantillaInput`, so the route that downloads it and
 * the fixture tests share one code path. Every formula cell is written with a
 * cached `result`: `exceljs` drops the result when no value is available, and
 * the parser (U2) reads `.result`, never the `Total`/`Control` text.
 */
import ExcelJS from "exceljs"
import { randomUUID } from "node:crypto"
import { toCents } from "../money"
import { projectPeriods, type IsoDate, type Periodo } from "../weeks"
import {
  CATALOGOS,
  ENCABEZADO_PROYECTO,
  ENCABEZADOS,
  ENCABEZADOS_PROGRAMACION,
  ETIQUETAS_PROYECTO,
  HOJAS,
  MAX_FILAS_HOJA,
  NOMBRES_RANGO,
  PLANTILLA_VERSION,
  UNIDADES_SUGERIDAS,
} from "./columns"

export type ObjetivoInput = { codigo: string; descripcion: string }

export type ActividadInput = {
  codigo: string
  objetivoCodigo: string
  nombre: string
  semanaInicio: number
  semanaFin: number
  responsable: string | null
}

export type EntregableInput = {
  codigo: string
  actividadCodigo: string
  descripcion: string
  cantidad: string
  unidad: string
}

export type IndicadorInput = {
  codigo: string
  objetivoCodigo: string
  nombre: string
  meta: string
  lineaBase: string | null
}

export type PlantillaInput = {
  proyecto: {
    codigo: string
    cliente: string
    fechaInicio: IsoDate
    fechaFin: IsoDate
    valorTotal: string | null
    beneficiariosMeta: number | null
    lineas: { codigo: string; nombre: string; principal: boolean }[]
    municipios: { nombre: string; departamento: string }[]
  }
  catalogo: {
    rubros: { codigo: string; nombre: string }[]
    lineas: { codigo: string; nombre: string }[]
    municipios: { nombre: string; departamento: string; codigoDane: string | null }[]
  }
  estructura: {
    objetivos: ObjetivoInput[]
    actividades: ActividadInput[]
    entregables: EntregableInput[]
    indicadores: IndicadorInput[]
  }
  /** Rubro code -> assigned amount as a decimal string. Missing codes mean 0. */
  presupuesto: Record<string, string>
  /** Rubro code -> period -> programmed amount as a decimal string. */
  programacion: Record<string, Record<Periodo, string>>
}

/** The subset of `exceljs` the typed surface omits (present at runtime). */
type WorksheetConValidaciones = ExcelJS.Worksheet & {
  dataValidations: { add(range: string, dv: Partial<ExcelJS.DataValidation>): void }
}

/** 1 -> "A", 27 -> "AA". */
function columnLetter(index: number): string {
  let n = index
  let letters = ""
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/* ── Presentación: colores de marca + ayudas para quien llena la plantilla ── */

/** Paleta de la marca Muttu Hub (misma del producto: rosa #CD1560 sobre tinta). */
const MARCA = {
  rosa: "FFCD1560",
  rosaOscuro: "FF940D44",
  rosaSuave: "FFFDF2F7",
  tinta: "FF191113",
  gris: "FF725D62",
  linea: "FFECE5E7",
  blanco: "FFFFFFFF",
  alterno: "FFF7F3F4",
} as const

type CeldaConNota = ExcelJS.Cell & { note?: string }

/** Nota (comentario) que Excel muestra al pasar el mouse por la celda. */
function nota(celda: ExcelJS.Cell, texto: string): void {
  ;(celda as CeldaConNota).note = texto
}

/** Franja de encabezado de la fila 1 de una hoja de datos. */
function pintarCabecera(fila: ExcelJS.Row): void {
  fila.height = 26
  fila.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARCA.rosa } }
    celda.font = { bold: true, color: { argb: MARCA.blanco }, size: 11 }
    celda.alignment = { vertical: "middle", horizontal: "left", wrapText: true }
    celda.border = { bottom: { style: "thin", color: { argb: MARCA.rosaOscuro } } }
  })
}

/** Filas de datos: texto legible, líneas finas y cebra suave. */
function pintarCuerpo(hoja: ExcelJS.Worksheet, primeraFilaDatos = 2): void {
  hoja.eachRow((fila, numero) => {
    if (numero < primeraFilaDatos) return
    fila.eachCell((celda) => {
      celda.font = { color: { argb: MARCA.tinta }, size: 10.5 }
      celda.alignment = { vertical: "top", wrapText: true }
      celda.border = { bottom: { style: "hair", color: { argb: MARCA.linea } } }
      if ((numero - primeraFilaDatos) % 2 === 1) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARCA.alterno } }
      }
    })
  })
}

function anchos(hoja: ExcelJS.Worksheet, medidas: number[]): void {
  medidas.forEach((ancho, indice) => {
    hoja.getColumn(indice + 1).width = ancho
  })
}

function congelarCabecera(hoja: ExcelJS.Worksheet): void {
  hoja.views = [{ state: "frozen", ySplit: 1 }]
}

/** Ejemplos por columna: se adjuntan como comentario en la celda del encabezado. */
function ayudasDeCabecera(hoja: ExcelJS.Worksheet, ayudas: Record<string, string>): void {
  for (const [columna, texto] of Object.entries(ayudas)) {
    nota(hoja.getCell(`${columna}1`), texto)
  }
}

/** An ISO calendar date as a UTC-midnight `Date`, so Excel stores a real date. */
function isoToDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function sheetRef(name: string): string {
  return `'${name}'`
}

function centsToNumber(cents: bigint): number {
  return Number(cents) / 100
}

function escribirInstrucciones(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.instrucciones)
  hoja.mergeCells("A1:D1")
  const titulo = hoja.getCell("A1")
  titulo.value = `Plantilla de importación de proyectos — ${input.proyecto.codigo}`
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARCA.rosa } }
  titulo.font = { bold: true, size: 15, color: { argb: MARCA.blanco } }
  titulo.alignment = { vertical: "middle" }
  nota(
    titulo,
    "Lee esta hoja antes de llenar el libro: reglas generales, versión y ejemplos de cada hoja.",
  )
  hoja.getRow(1).height = 34

  hoja.getCell("A2").value = "Versión de la plantilla (no cambiar):"
  hoja.getCell("A2").font = { color: { argb: MARCA.gris }, size: 10.5 }
  const version = hoja.getCell("B2")
  version.value = PLANTILLA_VERSION
  version.font = { bold: true, color: { argb: MARCA.rosaOscuro } }

  const texto = [
    "Cómo diligenciar esta plantilla",
    "1. No cambies los nombres de las hojas ni los encabezados de la fila 1.",
    "2. Los códigos deben ser únicos dentro de cada hoja (3 a 6).",
    "3. Usa punto y coma (;) para separar varias líneas estratégicas o municipios.",
    "4. Las semanas van de 1 al total de semanas del proyecto.",
    "5. Los montos aceptan formato colombiano (59.500.000 o 1.440.000,50).",
    "6. Revisa la hoja 9. Catálogos para los valores permitidos.",
  ]
  texto.forEach((linea, i) => {
    const celda = hoja.getCell(`A${i + 4}`)
    celda.value = linea
    celda.font = i === 0
      ? { bold: true, size: 13, color: { argb: MARCA.rosaOscuro } }
      : { color: { argb: MARCA.tinta }, size: 10.5 }
  })

  hoja.mergeCells("A12:D12")
  const subtitulo = hoja.getCell("A12")
  subtitulo.value = "Ejemplos de uso (así se llena cada hoja)"
  subtitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARCA.rosaOscuro } }
  subtitulo.font = { bold: true, size: 12, color: { argb: MARCA.blanco } }
  hoja.getRow(12).height = 24

  const encabezadosEjemplo = ["Hoja", "Campo", "Ejemplo", "Para qué sirve"]
  const filaEncabezado = hoja.getRow(13)
  encabezadosEjemplo.forEach((encabezado, i) => {
    const celda = filaEncabezado.getCell(i + 1)
    celda.value = encabezado
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARCA.rosa } }
    celda.font = { bold: true, color: { argb: MARCA.blanco }, size: 10.5 }
    celda.alignment = { vertical: "middle", wrapText: true }
  })

  const ejemplos: [string, string, string, string][] = [
    ["3. Objetivos", "Código", "O1", "Identificador único del objetivo; Actividades lo referencia."],
    ["3. Objetivos", "Descripción", "Fortalecer las capacidades productivas de las unidades textiles", "Qué logra el objetivo, en una frase."],
    ["4. Actividades", "Semana inicio / Semana fin", "1 / 4", "Semanas del proyecto (1 a la duración); inicio ≤ fin."],
    ["4. Actividades", "Responsable (correo)", "ana@muttu.co", "Usuario registrado; si no existe, se avisa y queda sin responsable."],
    ["5. Entregables", "Cantidad / Unidad", "4 / Acta", "Cuántos y en qué unidad se entrega (la unidad es libre)."],
    ["6. Indicadores", "Meta", "30", "Valor esperado del indicador (mayor que cero)."],
    ["7. Presupuesto", "Valor asignado", "59.500.000", "Monto del rubro; la suma de los rubros forma el presupuesto."],
    ["8. Programación", "Mes 1 (2026-10)", "14.880.000", "Monto del rubro ese mes; la fila debe sumar lo asignado."],
  ]
  ejemplos.forEach((fila, i) => {
    const numero = 14 + i
    fila.forEach((valor, columna) => {
      const celda = hoja.getCell(numero, columna + 1)
      celda.value = valor
      celda.font = { color: { argb: MARCA.tinta }, size: 10.5 }
      celda.alignment = { vertical: "top", wrapText: true }
      celda.border = { bottom: { style: "hair", color: { argb: MARCA.linea } } }
      if (i % 2 === 1) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARCA.alterno } }
      }
    })
  })

  const separadores = hoja.getCell("A23")
  separadores.value =
    "Varias líneas o municipios se separan con punto y coma. Ejemplo: «LE-01 - Educación; LE-02 - Salud»."
  separadores.font = { italic: true, color: { argb: MARCA.gris }, size: 10.5 }

  anchos(hoja, [34, 28, 34, 56])
  return hoja
}

function escribirProyecto(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.proyecto)
  hoja.addRow([...ENCABEZADO_PROYECTO])

  const lineas = input.proyecto.lineas.map((l) => `${l.codigo} - ${l.nombre}`).join("; ")
  const municipios = input.proyecto.municipios.map((m) => `${m.nombre} (${m.departamento})`).join("; ")
  const valores: ExcelJS.CellValue[] = [
    input.proyecto.codigo,
    input.proyecto.cliente,
    lineas,
    municipios,
    isoToDate(input.proyecto.fechaInicio),
    isoToDate(input.proyecto.fechaFin),
    input.proyecto.valorTotal === null ? null : Number(input.proyecto.valorTotal),
    input.proyecto.beneficiariosMeta,
  ]
  ETIQUETAS_PROYECTO.forEach((etiqueta, i) => {
    hoja.addRow([etiqueta, valores[i]])
  })

  pintarCabecera(hoja.getRow(1))
  pintarCuerpo(hoja)
  congelarCabecera(hoja)
  anchos(hoja, [30, 70])

  const filaDe = (etiqueta: string) => ETIQUETAS_PROYECTO.indexOf(etiqueta as never) + 2
  nota(
    hoja.getCell("A1"),
    "Etiqueta fija del formato: no la cambies. Cada fila explica un dato del proyecto.",
  )
  nota(
    hoja.getCell("B1"),
    "Valor del proyecto. Pasa el mouse por cada fila para ver qué escribir y un ejemplo.",
  )
  const ayudaProyecto: Record<string, string> = {
    Código: "No cambiar: debe coincidir con el código del proyecto (PRY-AAAA-NNN).",
    Cliente: "Informativo: el cliente del proyecto no cambia al importar.",
    "Líneas estratégicas": "Código - nombre, separados por «; ». Ejemplo: LE-01 - Educación; LE-02 - Salud.",
    Municipios: "Nombre (Departamento), separados por «; ». Ejemplo: Manizales (Caldas).",
    "Fecha de inicio": "Fecha real de Excel; define la semana 1. Ejemplo: 05/10/2026.",
    "Fecha de fin": "Fecha real de Excel; define la duración en semanas. Ejemplo: 29/01/2027.",
    "Valor total": "Valor en pesos. Ejemplo: 177.360.000. Revisa que el presupuesto sume igual.",
    "Meta de beneficiarios": "Número entero de beneficiarios. Ejemplo: 500.",
  }
  for (const [etiqueta, texto] of Object.entries(ayudaProyecto)) {
    nota(hoja.getCell(`A${filaDe(etiqueta)}`), `${etiqueta}: ${texto}`)
    nota(hoja.getCell(`B${filaDe(etiqueta)}`), texto)
  }
  hoja.getCell(`B${filaDe("Fecha de inicio")}`).numFmt = "dd/mm/yyyy"
  hoja.getCell(`B${filaDe("Fecha de fin")}`).numFmt = "dd/mm/yyyy"
  hoja.getCell(`B${filaDe("Valor total")}`).numFmt = "#,##0"
  return hoja
}

function escribirObjetivos(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.objetivos)
  hoja.addRow([...ENCABEZADOS.objetivos])
  for (const objetivo of input.estructura.objetivos) {
    hoja.addRow([objetivo.codigo, objetivo.descripcion])
  }
  pintarCabecera(hoja.getRow(1))
  pintarCuerpo(hoja)
  congelarCabecera(hoja)
  anchos(hoja, [14, 80])
  ayudasDeCabecera(hoja, {
    A: "Código único del objetivo (3 a 50 caracteres). Ejemplo: O1.",
    B: "Qué logra el objetivo, en una frase. Ejemplo: Fortalecer las capacidades productivas de las unidades textiles.",
  })
  return hoja
}

function escribirActividades(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.actividades)
  hoja.addRow([...ENCABEZADOS.actividades])
  for (const actividad of input.estructura.actividades) {
    hoja.addRow([
      actividad.codigo,
      actividad.objetivoCodigo,
      actividad.nombre,
      actividad.semanaInicio,
      actividad.semanaFin,
      actividad.responsable,
    ])
  }
  pintarCabecera(hoja.getRow(1))
  pintarCuerpo(hoja)
  congelarCabecera(hoja)
  anchos(hoja, [14, 16, 46, 14, 14, 32])
  ayudasDeCabecera(hoja, {
    A: "Código único de la actividad. Ejemplo: 1.1.",
    B: "Debe existir en la hoja 3. Objetivos (desplegable). Ejemplo: O1.",
    C: "Nombre de la actividad. Ejemplo: Caracterización de las unidades productivas.",
    D: "Semana del proyecto en la que inicia (1 a la duración). Ejemplo: 1.",
    E: "Semana en la que termina; debe ser mayor o igual a la inicial. Ejemplo: 4.",
    F: "Correo de un usuario registrado. Ejemplo: ana@muttu.co. Si no existe, la actividad queda sin responsable (aviso).",
  })
  return hoja
}

function escribirEntregables(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.entregables)
  hoja.addRow([...ENCABEZADOS.entregables])
  for (const entregable of input.estructura.entregables) {
    hoja.addRow([
      entregable.codigo,
      entregable.actividadCodigo,
      entregable.descripcion,
      Number(entregable.cantidad),
      entregable.unidad,
    ])
  }
  pintarCabecera(hoja.getRow(1))
  pintarCuerpo(hoja)
  congelarCabecera(hoja)
  anchos(hoja, [14, 18, 60, 14, 18])
  ayudasDeCabecera(hoja, {
    A: "Código único del entregable. Ejemplo: 1.1-E1.",
    B: "Debe existir en la hoja 4. Actividades (desplegable). Ejemplo: 1.1.",
    C: "Qué se entrega. Ejemplo: Informe de caracterización.",
    D: "Cantidad esperada, mayor que cero. Ejemplo: 4.",
    E: "Unidad de medida (texto libre, la lista solo sugiere). Ejemplo: Acta.",
  })
  return hoja
}

function escribirIndicadores(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.indicadores)
  hoja.addRow([...ENCABEZADOS.indicadores])
  for (const indicador of input.estructura.indicadores) {
    hoja.addRow([
      indicador.codigo,
      indicador.objetivoCodigo,
      indicador.nombre,
      Number(indicador.meta),
      indicador.lineaBase === null ? null : Number(indicador.lineaBase),
    ])
  }
  pintarCabecera(hoja.getRow(1))
  pintarCuerpo(hoja)
  congelarCabecera(hoja)
  anchos(hoja, [14, 18, 46, 14, 16])
  ayudasDeCabecera(hoja, {
    A: "Código único del indicador. Ejemplo: IND-1.",
    B: "Debe existir en la hoja 3. Objetivos (desplegable). Ejemplo: O1.",
    C: "Nombre del indicador. Ejemplo: Productores con plan de mejora.",
    D: "Valor esperado, mayor que cero. Ejemplo: 30.",
    E: "Valor inicial del indicador (opcional). Ejemplo: 0.",
  })
  return hoja
}

function escribirPresupuesto(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.presupuesto)
  hoja.addRow([...ENCABEZADOS.presupuesto])
  for (const rubro of input.catalogo.rubros) {
    hoja.addRow([rubro.codigo, rubro.nombre, Number(input.presupuesto[rubro.codigo] ?? "0")])
  }
  pintarCabecera(hoja.getRow(1))
  pintarCuerpo(hoja)
  congelarCabecera(hoja)
  anchos(hoja, [16, 48, 20])
  ayudasDeCabecera(hoja, {
    A: "Rubro del catálogo (desplegable). Ejemplo: R01.",
    B: "Nombre del rubro (solo lectura informativa).",
    C: "Monto asignado en pesos; puede ser 0. Ejemplo: 59.500.000.",
  })
  hoja.getColumn(3).numFmt = "#,##0"
  return hoja
}

function escribirProgramacion(workbook: ExcelJS.Workbook, input: PlantillaInput): ExcelJS.Worksheet {
  const hoja = workbook.addWorksheet(HOJAS.programacion)
  const periodos = projectPeriods(input.proyecto.fechaInicio, input.proyecto.fechaFin)
  hoja.addRow([
    ENCABEZADOS_PROGRAMACION.codigoRubro,
    ENCABEZADOS_PROGRAMACION.rubro,
    ...periodos.map((periodo, i) => `Mes ${i + 1} (${periodo})`),
    ENCABEZADOS_PROGRAMACION.total,
    ENCABEZADOS_PROGRAMACION.control,
  ])

  const primeraColumnaMes = columnLetter(3)
  const ultimaColumnaMes = columnLetter(2 + periodos.length)
  const columnaTotal = columnLetter(3 + periodos.length)
  const columnaControl = columnLetter(4 + periodos.length)

  for (const rubro of input.catalogo.rubros) {
    const asignado = toCents(input.presupuesto[rubro.codigo] ?? "0")
    const meses = periodos.map((periodo) => {
      const valor = input.programacion[rubro.codigo]?.[periodo]
      return valor === undefined ? null : Number(valor)
    })
    const totalCents = meses.reduce<bigint>(
      (suma, valor) => (valor === null ? suma : suma + toCents(String(valor))),
      toCents("0"),
    )

    const fila = hoja.addRow([rubro.codigo, rubro.nombre, ...meses])

    const celdaTotal = hoja.getCell(`${columnaTotal}${fila.number}`)
    celdaTotal.value = {
      formula: `SUM(${primeraColumnaMes}${fila.number}:${ultimaColumnaMes}${fila.number})`,
      result: centsToNumber(totalCents),
    }

    const celdaControl = hoja.getCell(`${columnaControl}${fila.number}`)
    celdaControl.value = {
      formula: `${columnaTotal}${fila.number}-VLOOKUP(A${fila.number},${sheetRef(HOJAS.presupuesto)}!A:C,3,FALSE)`,
      result: centsToNumber(totalCents - asignado),
    }
  }

  pintarCabecera(hoja.getRow(1))
  pintarCuerpo(hoja)
  congelarCabecera(hoja)
  anchos(hoja, [16, 42, ...periodos.map(() => 15), 18, 18])
  ayudasDeCabecera(hoja, {
    A: "Rubro del catálogo (desplegable). Ejemplo: R01.",
    B: "Nombre del rubro (solo lectura informativa).",
  })
  periodos.forEach((periodo, i) => {
    nota(
      hoja.getCell(1, 3 + i),
      `Monto del rubro en ${periodo}. La suma de todos los meses de la fila debe ser igual al Valor asignado. Ejemplo: 14.880.000.`,
    )
  })
  nota(
    hoja.getCell(1, 3 + periodos.length),
    "Fórmula: suma de los meses de la fila. No la modifiques.",
  )
  nota(
    hoja.getCell(1, 4 + periodos.length),
    "Fórmula: Total - Valor asignado del rubro. Si no es 0, revisa la programación. No la modifiques.",
  )
  for (let columna = 3; columna <= 4 + periodos.length; columna += 1) {
    hoja.getColumn(columna).numFmt = "#,##0"
  }
  return hoja
}

async function escribirCatalogos(workbook: ExcelJS.Workbook, input: PlantillaInput): Promise<ExcelJS.Worksheet> {
  const hoja = workbook.addWorksheet(HOJAS.catalogos)
  hoja.addRow([CATALOGOS.rubros, CATALOGOS.lineas, CATALOGOS.municipios, CATALOGOS.unidades])

  input.catalogo.rubros.forEach((rubro, i) => {
    hoja.getCell(i + 2, 1).value = rubro.codigo
  })
  input.catalogo.lineas.forEach((linea, i) => {
    hoja.getCell(i + 2, 2).value = `${linea.codigo} - ${linea.nombre}`
  })
  input.catalogo.municipios.forEach((municipio, i) => {
    hoja.getCell(i + 2, 3).value = `${municipio.nombre} (${municipio.departamento})`
  })
  UNIDADES_SUGERIDAS.forEach((unidad, i) => {
    hoja.getCell(i + 2, 4).value = unidad
  })

  pintarCabecera(hoja.getRow(1))
  anchos(hoja, [14, 40, 44, 20])
  ayudasDeCabecera(hoja, {
    A: "Códigos y nombres de rubros disponibles (alimenta el desplegable de la hoja 7 y 8).",
    B: "Líneas estratégicas activas como «código - nombre»; se eligen en la hoja 2 separadas por «; ».",
    C: "Municipios activos como «Nombre (Departamento)»; se eligen en la hoja 2 separadas por «; ».",
    D: "Unidades sugeridas para los entregables; la unidad es texto libre.",
  })

  // Anchor every range on the first data row (row 2). An empty catalog used to
  // produce a reversed range (`$C$2:$C$1`) that ExcelJS rewrites as
  // `$C$1:$C$2`, wrongly including the header; clamping the last row to row 2
  // yields a valid single-cell range instead.
  const ref = (columna: string, count: number) => {
    const filaFin = Math.max(2, 1 + count)
    return `${sheetRef(HOJAS.catalogos)}!$${columna}$2:$${columna}$${filaFin}`
  }
  workbook.definedNames.add(ref("A", input.catalogo.rubros.length), NOMBRES_RANGO.rubros)
  workbook.definedNames.add(ref("B", input.catalogo.lineas.length), NOMBRES_RANGO.lineas)
  workbook.definedNames.add(ref("C", input.catalogo.municipios.length), NOMBRES_RANGO.municipios)
  workbook.definedNames.add(ref("D", UNIDADES_SUGERIDAS.length), NOMBRES_RANGO.unidades)

  // Random per-download password, never stored: protects the catalog sheet
  // against accidental edits without leaking a shared secret anywhere.
  await hoja.protect(randomUUID(), { selectLockedCells: false, selectUnlockedCells: true })
  return hoja
}

function addValidation(sheet: ExcelJS.Worksheet, range: string, dv: Partial<ExcelJS.DataValidation>): void {
  ;(sheet as WorksheetConValidaciones).dataValidations.add(range, dv)
}

function aplicarValidaciones(hojas: {
  objetivos: ExcelJS.Worksheet
  actividades: ExcelJS.Worksheet
  entregables: ExcelJS.Worksheet
  indicadores: ExcelJS.Worksheet
  presupuesto: ExcelJS.Worksheet
  programacion: ExcelJS.Worksheet
}): void {
  const ultima = MAX_FILAS_HOJA + 1
  const referenciaObjetivos = `${sheetRef(HOJAS.objetivos)}!$A$2:$A$200`
  const referenciaActividades = `${sheetRef(HOJAS.actividades)}!$A$2:$A$200`

  addValidation(hojas.presupuesto, `A2:A${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${NOMBRES_RANGO.rubros}`],
  })
  addValidation(hojas.presupuesto, `C2:C${ultima}`, {
    type: "decimal",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
  })
  addValidation(hojas.programacion, `A2:A${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${NOMBRES_RANGO.rubros}`],
  })
  addValidation(hojas.actividades, `B2:B${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${referenciaObjetivos}`],
  })
  addValidation(hojas.actividades, `D2:E${ultima}`, {
    type: "whole",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [1],
  })
  addValidation(hojas.actividades, `G2:G${ultima}`, {
    type: "decimal",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: [0],
  })
  addValidation(hojas.entregables, `B2:B${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${referenciaActividades}`],
  })
  addValidation(hojas.entregables, `D2:D${ultima}`, {
    type: "decimal",
    operator: "greaterThan",
    allowBlank: true,
    formulae: [0],
  })
  // Units are free text in the DB: the dropdown warns, it does not block.
  addValidation(hojas.entregables, `E2:E${ultima}`, {
    type: "list",
    allowBlank: true,
    showErrorMessage: false,
    formulae: [`=${NOMBRES_RANGO.unidades}`],
  })
  addValidation(hojas.indicadores, `B2:B${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${referenciaObjetivos}`],
  })
  addValidation(hojas.indicadores, `D2:D${ultima}`, {
    type: "decimal",
    operator: "greaterThan",
    allowBlank: true,
    formulae: [0],
  })
}

/**
 * Builds the whole workbook and returns it as an xlsx `Buffer`. Pure: no DB,
 * no filesystem, no clock-dependent data beyond the workbook timestamps.
 */
export async function generarPlantilla(input: PlantillaInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Muttu Hub"
  workbook.title = `Plantilla de proyecto ${input.proyecto.codigo}`
  workbook.created = new Date()
  workbook.modified = new Date()

  escribirInstrucciones(workbook, input)
  escribirProyecto(workbook, input)
  const objetivos = escribirObjetivos(workbook, input)
  const actividades = escribirActividades(workbook, input)
  const entregables = escribirEntregables(workbook, input)
  const indicadores = escribirIndicadores(workbook, input)
  const presupuesto = escribirPresupuesto(workbook, input)
  const programacion = escribirProgramacion(workbook, input)
  await escribirCatalogos(workbook, input)

  aplicarValidaciones({ objetivos, actividades, entregables, indicadores, presupuesto, programacion })

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
