import { describe, expect, it } from "vitest"
import { canEditClient, canEditTask, canManageAny } from "./permissions"

describe("canManageAny", () => {
  it.each([
    ["ADMINISTRADOR", true],
    ["GERENCIA", true],
    ["COORDINADOR", true],
    ["COLABORADOR", false],
  ] as const)("%s -> %s", (rol, expected) => {
    expect(canManageAny(rol)).toBe(expected)
  })
})

describe("canEditClient", () => {
  it.each([
    ["ADMINISTRADOR", "someone-else", true],
    ["GERENCIA", "someone-else", true],
    ["COORDINADOR", "someone-else", true],
    ["COLABORADOR", "me", true],
    ["COLABORADOR", "someone-else", false],
  ] as const)("rol=%s responsable_id=%s -> %s", (rol, responsable_id, expected) => {
    expect(
      canEditClient({ responsable_id }, { id: "me", rol }),
    ).toBe(expected)
  })
})

describe("canEditTask", () => {
  it("full-access role -> true regardless of ownership", () => {
    expect(
      canEditTask(
        { responsable_id: "someone-else", cliente_responsable_id: null },
        { id: "me", rol: "ADMINISTRADOR" },
      ),
    ).toBe(true)
  })

  it("COLABORADOR responsable of the task -> true", () => {
    expect(
      canEditTask(
        { responsable_id: "me", cliente_responsable_id: null },
        { id: "me", rol: "COLABORADOR" },
      ),
    ).toBe(true)
  })

  it("COLABORADOR responsable of the linked client (not of the task) -> true", () => {
    expect(
      canEditTask(
        { responsable_id: "someone-else", cliente_responsable_id: "me" },
        { id: "me", rol: "COLABORADOR" },
      ),
    ).toBe(true)
  })

  it("COLABORADOR with no relation to the task or its client -> false", () => {
    expect(
      canEditTask(
        { responsable_id: "someone-else", cliente_responsable_id: "another-one" },
        { id: "me", rol: "COLABORADOR" },
      ),
    ).toBe(false)
  })

  it("no linked client (cliente_responsable_id: null) and not the responsable -> false", () => {
    expect(
      canEditTask(
        { responsable_id: "someone-else", cliente_responsable_id: null },
        { id: "me", rol: "COLABORADOR" },
      ),
    ).toBe(false)
  })
})
