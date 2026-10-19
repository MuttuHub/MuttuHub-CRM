import { describe, expect, it } from "vitest"
import {
  canEditClient,
  canEditTask,
  canManageAny,
  canManageOpportunity,
  hasCommercialAccess,
} from "./permissions"

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

describe("hasCommercialAccess", () => {
  it.each([
    ["ADMINISTRADOR", false, true],
    ["ADMINISTRADOR", true, true],
    ["GERENCIA", false, true],
    ["GERENCIA", true, true],
    ["COORDINADOR", false, true],
    ["COORDINADOR", true, true],
    ["COLABORADOR", false, false],
    ["COLABORADOR", true, true],
  ] as const)(
    "rol=%s gestiona_oportunidades=%s -> %s",
    (rol, gestiona_oportunidades, expected) => {
      expect(
        hasCommercialAccess({ id: "me", rol, gestiona_oportunidades }),
      ).toBe(expected)
    },
  )
})

describe("canManageOpportunity", () => {
  // Full matrix: 4 roles x flag on/off x responsable yes/no.
  it.each([
    ["ADMINISTRADOR", false, "someone-else", true],
    ["ADMINISTRADOR", false, "me", true],
    ["ADMINISTRADOR", true, "someone-else", true],
    ["GERENCIA", false, "someone-else", true],
    ["GERENCIA", true, "me", true],
    ["COORDINADOR", false, "someone-else", true],
    ["COORDINADOR", true, "me", true],
    ["COLABORADOR", true, "me", true],
    ["COLABORADOR", true, "someone-else", false],
    ["COLABORADOR", false, "me", false],
    ["COLABORADOR", false, "someone-else", false],
  ] as const)(
    "rol=%s gestiona_oportunidades=%s responsable_id=%s -> %s",
    (rol, gestiona_oportunidades, responsable_id, expected) => {
      expect(
        canManageOpportunity(
          { responsable_id },
          { id: "me", rol, gestiona_oportunidades },
        ),
      ).toBe(expected)
    },
  )

  it("COLABORADOR responsable of the client but without the flag -> false (RNF-C02, negates the old ownership-only rule)", () => {
    expect(
      canManageOpportunity(
        { responsable_id: "me" },
        { id: "me", rol: "COLABORADOR", gestiona_oportunidades: false },
      ),
    ).toBe(false)
  })
})
