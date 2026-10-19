import { describe, expect, it } from "vitest"
import { MENSAJE_RANGO_FECHAS } from "./rango-fechas"
import {
  DESCRIPCION_MAX,
  cuerpoDeCambios,
  validarDatosGenerales,
  type CampoDatosGenerales,
  type DatosGenerales,
} from "./editar-datos-generales"

const BASE: DatosGenerales = {
  nombre: "Fortalecimiento",
  descripcion: "Alcance",
  responsableId: "u1",
  valorTotal: "180000000",
  fechaInicio: "2026-01-05",
  fechaFin: "2026-03-30",
  beneficiarios: "120",
  lineas: [
    { id: "l1", principal: true },
    { id: "l2", principal: false },
  ],
  municipioIds: ["m1", "m2"],
}

describe("validarDatosGenerales", () => {
  it("accepts valid data in both modes", () => {
    expect(validarDatosGenerales(BASE, "BORRADOR")).toBeNull()
    expect(validarDatosGenerales(BASE, "EN_EJECUCION")).toBeNull()
  })

  it.each<[CampoDatosGenerales, Partial<DatosGenerales>, string]>([
    ["nombre", { nombre: "  " }, "El nombre del proyecto es obligatorio."],
    ["descripcion", { descripcion: "x".repeat(DESCRIPCION_MAX + 1) }, "La descripción no puede superar 2000 caracteres."],
    ["fechaInicio", { fechaInicio: "" }, "Completa las fechas de inicio y fin."],
    ["fechaFin", { fechaInicio: "2026-03-30" }, MENSAJE_RANGO_FECHAS],
    ["valorTotal", { valorTotal: "0" }, "El valor total debe ser mayor que cero."],
    ["valorTotal", { valorTotal: "" }, "El valor total debe ser mayor que cero."],
    ["beneficiarios", { beneficiarios: "0" }, "El número de beneficiarios debe ser mayor que cero."],
    ["beneficiarios", { beneficiarios: "1.5" }, "El número de beneficiarios debe ser mayor que cero."],
    ["lineas", { lineas: [] }, "Selecciona al menos una línea estratégica."],
    ["lineas", { lineas: [{ id: "l1", principal: false }] }, "Marca una línea estratégica como principal."],
    ["municipios", { municipioIds: [] }, "Selecciona al menos un municipio."],
  ])("rejects an invalid %s in BORRADOR", (campo, cambio, mensaje) => {
    expect(validarDatosGenerales({ ...BASE, ...cambio }, "BORRADOR")).toEqual({ campo, mensaje })
  })

  it("lets BORRADOR leave beneficiarios empty but not EN_EJECUCION", () => {
    expect(validarDatosGenerales({ ...BASE, beneficiarios: "" }, "BORRADOR")).toBeNull()
    expect(validarDatosGenerales({ ...BASE, beneficiarios: "" }, "EN_EJECUCION")).toEqual({
      campo: "beneficiarios",
      mensaje: "El número de beneficiarios debe ser mayor que cero.",
    })
  })

  it("ignores the fields that are read-only during execution", () => {
    const roto = { ...BASE, nombre: "", valorTotal: "0", lineas: [], municipioIds: [] }
    expect(validarDatosGenerales(roto, "EN_EJECUCION")).toBeNull()
  })
})

describe("cuerpoDeCambios", () => {
  it("is empty when nothing changed", () => {
    expect(cuerpoDeCambios(BASE, { ...BASE }, "BORRADOR")).toEqual({})
  })

  it("sends only the changed fields in BORRADOR", () => {
    const actual = { ...BASE, nombre: " Nuevo ", valorTotal: "200000000", municipioIds: ["m2"] }
    expect(cuerpoDeCambios(BASE, actual, "BORRADOR")).toEqual({
      nombre: "Nuevo",
      valor_total: 200000000,
      municipio_ids: ["m2"],
    })
  })

  it("treats a reordered selection as unchanged and a principal flip as a change", () => {
    expect(cuerpoDeCambios(BASE, { ...BASE, municipioIds: ["m2", "m1"], lineas: [...BASE.lineas].reverse() }, "BORRADOR")).toEqual({})
    const volteada = [
      { id: "l1", principal: false },
      { id: "l2", principal: true },
    ]
    expect(cuerpoDeCambios(BASE, { ...BASE, lineas: volteada }, "BORRADOR")).toEqual({ lineas: volteada })
  })

  it("sends a blank description to clear it and null to clear beneficiaries (BORRADOR)", () => {
    expect(cuerpoDeCambios(BASE, { ...BASE, descripcion: "  ", beneficiarios: "" }, "BORRADOR")).toEqual({
      descripcion: "",
      beneficiarios_meta: null,
    })
  })

  it("sends ONLY descripcion and beneficiarios_meta in EN_EJECUCION", () => {
    const actual = { ...BASE, nombre: "Otro", valorTotal: "1", fechaFin: "2027-01-01", descripcion: "Nueva", beneficiarios: "150" }
    expect(cuerpoDeCambios(BASE, actual, "EN_EJECUCION")).toEqual({ descripcion: "Nueva", beneficiarios_meta: 150 })
  })
})
