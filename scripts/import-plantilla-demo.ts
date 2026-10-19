/**
 * WHY: S7.7 pilot. The Excel template import is only proven when a real workbook
 * goes through the real catalogs. This is a LOCAL-ONLY manual-QA tool, not a
 * feature: it builds the synthetic F-X1 "CedeTextil" workbook (illustrative
 * figures) in its valid form and in a V-12-failing form (total off by $50.000),
 * validates both against the local catalogs, and with `--apply` writes both
 * files and imports the VALID one into an existing local BORRADOR project through
 * the same atomic writer the API uses. The failing file is for trying the error
 * table of the import dialog by hand.
 *
 *   npx tsx scripts/import-plantilla-demo.ts --project PRY-2026-007                          # dry run
 *   npx tsx scripts/import-plantilla-demo.ts --project PRY-2026-007 --actor me@x --apply
 *
 * The `require-local-db` guard MUST be the first import: it loads `.env.local`
 * and refuses a non-loopback database before `@/lib/db` builds a Prisma client,
 * exactly like `scripts/reset-demo.ts`. A dry run is the default and is fully
 * read-only (no database writes and no files); only `--apply` writes, and it
 * needs `--actor <email>` (an existing user) for the audit lote. The project must
 * already exist in BORRADOR: create it from the ficha first.
 */
import "../prisma/require-local-db"

import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { Prisma } from "@prisma/client"

import { connectionTarget } from "../prisma/local-env"
import { RUBROS_V2 } from "../src/lib/catalogs"
import {
  cargarContexto,
  importarPlantilla,
  resumenDePlan,
  type ResumenImportacion,
} from "../src/lib/api/plantilla-import"
import { db } from "../src/lib/db"
import { F_X1_RESPONSABLE, fixtureF_X1 } from "../src/lib/proyectos/__fixtures__/plantilla-cedetextil"
import { generarPlantilla, type PlantillaInput } from "../src/lib/proyectos/plantilla/generate"
import { construirPlan } from "../src/lib/proyectos/plantilla/mapear"
import { parsePlantilla } from "../src/lib/proyectos/plantilla/parse"
import { validarPlantilla, type ContextoValidacion } from "../src/lib/proyectos/plantilla/validate"

export type DemoMode = "dry-run" | "apply" | "help"

export type DemoArgs = { mode: DemoMode; proyecto: string; actor: string | null; out: string }

type Reader = Parameters<typeof cargarContexto>[0]

export type DemoDb = Reader & {
  usuario: { findFirst: (args: { where: { email: string }; select: { id: true } }) => Promise<{ id: string } | null> }
  $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: { timeout: number; maxWait: number }) => Promise<T>
}

export type DemoFiles = {
  mkdir: (dir: string) => Promise<void>
  writeFile: (path: string, contenido: Buffer) => Promise<void>
}

type Printer = (line: string) => void

const DEFAULT_OUT = "tmp/plantilla-demo"

const USAGE = [
  "Usage:",
  "  npx tsx scripts/import-plantilla-demo.ts --project <codigo|id>                          # dry run (default)",
  "  npx tsx scripts/import-plantilla-demo.ts --project <codigo|id> --actor <email> --apply",
  `Options: --out <dir> (default ${DEFAULT_OUT}). The project must be a local BORRADOR project.`,
]

export function parseDemoArgs(argv: readonly string[]): DemoArgs {
  if (argv.includes("--help")) return { mode: "help", proyecto: "", actor: null, out: DEFAULT_OUT }

  let proyecto: string | null = null
  let actor: string | null = null
  let out = DEFAULT_OUT
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--apply") continue
    if (arg === "--project") {
      proyecto = argv[(i += 1)] ?? null
    } else if (arg === "--actor") {
      actor = argv[(i += 1)] ?? null
    } else if (arg === "--out") {
      out = argv[(i += 1)] ?? DEFAULT_OUT
    } else {
      throw new Error(`Unknown argument "${arg}". Use --help.`)
    }
  }
  if (!proyecto) throw new Error("Missing --project <codigo|id>. Use --help.")
  return { mode: argv.includes("--apply") ? "apply" : "dry-run", proyecto, actor, out }
}

/** LE03/LE02 when the catalog has them, otherwise the first two active lines. */
export function elegirLineas(contexto: ContextoValidacion) {
  const activas = contexto.lineas.filter((linea) => linea.activo)
  const preferidas = ["LE03", "LE02"].flatMap((codigo) => activas.filter((linea) => linea.codigo === codigo))
  const elegidas = preferidas.length === 2 ? preferidas : activas.slice(0, 2)
  if (elegidas.length < 2) throw new Error("The local catalog needs at least 2 active strategic lines: run the migrations.")
  return elegidas
}

export function elegirMunicipios(contexto: ContextoValidacion) {
  const elegidos = contexto.municipios.filter((municipio) => municipio.activo).slice(0, 2)
  if (elegidos.length < 2) {
    throw new Error("The local catalog needs at least 2 active municipios: run the seed (prisma/seed.ts) first.")
  }
  return elegidos
}

