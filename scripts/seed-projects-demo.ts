/**
 * WHY: the Projects demo (Proyectos list, Tablero, semáforos, Versiones/Modificaciones,
 * "Aprobar línea base" and "Convertir en proyecto") needs realistic data without a long
 * manual walkthrough. This is a LOCAL-ONLY, idempotent tool, not a feature. It builds:
 *
 *   - Project A "Demo CedeTextil · Ruta de fortalecimiento": created from a won opportunity, with the
 *     CedeTextil structure + budget + monthly programming imported, left in BORRADOR so
 *     "Aprobar línea base" can be shown live.
 *   - Project B "Demo CedeTextil · En ejecución": same workbook, baseline approved through
 *     the real writer (version 0 frozen), then avances (some with https support links),
 *     indicator measurements and gastos with https soportes (REGISTRADO, VALIDADO and one
 *     overspend case whose validation is blocked and notified).
 *   - At least ONE GANADA opportunity without project, left for the live conversion. If
 *     fewer than three would be free, ONE extra fictitious GANADA opportunity is added.
 *
 * Every write goes through the same server-side helpers the API routes use
 * (`importarPlantilla`, `aprobarLineaBase`, `validarEnTransaccion`, `logChange(s)`,
 * `nextProjectCode`, `addProyectoMiembros`, `validarSoporte`, the gasto/avance guards), so
 * audit lotes, version 0, derived fields and the DB triggers stay correct. The routes keep
 * their transaction bodies inline and need a Supabase session (cookies), which a script
 * cannot have: those bodies (project creation from an opportunity, avance, medio,
 * medición, gasto registration) are mirrored here call for call, minus the session gates.
 *
 * Idempotent (D3): when a project named "Demo CedeTextil ..." already exists the run
 * changes nothing and says so. NOTE: the result contains an approved project, whose rows
 * live in append-only tables, so `db:demo:reset:local` can NOT delete it. To restore the
 * demo run `npm run db:migrate:reset:local` and then `npm run db:seed:local` (this wipes
 * the local database; it is documented, never run by this script).
 *
 *   npm run db:demo:seed-projects:local                # dry run (default)
 *   npm run db:demo:seed-projects:local -- --apply
 *
 * The `require-local-db` guard MUST be the first import: it loads `.env.local` and refuses
 * a non-loopback database before `@/lib/db` builds a Prisma client.
 */
import "../prisma/require-local-db"

import { randomUUID } from "node:crypto"

import { Prisma } from "@prisma/client"

import { NonLocalDatabaseError, connectionTarget, isLocalTarget } from "../prisma/local-env"
import { logChange, logChanges } from "../src/lib/api/audit-cambios"
import { toDecimal2 } from "../src/lib/api/estructura"
import {
  GASTO_INCLUDE,
  clavesNormalizadas,
  gastoAuditable,
  resolverLinea,
  resolverPeriodo,
  superaAsignado,
} from "../src/lib/api/gastos"
import { cargarContexto, importarPlantilla, resumenDePlan } from "../src/lib/api/plantilla-import"
import { decimalFromCents } from "../src/lib/api/presupuesto"
import { nextProjectCode } from "../src/lib/api/project-code"
import { PROJECT_SELECT_V2, addProyectoMiembros, normalizeProjectDate } from "../src/lib/api/projects"
import { validarSoporte, type SoporteDatos } from "../src/lib/api/soportes"
import { validarEnTransaccion } from "../src/lib/api/validacion-gastos"
import { aprobarLineaBase } from "../src/lib/api/versiones"
import { db } from "../src/lib/db"
import { toCents } from "../src/lib/proyectos/money"
import { diferenciaValor, miembrosInicialesProyecto } from "../src/lib/proyectos/proyecto-general"
import {
  F_X1_INICIO,
  F_X1_PERIODOS,
  F_X1_PRESUPUESTO,
  fixtureF_X1,
} from "../src/lib/proyectos/__fixtures__/plantilla-cedetextil"
import { generarPlantilla, type PlantillaInput } from "../src/lib/proyectos/plantilla/generate"
import { construirPlan } from "../src/lib/proyectos/plantilla/mapear"
import { parsePlantilla } from "../src/lib/proyectos/plantilla/parse"
import { validarPlantilla } from "../src/lib/proyectos/plantilla/validate"
import { todayInBogota } from "../src/lib/proyectos/weeks"
import { elegirLineas, elegirMunicipios, entradaDemo } from "./import-plantilla-demo"

// ---------------------------------------------------------------------------
// Pure part: modes, guard, idempotency, extra-opportunity rule, demo data
// ---------------------------------------------------------------------------

export type SeedMode = "dry-run" | "apply" | "help"

export type SeedClient = typeof db

/** Every demo project name starts with this prefix: it is the idempotency marker (D3). */
export const MARKER_PREFIX = "Demo CedeTextil"
export const NOMBRE_PROYECTO_A = `${MARKER_PREFIX} · Ruta de fortalecimiento`
/** Name project A had before it was neutralised: a database seeded then must still read as seeded. */
export const NOMBRE_PROYECTO_A_LEGADO = `${MARKER_PREFIX} · Borrador (aprobar línea base)`
export const NOMBRE_PROYECTO_B = `${MARKER_PREFIX} · En ejecución`
export const NOMBRE_EXTRA_GANADA = "Demo · Programa de formación técnica (ganada, lista para convertir)"
export const VALOR_EXTRA_GANADA = 95_000_000
/** Free GANADA opportunities that must remain available once the seed ends. */
export const MIN_GANADAS_LIBRES = 3

