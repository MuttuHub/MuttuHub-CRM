/**
 * S7 U4 (RF-04) — turn a validated `ParsedTemplate` into a write plan.
 *
 * Pure and framework-free: no `exceljs`, no Next, no Prisma, no DB. The plan is
 * the exact shape the U5 writer consumes, so the route layer never re-derives
 * business fields from raw cells. `construirPlan` assumes the template passed
 * validation (it is called only after `validarPlantilla` reports no errors), so
 * it never throws on the F-X1 fixtures; money stays in exact `bigint` cents.
 */
import { parseFechaCelda, parseNumeroColombiano, type Celda, type Fila, type ParsedTemplate } from "./parse"
import { resolverLineaToken, resolverMunicipioToken, type ContextoValidacion } from "./validate"
import { fromCents, sumCents, toCents, type Cents } from "../money"
import { defaultWeight, type IsoDate, type Periodo } from "../weeks"

export type PlanImportacion = {
  proyecto: {
    fechaInicio: IsoDate
    fechaFin: IsoDate
    valorTotalCents: Cents
    beneficiariosMeta: number
    lineas: { id: string; principal: boolean }[]
    municipioIds: string[]
  }
  objetivos: { codigo: string; descripcion: string; orden: number }[]
  actividades: {
    codigo: string
    objetivoCodigo: string
    nombre: string
    semanaInicio: number
    semanaFin: number
    responsableId: string | null
  }[]
  entregables: {
    codigo: string
    actividadCodigo: string
    descripcion: string
    cantidadMeta: string
    unidad: string
    tipoMedio: string
  }[]
  indicadores: {
    codigo: string
    objetivoCodigo: string
    nombre: string
    meta: string
    unidad: string
    lineaBase: string | null
  }[]
  presupuesto: { rubroCodigo: string; cents: Cents }[]
  programacion: { rubroCodigo: string; periodo: Periodo; cents: Cents }[]
}

const ZERO = BigInt(0)
const RE_ENTERO = /^-?\d+$/
/** A plain decimal; `String(1e21)`/`String(1e-7)` are rejected before `toCents`. */
const DECIMAL_PLANO = /^-?\d+(?:\.\d+)?$/

function texto(fila: Fila, encabezado: string): string {
  const valor = fila.celdas[encabezado]?.valor
  if (valor === null || valor === undefined) return ""
  if (valor instanceof Date) return valor.toISOString()
  return String(valor).trim()
}

function decimalDe(valor: Celda["valor"] | undefined): string | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null
    const texto = String(valor)
    return DECIMAL_PLANO.test(texto) ? texto : null
  }
  if (typeof valor === "string") return parseNumeroColombiano(valor)
  return null
}

function enteroDe(valor: Celda["valor"] | undefined): number | null {
  const dec = decimalDe(valor)
  if (dec === null || !RE_ENTERO.test(dec)) return null
  return Number(dec)
}

/** Canonical two-decimal string of a validated amount. */
function decimal2(valor: Celda["valor"] | undefined): string {
  const dec = decimalDe(valor)
  return dec === null ? fromCents(ZERO) : fromCents(toCents(dec))
}

function tokens(valor: Celda["valor"] | undefined): string[] {
  const bruto = valor === null || valor === undefined || valor instanceof Date ? "" : String(valor)
  return bruto
    .split(";")
    .map((token) => token.trim())
    .filter((token) => token !== "")
}

/**
 * Builds the import plan from a validated template. The first resolved strategic
 * line is the principal; empty `Peso` means the default duration (DP-08).
 */
