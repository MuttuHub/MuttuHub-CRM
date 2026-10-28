// Bench of the portfolio dashboard (S9 U4): seeds 50 `BENCH-` projects (20 activities x 3 deliverables,
// 30 validated expenses each), times the real read path (project query + batched KPI loader + aggregate)
// and prints min / p50 / p95 / max. LOCAL DATABASE ONLY: `./_guard` is the FIRST import and refuses any
// non-loopback target before the Prisma client exists. Everything it inserts is deleted in `finally`.
//
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/migrate-v2/bench-dashboard.ts
import "./_guard"

import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { db } from "@/lib/db"
import { loadKpisPortafolio } from "@/lib/api/kpis-portafolio"
import { kpisPortafolio } from "@/lib/proyectos/kpis"
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2"
import { describeTarget } from "./_guard"
import { summarize, verdict } from "./bench-stats"

const PROJECTS = 50
const ACTIVITIES = 20
const DELIVERABLES = 3
const EXPENSES = 30
const RUNS = 10
const CORTE = "2026-06-15"
const PREFIX = "BENCH-"
const MARKER = "bench-dashboard"

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const chunks = <T>(rows: T[], size = 2000): T[][] => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size))

async function cleanup() {
  const proyectos = { proyecto: { codigo: { startsWith: PREFIX } } }
  await db.soporteProyecto.deleteMany({ where: proyectos })
  await db.gasto.deleteMany({ where: proyectos })
  await db.programacionPeriodo.deleteMany({ where: proyectos })
  await db.lineaPresupuestal.deleteMany({ where: proyectos })
  await db.registroBeneficiario.deleteMany({ where: proyectos })
  await db.medicionIndicador.deleteMany({ where: proyectos })
  await db.indicador.deleteMany({ where: proyectos })
  await db.avanceEntregable.deleteMany({ where: proyectos })
  await db.entregable.deleteMany({ where: proyectos })
  await db.actividad.deleteMany({ where: proyectos })
  await db.objetivo.deleteMany({ where: proyectos })
  await db.proyecto.deleteMany({ where: { codigo: { startsWith: PREFIX } } })
  await db.rubro.deleteMany({ where: { codigo: { startsWith: PREFIX } } })
  await db.cliente.deleteMany({ where: { nombre: { startsWith: MARKER } } })
  await db.usuario.deleteMany({ where: { email: { startsWith: `${MARKER}-` } } })
}