export const DEMO_EMAIL_DOMAIN = "demo.muttuhub.local"
const EMAIL_ADMIN = `admin@${DEMO_EMAIL_DOMAIN}`
const EMAIL_GERENCIA = `gerencia@${DEMO_EMAIL_DOMAIN}`
const EMAIL_COORDINADOR = `coordinador@${DEMO_EMAIL_DOMAIN}`

const USAGE = [
  "Usage:",
  "  npm run db:demo:seed-projects:local                # dry run (default)",
  "  npm run db:demo:seed-projects:local -- --apply     # writes the demo projects",
  "Local database only. Idempotent: a second run changes nothing.",
]

export function parseSeedArgs(argv: readonly string[]): SeedMode {
  if (argv.includes("--help")) return "help"
  for (const arg of argv) {
    if (arg !== "--apply") throw new Error(`Unknown argument "${arg}". Use --help.`)
  }
  return argv.includes("--apply") ? "apply" : "dry-run"
}

/** Loopback only; `require-local-db` already refused at import time, this is the second line. */
export function assertLocalTarget(url: string | undefined | null): void {
  if (!isLocalTarget(url)) {
    throw new NonLocalDatabaseError(`Refusing to run: DATABASE_URL points to "", not to a loopback database.`)
  }
}

export type SeedDecision = "seed" | "already-seeded" | "partial"

/**
 * Decides from the names of the existing demo projects (those starting with MARKER_PREFIX):
 * none -> "seed"; both seeded projects (A, under its current or legacy name, and B) -> "already-seeded";
 * anything in between -> "partial" (a previous run failed midway), which must not be written over.
 */
export function decideSeed(nombres: readonly string[]): SeedDecision {
  if (nombres.length === 0) return "seed"
  const tieneA = nombres.includes(NOMBRE_PROYECTO_A) || nombres.includes(NOMBRE_PROYECTO_A_LEGADO)
  const completo = tieneA && nombres.includes(NOMBRE_PROYECTO_B)
  return completo ? "already-seeded" : "partial"
}

export const PARTIAL_SEED_MESSAGE =
  `A previous demo seed run was incomplete: some "${MARKER_PREFIX} ..." project exists but not both. ` +
  "Nothing was changed. The approved project cannot be removed by db:demo:reset:local (append-only triggers); " +
  "restore the local database with `npm run db:migrate:reset:local` and then `npm run db:seed:local` " +
  "(this wipes the whole local database)."

export function extraGanadaNeeded(libres: number): boolean {
  return libres < MIN_GANADAS_LIBRES
}

export type SeedMedio = { nombre: string; url: string }

export type SeedAvance = {
  entregable: string
  fecha: string
  cantidad: string
  observacion: string
  medios: SeedMedio[]
}

export type SeedMedicion = { indicador: string; fecha: string; valor: string; observacion: string }

/** REGISTRAR: stays REGISTRADO. VALIDAR: validated by Gerencia. INTENTAR_VALIDAR: blocked overspend. */
export type SeedGastoAccion = "REGISTRAR" | "VALIDAR" | "INTENTAR_VALIDAR"

export type SeedGasto = {
  rubro: string
  fechaDocumento: string
  periodo: string
  tipoSoporte: "FACTURA_PROVEEDOR" | "CUENTA_COBRO_PERSONA_NATURAL" | "OTRO"
  terceroNombre: string
  terceroTipoId: "NIT" | "CC" | "CE"
  terceroNumeroId: string
  numeroDocumento: string
  descripcion: string
  valor: string
  soportes: SeedMedio[]
  accion: SeedGastoAccion
}

