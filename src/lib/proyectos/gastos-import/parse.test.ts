// @vitest-environment node
// B8 — the expenses workbook (one row per distribution line): headers, row rules shared with the single
// expense form (amount, rubro with assigned value, project month, text limits) and, since T14.3, the
// activity of each line and the rows of one document read as ONE distributed invoice.
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import {
  IVA_NEGATIVO_MESSAGE,
  PERIODO_FUERA_MESSAGE,
  REPARTO_SUMA_MESSAGE,
  RUBRO_SIN_ASIGNADO_MESSAGE,
  SUBTOTAL_POSITIVO_MESSAGE,
} from "@/lib/api/gastos"
import { toCents } from "../money"
import type { RubroCatalogo } from "../excel-celdas"
import {
  ARCHIVO_ILEGIBLE,
  ENCABEZADOS_GASTOS,
  FACTURA_NO_COINCIDE_MESSAGE,
  MAX_FILAS_GASTOS,
  PLANTILLA_ANTERIOR_MESSAGE,
  SIN_FILAS_GASTOS,
  SIN_TOTAL_DISTRIBUCION_MESSAGE,
  facturaIncompleta,
  parseGastosImport,
  type ContextoImportGastos,
} from "./parse"

const rubros: RubroCatalogo[] = [
  { id: "rub-1", codigo: "R12", nombre: "Transporte" },
  { id: "rub-2", codigo: "R05", nombre: "Promoción y divulgación" },
  { id: "rub-3", codigo: "R99", nombre: "Sin asignar" },
]

const contexto: ContextoImportGastos = {
  proyecto: { fecha_inicio: new Date("2026-10-05"), fecha_fin: new Date("2027-01-29") },
  rubros,
  lineas: [
    { id: "lin-rub-1", rubro_id: "rub-1", actividad_codigo: "1.2", actividad_nombre: "Talleres", asignado: true },
    { id: "lin-rub-2", rubro_id: "rub-2", actividad_codigo: "1.2", actividad_nombre: "Talleres", asignado: true },
    { id: "lin-rub-3", rubro_id: "rub-3", actividad_codigo: "1.2", actividad_nombre: "Talleres", asignado: false },
  ],
}

/** The same rubro budgeted in two activities: the pair activity + rubro is what pins the line (S9). */
const contextoDistribuido: ContextoImportGastos = {
  ...contexto,
  lineas: [
    { id: "lin-12", rubro_id: "rub-1", actividad_codigo: "1.2", actividad_nombre: "Talleres", asignado: true },
    { id: "lin-13", rubro_id: "rub-1", actividad_codigo: "1.3", actividad_nombre: "Ferias", asignado: true },
    { id: "lin-13-sum", rubro_id: "rub-2", actividad_codigo: "1.3", actividad_nombre: "Ferias", asignado: true },
    { id: "lin-13-sin", rubro_id: "rub-3", actividad_codigo: "1.3", actividad_nombre: "Ferias", asignado: false },
  ],
}

type Celda = string | number | Date | null

const ENCABEZADO = [
  "Rubro",
  "Fecha del documento",
  "Tipo de soporte",
  "Tercero",
  "Tipo de identificación",
  "Número de identificación",
  "Número de documento",
  "Descripción",
  "Subtotal",
  "IVA",
  "Total",
  "Periodo",
  "Enlace del soporte",
  "Código de actividad",
]

const fila = (data: Partial<Record<(typeof ENCABEZADO)[number], Celda>> = {}): Celda[] => {
  const base: Record<string, Celda> = {
    Rubro: "Transporte",
    "Fecha del documento": "2026-10-15",
    "Tipo de soporte": "Factura de proveedor",
    Tercero: "Proveedor SAS",
    "Tipo de identificación": "NIT",
    "Número de identificación": "900.123.456-7",
    "Número de documento": "FE-0123",
    Descripción: "Tiquetes del equipo",
    Subtotal: 1500000.5,
    IVA: 0,
    Total: null,
    Periodo: null,
    "Enlace del soporte": "https://drive.google.com/soporte",
    ...data,
  }
  return ENCABEZADO.map((h) => base[h] ?? null)
}

