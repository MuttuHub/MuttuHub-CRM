// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  ENCABEZADOS,
  HOJAS,
  IMPORT_MAX_BYTES,
  MAX_ERRORES,
  MAX_FILAS_HOJA,
  PLANTILLA_VERSION,
  UNIDADES_SUGERIDAS,
} from "./columns"

describe("plantilla columns", () => {
  it("declares the template version 2026.2 (A2: budget by activity line)", () => {
    expect(PLANTILLA_VERSION).toBe("2026.2")
  })

  it("names the eight sheets in the canonical order, without the programming sheet (S4)", () => {
    expect(Object.values(HOJAS)).toEqual([
      "1. Instrucciones",
      "2. Proyecto",
      "3. Objetivos",
      "4. Actividades",
      "5. Entregables",
      "6. Indicadores",
      "7. Presupuesto",
      "8. Catálogos",
    ])
    expect(Object.keys(HOJAS)).toHaveLength(8)
  })

  it("fixes the data-sheet headers", () => {
    expect(ENCABEZADOS).toEqual({
      objetivos: ["Código", "Descripción"],
      actividades: [
        "Código",
        "Código objetivo",
        "Nombre",
        "Semana inicio",
        "Semana fin",
        "Responsable (correo)",
      ],
      // PO 2026-10-23: the templates no longer ask for "Tipo de medio exigido" nor the indicator "Unidad".
      entregables: ["Código", "Código actividad", "Descripción", "Cantidad", "Unidad"],
      indicadores: ["Código", "Código objetivo", "Nombre", "Meta", "Línea base"],
      // S3: «columnas Código de actividad, Rubro y Valor».
      presupuesto: ["Código de actividad", "Rubro", "Valor"],
    })
  })

  it("caps the import at 4 MB, the rows at 1000 and the errors at 500", () => {
    expect(IMPORT_MAX_BYTES).toBe(4 * 1024 * 1024)
    expect(MAX_FILAS_HOJA).toBe(1000)
    expect(MAX_ERRORES).toBe(500)
  })

  it("offers a non-empty unit suggestion list", () => {
    expect(UNIDADES_SUGERIDAS.length).toBeGreaterThan(0)
    expect(UNIDADES_SUGERIDAS).toContain("Personas")
  })
})