export type SeedData = {
  nombreA: string
  nombreB: string
  avances: SeedAvance[]
  mediciones: SeedMedicion[]
  gastos: SeedGasto[]
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Yesterday, but never before the project start and never after today. */
function ayerAcotado(hoy: string): string {
  const ayer = addDays(hoy, -1)
  const desdeInicio = ayer < F_X1_INICIO ? F_X1_INICIO : ayer
  return desdeInicio > hoy ? hoy : desdeInicio
}

const URL_BASE = "https://demo.muttuhub.example/soportes"

/**
 * Deliverables of the shared F-X1 workbook that do not belong to the activity that holds them
 * (a "Mapa de unidades productivas" under the training activity, an "Estatuto" under the technical
 * support, a "RUT" under the delivery of equipment). The demo rewrites only their text so each reads
 * as part of its activity; codes, quantities and counts stay, so the avances and the structure keep
 * matching the workbook.
 */
export const ENTREGABLES_DEMO: Readonly<Record<string, { descripcion: string; unidad: string }>> = {
  "1.2-E1": { descripcion: "Informe de la formación en confección", unidad: "Informe" },
  "1.3-E2": { descripcion: "Plan de mejora de la unidad productiva", unidad: "Plan" },
  "1.4-E2": { descripcion: "Acta de entrega de dotación", unidad: "Acta" },
}

/** The F-X1 input with the demo wording of {@link ENTREGABLES_DEMO} applied. */
export function aplicarContenidoDemo(entrada: PlantillaInput): PlantillaInput {
  return {
    ...entrada,
    estructura: {
      ...entrada.estructura,
      entregables: entrada.estructura.entregables.map((entregable) => {
        const ajuste = ENTREGABLES_DEMO[entregable.codigo]
        return ajuste ? { ...entregable, ...ajuste } : entregable
      }),
    },
  }
}

/** All illustrative: fictitious third parties, `.example` links, round figures. */
export function buildSeedData(hoy: string): SeedData {
  const ayer = ayerAcotado(hoy)
  const periodo = F_X1_PERIODOS[0]
  const soporte = (nombre: string, ruta: string): SeedMedio => ({ nombre, url: `${URL_BASE}/${ruta}` })

  const avances: SeedAvance[] = [
    {
      entregable: "1.1-E1",
      fecha: ayer,
      cantidad: "1",
      observacion: "Informe de caracterización entregado a la coordinación.",
      medios: [soporte("Informe de caracterización (PDF)", "informe-caracterizacion.pdf")],
    },
    {
      entregable: "1.1-E2",
      fecha: ayer,
      cantidad: "1",
      observacion: "Memoria de la jornada de caracterización.",
      medios: [soporte("Memoria de la jornada (PDF)", "memoria-jornada.pdf")],
    },
    {
      entregable: "1.2-E1",
      fecha: hoy,
      cantidad: "1",
      observacion: "Informe de la formación en confección entregado a la coordinación.",
      medios: [soporte("Informe de la formación (PDF)", "informe-formacion.pdf")],
    },
    {
      entregable: "1.3-E1",
      fecha: hoy,
      cantidad: "2",
      observacion: "Dos actas de acompañamiento técnico firmadas.",
      medios: [
        soporte("Acta de acompañamiento 1 (PDF)", "acta-acompanamiento-1.pdf"),
        soporte("Acta de acompañamiento 2 (PDF)", "acta-acompanamiento-2.pdf"),
      ],
    },
    {
      // No medio: it does not count toward the técnico semáforo yet (pending evidence).
      entregable: "1.4-E1",
      fecha: hoy,
      cantidad: "1",
      observacion: "Certificado emitido, pendiente de adjuntar el soporte.",
      medios: [],
    },
  ]

  const mediciones: SeedMedicion[] = [
    { indicador: "IND-01", fecha: ayer, valor: "4", observacion: "Primeras unidades fortalecidas." },
    { indicador: "IND-01", fecha: hoy, valor: "9", observacion: "Se suman cinco unidades en la jornada." },
    { indicador: "IND-02", fecha: hoy, valor: "12", observacion: "Personas formadas en la primera cohorte." },
  ]

  const base = {
    fechaDocumento: hoy,
    periodo,
    terceroTipoId: "NIT" as const,
  }
  const gastos: SeedGasto[] = [
    {
      ...base,
      rubro: "R01",
      tipoSoporte: "CUENTA_COBRO_PERSONA_NATURAL",
      terceroNombre: "Equipo técnico Textiles del Sinú (demo)",
      terceroTipoId: "CC",
      terceroNumeroId: "1000000001",
      numeroDocumento: "CC-0001",
      descripcion: "Honorarios del equipo técnico, primera quincena.",
      valor: "12000000",
      soportes: [soporte("Cuenta de cobro CC-0001", "cuenta-cobro-0001.pdf")],
      accion: "VALIDAR",
    },
    {
      ...base,
      rubro: "R04",
      tipoSoporte: "FACTURA_PROVEEDOR",
      terceroNombre: "Capacitaciones Costa Norte S.A.S. (demo)",
      terceroNumeroId: "900000001",
      numeroDocumento: "FV-1001",
      descripcion: "Jornada de formación en prácticas de confección.",
      valor: "8500000",
      soportes: [soporte("Factura FV-1001", "factura-fv-1001.pdf")],
      accion: "VALIDAR",
    },
    {
      ...base,
      rubro: "R08",
      tipoSoporte: "FACTURA_PROVEEDOR",
      terceroNombre: "Dotaciones del Caribe S.A.S. (demo)",
      terceroNumeroId: "900000002",
      numeroDocumento: "FV-2040",
      descripcion: "Anticipo de dotación de máquinas y herramientas.",
      valor: "11250000",
      soportes: [soporte("Factura FV-2040", "factura-fv-2040.pdf")],
      accion: "REGISTRAR",
    },
    {
      ...base,
      rubro: "R06",
      tipoSoporte: "FACTURA_PROVEEDOR",
      terceroNombre: "Logística Sinú S.A.S. (demo)",
      terceroNumeroId: "900000003",
      numeroDocumento: "FV-3002",
      descripcion: "Transporte de participantes a la jornada.",
      valor: "450000",
      soportes: [soporte("Factura FV-3002", "factura-fv-3002.pdf")],
      accion: "REGISTRAR",
    },
    {
      // R11 is assigned 300.000: validating 450.000 would exceed it, so the writer blocks it,
      // flags the gasto and notifies Gerencia (the sobreejecución case).
      ...base,
      rubro: "R11",
      tipoSoporte: "FACTURA_PROVEEDOR",
      terceroNombre: "Papelería y Suministros del Sinú (demo)",
      terceroNumeroId: "900000004",
      numeroDocumento: "FV-4007",
      descripcion: "Material de oficina para las jornadas, por encima del rubro.",
      valor: "450000",
      soportes: [soporte("Factura FV-4007", "factura-fv-4007.pdf")],
      accion: "INTENTAR_VALIDAR",
    },
  ]

  return { nombreA: NOMBRE_PROYECTO_A, nombreB: NOMBRE_PROYECTO_B, avances, mediciones, gastos }
}

/** Every inconsistency of the data against the F-X1 workbook (empty = consistent). */
export function checkSeedData(data: SeedData, hoy?: string): string[] {
  const problemas: string[] = []
  const { estructura } = fixtureF_X1("valido")
  const metas = new Map(estructura.entregables.map((e) => [e.codigo, Number(e.cantidad)]))
  const indicadores = new Set(estructura.indicadores.map((i) => i.codigo))

  const acumulado = new Map<string, number>()
  for (const a of data.avances) {
    if (!metas.has(a.entregable)) problemas.push(`avance on unknown entregable ${a.entregable}`)
    if (hoy && a.fecha > hoy) problemas.push(`avance ${a.entregable} dated after today (${a.fecha})`)
    acumulado.set(a.entregable, (acumulado.get(a.entregable) ?? 0) + Number(a.cantidad))
    for (const m of a.medios) if (!m.url.startsWith("https://")) problemas.push(`medio "${m.nombre}" is not https`)
  }
  for (const [codigo, total] of acumulado) {
    if (total > (metas.get(codigo) ?? 0)) problemas.push(`avances of ${codigo} exceed its goal`)
  }
  for (const m of data.mediciones) {
    if (!indicadores.has(m.indicador)) problemas.push(`medición on unknown indicator ${m.indicador}`)
    if (hoy && m.fecha > hoy) problemas.push(`medición ${m.indicador} dated after today (${m.fecha})`)
  }

  const validado = new Map<string, bigint>()
  for (const g of data.gastos) {
    const asignado = F_X1_PRESUPUESTO[g.rubro]
    if (asignado === undefined) problemas.push(`gasto on unfunded rubro ${g.rubro}`)
    if (!(F_X1_PERIODOS as readonly string[]).includes(g.periodo)) problemas.push(`gasto period ${g.periodo} is outside the project`)
    if (hoy && g.fechaDocumento > hoy) problemas.push(`gasto ${g.numeroDocumento} dated after today (${g.fechaDocumento})`)
    if (g.soportes.length === 0) problemas.push(`gasto ${g.numeroDocumento} has no soporte`)
    for (const s of g.soportes) if (!s.url.startsWith("https://")) problemas.push(`soporte "${s.nombre}" is not https`)
    if (g.accion === "VALIDAR") validado.set(g.rubro, (validado.get(g.rubro) ?? BigInt(0)) + toCents(g.valor))
    if (g.accion === "INTENTAR_VALIDAR" && asignado !== undefined && toCents(g.valor) <= toCents(asignado)) {
      problemas.push(`gasto ${g.numeroDocumento} does not exceed its rubro: it is not an overspend case`)
    }
  }
  for (const [rubro, total] of validado) {
    if (total > toCents(F_X1_PRESUPUESTO[rubro] ?? "0")) problemas.push(`validated gastos exceed rubro ${rubro}`)
  }
  if (data.gastos.filter((g) => g.accion === "INTENTAR_VALIDAR").length !== 1) {
    problemas.push("the seed needs exactly one overspend gasto")
  }
  if (!data.gastos.some((g) => g.accion === "VALIDAR") || !data.gastos.some((g) => g.accion === "REGISTRAR")) {
    problemas.push("the seed needs both VALIDADO and REGISTRADO gastos")
  }
  return problemas
}

// ---------------------------------------------------------------------------
// Orchestration (dry run / idempotency); the writer is injected for tests
// ---------------------------------------------------------------------------

type Printer = (line: string) => void

export type SeedWriter = (client: SeedClient, data: SeedData, hoy: string) => Promise<{ lines: string[] }>

export type SeedRunResult = { mode: SeedMode | "already-seeded" }

export async function runSeedProjectsDemo(
  client: SeedClient,
  argv: readonly string[] = process.argv.slice(2),
  print: Printer = (line) => console.log(line),
  writer: SeedWriter = applySeed,
  hoy: string = todayInBogota(),
): Promise<SeedRunResult> {
  const mode = parseSeedArgs(argv)
  if (mode === "help") {
    for (const line of USAGE) print(line)
    return { mode }
  }

  assertLocalTarget(process.env.DATABASE_URL)
  const host = connectionTarget(process.env.DATABASE_URL) ?? "unknown"
  print(`${mode === "apply" ? "Projects demo seed — apply" : "Projects demo seed — dry run (no writes)"}  (db host: ${host})`)

  const data = buildSeedData(hoy)
  const problemas = checkSeedData(data, hoy)
  if (problemas.length > 0) throw new Error(`The seed data is inconsistent: ${problemas.join("; ")}`)

  const existentes = await client.proyecto.findMany({
    where: { nombre: { startsWith: MARKER_PREFIX } },
    select: { nombre: true },
  })
  const decision = decideSeed(existentes.map((p) => p.nombre))
  if (decision === "partial") throw new Error(PARTIAL_SEED_MESSAGE)
  if (decision === "already-seeded") {
    print(`Demo projects already seeded (${existentes.length} project(s) named "${MARKER_PREFIX} ..."). Nothing was changed.`)
    return { mode: "already-seeded" }
  }

  const libres = await client.oportunidad.count({ where: { estado: "GANADA", deleted_at: null, proyecto: { is: null } } })
  const extra = extraGanadaNeeded(libres)
  print(`Free GANADA opportunities: ${libres}`)
  print(`Creates: "${data.nombreA}" (BORRADOR, structure + budget + programming imported)`)
  print(
    `Creates: "${data.nombreB}" (EN_EJECUCION via baseline approval, v0): ${data.avances.length} avances, ` +
      `${data.mediciones.length} mediciones, ${data.gastos.length} gastos (1 overspend case)`,
  )
  print(
    extra
      ? `Adds ONE extra GANADA opportunity "${NOMBRE_EXTRA_GANADA}" so ${MIN_GANADAS_LIBRES - 2} stay free for the live conversion.`
      : `No extra GANADA opportunity needed: ${libres - 2} stay free for the live conversion.`,
  )

  if (mode === "dry-run") {
    print("Dry run: nothing was written. Re-run with --apply to write.")
    return { mode }
  }

  const { lines } = await writer(client, data, hoy)
  for (const line of lines) print(line)
  return { mode }
}

// ---------------------------------------------------------------------------
// Writer (real database): mirrors the route transaction bodies, see the header
// ---------------------------------------------------------------------------

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 }