async function libro(filas: Celda[][], encabezado: string[] = ENCABEZADO, hoja = "Gastos"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(hoja)
  ;[encabezado, ...filas].forEach((f, r) =>
    f.forEach((valor, c) => {
      if (valor !== null) sheet.getCell(r + 1, c + 1).value = valor
    }),
  )
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe("parseGastosImport — file", () => {
  it("reads a valid row into the data of a single expense", async () => {
    const r = await parseGastosImport(await libro([fila()]), contexto)
    expect(r.erroresArchivo).toEqual([])
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0]).toMatchObject({ fila: 2, rubroId: "rub-1", error: null })
    expect(r.filas[0].datos).toEqual({
      rubro_id: "rub-1",
      linea_id: "lin-rub-1",
      total_documento: null,
      fecha_documento: "2026-10-15",
      periodo: "2026-10",
      tipo_soporte: "FACTURA_PROVEEDOR",
      tercero_nombre: "Proveedor SAS",
      tercero_tipo_id: "NIT",
      tercero_numero_id: "900.123.456-7",
      numero_documento: "FE-0123",
      descripcion: "Tiquetes del equipo",
      subtotal: toCents("1500000.50"),
      iva: BigInt(0),
      cents: toCents("1500000.50"),
      enlaces: ["https://drive.google.com/soporte"],
    })
    expect(r.resumen).toEqual({ validas: 1, errores: 0 })
  })

  it("rejects an unreadable file as a whole", async () => {
    const r = await parseGastosImport(Buffer.from("no es un xlsx"), contexto)
    expect(r.erroresArchivo).toEqual([ARCHIVO_ILEGIBLE])
    expect(r.filas).toEqual([])
  })

  it("rejects a file without the required headers and names the missing ones", async () => {
    const r = await parseGastosImport(await libro([["x", 1]], ["Rubro", "Subtotal"]), contexto)
    expect(r.filas).toEqual([])
    expect(r.erroresArchivo).toHaveLength(1)
    expect(r.erroresArchivo[0]).toContain("Fecha del documento")
    expect(r.erroresArchivo[0]).toContain("Tercero")
    expect(r.erroresArchivo[0]).not.toContain("«Rubro»")
  })

  it("rejects a file with headers but no data rows", async () => {
    const r = await parseGastosImport(await libro([[null, null]]), contexto)
    expect(r.erroresArchivo).toEqual([SIN_FILAS_GASTOS])
  })

  it("rejects a file over the row cap and accepts exactly the cap", async () => {
    const dentro = await parseGastosImport(await libro(Array.from({ length: MAX_FILAS_GASTOS }, () => fila())), contexto)
    expect(dentro.erroresArchivo).toEqual([])
    const fuera = await parseGastosImport(await libro(Array.from({ length: MAX_FILAS_GASTOS + 1 }, () => fila())), contexto)
    expect(fuera.erroresArchivo).toHaveLength(1)
    expect(fuera.erroresArchivo[0]).toContain(String(MAX_FILAS_GASTOS))
    expect(fuera.filas).toEqual([])
  })

  it("accepts the optional columns missing and the columns in any order", async () => {
    const encabezado = ["IVA", "Subtotal", "Descripción", "Número de documento", "Tercero", "Tipo de soporte", "Fecha del documento", "Rubro", "Enlace del soporte"]
    const r = await parseGastosImport(
      await libro([[190, 1000, "Taxi", "D-1", "Pedro", "Otro", "2026-11-02", "R12", "https://drive.google.com/x"]], encabezado),
      contexto,
    )
    expect(r.filas[0].error).toBeNull()
    expect(r.filas[0].datos).toMatchObject({
      rubro_id: "rub-1",
      tipo_soporte: "OTRO",
      tercero_tipo_id: null,
      tercero_numero_id: null,
      periodo: "2026-11",
      subtotal: toCents("1000"),
      iva: toCents("190"),
      cents: toCents("1190"),
    })
  })

  it("skips empty rows and keeps the Excel row number of the others", async () => {
    const r = await parseGastosImport(await libro([fila(), [null], fila({ "Número de documento": "FE-2" })]), contexto)
    expect(r.filas.map((f) => f.fila)).toEqual([2, 4])
  })

  it("exposes the template headers in the documented order", () => {
    expect(ENCABEZADOS_GASTOS).toEqual(ENCABEZADO)
  })
})

