import { describe, expect, it } from "vitest"
import { etiquetaCampoAuditoria, etiquetaEntidadAuditoria, formatDiferenciaPp } from "./project-display"

describe("formatDiferenciaPp", () => {
  it("shows real - plan with its sign from the plan - real deviation of the API", () => {
    // PRY-2026-001: real 32,1 % vs plan 20,4 % -> desviacion_pp = -11,7 (plan - real) -> "+11,7 pp".
    expect(formatDiferenciaPp(-11.7)).toBe("+11,7 pp")
    expect(formatDiferenciaPp(35.7)).toBe("-35,7 pp")
  })

  it("never prints a signed zero", () => {
    expect(formatDiferenciaPp(0)).toBe("0 pp")
    expect(formatDiferenciaPp(0.04)).toBe("0 pp")
    expect(formatDiferenciaPp(-0.04)).toBe("0 pp")
  })
})

describe("etiquetas con tilde", () => {
  it("labels fields with Spanish accents", () => {
    const esperado: Record<string, string> = {
      descripcion: "Descripción",
      observacion: "Observación",
      numero_documento: "Número de documento",
      tercero_numero: "Número del tercero",
      url_externa: "URL externa",
      medicion: "Medición",
      linea_base: "Línea base",
      version: "Versión",
      numero: "Número",
    }
    for (const [campo, etiqueta] of Object.entries(esperado)) {
      expect(etiquetaCampoAuditoria(campo)).toBe(etiqueta)
    }
  })

  it("accents unmapped words in the humanized fallback", () => {
    expect(etiquetaCampoAuditoria("fecha_validacion_medicion")).toBe("Fecha validación medición")
  })

  it("labels entities with Spanish accents", () => {
    expect(etiquetaEntidadAuditoria("medicion")).toBe("Medición")
    expect(etiquetaEntidadAuditoria("version")).toBe("Versión")
  })
})
