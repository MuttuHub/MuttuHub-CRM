// @vitest-environment node
/**
 * WHY: S7.7 pilot. The template import is only proven when a real workbook goes
 * through the real catalogs, so this LOCAL-ONLY tool generates the valid F-X1
 * workbook and its V-12-failing twin and imports the valid one into a local
 * BORRADOR project. It must stay inert by default: a dry run issues zero writes
 * (no files, no transaction), `--apply` needs an actor for the audit lote, and
 * the `require-local-db` guard (mocked here) is what refuses a non-loopback
 * database before the client exists. tsx cannot run in every shell, so the whole
 * flow is covered here with fakes.
 */
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../prisma/require-local-db", () => ({}))
vi.mock("../src/lib/db", () => ({ db: {} }))
vi.mock("../src/lib/api/plantilla-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api/plantilla-import")>()
  return { ...actual, importarPlantilla: vi.fn() }
})

import { RUBROS_V2 } from "../src/lib/catalogs"
import { importarPlantilla } from "../src/lib/api/plantilla-import"
import {
  parseDemoArgs,
  runImportPlantillaDemo,
  type DemoDb,
  type DemoFiles,
} from "./import-plantilla-demo"

const proyecto = { id: "pry-1", codigo: "PRY-2026-007", estado: "BORRADOR" }
const actor = { id: "usr-1", email: "qa@example.test" }

const lineas = [
  { id: "l2", codigo: "LE02", nombre: "Emprendimiento", activo: true },
  { id: "l3", codigo: "LE03", nombre: "Productividad", activo: true },
]
const municipios = [
  { id: "m1", nombre: "Cereté", departamento: "Córdoba", codigo_dane: "23162", activo: true },
  { id: "m2", nombre: "Montería", departamento: "Córdoba", codigo_dane: "23001", activo: true },
  { id: "m3", nombre: "Suspendido", departamento: "Córdoba", codigo_dane: null, activo: false },
]

function fakeDb(over: { proyecto?: unknown; municipios?: unknown[]; actor?: unknown } = {}) {
  const tx = { marca: "tx" }
  const transaction = vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx))
  const client = {
    proyecto: { findFirst: vi.fn(async () => ("proyecto" in over ? over.proyecto : proyecto)) },
    rubro: { findMany: vi.fn(async () => RUBROS_V2.map((r) => ({ codigo: r.codigo, activo: true }))) },
    lineaEstrategicaCatalogo: { findMany: vi.fn(async () => lineas) },
    municipio: { findMany: vi.fn(async () => over.municipios ?? municipios) },
    usuario: {
      findMany: vi.fn(async () => [actor]),
      findFirst: vi.fn(async () => ("actor" in over ? over.actor : actor)),
    },
    $transaction: transaction,
  }
  return { client: client as unknown as DemoDb, transaction, tx }
}

function fakeFiles() {
  const written: { ruta: string; bytes: number }[] = []
  const files: DemoFiles = {
    mkdir: vi.fn(async () => {}),
    writeFile: vi.fn(async (ruta: string, contenido: Buffer) => {
      written.push({ ruta, bytes: contenido.length })
    }),
  }
  return { files, written }
}

describe("parseDemoArgs", () => {
  it("defaults to a dry run into tmp/plantilla-demo", () => {
    expect(parseDemoArgs(["--project", "PRY-2026-007"])).toEqual({
      mode: "dry-run",
      proyecto: "PRY-2026-007",
      actor: null,
      out: "tmp/plantilla-demo",
    })
  })

  it("reads --apply, --actor and --out", () => {
    expect(parseDemoArgs(["--project", "p", "--actor", "qa@example.test", "--out", "salida", "--apply"])).toEqual({
      mode: "apply",
      proyecto: "p",
      actor: "qa@example.test",
      out: "salida",
    })
  })

  it("shows help and rejects a missing --project or an unknown flag", () => {
    expect(parseDemoArgs(["--help"]).mode).toBe("help")
    expect(() => parseDemoArgs([])).toThrow(/--project/)
    expect(() => parseDemoArgs(["--project", "p", "--nope"])).toThrow(/--nope/)
  })
})