describe("parseGastosImport — rows (same rules as a single expense)", () => {
  async function unaFila(data: Partial<Record<string, Celda>>) {
    const r = await parseGastosImport(await libro([fila(data)]), contexto)
    return r.filas[0]
  }

  it("matches the rubro by code or by normalized name", async () => {
    expect((await unaFila({ Rubro: "r12" })).rubroId).toBe("rub-1")
    expect((await unaFila({ Rubro: "PROMOCION Y DIVULGACION" })).rubroId).toBe("rub-2")
  })

  it("flags an unknown rubro and a rubro without assigned value", async () => {
    expect((await unaFila({ Rubro: "Inventado" })).error).toBe("No encontramos el rubro «Inventado» en el catálogo.")
    expect((await unaFila({ Rubro: "Sin asignar" })).error).toBe(RUBRO_SIN_ASIGNADO_MESSAGE)
    expect((await unaFila({ Rubro: null })).error).toBe("Falta el nombre del rubro.")
  })

  // B6: a rubro the project disabled is refused with the reason, not as «sin valor asignado».
  it("refuses a rubro disabled for the project, naming it", async () => {
    const ctx: ContextoImportGastos = { ...contexto, deshabilitados: new Set(["rub-3"]) }
    const r = await parseGastosImport(await libro([fila({ Rubro: "Sin asignar" })]), ctx)
    expect(r.filas[0].datos).toBeNull()
    expect(r.filas[0].error).toBe(
      "El rubro R99 Sin asignar está deshabilitado para este proyecto. Habilítalo en el presupuesto antes de asignarle dinero o registrarle gastos.",
    )
  })

  it("accepts es-CO text amounts and Date cells", async () => {
    const f = await unaFila({ Subtotal: "1.500.000,50", "Fecha del documento": new Date("2026-10-20T00:00:00Z") })
    expect(f.error).toBeNull()
    expect(f.datos?.cents).toBe(toCents("1500000.50"))
    expect(f.datos?.fecha_documento).toBe("2026-10-20")
  })

  it("accepts a DD/MM/AAAA text date", async () => {
    const f = await unaFila({ "Fecha del documento": "05/11/2026" })
    expect(f.datos?.fecha_documento).toBe("2026-11-05")
  })

  it("rejects a zero, empty, negative or three-decimal Subtotal naming the column", async () => {
    expect((await unaFila({ Subtotal: 0 })).error).toBe(`«Subtotal»: ${SUBTOTAL_POSITIVO_MESSAGE}`)
    expect((await unaFila({ Subtotal: null })).error).toBe(`«Subtotal»: ${SUBTOTAL_POSITIVO_MESSAGE}`)
    expect((await unaFila({ Subtotal: -5 })).error).toBe("«Subtotal»: El valor no puede ser negativo.")
    expect((await unaFila({ Subtotal: 10.123 })).error).toContain("«Subtotal»: El valor no es un monto válido")
  })

  // AJ-04 (S1, S2): Subtotal + IVA = Total, the Total is computed.
  it("reads Subtotal 1.000.000 + IVA 190.000 as a Total of 1.190.000", async () => {
    const f = await unaFila({ Subtotal: 1000000, IVA: 190000 })
    expect(f.error).toBeNull()
    expect(f.datos).toMatchObject({
      subtotal: toCents("1000000"),
      iva: toCents("190000"),
      cents: toCents("1190000"),
    })
  })

  it("accepts an IVA of 0 and es-CO text amounts in IVA", async () => {
    expect((await unaFila({ Subtotal: 250000, IVA: 0 })).datos).toMatchObject({ iva: BigInt(0), cents: toCents("250000") })
    expect((await unaFila({ Subtotal: 1000, IVA: "190,50" })).datos).toMatchObject({ cents: toCents("1190.50") })
  })

  it("requires the IVA to be written (0 is fine, an empty cell is not) and rejects a negative or malformed one", async () => {
    expect((await unaFila({ IVA: null })).error).toBe("«IVA»: Ingresa el IVA (puede ser 0).")
    expect((await unaFila({ IVA: -1 })).error).toBe(`«IVA»: ${IVA_NEGATIVO_MESSAGE}`)
    expect((await unaFila({ IVA: "abc" })).error).toContain("«IVA»: El valor no es un monto válido")
    expect((await unaFila({ IVA: 1.234 })).error).toContain("«IVA»: El valor no es un monto válido")
  })

  it("accepts an optional Total equal to Subtotal + IVA", async () => {
    const f = await unaFila({ Subtotal: 1000000, IVA: 190000, Total: 1190000 })
    expect(f.error).toBeNull()
    expect(f.datos?.cents).toBe(toCents("1190000"))
    expect((await unaFila({ Subtotal: 1000, IVA: 190, Total: "1.190" })).error).toBeNull()
  })

  it("rejects Subtotal 500.000, IVA 95.000 and Total 600.000 naming the Total column (S2)", async () => {
    const r = await parseGastosImport(await libro([fila(), fila({ "Número de documento": "FE-2", Subtotal: 500000, IVA: 95000, Total: 600000 })]), contexto)
    expect(r.filas[0].error).toBeNull()
    expect(r.filas[1]).toMatchObject({ fila: 3, datos: null })
    expect(r.filas[1].error).toBe("«Total»: no coincide con Subtotal + IVA ($ 595.000). Corrígelo o deja la columna vacía.")
    expect(r.resumen).toEqual({ validas: 1, errores: 1 })
  })

  it("rejects a malformed Total naming the Total column", async () => {
    expect((await unaFila({ Total: "abc" })).error).toContain("«Total»: El valor no es un monto válido")
  })

  it("rejects a file with the old «Valor (COP)» column and no Subtotal, whatever its other headers (S4)", async () => {
    const antiguo = ["Rubro", "Fecha del documento", "Tipo de soporte", "Tercero", "Número de documento", "Descripción", "Valor (COP)"]
    const fila1 = ["Transporte", "2026-10-15", "Otro", "Proveedor SAS", "FE-1", "Tiquetes", 1190000]
    const r = await parseGastosImport(await libro([fila1], antiguo), contexto)
    expect(r.filas).toEqual([])
    expect(r.erroresArchivo).toEqual(["Esta plantilla es anterior: descarga la nueva, que separa Subtotal e IVA."])
    expect(PLANTILLA_ANTERIOR_MESSAGE).toBe(r.erroresArchivo[0])
    for (const alias of ["Valor", "Monto"]) {
      const otra = await parseGastosImport(await libro([fila1], antiguo.map((h) => (h === "Valor (COP)" ? alias : h))), contexto)
      expect(otra.erroresArchivo).toEqual([PLANTILLA_ANTERIOR_MESSAGE])
    }
    const soloValor = await parseGastosImport(await libro([["x", 1]], ["Rubro", "Valor (COP)"]), contexto)
    expect(soloValor.erroresArchivo).toEqual([PLANTILLA_ANTERIOR_MESSAGE])
  })

  it("never reads the old amount as a Subtotal with IVA 0", async () => {
    const antiguo = [...ENCABEZADO.filter((h) => !["Subtotal", "IVA", "Total"].includes(h)), "Valor (COP)"]
    const fila2 = antiguo.map((h) => ({ Rubro: "Transporte", "Fecha del documento": "2026-10-15", "Tipo de soporte": "Otro", Tercero: "P", "Número de documento": "D", Descripción: "d", "Valor (COP)": 100 })[h as string] ?? null)
    const r = await parseGastosImport(await libro([fila2 as Celda[]], antiguo), contexto)
    expect(r.filas).toEqual([])
    expect(r.erroresArchivo).toEqual([PLANTILLA_ANTERIOR_MESSAGE])
  })

  it("rejects an invalid date and a missing one", async () => {
    expect((await unaFila({ "Fecha del documento": "ayer" })).error).toBe("La fecha del documento no es válida.")
    expect((await unaFila({ "Fecha del documento": null })).error).toBe("La fecha del documento es obligatoria.")
  })

  it("defaults the period to the month of the date, honours an explicit one and rejects one outside the project", async () => {
    expect((await unaFila({ "Fecha del documento": "2026-12-31" })).datos?.periodo).toBe("2026-12")
    expect((await unaFila({ Periodo: "2027-01" })).datos?.periodo).toBe("2027-01")
    expect((await unaFila({ Periodo: "2030-01" })).error).toBe(PERIODO_FUERA_MESSAGE)
    expect((await unaFila({ Periodo: "enero" })).error).toBe("El periodo no es válido (AAAA-MM).")
    expect((await unaFila({ "Fecha del documento": "2025-01-10", Periodo: "2025-01" })).error).toBe(PERIODO_FUERA_MESSAGE)
  })

  it("uses the document month for a blank Periodo and asks to choose one when that month is outside the project (S5)", async () => {
    expect((await unaFila({ "Fecha del documento": "2026-10-28", Periodo: null })).datos?.periodo).toBe("2026-10")
    const fuera = await unaFila({ "Fecha del documento": "2025-01-10", Periodo: null })
    expect(fuera.datos).toBeNull()
    expect(fuera.error).toBe("La fecha del documento está fuera de los meses del proyecto: elige el periodo.")
    expect((await unaFila({ "Fecha del documento": "2025-01-10", Periodo: "2026-12" })).datos?.periodo).toBe("2026-12")
  })

  it("maps the support type text and rejects an unknown one", async () => {
    expect((await unaFila({ "Tipo de soporte": "cuenta de cobro persona natural" })).datos?.tipo_soporte).toBe(
      "CUENTA_COBRO_PERSONA_NATURAL",
    )
    expect((await unaFila({ "Tipo de soporte": "Cuenta de cobro de persona natural" })).datos?.tipo_soporte).toBe(
      "CUENTA_COBRO_PERSONA_NATURAL",
    )
    expect((await unaFila({ "Tipo de soporte": "Recibo" })).error).toBe("El tipo de soporte no es válido.")
  })

  it("maps the identification type, keeps it optional and rejects an unknown one", async () => {
    expect((await unaFila({ "Tipo de identificación": "cc" })).datos?.tercero_tipo_id).toBe("CC")
    const sinId = await unaFila({ "Tipo de identificación": null, "Número de identificación": null })
    expect(sinId.datos).toMatchObject({ tercero_tipo_id: null, tercero_numero_id: null })
    expect((await unaFila({ "Tipo de identificación": "PASAPORTE" })).error).toBe(
      "El tipo de identificación no es válido.",
    )
  })

  it("reads a numeric identification and document number as text", async () => {
    const f = await unaFila({ "Número de identificación": 1020304050, "Número de documento": 4567 })
    expect(f.datos).toMatchObject({ tercero_numero_id: "1020304050", numero_documento: "4567" })
  })

  it("applies the text limits and required texts of the single expense", async () => {
    expect((await unaFila({ Tercero: null })).error).toBe("El nombre del tercero es obligatorio.")
    expect((await unaFila({ "Número de documento": null })).error).toBe("El número de documento es obligatorio.")
    expect((await unaFila({ Descripción: null })).error).toBe("La descripción es obligatoria.")
    expect((await unaFila({ Descripción: "x".repeat(1001) })).error).toBe("La descripción es demasiado larga.")
    expect((await unaFila({ Tercero: "x".repeat(201) })).error).toBe("El nombre del tercero es demasiado largo.")
  })

  it("trims the texts", async () => {
    const f = await unaFila({ Tercero: "  Proveedor SAS  ", Descripción: " Tiquetes " })
    expect(f.datos).toMatchObject({ tercero_nombre: "Proveedor SAS", descripcion: "Tiquetes" })
  })

  it("flags a project without dates on every row", async () => {
    const r = await parseGastosImport(await libro([fila()]), { ...contexto, proyecto: { fecha_inicio: null, fecha_fin: null } })
    expect(r.filas[0].error).toBe("El proyecto no tiene fechas definidas.")
  })
})

