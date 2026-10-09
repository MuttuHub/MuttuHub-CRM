// Pure model of a project version (S8): the immutable snapshot taken at baseline approval
// and at every approved modification, and the diff between two snapshots. Framework- and
// DB-free, like `ficha-financiera.ts`. Money goes through cents so equal amounts always
// serialize identically ("100.5" and "100.50" are the same snapshot value).

import { fromCents, toCents } from "./money"

export type SnapshotV1 = {
  schema: 1
  proyecto: { valor_total: string; fecha_inicio: string; fecha_fin: string; beneficiarios_meta: number | null }
  presupuesto: { rubro_codigo: string; rubro_nombre: string; asignado: string }[]
  programacion: { rubro_codigo: string; periodo: string; valor: string }[]
  actividades: {
    codigo: string
    objetivo_codigo: string
    nombre: string
    semana_inicio: number
    semana_fin: number
    peso: string
    peso_manual: boolean
  }[]
  entregables: { codigo: string; actividad_codigo: string; descripcion: string; cantidad_meta: string; unidad: string }[]
  indicadores: {
    codigo: string
    objetivo_codigo: string
    nombre: string
    meta: string
    unidad: string
    linea_base: string | null
  }[]
}

/**
 * The live project as the loader reads it: plain strings and numbers, soft-deleted rows
 * already dropped. Rubro codes are nullable only because legacy rubros have none;
 * `buildSnapshot` refuses them.
 */
export type LiveProyecto = Omit<SnapshotV1, "schema" | "presupuesto" | "programacion"> & {
  presupuesto: { rubro_codigo: string | null; rubro_nombre: string; asignado: string }[]
  programacion: { rubro_codigo: string | null; periodo: string; valor: string }[]
}