type Actores = { admin: string; gerencia: string; coordinador: string; coordinadorEmail: string }

async function cargarActores(client: SeedClient): Promise<Actores> {
  const ids: Record<string, string> = {}
  for (const email of [EMAIL_ADMIN, EMAIL_GERENCIA, EMAIL_COORDINADOR]) {
    const usuario = await client.usuario.findFirst({ where: { email, activo: true }, select: { id: true } })
    if (!usuario) throw new Error(`Demo user ${email} not found: run "npm run db:seed:local" first.`)
    ids[email] = usuario.id
  }
  return {
    admin: ids[EMAIL_ADMIN],
    gerencia: ids[EMAIL_GERENCIA],
    coordinador: ids[EMAIL_COORDINADOR],
    coordinadorEmail: EMAIL_COORDINADOR,
  }
}

type OportunidadLibre = { id: string; nombre: string; cliente_id: string; valor_estimado_cop: Prisma.Decimal | null; fecha_adjudicacion: Date | null; fase: string }

/** Mirrors POST /clients/:id/opportunities/:opportunityId/project (one transaction, shared lote). */
async function crearProyectoDesdeOportunidad(
  client: SeedClient,
  oportunidad: OportunidadLibre,
  input: { nombre: string; actor: string; responsable: string },
): Promise<{ id: string; codigo: string }> {
  const contexto = await cargarContextoCatalogo(client)
  const lineas = elegirLineas(contexto)
  const municipios = elegirMunicipios(contexto)
  const fixture = fixtureF_X1("valido")
  const inicio = normalizeProjectDate(fixture.proyecto.fechaInicio)
  const fin = normalizeProjectDate(fixture.proyecto.fechaFin)
  const year = new Date().getUTCFullYear()
  const equipo = miembrosInicialesProyecto(input.responsable, [])

  return client.$transaction(async (tx) => {
    await tx.oportunidad.update({
      where: { id: oportunidad.id },
      data: {
        fase: "EJECUCION",
        ...(oportunidad.fecha_adjudicacion === null ? { fecha_adjudicacion: new Date() } : {}),
      },
    })
    const codigo = await nextProjectCode(tx, year)
    const created = await tx.proyecto.create({
      data: {
        codigo,
        nombre: input.nombre,
        cliente_id: oportunidad.cliente_id,
        oportunidad_id: oportunidad.id,
        responsable_id: input.responsable,
        origen: "OPORTUNIDAD",
        fecha_inicio: inicio,
        fecha_fin: fin,
        valor_total: oportunidad.valor_estimado_cop,
        diferencia_valor_oportunidad: diferenciaValor(oportunidad.valor_estimado_cop, oportunidad.valor_estimado_cop),
        beneficiarios_meta: fixture.proyecto.beneficiariosMeta,
        lineas: { create: lineas.map((linea, i) => ({ linea_id: linea.id, principal: i === 0 })) },
        municipios: { create: municipios.map((m) => ({ municipio_id: m.id })) },
      },
      select: PROJECT_SELECT_V2,
    })
    await logChanges(tx, [
      {
        usuario_id: input.actor,
        accion: "CONVERTIR",
        entidad: "oportunidad",
        entidad_id: oportunidad.id,
        proyecto_id: created.id,
        valor_anterior: { fase: oportunidad.fase, fecha_adjudicacion: oportunidad.fecha_adjudicacion },
        valor_nuevo: { fase: "EJECUCION" },
      },
      {
        usuario_id: input.actor,
        accion: "CREAR",
        entidad: "proyecto",
        entidad_id: created.id,
        proyecto_id: created.id,
        valor_nuevo: { codigo, nombre: input.nombre, cliente_id: oportunidad.cliente_id, origen: "OPORTUNIDAD" },
      },
    ])
    await addProyectoMiembros(tx, { proyectoId: created.id, usuarioIds: equipo, agregadoPorId: input.actor })
    return { id: created.id, codigo }
  }, TX_OPTIONS)
}

