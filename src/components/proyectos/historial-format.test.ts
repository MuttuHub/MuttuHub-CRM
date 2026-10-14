import { describe, expect, it } from "vitest"
import { etiquetaCampoAuditoria, etiquetaEntidadAuditoria } from "./project-display"
import { formatearValorHistorial, nombresDelProyecto, pasosLegibles, resumirCambio } from "./historial-format"

const UUID = "48e0a1b2-1111-4222-8333-444455556666"
const CLIENTE_ID = "00000000-0000-4000-8000-000000000001"
const NOMBRES = new Map([[CLIENTE_ID, "CedeTextil SAS"]])

describe("etiquetas del historial", () => {
  it("maps known fields to sentence-case Spanish and humanizes the rest", () => {
    expect(etiquetaCampoAuditoria("peso")).toBe("Peso")
    expect(etiquetaCampoAuditoria("alerta_sobregasto")).toBe("Alerta de sobregasto")
    expect(etiquetaCampoAuditoria("codigo")).toBe("Código")
    expect(etiquetaCampoAuditoria("fecha_compromiso_pago")).toBe("Fecha compromiso pago")
    expect(etiquetaCampoAuditoria("objetivo_id")).toBe("Objetivo")
    expect(etiquetaCampoAuditoria("rubro_id")).toBe("Rubro")
  })

  it("humanizes unknown entities too", () => {
    expect(etiquetaEntidadAuditoria("proyecto")).toBe("Proyecto")
    expect(etiquetaEntidadAuditoria("linea_presupuestal")).toBe("Línea presupuestal")
  })
})

describe("formatearValorHistorial", () => {
  it("never prints a bare uuid: resolves a known name or omits it", () => {
    expect(formatearValorHistorial(CLIENTE_ID, NOMBRES)).toBe("CedeTextil SAS")
    expect(formatearValorHistorial(UUID, NOMBRES)).toBe("")
  })

  it("formats decimal money with formatCOP", () => {
    expect(formatearValorHistorial("14875000.00", NOMBRES)).toBe("$ 14.875.000")
  })

  it("formats a programming month key as a readable month", () => {
    expect(formatearValorHistorial("2026-11", NOMBRES)).toBe("Noviembre 2026")
  })

  it("renders booleans and enums readably", () => {
    expect(formatearValorHistorial(true, NOMBRES)).toBe("Sí")
    expect(formatearValorHistorial("PROSPECCION", NOMBRES)).toBe("Prospección")
  })

  it("drops null keys and unresolved id keys of an object, and names the resolved ones", () => {
    expect(
      formatearValorHistorial({ objetivo_id: UUID, rubro_id: UUID, peso: 2, fecha_adjudicacion: null }, NOMBRES),
    ).toBe("Peso: 2")
    expect(formatearValorHistorial({ id: CLIENTE_ID, principal: true }, NOMBRES)).toBe("CedeTextil SAS · Principal: Sí")
  })
})

describe("resumirCambio", () => {
  it("hides a no-op change", () => {
    expect(resumirCambio({ campo: "alerta_sobregasto", valor_anterior: true, valor_nuevo: true }, NOMBRES)).toBeNull()
    expect(resumirCambio({ campo: "asignado", valor_anterior: "100.00", valor_nuevo: "100.00" }, NOMBRES)).toBeNull()
  })

  it("hides an object change where every key is unchanged, and strips unchanged keys otherwise", () => {
    expect(resumirCambio({ campo: null, valor_anterior: { a: 1, b: null }, valor_nuevo: { a: 1 } }, NOMBRES)).toBeNull()
    expect(
      resumirCambio({ campo: null, valor_anterior: { fase: "PROSPECCION", peso: 1 }, valor_nuevo: { fase: "EJECUCION", peso: 1 } }, NOMBRES),
    ).toEqual({ campo: null, anterior: "Fase: Prospección", nuevo: "Fase: Ejecución" })
  })

  it("formats label and money of a budget change and the month of a programming cell", () => {
    expect(resumirCambio({ campo: "asignado", valor_anterior: null, valor_nuevo: "14875000.00" }, NOMBRES)).toEqual({
      campo: "Monto asignado",
      anterior: "",
      nuevo: "$ 14.875.000",
    })
    expect(resumirCambio({ campo: "2026-11", valor_anterior: "100000.00", valor_nuevo: "250000.00" }, NOMBRES)).toEqual({
      campo: "Noviembre 2026",
      anterior: "$ 100.000",
      nuevo: "$ 250.000",
    })
  })

  it("keeps the entry when only an unresolvable uuid is omitted, with no raw id", () => {
    expect(resumirCambio({ campo: "objetivo_id", valor_anterior: null, valor_nuevo: UUID }, NOMBRES)).toEqual({
      campo: null,
      anterior: "",
      nuevo: "",
    })
    expect(resumirCambio({ campo: "cliente_id", valor_anterior: null, valor_nuevo: CLIENTE_ID }, NOMBRES)).toEqual({
      campo: "Cliente",
      anterior: "",
      nuevo: "CedeTextil SAS",
    })
  })
})

describe("nombresDelProyecto", () => {
  it("indexes the names the ficha already has by id", () => {
    const nombres = nombresDelProyecto({
      cliente: { id: "c1", nombre: "Cliente" },
      responsable: { id: "u1", nombre: "Ana" },
      lineas: [{ id: "l1", codigo: "LE01", nombre: "Línea", principal: true }],
      municipios: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
    })
    expect([...nombres.entries()]).toEqual([
      ["c1", "Cliente"],
      ["u1", "Ana"],
      ["l1", "Línea"],
      ["m1", "Barranquilla"],
    ])
  })
})

describe("pasosLegibles", () => {
  const fila = (id: string, lote: string | null, valor_anterior: unknown, valor_nuevo: unknown) => ({
    id,
    lote_id: lote,
    entidad: "gasto",
    created_at: "2026-10-06T20:39:51.751Z",
    campo: "alerta_sobregasto",
    valor_anterior,
    valor_nuevo,
  })

  it("drops the no-op rows and the steps left empty", () => {
    const pasos = pasosLegibles(
      [fila("a", "l1", true, true), fila("b", "l1", false, true), fila("c", "l2", true, true)],
      NOMBRES,
    )
    expect(pasos).toHaveLength(1)
    expect(pasos[0].key).toBe("l1")
    expect(pasos[0].entradas.map((e) => e.entry.id)).toEqual(["b"])
    expect(pasos[0].entradas[0].cambio).toEqual({ campo: "Alerta de sobregasto", anterior: "No", nuevo: "Sí" })
  })
})
