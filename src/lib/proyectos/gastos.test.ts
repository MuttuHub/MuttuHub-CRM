import { describe, expect, it } from "vitest"
import { toCents } from "./money"
import { excederiaAsignado, validadoAcumulado } from "./ficha-financiera"
import { gastosTransporte, TRANSPORTE_ASIGNADO } from "./__fixtures__/gastos"
import {
  datosIncompletos,
  esDuplicado,
  esObservado,
  normalizarIdentificacion,
  normalizarNumeroDocumento,
  periodoEnProyecto,
  periodoPorDefecto,
  puedeTransicionar,
  redactarGasto,
} from "./gastos"

describe("normalizarIdentificacion", () => {
  it("drops dots, spaces and the NIT check digit", () => {
    expect(normalizarIdentificacion("NIT", "900.123.456-7")).toBe("900123456")
    expect(normalizarIdentificacion("NIT", " 900 123 456 - 7 ")).toBe("900123456")
    expect(normalizarIdentificacion("NIT", "900123456")).toBe("900123456")
  })

  it("keeps alphanumerics only for CC and CE, uppercased", () => {
    expect(normalizarIdentificacion("CC", "1.020.304.050")).toBe("1020304050")
    expect(normalizarIdentificacion("CE", "ce-123456")).toBe("CE123456")
    expect(normalizarIdentificacion("CC", "10_20 30")).toBe("102030")
  })

  it("returns null for blank or missing values", () => {
    expect(normalizarIdentificacion("NIT", "   ")).toBeNull()
    expect(normalizarIdentificacion("CC", "")).toBeNull()
    expect(normalizarIdentificacion("CC", null)).toBeNull()
    expect(normalizarIdentificacion(null, "123")).toBe("123")
    expect(normalizarIdentificacion("CC", "...")).toBeNull()
  })
})

describe("normalizarNumeroDocumento", () => {
  it("ignores case, whitespace and separators but keeps leading zeros", () => {
    expect(normalizarNumeroDocumento("FE-0123")).toBe("FE0123")
    expect(normalizarNumeroDocumento("fe 0123")).toBe("FE0123")
    expect(normalizarNumeroDocumento("FE/01.23_")).toBe("FE0123")
    expect(normalizarNumeroDocumento("FE-0123")).not.toBe(normalizarNumeroDocumento("FE-123"))
  })
})

describe("periods", () => {
  it("defaults to the document month", () => {
    expect(periodoPorDefecto("2026-11-30")).toBe("2026-11")
  })

  it("accepts only periods of the project", () => {
    const periodos = ["2026-10", "2026-11"]
    expect(periodoEnProyecto("2026-11", periodos)).toBe(true)
    expect(periodoEnProyecto("2027-01", periodos)).toBe(false)
  })
})

describe("datosIncompletos", () => {
  it("is derived from the third-party identification", () => {
    expect(datosIncompletos({ tercero_tipo_id: null, tercero_numero_id: "1" })).toBe(true)
    expect(datosIncompletos({ tercero_tipo_id: "CC", tercero_numero_id: null })).toBe(true)
    expect(datosIncompletos({ tercero_tipo_id: "CC", tercero_numero_id: "1" })).toBe(false)
  })
})

describe("puedeTransicionar", () => {
  it("follows the estado machine", () => {
    expect(puedeTransicionar("REGISTRADO", "VALIDAR")).toBe("VALIDADO")
    expect(puedeTransicionar("REGISTRADO", "RECHAZAR")).toBe("RECHAZADO")
    expect(puedeTransicionar("RECHAZADO", "CORREGIR")).toBe("REGISTRADO")
    expect(puedeTransicionar("VALIDADO", "ANULAR")).toBe("ANULADO")
  })

  it("rejects every other move", () => {
    expect(puedeTransicionar("VALIDADO", "RECHAZAR")).toBeNull()
    expect(puedeTransicionar("VALIDADO", "CORREGIR")).toBeNull()
    expect(puedeTransicionar("REGISTRADO", "ANULAR")).toBeNull()
    expect(puedeTransicionar("RECHAZADO", "VALIDAR")).toBeNull()
    expect(puedeTransicionar("ANULADO", "VALIDAR")).toBeNull()
    expect(puedeTransicionar("ANULADO", "CORREGIR")).toBeNull()
  })
})