async function cargarContextoCatalogo(client: SeedClient) {
  // The catalog part of the context does not depend on a project; any live id works,
  // but a fresh project does not exist yet, so read the catalogs directly.
  const [rubros, lineas, municipios, usuarios] = await Promise.all([
    client.rubro.findMany({ where: { codigo: { not: null } }, select: { codigo: true, activo: true } }),
    client.lineaEstrategicaCatalogo.findMany({ select: { id: true, codigo: true, nombre: true, activo: true } }),
    client.municipio.findMany({
      select: { id: true, nombre: true, departamento: true, codigo_dane: true, activo: true },
    }),
    client.usuario.findMany({ where: { activo: true }, select: { id: true, email: true } }),
  ])
  return {
    proyecto: { codigo: "", estado: "BORRADOR" },
    rubros: rubros.map((r) => ({ codigo: r.codigo as string, activo: r.activo })),
    lineas,
    municipios: municipios.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      departamento: m.departamento,
      codigoDane: m.codigo_dane,
      activo: m.activo,
    })),
    usuarios,
  }
}

/** Generates the valid CedeTextil workbook for the project and imports it (E-24 writer). */
async function importarCedeTextil(
  client: SeedClient,
  proyecto: { id: string; codigo: string },
  actor: string,
  responsableEmail: string,
): Promise<string> {
  const contexto = await cargarContexto(client, proyecto.id)
  const buffer = await generarPlantilla(
    aplicarContenidoDemo(entradaDemo("valido", proyecto.codigo, contexto, responsableEmail)),
  )
  const parsed = await parsePlantilla(buffer)
  const resultado = validarPlantilla(parsed, contexto)
  if (resultado.errores.length > 0) {
    throw new Error(`The workbook failed validation (${resultado.errores.map((e) => e.regla).join(", ")}).`)
  }
  const plan = construirPlan(parsed, contexto)
  const loteId = randomUUID()
  await client.$transaction((tx) => importarPlantilla(tx, { proyectoId: proyecto.id, usuarioId: actor, plan, loteId }), TX_OPTIONS)
  const r = resumenDePlan(plan)
  return `${r.actividades} actividades, ${r.entregables} entregables, ${r.indicadores} indicadores, ${r.rubros} rubros, ${r.celdas_programacion} celdas`
}