describe("parseGastosImport — enlace del soporte (AJ-06, S2, S3)", () => {
  async function unaFila(data: Partial<Record<string, Celda>>) {
    const r = await parseGastosImport(await libro([fila(data)]), contexto)
    return r.filas[0]
  }

  it("rejects a row without a support link, naming the row and the column (S2)", async () => {
    const f = await unaFila({ "Enlace del soporte": null })
    expect(f.datos).toBeNull()
    expect(f.error).toBe("«Enlace del soporte»: es obligatorio.")
  })

  it("reads one valid http(s) link into one support", async () => {
    const f = await unaFila({ "Enlace del soporte": "https://drive.google.com/a" })
    expect(f.error).toBeNull()
    expect(f.datos?.enlaces).toEqual(["https://drive.google.com/a"])
  })

  it("splits two semicolon-separated links into two supports (S3's accept-if example)", async () => {
    const f = await unaFila({ "Enlace del soporte": "https://drive.google.com/a ; http://example.com/b" })
    expect(f.error).toBeNull()
    expect(f.datos?.enlaces).toEqual(["https://drive.google.com/a", "http://example.com/b"])
  })

  it("rejects a row where a piece does not start with http:// or https://, naming the row and the column", async () => {
    const r = await parseGastosImport(
      await libro([fila(), fila({ "Número de documento": "FE-2", "Enlace del soporte": "https://ok.com; ftp://no.com" })]),
      contexto,
    )
    expect(r.filas[0].error).toBeNull()
    expect(r.filas[1]).toMatchObject({ fila: 3, datos: null })
    expect(r.filas[1].error).toBe('«Enlace del soporte»: "ftp://no.com" no empieza por http:// o https://.')
  })

  it("accepts http:// case-insensitively and trims blank pieces from a trailing separator", async () => {
    const f = await unaFila({ "Enlace del soporte": "HTTPS://Drive.com/a;" })
    expect(f.error).toBeNull()
    expect(f.datos?.enlaces).toEqual(["HTTPS://Drive.com/a"])
  })

  it("rejects every row of an old-format file that has no «Enlace del soporte» column (S2 change)", async () => {
    const antiguo = ENCABEZADO.filter((h) => h !== "Enlace del soporte")
    const filaAntigua = [
      "Transporte",
      "2026-10-15",
      "Factura de proveedor",
      "Proveedor SAS",
      "NIT",
      "900.123.456-7",
      "FE-0123",
      "Tiquetes del equipo",
      1500000.5,
      0,
      null,
      null,
    ]
    const r = await parseGastosImport(await libro([filaAntigua], antiguo), contexto)
    expect(r.erroresArchivo).toEqual([])
    expect(r.filas[0].error).toBe("«Enlace del soporte»: es obligatorio.")
    expect(r.filas[0].datos).toBeNull()
  })
})