export function construirPlan(p: ParsedTemplate, c: ContextoValidacion): PlanImportacion {
  const fechaInicio = parseFechaCelda(p.proyecto.fechaInicio.valor)
  const fechaFin = parseFechaCelda(p.proyecto.fechaFin.valor)
  if (!fechaInicio || !fechaFin) throw new Error("La plantilla no tiene fechas de proyecto válidas.")

  const valorTotal = decimalDe(p.proyecto.valorTotal.valor)
  const beneficiariosMeta = enteroDe(p.proyecto.metaBeneficiarios.valor)
  if (valorTotal === null || beneficiariosMeta === null) {
    throw new Error("La plantilla no tiene valor total o meta de beneficiarios válidos.")
  }

  const lineas: { id: string; principal: boolean }[] = []
  const idsLineas = new Set<string>()
  for (const token of tokens(p.proyecto.lineas.valor)) {
    const resuelta = resolverLineaToken(token, c)
    if (resuelta && !idsLineas.has(resuelta.id)) {
      idsLineas.add(resuelta.id)
      lineas.push({ id: resuelta.id, principal: lineas.length === 0 })
    }
  }

  const municipioIds: string[] = []
  const idsMunicipios = new Set<string>()
  for (const token of tokens(p.proyecto.municipios.valor)) {
    const resuelto = resolverMunicipioToken(token, c)
    if (resuelto && !idsMunicipios.has(resuelto.id)) {
      idsMunicipios.add(resuelto.id)
      municipioIds.push(resuelto.id)
    }
  }

  const usuarios = new Map(c.usuarios.map((usuario) => [usuario.email.trim().toLowerCase(), usuario.id]))

  const objetivos = p.objetivos.map((fila, indice) => ({
    codigo: texto(fila, "Código"),
    descripcion: texto(fila, "Descripción"),
    orden: indice + 1,
  }))

  const actividades = p.actividades.map((fila) => {
    const semanaInicio = enteroDe(fila.celdas["Semana inicio"]?.valor) ?? 0
    const semanaFin = enteroDe(fila.celdas["Semana fin"]?.valor) ?? 0
    // AJ-02: no weight is read from the sheet — it is always the duration in weeks.
    const email = texto(fila, "Responsable (correo)").toLowerCase()
    return {
      codigo: texto(fila, "Código"),
      objetivoCodigo: texto(fila, "Código objetivo"),
      nombre: texto(fila, "Nombre"),
      semanaInicio,
      semanaFin,
      responsableId: email === "" ? null : usuarios.get(email) ?? null,
    }
  })

  const entregables = p.entregables.map((fila) => ({
    codigo: texto(fila, "Código"),
    actividadCodigo: texto(fila, "Código actividad"),
    descripcion: texto(fila, "Descripción"),
    cantidadMeta: decimal2(fila.celdas["Cantidad"]?.valor),
    unidad: texto(fila, "Unidad"),
    tipoMedio: texto(fila, "Tipo de medio exigido"),
  }))

  const indicadores = p.indicadores.map((fila) => {
    const tieneLineaBase = texto(fila, "Línea base") !== ""
    return {
      codigo: texto(fila, "Código"),
      objetivoCodigo: texto(fila, "Código objetivo"),
      nombre: texto(fila, "Nombre"),
      meta: decimal2(fila.celdas["Meta"]?.valor),
      unidad: texto(fila, "Unidad"),
      lineaBase: tieneLineaBase ? decimal2(fila.celdas["Línea base"]?.valor) : null,
    }
  })

  const asignadoPorRubro = new Map<string, Cents>()
  for (const fila of p.presupuesto) {
    const codigo = texto(fila, "Código rubro")
    if (codigo === "") continue
    asignadoPorRubro.set(codigo, toCents(decimalDe(fila.celdas["Valor asignado"]?.valor) ?? "0"))
  }
  const presupuesto = c.rubros
    .filter((rubro) => rubro.activo)
    .map((rubro) => ({ rubroCodigo: rubro.codigo, cents: asignadoPorRubro.get(rubro.codigo) ?? ZERO }))

  const programacion: { rubroCodigo: string; periodo: Periodo; cents: Cents }[] = []
  for (const fila of p.programacion.filas) {
    const codigo = texto(fila, "Código rubro")
    if (codigo === "") continue
    for (const mes of p.programacion.meses) {
      if (mes.periodo === null) continue
      const dec = decimalDe(fila.celdas[mes.encabezado]?.valor)
      if (dec === null) continue
      const cents = toCents(dec)
      if (cents > ZERO) programacion.push({ rubroCodigo: codigo, periodo: mes.periodo, cents })
    }
  }

  // A funded budget is the value the project tracks (W-02, PO feedback 2026-10-23);
  // an empty one keeps the template total.
  const sumaPresupuesto = sumCents(presupuesto.map((linea) => linea.cents))

  return {
    proyecto: {
      fechaInicio,
      fechaFin,
      valorTotalCents: sumaPresupuesto > ZERO ? sumaPresupuesto : toCents(valorTotal),
      beneficiariosMeta,
      lineas,
      municipioIds,
    },
    objetivos,
    actividades,
    entregables,
    indicadores,
    presupuesto,
    programacion,
  }
}
