/**
 * WHY: no API route moves a project to EN_EJECUCION in S4 (baseline approval,
 * S8.2, does), so manual QA of the execution module needs a local-only tool.
 * It must stay inert by default: a dry run issues zero writes, `--apply` needs
 * an actor for the audit row, and the `require-local-db` guard (mocked here)
 * is what refuses a non-loopback database before the client exists.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../prisma/require-local-db", () => ({}))
vi.mock("../src/lib/db", () => ({ db: {} }))
vi.mock("../src/lib/api/audit-cambios", () => ({ logChange: vi.fn() }))

import { logChange } from "../src/lib/api/audit-cambios"
import { parseSetEstadoArgs, runSetEstado, type SetEstadoDb } from "./set-project-estado"

const proyecto = { id: "pry-1", codigo: "PRY-2026-001", nombre: "Demo", estado: "BORRADOR" }
const usuario = { id: "usr-1", email: "qa@example.test" }

function fakeDb(over: { proyecto?: unknown; usuario?: unknown; versiones?: number } = {}) {
  const calls: string[] = []
  const tx = {
    proyecto: {
      findFirst: vi.fn(async () => ("proyecto" in over ? over.proyecto : proyecto)),
      update: vi.fn(async (args: unknown) => {
        calls.push("proyecto.update")
        return args
      }),
    },
    usuario: { findFirst: vi.fn(async () => ("usuario" in over ? over.usuario : usuario)) },
    versionProyecto: { count: vi.fn(async () => over.versiones ?? 0) },
  }
  const client = { $transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(tx) } as unknown as SetEstadoDb
  return { client, tx, calls }
}

describe("parseSetEstadoArgs", () => {
  it("defaults to a dry run and reads project, estado and actor", () => {
    expect(parseSetEstadoArgs(["PRY-2026-001", "EN_EJECUCION"])).toEqual({
      mode: "dry-run",
      proyecto: "PRY-2026-001",
      estado: "EN_EJECUCION",
      actor: null,
    })
    expect(parseSetEstadoArgs(["PRY-2026-001", "EN_EJECUCION", "--actor", "qa@example.test", "--apply"])).toMatchObject({
      mode: "apply",
      actor: "qa@example.test",
    })
  })

  it("rejects an unknown estado or missing arguments, and shows help", () => {
    expect(() => parseSetEstadoArgs(["PRY-1", "NOPE"])).toThrow(/estado/i)
    expect(() => parseSetEstadoArgs(["PRY-1"])).toThrow()
    expect(parseSetEstadoArgs(["--help"]).mode).toBe("help")
  })
})

describe("runSetEstado", () => {
  afterEach(() => vi.clearAllMocks())
  const lines: string[] = []
  const print = (line: string) => lines.push(line)

  it("writes nothing on a dry run and reports the plan", async () => {
    const { client, calls } = fakeDb()
    const result = await runSetEstado(client, ["PRY-2026-001", "EN_EJECUCION"], print)
    expect(result.mode).toBe("dry-run")
    expect(calls).toEqual([])
    expect(logChange).not.toHaveBeenCalled()
    expect(lines.join("\n")).toMatch(/BORRADOR -> EN_EJECUCION/)
    expect(lines.join("\n")).toMatch(/Dry run/)
  })

  it("applies the change and audits it with the actor", async () => {
    const { client, tx } = fakeDb()
    await runSetEstado(client, ["PRY-2026-001", "EN_EJECUCION", "--actor", "qa@example.test", "--apply"], print)
    expect(tx.proyecto.update).toHaveBeenCalledWith({ where: { id: "pry-1" }, data: { estado: "EN_EJECUCION" } })
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "usr-1",
        accion: "EDITAR",
        entidad: "proyecto",
        entidad_id: "pry-1",
        proyecto_id: "pry-1",
        campo: "estado",
        valor_anterior: "BORRADOR",
        valor_nuevo: "EN_EJECUCION",
      }),
    )
  })

  it("refuses --apply without a known actor, an unknown project, and a no-op", async () => {
    await expect(runSetEstado(fakeDb().client, ["PRY-1", "EN_EJECUCION", "--apply"], print)).rejects.toThrow(/actor/i)
    await expect(
      runSetEstado(fakeDb({ usuario: null }).client, ["PRY-1", "EN_EJECUCION", "--actor", "x@y.z", "--apply"], print),
    ).rejects.toThrow(/actor/i)
    await expect(runSetEstado(fakeDb({ proyecto: null }).client, ["PRY-9", "EN_EJECUCION"], print)).rejects.toThrow(/not found/i)
    const same = fakeDb({ proyecto: { ...proyecto, estado: "EN_EJECUCION" } })
    await expect(runSetEstado(same.client, ["PRY-1", "EN_EJECUCION"], print)).rejects.toThrow(/already/i)
    expect(same.calls).toEqual([])
  })

  it("warns when moving to EN_EJECUCION a project with no baseline version (dry run and apply)", async () => {
    const dry: string[] = []
    await runSetEstado(fakeDb().client, ["PRY-2026-001", "EN_EJECUCION"], (line) => dry.push(line))
    expect(dry.join("\n")).toMatch(/WARNING: .*no baseline \(v0\)/)
    expect(dry.join("\n")).toMatch(/baseline\/approve/)

    const applied: string[] = []
    await runSetEstado(
      fakeDb().client,
      ["PRY-2026-001", "EN_EJECUCION", "--actor", "qa@example.test", "--apply"],
      (line) => applied.push(line),
    )
    expect(applied.join("\n")).toMatch(/WARNING/)
  })

  it("does not warn when the project already has its baseline or the target is another estado", async () => {
    const withBaseline: string[] = []
    await runSetEstado(fakeDb({ versiones: 1 }).client, ["PRY-2026-001", "EN_EJECUCION"], (line) => withBaseline.push(line))
    expect(withBaseline.join("\n")).not.toMatch(/WARNING/)

    const other: string[] = []
    await runSetEstado(fakeDb().client, ["PRY-2026-001", "SUSPENDIDO"], (line) => other.push(line))
    expect(other.join("\n")).not.toMatch(/WARNING/)
  })
})
