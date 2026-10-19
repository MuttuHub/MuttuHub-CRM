/**
 * F-X1 — the synthetic "CedeTextil" template fixture (S7 U1, map §7).
 *
 * Structurally the RF v2.0 worked example (`__fixtures__/weeks.ts`, F-W1):
 * project 2026-10-05 .. 2027-01-29, four monthly periods, one objective,
 * four activities (1.1 w1, 1.2 w2, 1.3 w3, 1.4 w3-6 → default peso 4) and
 * seven deliverables. Figures are illustrative (decision D-10, N-22).
 *
 * The budget sums 177.360.000; the `v12` variant keeps the same lines but
 * declares a `valor_total` of 177.410.000, i.e. V-12 is off by exactly 50.000
 * (map §3 V-12). The fixture carries the full 15-rubro catalog so the
 * generator always emits every active row.
 */
import { LINEAS_ESTRATEGICAS_V2, RUBROS_V2 } from "@/lib/catalogs"
import { fromCents, toCents } from "../money"
import type { Periodo } from "../weeks"
import type { PlantillaInput } from "../plantilla/generate"
import type { ContextoValidacion } from "../plantilla/validate"

export type F_X1_Variante = "valido" | "v12"

export const F_X1_CODIGO = "PRY-2026-001"
export const F_X1_CLIENTE = "CedeTextil S.A.S."
export const F_X1_INICIO = "2026-10-05"
export const F_X1_FIN = "2027-01-29"
export const F_X1_PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01"] as const
export const F_X1_META_BENEFICIARIOS = 500
export const F_X1_VALOR_VALIDO = "177360000"
export const F_X1_VALOR_V12 = "177410000"
export const F_X1_RESPONSABLE = "ana@muttu.co"

/** "R01" -> 59.500.000, the eight funded rubros of the pilot. */
export const F_X1_PRESUPUESTO: Readonly<Record<string, string>> = {
  R01: "59500000",
  R04: "34000000",
  R06: "1440000",
  R08: "45000000",
  R11: "300000",
  R12: "24000000",
  R13: "12800000",
  R15: "320000",
}

/** The eight funded rubros, each split in four equal monthly cells. */
export const F_X1_PROGRAMACION: Readonly<Record<string, Readonly<Record<Periodo, string>>>> = Object.fromEntries(
  Object.entries(F_X1_PRESUPUESTO).map(([codigo, valor]) => [codigo, mensual(valor)]),
)

function mensual(valor: string): Record<Periodo, string> {
  const cell = fromCents(toCents(valor) / BigInt(4))
  return Object.fromEntries(F_X1_PERIODOS.map((periodo) => [periodo, cell])) as Record<Periodo, string>
}

export const F_X1_MUNICIPIOS = [
  { nombre: "Montería", departamento: "Córdoba", codigoDane: "23001" },
  { nombre: "Cereté", departamento: "Córdoba", codigoDane: "23162" },
] as const