async function seed() {
  const [registrador, validador] = await Promise.all(
    ["a", "b"].map((n) => db.usuario.create({ data: { email: `${MARKER}-${n}-${randomUUID()}@example.test`, nombre: MARKER } })),
  )
  const cliente = await db.cliente.create({ data: { nombre: `${MARKER}-cliente`, tipo_cliente: "OTRO", responsable_id: registrador.id } })
  const rubros = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) => db.rubro.create({ data: { codigo: `${PREFIX}R${n}-${randomUUID().slice(0, 6)}`, nombre: `${MARKER}-rubro-${n}` } })),
  )

  const rows = {
    proyectos: [] as object[], objetivos: [] as object[], actividades: [] as object[], entregables: [] as object[],
    avances: [] as object[], indicadores: [] as object[], mediciones: [] as object[], beneficiarios: [] as object[],
    lineas: [] as object[], programacion: [] as object[], gastos: [] as object[],
  }
  for (let p = 0; p < PROJECTS; p++) {
    const proyecto_id = randomUUID()
    rows.proyectos.push({
      id: proyecto_id, codigo: `${PREFIX}${String(p + 1).padStart(3, "0")}`, nombre: `${MARKER}-${p + 1}`, cliente_id: cliente.id,
      estado: "EN_EJECUCION", fecha_inicio: D("2026-01-05"), fecha_fin: D("2026-12-28"), valor_total: "600000000", beneficiarios_meta: 500,
    })
    const objetivo_id = randomUUID()
    rows.objetivos.push({ id: objetivo_id, proyecto_id, codigo: "1", descripcion: MARKER })
    for (let a = 0; a < ACTIVITIES; a++) {
      const actividad_id = randomUUID()
      rows.actividades.push({ id: actividad_id, proyecto_id, objetivo_id, codigo: `1.${a + 1}`, nombre: MARKER, semana_inicio: a + 1, semana_fin: a + 4, peso: "4", peso_manual: false })
      for (let e = 0; e < DELIVERABLES; e++) {
        const entregable_id = randomUUID()
        rows.entregables.push({ id: entregable_id, proyecto_id, actividad_id, codigo: `1.${a + 1}-E${e + 1}`, descripcion: MARKER, cantidad_meta: "10", unidad: "u", tipo_medio_exigido: "acta" })
        rows.avances.push({ id: randomUUID(), proyecto_id, entregable_id, fecha: D("2026-03-10"), cantidad: "6", registrado_por_id: registrador.id })
      }
    }
    for (let i = 0; i < 3; i++) {
      const indicador_id = randomUUID()
      rows.indicadores.push({ id: indicador_id, proyecto_id, objetivo_id, codigo: `I${i + 1}`, nombre: MARKER, meta: "100", unidad: "u" })
      rows.mediciones.push({ id: randomUUID(), proyecto_id, indicador_id, fecha: D("2026-04-01"), valor: "40", registrado_por_id: registrador.id })
    }
    for (let b = 0; b < 5; b++) rows.beneficiarios.push({ id: randomUUID(), proyecto_id, fecha: D("2026-03-01"), cantidad: 10, registrado_por_id: registrador.id })
    const lineas = rubros.map((rubro) => ({ id: randomUUID(), proyecto_id, rubro_id: rubro.id, monto_proyectado_cop: "100000000" }))
    rows.lineas.push(...lineas)
    for (const linea of lineas) {
      for (const mes of ["01", "02", "03", "04", "05", "06"]) rows.programacion.push({ id: randomUUID(), proyecto_id, linea_id: linea.id, periodo: `2026-${mes}`, valor: "10000000" })
    }
    for (let g = 0; g < EXPENSES; g++) {
      const linea = lineas[g % lineas.length]
      rows.gastos.push({
        id: randomUUID(), proyecto_id, linea_id: linea.id, fecha_documento: D("2026-03-15"), periodo: `2026-0${(g % 6) + 1}`,
        tipo_soporte: "FACTURA_PROVEEDOR", tercero_nombre: MARKER, tercero_tipo_id: "NIT", tercero_numero_id: "900123456",
        tercero_id_norm: "900123456", numero_documento: `FE-${g}`, numero_documento_norm: `FE${g}`, descripcion: MARKER,
        monto_cop: "1500000", subtotal_cop: "1500000", iva_cop: "0", estado: "VALIDADO", registrado_por_id: registrador.id, validado_por_id: validador.id, validado_at: new Date(),
      })
    }
  }
  const insert = async (rowsOf: object[], create: (data: never) => Promise<unknown>) => {
    for (const part of chunks(rowsOf)) await create(part as never)
  }
  await insert(rows.proyectos, (data) => db.proyecto.createMany({ data }))
  await insert(rows.objetivos, (data) => db.objetivo.createMany({ data }))
  await insert(rows.actividades, (data) => db.actividad.createMany({ data }))
  await insert(rows.entregables, (data) => db.entregable.createMany({ data }))
  await insert(rows.avances, (data) => db.avanceEntregable.createMany({ data }))
  await insert(rows.indicadores, (data) => db.indicador.createMany({ data }))
  await insert(rows.mediciones, (data) => db.medicionIndicador.createMany({ data }))
  await insert(rows.beneficiarios, (data) => db.registroBeneficiario.createMany({ data }))
  await insert(rows.lineas, (data) => db.lineaPresupuestal.createMany({ data }))
  await insert(rows.programacion, (data) => db.programacionPeriodo.createMany({ data }))
  await insert(rows.gastos, (data) => db.gasto.createMany({ data }))
  return Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]))
}

/** One dashboard read, the way `GET dashboard/portfolio` does it for a manager. */
async function dashboardRead() {
  const rows = await db.proyecto.findMany({
    where: { deleted_at: null, codigo: { startsWith: PREFIX } },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nombre: true, estado: true, fecha_inicio: true, fecha_fin: true, beneficiarios_meta: true, cliente: { select: { id: true, nombre: true } }, responsable: { select: { id: true, nombre: true } }, lineas: { select: { principal: true, linea: { select: { id: true, codigo: true, nombre: true } } } } },
  })
  const kpis = await loadKpisPortafolio({ proyectos: rows, corte: CORTE, parametros: PARAMETROS_V2_DEFAULT })
  return kpisPortafolio([...kpis.values()], CORTE)
}

async function main() {
  console.log(`bench-dashboard: target ${describeTarget()} (loopback only)`)
  await cleanup()
  try {
    const sembrado = await seed()
    console.log("seeded rows:", sembrado)
    const agregado = await dashboardRead() // warm-up
    const samples: number[] = []
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now()
      await dashboardRead()
      samples.push(performance.now() - t0)
    }
    const summary = summarize(samples)
    const result = verdict(summary)
    console.log(`projects=${PROJECTS} runs=${RUNS} (ms)`, summary)
    console.log(`p95 < 3000 ms: ${result.ok ? "PASS" : "FAIL"}; cache table (p95 > 1500 ms) warranted: ${result.cacheWarranted ? "YES" : "NO"}`)
    const out = join(process.cwd(), "scripts/migrate-v2/out")
    mkdirSync(out, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)
    writeFileSync(join(out, `bench-dashboard-${stamp}.json`), JSON.stringify({ target: describeTarget(), corte: CORTE, sembrado, summary, result, proyectos_medidos: agregado.tecnico.proyectos }, null, 2))
    process.exitCode = result.ok ? 0 : 1
  } finally {
    await cleanup()
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