/** The F-X1 input rebound to this project and to what the local catalogs actually hold. */
export function entradaDemo(
  variante: "valido" | "v12",
  codigo: string,
  contexto: ContextoValidacion,
  responsable: string,
): PlantillaInput {
  const base = fixtureF_X1(variante)
  const lineas = elegirLineas(contexto)
  const municipios = elegirMunicipios(contexto)
  return {
    ...base,
    proyecto: {
      ...base.proyecto,
      codigo,
      lineas: lineas.map((linea, indice) => ({ codigo: linea.codigo, nombre: linea.nombre, principal: indice === 0 })),
      municipios: municipios.map((m) => ({ nombre: m.nombre, departamento: m.departamento })),
    },
    catalogo: {
      rubros: RUBROS_V2.map((rubro) => ({ codigo: rubro.codigo, nombre: rubro.nombre })),
      lineas: contexto.lineas.filter((linea) => linea.activo).map((linea) => ({ codigo: linea.codigo, nombre: linea.nombre })),
      municipios: contexto.municipios
        .filter((m) => m.activo)
        .map((m) => ({ nombre: m.nombre, departamento: m.departamento, codigoDane: m.codigoDane })),
    },
    estructura: {
      ...base.estructura,
      actividades: base.estructura.actividades.map((actividad) => ({ ...actividad, responsable })),
    },
  }
}

const nodeFiles: DemoFiles = {
  mkdir: async (dir) => {
    await mkdir(dir, { recursive: true })
  },
  writeFile: (path, contenido) => writeFile(path, contenido),
}

export async function runImportPlantillaDemo(
  client: DemoDb,
  argv: readonly string[] = process.argv.slice(2),
  print: Printer = (line) => console.log(line),
  files: DemoFiles = nodeFiles,
): Promise<{ mode: DemoMode }> {
  const args = parseDemoArgs(argv)
  if (args.mode === "help") {
    for (const line of USAGE) print(line)
    return { mode: "help" }
  }
  if (args.mode === "apply" && !args.actor) {
    throw new Error("--apply needs --actor <email> so the import can be audited.")
  }

  const proyecto = await client.proyecto.findFirst({
    where: { OR: [{ id: args.proyecto }, { codigo: args.proyecto }], deleted_at: null },
    select: { id: true, codigo: true, estado: true },
  })
  if (!proyecto) throw new Error(`Project "${args.proyecto}" not found.`)
  if (proyecto.estado !== "BORRADOR") {
    throw new Error(`Project ${proyecto.codigo} is ${proyecto.estado}: only a BORRADOR project can be imported into.`)
  }

  let actorId: string | null = null
  if (args.actor) {
    const usuario = await client.usuario.findFirst({ where: { email: args.actor }, select: { id: true } })
    if (!usuario) throw new Error(`Actor "${args.actor}" not found: pass the email of an existing user.`)
    actorId = usuario.id
  }

  const host = connectionTarget(process.env.DATABASE_URL) ?? "unknown"
  print(`${args.mode === "apply" ? "Import plantilla demo — apply" : "Import plantilla demo — dry run (no writes)"}  (db host: ${host})`)
  print(`  project: ${proyecto.codigo}`)

  const contexto = await cargarContexto(client, proyecto.id)
  const responsable = args.actor ?? F_X1_RESPONSABLE

  const construidas = new Map<"valido" | "v12", { buffer: Buffer; errores: string[]; plan: ReturnType<typeof construirPlan> | null }>()
  for (const variante of ["valido", "v12"] as const) {
    const buffer = await generarPlantilla(entradaDemo(variante, proyecto.codigo, contexto, responsable))
    const parsed = await parsePlantilla(buffer)
    const resultado = validarPlantilla(parsed, contexto)
    construidas.set(variante, {
      buffer,
      errores: resultado.errores.map((e) => e.regla),
      plan: resultado.errores.length === 0 ? construirPlan(parsed, contexto) : null,
    })
  }

  const valida = construidas.get("valido")!
  const fallida = construidas.get("v12")!
  if (valida.errores.length > 0 || !valida.plan) {
    throw new Error(`The valid variant failed validation (${valida.errores.join(", ")}): the local catalogs do not match F-X1.`)
  }
  if (!fallida.errores.includes("V-12")) {
    throw new Error("The V-12 variant did not fail V-12: the demo fixture is out of sync with the validators.")
  }
  const resumen: ResumenImportacion = resumenDePlan(valida.plan)
  print(
    `  valid variant: 0 errors — ${resumen.objetivos} objetivo, ${resumen.actividades} actividades, ` +
      `${resumen.entregables} entregables, ${resumen.indicadores} indicadores, ${resumen.rubros} rubros, ` +
      `${resumen.celdas_programacion} celdas`,
  )
  const nErrores = fallida.errores.length
  print(`  V-12 variant: ${nErrores} ${nErrores === 1 ? "error" : "errors"} (${[...new Set(fallida.errores)].join(", ")}) — for the error table`)

  if (args.mode !== "apply") {
    print("Dry run: nothing was written. Re-run with --actor <email> --apply to write the files and import.")
    return { mode: args.mode }
  }

  await files.mkdir(args.out)
  const validaRuta = join(args.out, `${proyecto.codigo}-valida.xlsx`)
  const fallidaRuta = join(args.out, `${proyecto.codigo}-error-v12.xlsx`)
  await files.writeFile(validaRuta, valida.buffer)
  await files.writeFile(fallidaRuta, fallida.buffer)
  print(`  wrote ${validaRuta}`)
  print(`  wrote ${fallidaRuta}`)

  const loteId = randomUUID()
  const plan = valida.plan
  await client.$transaction((tx) => importarPlantilla(tx, { proyectoId: proyecto.id, usuarioId: actorId as string, plan, loteId }), {
    timeout: 60_000,
    maxWait: 10_000,
  })
  print(`Imported the valid workbook into ${proyecto.codigo} (lote ${loteId}).`)
  return { mode: args.mode }
}

async function main(): Promise<void> {
  await runImportPlantillaDemo(db as unknown as DemoDb)
}

// Only run when invoked as a script: a test imports this module and must not
// query a database as an import side effect.
const invokedDirectly = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/import-plantilla-demo.ts")

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