/** Mirrors POST .../deliverables/:id/progress and POST .../progress/:id/attachments (links only). */
async function registrarAvance(client: SeedClient, proyectoId: string, actor: string, a: SeedAvance): Promise<void> {
  const entregable = await client.entregable.findFirst({
    where: { proyecto_id: proyectoId, codigo: a.entregable, deleted_at: null },
    select: { id: true, cantidad_meta: true },
  })
  if (!entregable) throw new Error(`Entregable ${a.entregable} not found in the project.`)
  const cantidad = toDecimal2(Number(a.cantidad))

  const avanceId = await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "entregables" WHERE "id" = ${entregable.id} FOR UPDATE`
    const { _sum } = await tx.avanceEntregable.aggregate({
      where: { entregable_id: entregable.id, anulado_at: null },
      _sum: { cantidad: true },
    })
    const acumulado = _sum.cantidad ?? toDecimal2(0)
    if (acumulado.plus(cantidad).greaterThan(entregable.cantidad_meta)) {
      throw new Error(`Avance on ${a.entregable} would exceed its goal.`)
    }
    const created = await tx.avanceEntregable.create({
      data: {
        proyecto_id: proyectoId,
        entregable_id: entregable.id,
        fecha: new Date(`${a.fecha}T00:00:00.000Z`),
        cantidad,
        observacion: a.observacion,
        justificacion_exceso: null,
        registrado_por_id: actor,
      },
    })
    await logChange(tx, {
      usuario_id: actor,
      accion: "CREAR",
      entidad: "avance",
      entidad_id: created.id,
      proyecto_id: proyectoId,
      valor_nuevo: {
        entregable_id: created.entregable_id,
        fecha: a.fecha,
        cantidad: created.cantidad,
        observacion: created.observacion,
        justificacion_exceso: created.justificacion_exceso,
      },
    })
    return created.id
  }, TX_OPTIONS)

  for (const medio of a.medios) {
    const soporte = await validarSoporte(proyectoId, { url_externa: medio.url, nombre: medio.nombre })
    if (!soporte.ok) throw new Error(`Medio "${medio.nombre}" was refused: ${await soporte.response.text()}`)
    await client.$transaction(async (tx) => {
      const created = await tx.soporteProyecto.create({
        data: { proyecto_id: proyectoId, avance_id: avanceId, subido_por_id: actor, ...soporte.value },
      })
      await logChange(tx, {
        usuario_id: actor,
        accion: "CREAR",
        entidad: "avance",
        entidad_id: avanceId,
        proyecto_id: proyectoId,
        campo: "medio",
        valor_nuevo: {
          medio_id: created.id,
          nombre: created.nombre,
          tipo: "enlace",
          url_externa: created.url_externa,
          tamano_bytes: created.tamano_bytes,
        },
      })
    }, TX_OPTIONS)
  }
}

/** Mirrors POST .../indicators/:id/measurements. */
async function registrarMedicion(client: SeedClient, proyectoId: string, actor: string, m: SeedMedicion): Promise<void> {
  const indicador = await client.indicador.findFirst({
    where: { proyecto_id: proyectoId, codigo: m.indicador, deleted_at: null },
    select: { id: true },
  })
  if (!indicador) throw new Error(`Indicator ${m.indicador} not found in the project.`)
  await client.$transaction(async (tx) => {
    const created = await tx.medicionIndicador.create({
      data: {
        proyecto_id: proyectoId,
        indicador_id: indicador.id,
        fecha: new Date(`${m.fecha}T00:00:00.000Z`),
        valor: toDecimal2(Number(m.valor)),
        observacion: m.observacion,
        registrado_por_id: actor,
      },
    })
    await logChange(tx, {
      usuario_id: actor,
      accion: "CREAR",
      entidad: "medicion",
      entidad_id: created.id,
      proyecto_id: proyectoId,
      valor_nuevo: { indicador_id: indicador.id, fecha: m.fecha, valor: created.valor, observacion: created.observacion },
    })
  }, TX_OPTIONS)
}

/** Mirrors POST .../expenses, then POST .../expenses/:id/validate for VALIDAR / INTENTAR_VALIDAR. */
async function registrarGasto(
  client: SeedClient,
  proyecto: { id: string; estado: string; fecha_inicio: Date | null; fecha_fin: Date | null },
  actores: Actores,
  g: SeedGasto,
): Promise<"REGISTRADO" | "VALIDADO" | "BLOQUEADO"> {
  const rubro = await client.rubro.findFirst({ where: { codigo: g.rubro }, select: { id: true } })
  if (!rubro) throw new Error(`Rubro ${g.rubro} not found.`)
  const linea = await resolverLinea(proyecto.id, rubro.id)
  if (!linea.ok) throw new Error(`Rubro ${g.rubro} has no assigned amount in the project.`)
  const periodo = resolverPeriodo(proyecto, g.fechaDocumento, g.periodo)
  if (!periodo.ok) throw new Error(`Period ${g.periodo} is not a month of the project.`)

  const soportes: SoporteDatos[] = []
  for (const s of g.soportes) {
    const validado = await validarSoporte(proyecto.id, { url_externa: s.url, nombre: s.nombre })
    if (!validado.ok) throw new Error(`Soporte "${s.nombre}" was refused: ${await validado.response.text()}`)
    soportes.push(validado.value)
  }
  const cents = toCents(g.valor)
  const claves = clavesNormalizadas({
    tercero_tipo_id: g.terceroTipoId,
    tercero_numero_id: g.terceroNumeroId,
    numero_documento: g.numeroDocumento,
  })

  const gastoId = await client.$transaction(async (tx) => {
    const sobregasto = await superaAsignado(tx, linea.value, cents)
    const created = await tx.gasto.create({
      data: {
        proyecto_id: proyecto.id,
        linea_id: linea.value.id,
        fecha_documento: normalizeProjectDate(g.fechaDocumento),
        periodo: periodo.value,
        tipo_soporte: g.tipoSoporte,
        tercero_nombre: g.terceroNombre,
        tercero_tipo_id: g.terceroTipoId,
        tercero_numero_id: g.terceroNumeroId,
        ...claves,
        numero_documento: g.numeroDocumento,
        descripcion: g.descripcion,
        monto_cop: decimalFromCents(cents),
        subtotal_cop: decimalFromCents(cents),
        iva_cop: decimalFromCents(BigInt(0)),
        alerta_sobregasto: sobregasto,
        registrado_por_id: actores.coordinador,
      },
    })
    const creados: { id: string }[] = []
    for (const soporte of soportes) {
      creados.push(
        await tx.soporteProyecto.create({
          data: { proyecto_id: proyecto.id, gasto_id: created.id, subido_por_id: actores.coordinador, ...soporte },
        }),
      )
    }
    await logChange(tx, {
      usuario_id: actores.coordinador,
      accion: "CREAR",
      entidad: "gasto",
      entidad_id: created.id,
      proyecto_id: proyecto.id,
      valor_nuevo: {
        ...gastoAuditable({ ...created, rubro_id: linea.value.rubro.id }),
        estado: created.estado,
        soportes: creados.length,
      },
    })
    return created.id
  }, TX_OPTIONS)

  if (g.accion === "REGISTRAR") return "REGISTRADO"

  const gasto = await client.gasto.findFirstOrThrow({ where: { id: gastoId }, include: GASTO_INCLUDE })
  const resultado = await client.$transaction((tx) => validarEnTransaccion(tx, { gasto, validadorId: actores.gerencia }), TX_OPTIONS)
  if ("stale" in resultado) throw new Error(`Gasto ${g.numeroDocumento} changed while validating.`)
  if (g.accion === "VALIDAR") {
    if (resultado.blocked) throw new Error(`Gasto ${g.numeroDocumento} was unexpectedly blocked as overspend.`)
    return "VALIDADO"
  }
  if (!resultado.blocked) throw new Error(`Gasto ${g.numeroDocumento} was expected to be blocked as overspend.`)
  return "BLOQUEADO"
}

async function asegurarOportunidades(client: SeedClient): Promise<{ lista: OportunidadLibre[]; extra: boolean }> {
  const select = {
    id: true,
    nombre: true,
    cliente_id: true,
    valor_estimado_cop: true,
    fecha_adjudicacion: true,
    fase: true,
  } as const
  const where = { estado: "GANADA", deleted_at: null, proyecto: { is: null } } as const
  const libres = await client.oportunidad.findMany({ where, select, orderBy: [{ valor_estimado_cop: "desc" }, { nombre: "asc" }] })
  if (libres.length < 2) {
    throw new Error(`Need at least 2 free GANADA opportunities (found ${libres.length}): run "npm run db:seed:local" first.`)
  }
  if (!extraGanadaNeeded(libres.length)) return { lista: libres, extra: false }

  const yaExiste = await client.oportunidad.findFirst({ where: { nombre: NOMBRE_EXTRA_GANADA }, select: { id: true } })
  if (yaExiste) return { lista: libres, extra: false }
  await client.oportunidad.create({
    data: {
      cliente_id: libres[0].cliente_id,
      nombre: NOMBRE_EXTRA_GANADA,
      problema_detectado: "Demo: oportunidad ganada pendiente de convertir en proyecto.",
      solucion_propuesta: "Demo: acompañamiento técnico en formación para el trabajo.",
      valor_estimado_cop: VALOR_EXTRA_GANADA,
      estado: "GANADA",
      fecha_ultima_gestion: new Date(),
    },
  })
  return { lista: libres, extra: true }
}

export async function applySeed(client: SeedClient, data: SeedData, hoy: string): Promise<{ lines: string[] }> {
  void hoy
  const lines: string[] = []
  const actores = await cargarActores(client)
  const { lista, extra } = await asegurarOportunidades(client)
  // Highest value first: B takes the one closest to the workbook total, A the next; the rest stays free.
  const [oportunidadB, oportunidadA] = lista

  // Project B first and A last. The seed counts as complete only when BOTH exact names exist (see
  // decideSeed); if a run fails midway, the next run sees a partial state, writes nothing and exits non-zero.
  const b = await crearProyectoDesdeOportunidad(client, oportunidadB, {
    nombre: data.nombreB,
    actor: actores.admin,
    responsable: actores.coordinador,
  })
  const resumenB = await importarCedeTextil(client, b, actores.admin, actores.coordinadorEmail)
  const baseline = await client.$transaction((tx) => aprobarLineaBase(tx, { proyectoId: b.id, usuarioId: actores.admin }), TX_OPTIONS)
  lines.push(`  ${b.codigo} ${data.nombreB}: ${resumenB}; baseline approved (v${baseline.version.numero}, ${baseline.proyecto.estado})`)

  for (const avance of data.avances) await registrarAvance(client, b.id, actores.coordinador, avance)
  lines.push(`  ${b.codigo}: ${data.avances.length} avances (${data.avances.reduce((n, a) => n + a.medios.length, 0)} https medios)`)
  for (const medicion of data.mediciones) await registrarMedicion(client, b.id, actores.coordinador, medicion)
  lines.push(`  ${b.codigo}: ${data.mediciones.length} mediciones`)

  const proyectoB = await client.proyecto.findFirstOrThrow({
    where: { id: b.id },
    select: { id: true, estado: true, fecha_inicio: true, fecha_fin: true },
  })
  const conteo = { REGISTRADO: 0, VALIDADO: 0, BLOQUEADO: 0 }
  for (const gasto of data.gastos) conteo[await registrarGasto(client, proyectoB, actores, gasto)] += 1
  lines.push(
    `  ${b.codigo}: ${data.gastos.length} gastos (registered=${conteo.REGISTRADO}, validated=${conteo.VALIDADO}, overspend blocked=${conteo.BLOQUEADO})`,
  )

  const a = await crearProyectoDesdeOportunidad(client, oportunidadA, {
    nombre: data.nombreA,
    actor: actores.admin,
    responsable: actores.coordinador,
  })
  const resumenA = await importarCedeTextil(client, a, actores.admin, actores.coordinadorEmail)
  lines.push(`  ${a.codigo} ${data.nombreA}: ${resumenA}; left in BORRADOR`)

  lines.push(extra ? `  extra GANADA opportunity added: "${NOMBRE_EXTRA_GANADA}"` : "  no extra GANADA opportunity was needed")
  lines.push(
    "Done. The approved project cannot be removed by db:demo:reset:local; to restore the demo run " +
      "db:migrate:reset:local then db:seed:local (wipes the local database).",
  )
  return { lines }
}

async function main(): Promise<void> {
  await runSeedProjectsDemo(db)
}

// Only run when invoked as a script: a test imports this module and must not
// query a database as an import side effect.
const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/seed-projects-demo.ts")

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