describe("parseGastosImport — código de actividad (S9, T14.3)", () => {
  async function unaFila(data: Partial<Record<string, Celda>>, ctx: ContextoImportGastos = contextoDistribuido) {
    const r = await parseGastosImport(await libro([fila(data)]), ctx)
    return r.filas[0]
  }

  it("reads «Código de actividad» by code or by name and pins the line of that activity and rubro (S9)", async () => {
    expect((await unaFila({ "Código de actividad": "1.3" })).datos).toMatchObject({ rubro_id: "rub-1", linea_id: "lin-13" })
    expect((await unaFila({ "Código de actividad": "ferias" })).datos).toMatchObject({ linea_id: "lin-13" })
    expect((await unaFila({ "Código de actividad": " 1.2 " })).datos).toMatchObject({ linea_id: "lin-12" })
    expect((await unaFila({ "Código de actividad": "1.3" })).actividadTexto).toBe("1.3")
  })

  it("keeps resolving by rubro when the column is missing or the cell is empty (compatibilidad)", async () => {
    const sinColumna = await parseGastosImport(
      await libro([fila().slice(0, 13)], ENCABEZADO.filter((h) => h !== "Código de actividad")),
      contexto,
    )
    expect(sinColumna.filas[0].error).toBeNull()
    expect(sinColumna.filas[0].datos).toMatchObject({ linea_id: "lin-rub-1" })
    expect((await unaFila({ Rubro: "Promoción y divulgación" }, contexto)).datos).toMatchObject({ linea_id: "lin-rub-2" })
  })

  it("rejects a row whose activity is not in the project, naming the column (S9)", async () => {
    const f = await unaFila({ "Código de actividad": "9.9" })
    expect(f.datos).toBeNull()
    expect(f.error).toBe("«Código de actividad»: no encontramos la actividad «9.9» en el proyecto.")
  })

  it("rejects a row whose activity and rubro have no line with an assigned amount (S9)", async () => {
    // El rubro no está presupuestado en la actividad 1.2.
    expect((await unaFila({ "Código de actividad": "1.2", Rubro: "Promoción y divulgación" })).error).toBe(
      RUBRO_SIN_ASIGNADO_MESSAGE,
    )
    // El rubro 3 está en la 1.3, pero sin valor asignado.
    expect((await unaFila({ "Código de actividad": "1.3", Rubro: "Sin asignar" })).error).toBe(RUBRO_SIN_ASIGNADO_MESSAGE)
  })

  it("asks for the activity when the rubro is budgeted in several and the cell is empty (S9)", async () => {
    expect((await unaFila({})).error).toBe(
      "«Código de actividad»: el rubro está en varias actividades: escribe el código de la que corresponde.",
    )
  })
})