describe("esDuplicado", () => {
  const base = { tercero_id_norm: "900123456", numero_documento_norm: "FE0123", estado: "REGISTRADO" as const }

  it("matches the same third party and document number among live expenses", () => {
    expect(esDuplicado(base, { ...base, estado: "VALIDADO" })).toBe(true)
  })

  it("ignores RECHAZADO and ANULADO, other documents and missing ids", () => {
    expect(esDuplicado(base, { ...base, estado: "RECHAZADO" })).toBe(false)
    expect(esDuplicado(base, { ...base, estado: "ANULADO" })).toBe(false)
    expect(esDuplicado(base, { ...base, numero_documento_norm: "FE123" })).toBe(false)
    expect(esDuplicado({ ...base, tercero_id_norm: null }, { ...base, tercero_id_norm: null })).toBe(false)
  })
})

describe("redactarGasto", () => {
  const view = {
    id: "g1",
    tercero_nombre: "Proveedor SAS",
    tercero_numero_id: "900123456",
    tercero_id_norm: "900123456",
    soportes: [{ id: "s1" }],
    valor: "100.00",
  }

  it("hides the identification and the supports from actors without access", () => {
    const out = redactarGasto(view, { puedeVerSoportes: false })
    expect(out).not.toHaveProperty("tercero_numero_id")
    expect(out).not.toHaveProperty("tercero_id_norm")
    expect(out).not.toHaveProperty("soportes")
    expect(out.tercero_nombre).toBe("Proveedor SAS")
  })

  it("keeps everything for actors with access", () => {
    expect(redactarGasto(view, { puedeVerSoportes: true })).toEqual(view)
  })

  it("hides the support count together with the supports", () => {
    const out = redactarGasto({ ...view, soportes_count: 1 }, { puedeVerSoportes: false })
    expect(out).not.toHaveProperty("soportes_count")
  })
})

describe("esObservado (D5)", () => {
  const base = { estado: "REGISTRADO" as const, alerta_sobregasto: false, datos_incompletos: false }

  it("is a REGISTRADO expense with the overspend alert or with incomplete data", () => {
    expect(esObservado({ ...base, alerta_sobregasto: true })).toBe(true)
    expect(esObservado({ ...base, datos_incompletos: true })).toBe(true)
    expect(esObservado(base)).toBe(false)
  })

  it("never applies to an expense that already left REGISTRADO", () => {
    for (const estado of ["VALIDADO", "RECHAZADO", "ANULADO"] as const) {
      expect(esObservado({ ...base, estado, alerta_sobregasto: true, datos_incompletos: true })).toBe(false)
    }
  })
})

describe("overspend with the shared ficha helpers", () => {
  const validado = validadoAcumulado(gastosTransporte())

  it("counts only VALIDADO rows", () => {
    expect(validado).toBe(toCents("23500000"))
  })

  it("blocks when the new amount pushes the total above A", () => {
    expect(excederiaAsignado({ asignado: TRANSPORTE_ASIGNADO, validado, nuevo: toCents("1000000") })).toBe(true)
  })

  it("allows reaching A exactly", () => {
    expect(excederiaAsignado({ asignado: TRANSPORTE_ASIGNADO, validado, nuevo: toCents("500000") })).toBe(false)
  })

  it("allows the same amount once A is raised", () => {
    expect(excederiaAsignado({ asignado: toCents("25000000"), validado, nuevo: toCents("1000000") })).toBe(false)
  })
})
