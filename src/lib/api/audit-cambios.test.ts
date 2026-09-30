import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  db: {
    auditoriaCambio: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}))

import { db } from "@/lib/db"
import { AUDIT_ENTIDADES_V2, diffFields, logChange, logChanges, type CambioInput } from "./audit-cambios"

/** Mimics Prisma.Decimal: a value object whose prototype is not Object.prototype. */
class FakeDecimal {
  constructor(private readonly value: string) {}
  toString() {
    return this.value
  }
}

function fakeTx() {
  return {
    auditoriaCambio: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }
}

const base: CambioInput = {
  usuario_id: "user-1",
  accion: "EDITAR",
  entidad: "proyecto",
  entidad_id: "prj-1",
  proyecto_id: "prj-1",
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("diffFields", () => {
  it("returns one entry per changed field with before and after values", () => {
    const before = { nombre: "CedeTextil", valor_total: "100.00", estado: "BORRADOR" }
    const after = { nombre: "CedeTextil fase 2" }

    expect(diffFields(before, after, ["nombre", "valor_total", "estado"])).toEqual([
      { campo: "nombre", valor_anterior: "CedeTextil", valor_nuevo: "CedeTextil fase 2" },
    ])
  })

  it("returns an empty list when nothing changed", () => {
    const before = { nombre: "Igual", estado: "BORRADOR" }
    expect(diffFields(before, { nombre: "Igual" }, ["nombre", "estado"])).toEqual([])
  })

  it("ignores unchanged fields and normalises Decimal and Date to strings", () => {
    const before = {
      monto: new FakeDecimal("1234.56"),
      fecha: new Date("2026-10-05T00:00:00.000Z"),
      nombre: "sin cambios",
    }
    const after = {
      monto: new FakeDecimal("2000.00"),
      fecha: new Date("2026-10-06T00:00:00.000Z"),
      nombre: "sin cambios",
    }

    expect(diffFields(before, after, ["monto", "fecha", "nombre"])).toEqual([
      { campo: "monto", valor_anterior: "1234.56", valor_nuevo: "2000.00" },
      {
        campo: "fecha",
        valor_anterior: "2026-10-05T00:00:00.000Z",
        valor_nuevo: "2026-10-06T00:00:00.000Z",
      },
    ])
  })

  it("treats an absent field in `after` as unchanged, not as a deletion", () => {
    const before = { a: 1, b: 2 }
    expect(diffFields(before, { a: 1 }, ["a", "b"])).toEqual([])
  })

  it("treats an explicit null as a change", () => {
    const before: { responsable_id: string | null } = { responsable_id: "user-9" }
    expect(diffFields(before, { responsable_id: null }, ["responsable_id"])).toEqual([
      { campo: "responsable_id", valor_anterior: "user-9", valor_nuevo: null },
    ])
  })
})

describe("logChange", () => {
  it("inserts through the given transaction client, not the global db", async () => {
    const tx = fakeTx()

    await logChange(tx as never, { ...base, campo: "nombre", valor_anterior: "A", valor_nuevo: "B" })

    expect(tx.auditoriaCambio.create).toHaveBeenCalledTimes(1)
    expect(db.auditoriaCambio.create).not.toHaveBeenCalled()
    expect(tx.auditoriaCambio.create).toHaveBeenCalledWith({
      data: {
        usuario_id: "user-1",
        accion: "EDITAR",
        entidad: "proyecto",
        entidad_id: "prj-1",
        proyecto_id: "prj-1",
        campo: "nombre",
        valor_anterior: "A",
        valor_nuevo: "B",
        lote_id: null,
      },
    })
  })

  it("propagates insert errors instead of swallowing them", async () => {
    const tx = fakeTx()
    tx.auditoriaCambio.create.mockRejectedValue(new Error("db down"))

    await expect(logChange(tx as never, base)).rejects.toThrow("db down")
  })
})

describe("logChanges", () => {
  it("writes all rows with one createMany call and the shared lote_id", async () => {
    const tx = fakeTx()

    await logChanges(tx as never, [
      { ...base, campo: "nombre", valor_anterior: "A", valor_nuevo: "B" },
      { ...base, campo: "valor_total", valor_anterior: "1", valor_nuevo: "2" },
      { ...base, campo: "estado", valor_anterior: "BORRADOR", valor_nuevo: "EN_EJECUCION" },
    ])

    expect(tx.auditoriaCambio.createMany).toHaveBeenCalledTimes(1)
    const arg = tx.auditoriaCambio.createMany.mock.calls[0][0] as { data: { lote_id: string | null }[] }
    expect(arg.data).toHaveLength(3)
    expect(arg.data.every((row) => row.lote_id !== null)).toBe(true)
    expect(new Set(arg.data.map((row) => row.lote_id)).size).toBe(1)
  })

  it("honours an explicit lote_id when the caller supplied one", async () => {
    const tx = fakeTx()

    await logChanges(tx as never, [
      { ...base, lote_id: "lote-7" },
      { ...base, lote_id: "lote-7" },
    ])

    const arg = tx.auditoriaCambio.createMany.mock.calls[0][0] as { data: { lote_id: string }[] }
    expect(arg.data.every((row) => row.lote_id === "lote-7")).toBe(true)
  })

  it("does not call the database for an empty list", async () => {
    const tx = fakeTx()

    await logChanges(tx as never, [])

    expect(tx.auditoriaCambio.createMany).not.toHaveBeenCalled()
  })

  it("propagates insert errors so the business transaction rolls back", async () => {
    const tx = fakeTx()
    tx.auditoriaCambio.createMany.mockRejectedValue(new Error("db down"))

    await expect(logChanges(tx as never, [base])).rejects.toThrow("db down")
  })
})

describe("AUDIT_ENTIDADES_V2", () => {
  it("covers the v2 project entity names", () => {
    for (const entidad of ["proyecto", "objetivo", "actividad", "entregable", "gasto", "version"]) {
      expect(AUDIT_ENTIDADES_V2).toContain(entidad)
    }
  })
})