describe("runImportPlantillaDemo", () => {
  const lines: string[] = []
  const print = (line: string) => lines.push(line)

  beforeEach(() => {
    lines.length = 0
  })
  afterEach(() => vi.clearAllMocks())

  it("writes nothing on a dry run: no files, no transaction, no import", async () => {
    const { client, transaction } = fakeDb()
    const { files, written } = fakeFiles()

    const result = await runImportPlantillaDemo(client, ["--project", "PRY-2026-007"], print, files)

    expect(result.mode).toBe("dry-run")
    expect(written).toEqual([])
    expect(files.mkdir).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
    expect(importarPlantilla).not.toHaveBeenCalled()
    const salida = lines.join("\n")
    expect(salida).toMatch(/Dry run/)
    expect(salida).toMatch(/valid variant: 0 errors/)
    expect(salida).toMatch(/V-12 variant: 1 error/)
  })

  it("on --apply writes both workbooks and imports ONLY the valid one, once, in one transaction", async () => {
    const { client, transaction, tx } = fakeDb()
    const { files, written } = fakeFiles()
    vi.mocked(importarPlantilla).mockResolvedValue({
      objetivos: 1,
      actividades: 4,
      entregables: 7,
      indicadores: 2,
      rubros: 8,
      celdas_programacion: 32,
    })

    await runImportPlantillaDemo(
      client,
      ["--project", "PRY-2026-007", "--actor", "qa@example.test", "--apply"],
      print,
      files,
    )

    expect(written.map((w) => w.ruta.replace(/\\/g, "/"))).toEqual([
      "tmp/plantilla-demo/PRY-2026-007-valida.xlsx",
      "tmp/plantilla-demo/PRY-2026-007-error-v12.xlsx",
    ])
    expect(written.every((w) => w.bytes > 1000)).toBe(true)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(importarPlantilla).toHaveBeenCalledTimes(1)
    const [usado, args] = vi.mocked(importarPlantilla).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(usado).toBe(tx)
    expect(args).toMatchObject({ proyectoId: "pry-1", usuarioId: "usr-1" })
    expect(args.loteId).toMatch(/^[0-9a-f-]{36}$/)
    const plan = args.plan as { actividades: unknown[]; entregables: unknown[]; proyecto: { lineas: { id: string; principal: boolean }[]; municipioIds: string[] } }
    expect(plan.actividades).toHaveLength(4)
    expect(plan.entregables).toHaveLength(7)
    // The catalog drives the picks: LE03 first (principal), only ACTIVE municipios.
    expect(plan.proyecto.lineas).toEqual([
      { id: "l3", principal: true },
      { id: "l2", principal: false },
    ])
    expect(plan.proyecto.municipioIds.sort()).toEqual(["m1", "m2"])
    expect(lines.join("\n")).toMatch(/Imported/)
  })

  it("refuses --apply without a known actor", async () => {
    const { files } = fakeFiles()
    await expect(
      runImportPlantillaDemo(fakeDb().client, ["--project", "p", "--apply"], print, files),
    ).rejects.toThrow(/--actor/)
    await expect(
      runImportPlantillaDemo(fakeDb({ actor: null }).client, ["--project", "p", "--actor", "x@y.z", "--apply"], print, files),
    ).rejects.toThrow(/Actor/)
    expect(importarPlantilla).not.toHaveBeenCalled()
  })

  it("refuses an unknown project and a project that is not BORRADOR", async () => {
    const { files, written } = fakeFiles()
    await expect(
      runImportPlantillaDemo(fakeDb({ proyecto: null }).client, ["--project", "PRY-9"], print, files),
    ).rejects.toThrow(/not found/i)
    await expect(
      runImportPlantillaDemo(
        fakeDb({ proyecto: { ...proyecto, estado: "EN_EJECUCION" } }).client,
        ["--project", "PRY-2026-007"],
        print,
        files,
      ),
    ).rejects.toThrow(/BORRADOR/)
    expect(written).toEqual([])
  })

  it("fails loudly when the local catalog has too few active municipios", async () => {
    const { files } = fakeFiles()
    await expect(
      runImportPlantillaDemo(fakeDb({ municipios: [municipios[0], municipios[2]] }).client, ["--project", "p"], print, files),
    ).rejects.toThrow(/municipios/i)
  })
})

describe("anti-production guard", () => {
  it("loads the local-db guard before anything else, like reset-demo and set-project-estado", () => {
    const fuente = readFileSync(new URL("./import-plantilla-demo.ts", import.meta.url), "utf8")
    const primerImport = fuente.split(/\r?\n/).find((linea) => linea.startsWith("import "))
    expect(primerImport).toBe('import "../prisma/require-local-db"')
  })
})