describe("parseGastosImport — una factura distribuida (S9, T14.3)", () => {
  const dosFilas = (total: number | null = 1000000) =>
    libro([
      fila({ "Código de actividad": "1.2", Subtotal: 350000, Total: total }),
      fila({ "Código de actividad": "1.3", Subtotal: 650000, Total: total }),
    ])

  it("reads two rows of the same document as ONE distributed invoice, not as duplicates (S9)", async () => {
    const r = await parseGastosImport(await dosFilas(), contextoDistribuido)
    expect(r.erroresArchivo).toEqual([])
    expect(r.filas.map((f) => f.error)).toEqual([null, null])
    expect(r.resumen).toEqual({ validas: 2, errores: 0 })
    expect(r.facturas).toHaveLength(1)
    expect(r.facturas[0].filas).toEqual([2, 3])
    expect(r.facturas[0].error).toBeNull()
    expect(r.facturas[0].datos).toMatchObject({
      numero_documento: "FE-0123",
      subtotal: toCents("1000000"),
      iva: BigInt(0),
      cents: toCents("1000000"),
      repartos: [
        { linea_id: "lin-12", valor: toCents("350000") },
        { linea_id: "lin-13", valor: toCents("650000") },
      ],
    })
  })

  it("rejects the whole invoice when its rows do not add up to the «Total» of the document (S9)", async () => {
    const r = await parseGastosImport(
      await libro([
        fila({ "Código de actividad": "1.2", Subtotal: 350000, Total: 1000000 }),
        fila({ "Código de actividad": "1.3", Subtotal: 640000, Total: 1000000 }),
      ]),
      contextoDistribuido,
    )
    expect(r.filas.map((f) => [f.fila, f.error, f.datos])).toEqual([
      [2, REPARTO_SUMA_MESSAGE, null],
      [3, REPARTO_SUMA_MESSAGE, null],
    ])
    expect(r.facturas[0].datos).toBeNull()
    expect(r.resumen).toEqual({ validas: 0, errores: 2 })
  })

  it("joins two rows of the same invoice on the same line into one distribution row with their sum (S9)", async () => {
    const r = await parseGastosImport(
      await libro([
        fila({ "Código de actividad": "1.2", Subtotal: 600000, Total: 1000000 }),
        fila({ "Código de actividad": "1.2", Subtotal: 400000, Total: 1000000 }),
      ]),
      contextoDistribuido,
    )
    expect(r.filas.map((f) => f.error)).toEqual([null, null])
    expect(r.facturas[0].datos?.repartos).toEqual([{ linea_id: "lin-12", valor: toCents("1000000"), iva: BigInt(0) }])
  })

  // Review of T14: a code Excel turned into a number (1.10 → 1.1) or a date must never resolve to an activity.
  it.each([
    ["a number", 1.1],
    ["a date", new Date(Date.UTC(2026, 1, 1))],
  ])("rejects an activity code that arrives as %s instead of text (S9)", async (_caso, valor) => {
    const r = await parseGastosImport(
      await libro([fila({ "Código de actividad": valor, Subtotal: 1000000 })]),
      contextoDistribuido,
    )
    expect(r.filas[0].error).toBe(
      "«Código de actividad»: escríbelo como texto (por ejemplo 1.10); Excel lo convirtió en número o fecha.",
    )
    expect(r.facturas[0].datos).toBeNull()
  })

  it("requires the invoice to state its «Total» before it can be distributed (S9)", async () => {
    const r = await parseGastosImport(await dosFilas(null), contextoDistribuido)
    expect(r.filas.map((f) => f.error)).toEqual([SIN_TOTAL_DISTRIBUCION_MESSAGE, SIN_TOTAL_DISTRIBUCION_MESSAGE])
    expect(r.facturas[0].datos).toBeNull()
  })

  it("keeps the invoice total equal on every row that writes it (S9)", async () => {
    const r = await parseGastosImport(
      await libro([
        fila({ "Código de actividad": "1.2", Subtotal: 350000, Total: 1000000 }),
        fila({ "Código de actividad": "1.3", Subtotal: 650000, Total: 990000 }),
      ]),
      contextoDistribuido,
    )
    expect(r.filas.map((f) => f.error)).toEqual([REPARTO_SUMA_MESSAGE, REPARTO_SUMA_MESSAGE])
  })

  it("rejects the whole invoice when one of its rows has an error, so no half document is written (S9)", async () => {
    const r = await parseGastosImport(
      await libro([
        fila({ "Código de actividad": "1.2", Subtotal: 350000, Total: 1000000 }),
        fila({ "Código de actividad": "1.3", Subtotal: 0, Total: 1000000 }),
      ]),
      contextoDistribuido,
    )
    expect(r.filas[1].error).toBe(`«Subtotal»: ${SUBTOTAL_POSITIVO_MESSAGE}`)
    expect(r.filas[0]).toMatchObject({ error: facturaIncompleta(3), datos: null })
    expect(r.facturas[0].datos).toBeNull()
  })

  it("rejects the rows of one invoice that disagree on its date, period or support type (S9)", async () => {
    const otraFecha = await parseGastosImport(
      await libro([
        fila({ "Código de actividad": "1.2", Subtotal: 350000, Total: 1000000 }),
        fila({ "Código de actividad": "1.3", Subtotal: 650000, Total: 1000000, "Fecha del documento": "2026-10-20" }),
      ]),
      contextoDistribuido,
    )
    expect(otraFecha.filas.map((f) => f.error)).toEqual([FACTURA_NO_COINCIDE_MESSAGE, FACTURA_NO_COINCIDE_MESSAGE])
    expect(otraFecha.facturas[0].datos).toBeNull()
  })

  it("keeps the same document of another third party apart, as two invoices (S9)", async () => {
    const r = await parseGastosImport(
      await libro([
        fila({ "Código de actividad": "1.2" }),
        fila({ "Código de actividad": "1.3", "Número de identificación": "800.000.001-1" }),
      ]),
      contextoDistribuido,
    )
    expect(r.filas.map((f) => f.error)).toEqual([null, null])
    expect(r.facturas).toHaveLength(2)
    expect(r.facturas.map((f) => f.datos?.numero_documento)).toEqual(["FE-0123", "FE-0123"])
  })

  it("reads every row without identification as its own invoice, as before (S9)", async () => {
    const sinId = { "Tipo de identificación": null, "Número de identificación": null, "Código de actividad": "1.2" }
    const r = await parseGastosImport(await libro([fila(sinId), fila(sinId)]), contextoDistribuido)
    expect(r.filas.map((f) => f.error)).toEqual([null, null])
    expect(r.facturas).toHaveLength(2)
    expect(r.facturas.map((f) => f.datos?.repartos)).toEqual([
      [{ linea_id: "lin-12", valor: toCents("1500000.50"), iva: BigInt(0) }],
      [{ linea_id: "lin-12", valor: toCents("1500000.50"), iva: BigInt(0) }],
    ])
  })

  it("writes one row per invoice when the document has a single row, with its whole total (regresión)", async () => {
    const r = await parseGastosImport(await libro([fila({ "Código de actividad": "1.2" })]), contextoDistribuido)
    expect(r.facturas).toHaveLength(1)
    expect(r.facturas[0].datos?.repartos).toEqual([{ linea_id: "lin-12", valor: toCents("1500000.50"), iva: BigInt(0) }])
    expect(r.facturas[0].datos).toMatchObject({ subtotal: toCents("1500000.50"), iva: BigInt(0), cents: toCents("1500000.50") })
  })

  it("joins the support links of every row of the same invoice (S9)", async () => {
    const r = await parseGastosImport(
      await libro([
        fila({ "Código de actividad": "1.2", Subtotal: 350000, Total: 1000000, "Enlace del soporte": "https://drive.google.com/a" }),
        fila({ "Código de actividad": "1.3", Subtotal: 650000, Total: 1000000, "Enlace del soporte": "https://drive.google.com/b" }),
      ]),
      contextoDistribuido,
    )
    expect(r.facturas[0].datos?.enlaces).toEqual(["https://drive.google.com/a", "https://drive.google.com/b"])
  })

  it("keeps a single-row invoice Total rule: «Total» must equal Subtotal + IVA (regresión)", async () => {
    const r = await parseGastosImport(
      await libro([fila({ "Código de actividad": "1.2", Subtotal: 500000, IVA: 95000, Total: 600000 })]),
      contextoDistribuido,
    )
    expect(r.filas[0].error).toBe(
      "«Total»: no coincide con Subtotal + IVA ($ 595.000). Corrígelo o deja la columna vacía.",
    )
    expect(r.facturas[0].datos).toBeNull()
  })
})