const byKey = <T>(key: (row: T) => string) => (a: T, b: T) => {
  const ka = key(a)
  const kb = key(b)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

const money = (value: string): string => fromCents(toCents(value))

/** Canonical plain-decimal text: no trailing fractional zeros ("2.00" -> "2", "10.50" -> "10.5"). */
function decimal(value: string): string {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value
}

function codigoRubro(codigo: string | null, donde: string): string {
  if (codigo === null) throw new Error(`Un rubro sin código no puede entrar en una versión (${donde}).`)
  return codigo
}

/** Deterministic snapshot: every list sorted by its business key, money normalized. */
export function buildSnapshot(live: LiveProyecto): SnapshotV1 {
  return {
    schema: 1,
    proyecto: {
      valor_total: money(live.proyecto.valor_total),
      fecha_inicio: live.proyecto.fecha_inicio,
      fecha_fin: live.proyecto.fecha_fin,
      beneficiarios_meta: live.proyecto.beneficiarios_meta,
    },
    presupuesto: live.presupuesto
      .map((r) => ({
        rubro_codigo: codigoRubro(r.rubro_codigo, r.rubro_nombre),
        rubro_nombre: r.rubro_nombre,
        asignado: money(r.asignado),
      }))
      .sort(byKey((r) => r.rubro_codigo)),
    programacion: live.programacion
      .map((c) => ({
        rubro_codigo: codigoRubro(c.rubro_codigo, c.periodo),
        periodo: c.periodo,
        valor: money(c.valor),
      }))
      .sort(byKey((c) => `${c.rubro_codigo}|${c.periodo}`)),
    actividades: live.actividades
      .map((a) => ({
        codigo: a.codigo,
        objetivo_codigo: a.objetivo_codigo,
        nombre: a.nombre,
        semana_inicio: a.semana_inicio,
        semana_fin: a.semana_fin,
        peso: decimal(a.peso),
        peso_manual: a.peso_manual,
      }))
      .sort(byKey((a) => a.codigo)),
    entregables: live.entregables
      .map((e) => ({
        codigo: e.codigo,
        actividad_codigo: e.actividad_codigo,
        descripcion: e.descripcion,
        cantidad_meta: decimal(e.cantidad_meta),
        unidad: e.unidad,
      }))
      .sort(byKey((e) => e.codigo)),
    indicadores: live.indicadores
      .map((i) => ({
        codigo: i.codigo,
        objetivo_codigo: i.objetivo_codigo,
        nombre: i.nombre,
        meta: decimal(i.meta),
        unidad: i.unidad,
        linea_base: i.linea_base === null ? null : decimal(i.linea_base),
      }))
      .sort(byKey((i) => i.codigo)),
  }
}

export type Diferencia = {
  elemento: "proyecto" | "presupuesto" | "programacion" | "actividad" | "entregable" | "indicador"
  clave: string
  campo: string
  desde: string | null
  hasta: string | null
}

const ELEMENTO_ORDEN: Record<Diferencia["elemento"], number> = {
  proyecto: 0,
  presupuesto: 1,
  programacion: 2,
  actividad: 3,
  entregable: 4,
  indicador: 5,
}

type Fila = Record<string, string | number | boolean | null>

const texto = (value: string | number | boolean | null): string | null => (value === null ? null : String(value))

function compareRows(
  elemento: Diferencia["elemento"],
  campos: readonly string[],
  a: ReadonlyMap<string, Fila>,
  b: ReadonlyMap<string, Fila>,
): Diferencia[] {
  const out: Diferencia[] = []
  const claves = [...new Set([...a.keys(), ...b.keys()])].sort()
  for (const clave of claves) {
    const antes = a.get(clave)
    const despues = b.get(clave)
    if (!antes || !despues) {
      out.push({
        elemento,
        clave,
        campo: "existencia",
        desde: antes ? "presente" : null,
        hasta: despues ? "presente" : null,
      })
      continue
    }
    for (const campo of campos) {
      if (antes[campo] !== despues[campo]) {
        out.push({ elemento, clave, campo, desde: texto(antes[campo]), hasta: texto(despues[campo]) })
      }
    }
  }
  return out
}

const index = <T extends Fila>(rows: readonly T[], key: (row: T) => string) =>
  new Map<string, Fila>(rows.map((row) => [key(row), row]))

/** Differences from `a` to `b`, ordered by (elemento, clave, campo). Add/remove -> campo "existencia". */
export function diffSnapshots(a: SnapshotV1, b: SnapshotV1): Diferencia[] {
  const proyecto = (s: SnapshotV1) => new Map<string, Fila>([["proyecto", s.proyecto]])
  const diff = [
    ...compareRows("proyecto", ["valor_total", "fecha_inicio", "fecha_fin", "beneficiarios_meta"], proyecto(a), proyecto(b)),
    ...compareRows("presupuesto", ["rubro_nombre", "asignado"], index(a.presupuesto, (r) => r.rubro_codigo), index(b.presupuesto, (r) => r.rubro_codigo)),
    ...compareRows(
      "programacion",
      ["valor"],
      index(a.programacion, (c) => `${c.rubro_codigo}|${c.periodo}`),
      index(b.programacion, (c) => `${c.rubro_codigo}|${c.periodo}`),
    ),
    ...compareRows(
      "actividad",
      ["objetivo_codigo", "nombre", "semana_inicio", "semana_fin", "peso", "peso_manual"],
      index(a.actividades, (x) => x.codigo),
      index(b.actividades, (x) => x.codigo),
    ),
    ...compareRows(
      "entregable",
      ["actividad_codigo", "descripcion", "cantidad_meta", "unidad"],
      index(a.entregables, (x) => x.codigo),
      index(b.entregables, (x) => x.codigo),
    ),
    ...compareRows(
      "indicador",
      ["objetivo_codigo", "nombre", "meta", "unidad", "linea_base"],
      index(a.indicadores, (x) => x.codigo),
      index(b.indicadores, (x) => x.codigo),
    ),
  ]
  // Already grouped per element and key; the stable sort only fixes the element rank.
  return diff.sort((x, y) => ELEMENTO_ORDEN[x.elemento] - ELEMENTO_ORDEN[y.elemento])
}
