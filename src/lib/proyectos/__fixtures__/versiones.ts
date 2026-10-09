/**
 * F-V1 — live project fixtures for the S8 version libs (map §4).
 *
 * `liveF_V1()` models the S7 F-X1 import plan as the loader reads it from the live
 * tables: eight funded rubros over four months, one objective, activities 1.1..1.4
 * (weights 1/1/1/4) and seven deliverables. The arrays are deliberately NOT in
 * snapshot order, so `buildSnapshot` has to sort. `liveMini()` is the small shape the
 * frozen-literal test pins byte for byte.
 */
import { RUBROS_V2 } from "@/lib/catalogs"
import type { LiveProyecto } from "../versiones"
import {
  F_X1_FIN,
  F_X1_INICIO,
  F_X1_META_BENEFICIARIOS,
  F_X1_PERIODOS,
  F_X1_PRESUPUESTO,
  F_X1_PROGRAMACION,
  F_X1_VALOR_VALIDO,
} from "./plantilla-cedetextil"

const NOMBRE = new Map(RUBROS_V2.map((r) => [r.codigo, r.nombre]))

export function liveF_V1(): LiveProyecto {
  const codigos = Object.keys(F_X1_PRESUPUESTO).reverse()
  return {
    proyecto: {
      valor_total: F_X1_VALOR_VALIDO,
      fecha_inicio: F_X1_INICIO,
      fecha_fin: F_X1_FIN,
      beneficiarios_meta: F_X1_META_BENEFICIARIOS,
    },
    presupuesto: codigos.map((codigo) => ({
      rubro_codigo: codigo,
      rubro_nombre: NOMBRE.get(codigo) ?? codigo,
      asignado: F_X1_PRESUPUESTO[codigo],
    })),
    programacion: codigos.flatMap((codigo) =>
      [...F_X1_PERIODOS].reverse().map((periodo) => ({
        rubro_codigo: codigo,
        periodo,
        valor: F_X1_PROGRAMACION[codigo][periodo],
      })),
    ),
    actividades: [
      { codigo: "1.4", objetivo_codigo: "OE1", nombre: "Entrega de dotación y certificación", semana_inicio: 3, semana_fin: 6, peso: "4", peso_manual: false },
      { codigo: "1.1", objetivo_codigo: "OE1", nombre: "Caracterización de las unidades productivas", semana_inicio: 1, semana_fin: 1, peso: "1", peso_manual: false },
      { codigo: "1.3", objetivo_codigo: "OE1", nombre: "Acompañamiento técnico a las unidades", semana_inicio: 3, semana_fin: 3, peso: "1", peso_manual: false },
      { codigo: "1.2", objetivo_codigo: "OE1", nombre: "Formación en prácticas de confección", semana_inicio: 2, semana_fin: 2, peso: "1", peso_manual: false },
    ],
    entregables: [
      { codigo: "1.4-E2", actividad_codigo: "1.4", descripcion: "RUT actualizado de la unidad productiva", cantidad_meta: "4", unidad: "RUT" },
      { codigo: "1.1-E1", actividad_codigo: "1.1", descripcion: "Informe de caracterización", cantidad_meta: "1", unidad: "Informe" },
      { codigo: "1.3-E1", actividad_codigo: "1.3", descripcion: "Acta de acompañamiento", cantidad_meta: "4", unidad: "Acta" },
      { codigo: "1.1-E2", actividad_codigo: "1.1", descripcion: "Memoria de la jornada de caracterización", cantidad_meta: "1", unidad: "Memoria" },
      { codigo: "1.2-E1", actividad_codigo: "1.2", descripcion: "Mapa de unidades productivas", cantidad_meta: "1", unidad: "Mapa" },
      { codigo: "1.4-E1", actividad_codigo: "1.4", descripcion: "Certificado de formación", cantidad_meta: "4", unidad: "Certificado" },
      { codigo: "1.3-E2", actividad_codigo: "1.3", descripcion: "Estatuto del emprendimiento", cantidad_meta: "1", unidad: "Estatuto" },
    ],
    indicadores: [
      { codigo: "IND-02", objetivo_codigo: "OE1", nombre: "Personas formadas", meta: "60", unidad: "Personas", linea_base: "0" },
      { codigo: "IND-01", objetivo_codigo: "OE1", nombre: "Unidades productivas fortalecidas", meta: "30", unidad: "Unidades", linea_base: "0" },
    ],
  }
}

/** Two rubros, two months, one activity: small enough to freeze as a literal. */
export function liveMini(): LiveProyecto {
  return {
    proyecto: { valor_total: "300", fecha_inicio: "2026-10-05", fecha_fin: "2026-11-27", beneficiarios_meta: null },
    presupuesto: [
      { rubro_codigo: "R12", rubro_nombre: "Transporte", asignado: "100.5" },
      { rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "199.50" },
    ],
    programacion: [
      { rubro_codigo: "R12", periodo: "2026-11", valor: "50.25" },
      { rubro_codigo: "R01", periodo: "2026-11", valor: "100" },
      { rubro_codigo: "R12", periodo: "2026-10", valor: "50.25" },
      { rubro_codigo: "R01", periodo: "2026-10", valor: "99.50" },
    ],
    actividades: [
      { codigo: "1.1", objetivo_codigo: "OE1", nombre: "A", semana_inicio: 1, semana_fin: 2, peso: "2.00", peso_manual: false },
    ],
    entregables: [],
    indicadores: [{ codigo: "IND-01", objetivo_codigo: "OE1", nombre: "I", meta: "10.50", unidad: "u", linea_base: null }],
  }
}
