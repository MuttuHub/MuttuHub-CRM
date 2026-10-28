// @vitest-environment node
// B8 — the expenses workbook (one row per expense): headers, row rules shared with the single
// expense form (amount, rubro with assigned value, project month, text limits), in-file duplicates.
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import {
  PERIODO_FUERA_MESSAGE,
  RUBRO_SIN_ASIGNADO_MESSAGE,
  VALOR_POSITIVO_MESSAGE,
} from "@/lib/api/gastos"
import { toCents } from "../money"
import type { RubroCatalogo } from "../presupuesto-po/parse"
import {
  ARCHIVO_ILEGIBLE,
  DUPLICADO_EN_ARCHIVO_MESSAGE,
  ENCABEZADOS_GASTOS,
  MAX_FILAS_GASTOS,
  SIN_FILAS_GASTOS,
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
  rubrosConAsignado: new Set(["rub-1", "rub-2"]),
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
  "Valor (COP)",
  "Periodo",
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
    "Valor (COP)": 1500000.5,
    Periodo: null,
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
    })
    expect(r.resumen).toEqual({ validas: 1, errores: 0 })
  })

  it("rejects an unreadable file as a whole", async () => {
    const r = await parseGastosImport(Buffer.from("no es un xlsx"), contexto)
    expect(r.erroresArchivo).toEqual([ARCHIVO_ILEGIBLE])
    expect(r.filas).toEqual([])
  })

  it("rejects a file without the required headers and names the missing ones", async () => {
    const r = await parseGastosImport(await libro([["x", 1]], ["Rubro", "Valor (COP)"]), contexto)
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
    const encabezado = ["Valor (COP)", "Descripción", "Número de documento", "Tercero", "Tipo de soporte", "Fecha del documento", "Rubro"]
    const r = await parseGastosImport(
      await libro([[1000, "Taxi", "D-1", "Pedro", "Otro", "2026-11-02", "R12"]], encabezado),
      contexto,
    )
    expect(r.filas[0].error).toBeNull()
    expect(r.filas[0].datos).toMatchObject({
      rubro_id: "rub-1",
      tipo_soporte: "OTRO",
      tercero_tipo_id: null,
      tercero_numero_id: null,
      periodo: "2026-11",
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

  it("accepts es-CO text amounts and Date cells", async () => {
    const f = await unaFila({ "Valor (COP)": "1.500.000,50", "Fecha del documento": new Date("2026-10-20T00:00:00Z") })
    expect(f.error).toBeNull()
    expect(f.datos?.cents).toBe(toCents("1500000.50"))
    expect(f.datos?.fecha_documento).toBe("2026-10-20")
  })

  it("accepts a DD/MM/AAAA text date", async () => {
    const f = await unaFila({ "Fecha del documento": "05/11/2026" })
    expect(f.datos?.fecha_documento).toBe("2026-11-05")
  })

  it("rejects a zero, negative or three-decimal amount", async () => {
    expect((await unaFila({ "Valor (COP)": 0 })).error).toBe(VALOR_POSITIVO_MESSAGE)
    expect((await unaFila({ "Valor (COP)": null })).error).toBe(VALOR_POSITIVO_MESSAGE)
    expect((await unaFila({ "Valor (COP)": -5 })).error).toBe("El valor no puede ser negativo.")
    expect((await unaFila({ "Valor (COP)": 10.123 })).error).toContain("no es un monto válido")
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
    expect((await unaFila({ "Fecha del documento": "2025-01-10" })).error).toBe(PERIODO_FUERA_MESSAGE)
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
    expect((await unaFila({ Descripción: null })).error).toBe("La descripción es obligatorio.")
    expect((await unaFila({ Descripción: "x".repeat(1001) })).error).toBe("La descripción es demasiado largo.")
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

describe("parseGastosImport — duplicates inside the file", () => {
  it("flags the second row with the same normalized third-party id and document number", async () => {
    const r = await parseGastosImport(
      await libro([fila(), fila({ "Número de identificación": "900123456", "Número de documento": "fe 0123" })]),
      contexto,
    )
    expect(r.filas[0].error).toBeNull()
    expect(r.filas[1].error).toBe(`${DUPLICADO_EN_ARCHIVO_MESSAGE} (ya aparece en la fila 2).`)
    expect(r.filas[1].datos).toBeNull()
    expect(r.resumen).toEqual({ validas: 1, errores: 1 })
  })

  it("does not flag the same document number of another third party or without identification", async () => {
    const r = await parseGastosImport(
      await libro([
        fila(),
        fila({ "Número de identificación": "800.000.001-1" }),
        fila({ "Tipo de identificación": null, "Número de identificación": null }),
        fila({ "Tipo de identificación": null, "Número de identificación": null }),
      ]),
      contexto,
    )
    expect(r.filas.map((f) => f.error)).toEqual([null, null, null, null])
  })

  it("does not take an invalid row as the first occurrence", async () => {
    const r = await parseGastosImport(await libro([fila({ "Valor (COP)": 0 }), fila()]), contexto)
    expect(r.filas[0].error).toBe(VALOR_POSITIVO_MESSAGE)
    expect(r.filas[1].error).toBeNull()
  })
})