export function fixtureF_X1(variante: F_X1_Variante = "valido"): PlantillaInput {
  return {
    proyecto: {
      codigo: F_X1_CODIGO,
      cliente: F_X1_CLIENTE,
      fechaInicio: F_X1_INICIO,
      fechaFin: F_X1_FIN,
      valorTotal: variante === "v12" ? F_X1_VALOR_V12 : F_X1_VALOR_VALIDO,
      beneficiariosMeta: F_X1_META_BENEFICIARIOS,
      lineas: [
        { codigo: "LE03", nombre: "Productividad", principal: true },
        { codigo: "LE02", nombre: "Emprendimiento", principal: false },
      ],
      municipios: F_X1_MUNICIPIOS.map((m) => ({ nombre: m.nombre, departamento: m.departamento })),
    },
    catalogo: {
      rubros: RUBROS_V2.map((r) => ({ codigo: r.codigo, nombre: r.nombre })),
      lineas: LINEAS_ESTRATEGICAS_V2.map((l) => ({ codigo: l.codigo, nombre: l.nombre })),
      municipios: F_X1_MUNICIPIOS.map((m) => ({ ...m })),
    },
    estructura: {
      objetivos: [
        {
          codigo: "OE1",
          descripcion: "Fortalecer las capacidades productivas de las unidades textiles del municipio.",
        },
      ],
      actividades: [
        {
          codigo: "1.1",
          objetivoCodigo: "OE1",
          nombre: "Caracterización de las unidades productivas",
          semanaInicio: 1,
          semanaFin: 1,
          responsable: F_X1_RESPONSABLE,
          peso: null,
        },
        {
          codigo: "1.2",
          objetivoCodigo: "OE1",
          nombre: "Formación en prácticas de confección",
          semanaInicio: 2,
          semanaFin: 2,
          responsable: F_X1_RESPONSABLE,
          peso: null,
        },
        {
          codigo: "1.3",
          objetivoCodigo: "OE1",
          nombre: "Acompañamiento técnico a las unidades",
          semanaInicio: 3,
          semanaFin: 3,
          responsable: F_X1_RESPONSABLE,
          peso: null,
        },
        {
          codigo: "1.4",
          objetivoCodigo: "OE1",
          nombre: "Entrega de dotación y certificación",
          semanaInicio: 3,
          semanaFin: 6,
          responsable: F_X1_RESPONSABLE,
          peso: null,
        },
      ],
      entregables: [
        {
          codigo: "1.1-E1",
          actividadCodigo: "1.1",
          descripcion: "Informe de caracterización",
          cantidad: "1",
          unidad: "Informe",
          tipoMedio: "Documento PDF",
        },
        {
          codigo: "1.1-E2",
          actividadCodigo: "1.1",
          descripcion: "Memoria de la jornada de caracterización",
          cantidad: "1",
          unidad: "Memoria",
          tipoMedio: "Documento PDF",
        },
        {
          codigo: "1.2-E1",
          actividadCodigo: "1.2",
          descripcion: "Mapa de unidades productivas",
          cantidad: "1",
          unidad: "Mapa",
          tipoMedio: "Documento PDF",
        },
        {
          codigo: "1.3-E1",
          actividadCodigo: "1.3",
          descripcion: "Acta de acompañamiento",
          cantidad: "4",
          unidad: "Acta",
          tipoMedio: "Documento PDF",
        },
        {
          codigo: "1.3-E2",
          actividadCodigo: "1.3",
          descripcion: "Estatuto del emprendimiento",
          cantidad: "1",
          unidad: "Estatuto",
          tipoMedio: "Documento PDF",
        },
        {
          codigo: "1.4-E1",
          actividadCodigo: "1.4",
          descripcion: "Certificado de formación",
          cantidad: "4",
          unidad: "Certificado",
          tipoMedio: "Documento PDF",
        },
        {
          codigo: "1.4-E2",
          actividadCodigo: "1.4",
          descripcion: "RUT actualizado de la unidad productiva",
          cantidad: "4",
          unidad: "RUT",
          tipoMedio: "Documento PDF",
        },
      ],
      indicadores: [
        {
          codigo: "IND-01",
          objetivoCodigo: "OE1",
          nombre: "Unidades productivas fortalecidas",
          meta: "30",
          unidad: "Unidades",
          lineaBase: "0",
        },
        {
          codigo: "IND-02",
          objetivoCodigo: "OE1",
          nombre: "Personas formadas",
          meta: "60",
          unidad: "Personas",
          lineaBase: "0",
        },
      ],
    },
    presupuesto: { ...F_X1_PRESUPUESTO },
    programacion: Object.fromEntries(
      Object.entries(F_X1_PROGRAMACION).map(([codigo, periodos]) => [codigo, { ...periodos }]),
    ),
  }
}

/** The eight funded amounts sum to the valid project total. */
export const F_X1_SUMA_VALIDA = Object.values(F_X1_PRESUPUESTO).reduce(
  (total, valor) => total + toCents(valor),
  toCents("0"),
)

/**
 * F-X1 validation context (U3): the project, catalogs and users the validators
 * resolve against. Mirrors the fixture input one-to-one (the two strategic
 * lines, the two municipios and the single responsable) plus LE01 so a test can
 * exercise an unknown-code case against a catalog that still has other entries.
 * Fresh object per call: tests mutate the context without leaking state.
 */
export function fixtureContextoFX1(): ContextoValidacion {
  return {
    proyecto: { codigo: F_X1_CODIGO, estado: "BORRADOR" },
    rubros: RUBROS_V2.map((rubro) => ({ codigo: rubro.codigo, activo: true })),
    lineas: [
      { id: "linea-LE03", codigo: "LE03", nombre: "Productividad", activo: true },
      { id: "linea-LE02", codigo: "LE02", nombre: "Emprendimiento", activo: true },
      { id: "linea-LE01", codigo: "LE01", nombre: "Empleabilidad", activo: true },
    ],
    municipios: [
      { id: "municipio-23001", nombre: "Montería", departamento: "Córdoba", codigoDane: "23001", activo: true },
      { id: "municipio-23162", nombre: "Cereté", departamento: "Córdoba", codigoDane: "23162", activo: true },
    ],
    usuarios: [{ id: "usuario-ana", email: F_X1_RESPONSABLE }],
  }
}
