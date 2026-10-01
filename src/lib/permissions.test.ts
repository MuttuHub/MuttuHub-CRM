import { describe, expect, it } from "vitest"
import type { RolUsuario } from "@prisma/client"
import {
  canApproveBaseline,
  canApproveModification,
  canCreateProject,
  canEditClient,
  canEditTask,
  canExecuteProject,
  canManageAny,
  canManageOpportunity,
  canManageProject,
  canManageProjects,
  canReadRestrictedDocs,
  canValidateExpense,
  canViewFinancialSupports,
  canViewPortfolio,
  canViewProjectV2,
  hasCommercialAccess,
} from "./permissions"
import type { ProjectActor, ProjectMembershipActor } from "./permissions"

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

describe("project permissions (v2, S0.7)", () => {
  const allRoles = [
    "ADMINISTRADOR",
    "GERENCIA",
    "COORDINADOR",
    "COLABORADOR",
  ] as const satisfies readonly RolUsuario[]

  it("canCreateProject is true only for ADMINISTRADOR and GERENCIA", () => {
    // Exhaustive over the closed RolUsuario union: no role other than the two
    // project managers may create a project (COORDINADOR lost this in v2).
    for (const rol of allRoles) {
      const expected = rol === "ADMINISTRADOR" || rol === "GERENCIA"
      expect(canCreateProject({ id: "me", rol })).toBe(expected)
    }
  })

  it("canManageProject denies a COORDINADOR on a project they are not responsable of", () => {
    expect(
      canManageProject(
        { responsable_id: "someone-else" },
        { id: "me", rol: "COORDINADOR" },
      ),
    ).toBe(false)
  })

  it("canManageProject allows the COORDINADOR responsable (v1 path) and denies a COLABORADOR responsable", () => {
    expect(
      canManageProject({ responsable_id: "me" }, { id: "me", rol: "COORDINADOR" }),
    ).toBe(true)
    // Behaviour change vs v1: ownership alone no longer grants management to a
    // non-manager role.
    expect(
      canManageProject({ responsable_id: "me" }, { id: "me", rol: "COLABORADOR" }),
    ).toBe(false)
    // Managers keep the unconditional path.
    expect(
      canManageProject(
        { responsable_id: "someone-else" },
        { id: "me", rol: "ADMINISTRADOR" },
      ),
    ).toBe(true)
    expect(
      canManageProject(
        { responsable_id: "someone-else" },
        { id: "me", rol: "GERENCIA" },
      ),
    ).toBe(true)
  })

  it("canExecuteProject requires COORDINADOR membership unless the actor is a project manager", () => {
    expect(
      canExecuteProject({
        id: "me",
        rol: "COORDINADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: false,
      }),
    ).toBe(false)
    expect(
      canExecuteProject({
        id: "me",
        rol: "COORDINADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: true,
      }),
    ).toBe(true)
    // Managers execute any project without membership.
    expect(
      canExecuteProject({
        id: "me",
        rol: "ADMINISTRADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: false,
      }),
    ).toBe(true)
    expect(
      canExecuteProject({
        id: "me",
        rol: "GERENCIA",
        puede_ver_tablero_gerencial: false,
        es_miembro: false,
      }),
    ).toBe(true)
    // Membership alone does not let a COLABORADOR execute.
    expect(
      canExecuteProject({
        id: "me",
        rol: "COLABORADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: true,
      }),
    ).toBe(false)
  })

  it("canApproveBaseline and canApproveModification follow the project manager set", () => {
    // Both approvals are management decisions, not execution ones: true for the
    // two project managers and false for every other role, with no ownership or
    // membership path that could widen them.
    for (const rol of allRoles) {
      const actor = { id: "me", rol }
      const expected = rol === "ADMINISTRADOR" || rol === "GERENCIA"
      expect(canApproveBaseline(actor)).toBe(expected)
      expect(canApproveModification(actor)).toBe(expected)
    }
  })

  it("canViewFinancialSupports excludes the Visualizador flag", () => {
    // A COORDINADOR without membership has no financial visibility, even when
    // the gerencial board flag is set: the flag is a read axis of its own and
    // never a financial one.
    expect(
      canViewFinancialSupports({
        id: "me",
        rol: "COORDINADOR",
        puede_ver_tablero_gerencial: true,
        es_miembro: false,
      }),
    ).toBe(false)
    expect(
      canViewFinancialSupports({
        id: "me",
        rol: "COLABORADOR",
        puede_ver_tablero_gerencial: true,
        es_miembro: true,
      }),
    ).toBe(false)
    // Membership, not the flag, is what opens the financial axis to a COORDINADOR.
    expect(
      canViewFinancialSupports({
        id: "me",
        rol: "COORDINADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: true,
      }),
    ).toBe(true)
    // Managers get it regardless of membership and of the flag.
    expect(
      canViewFinancialSupports({
        id: "me",
        rol: "ADMINISTRADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: false,
      }),
    ).toBe(true)
    expect(
      canViewFinancialSupports({
        id: "me",
        rol: "GERENCIA",
        puede_ver_tablero_gerencial: false,
        es_miembro: false,
      }),
    ).toBe(true)
  })

  it("canValidateExpense denies the user who registered the expense", () => {
    // Segregation of duties: the registrant can never validate their own expense.
    expect(
      canValidateExpense({ registrado_por_id: "me" }, { id: "me", rol: "GERENCIA" }),
    ).toBe(false)
    expect(
      canValidateExpense(
        { registrado_por_id: "someone-else" },
        { id: "me", rol: "GERENCIA" },
      ),
    ).toBe(true)
    // Non-managers never validate, not even someone else's expense.
    expect(
      canValidateExpense(
        { registrado_por_id: "someone-else" },
        { id: "me", rol: "COORDINADOR" },
      ),
    ).toBe(false)
    expect(
      canValidateExpense(
        { registrado_por_id: "someone-else" },
        { id: "me", rol: "COLABORADOR" },
      ),
    ).toBe(false)
  })

  it("canManageAny still includes COORDINADOR for clients, tasks and documents", () => {
    // Regression guard: the v2 project predicates narrow the manager set, but
    // the shared write/confidentiality predicate must stay untouched.
    const coordinador = { id: "coord-1", rol: "COORDINADOR" } as const
    expect(canManageAny(coordinador.rol)).toBe(true)
    expect(canEditClient({ responsable_id: "someone-else" }, coordinador)).toBe(true)
    expect(
      canEditTask(
        { responsable_id: "someone-else", cliente_responsable_id: null },
        coordinador,
      ),
    ).toBe(true)
    expect(canReadRestrictedDocs(coordinador.rol)).toBe(true)
  })

  it("puede_ver_tablero_gerencial never grants write in any project predicate", () => {
    const flaggedCoordinador: ProjectActor = {
      id: "me",
      rol: "COORDINADOR",
      puede_ver_tablero_gerencial: true,
    }
    const flaggedColaborador: ProjectActor = {
      id: "me",
      rol: "COLABORADOR",
      puede_ver_tablero_gerencial: true,
    }

    for (const actor of [flaggedCoordinador, flaggedColaborador]) {
      expect(canManageProjects(actor)).toBe(false)
      expect(canCreateProject(actor)).toBe(false)
      expect(canManageProject({ responsable_id: "someone-else" }, actor)).toBe(false)
      expect(canValidateExpense({ registrado_por_id: "someone-else" }, actor)).toBe(false)
      expect(canApproveBaseline(actor)).toBe(false)
      expect(canApproveModification(actor)).toBe(false)
    }

    // The flag is a READ axis only: it does grant the two view predicates.
    expect(
      canViewProjectV2({
        id: "me",
        rol: "COLABORADOR",
        puede_ver_tablero_gerencial: true,
        es_miembro: false,
      }),
    ).toBe(true)
    expect(canViewPortfolio(flaggedCoordinador)).toBe(true)
  })

  it("canViewProjectV2: a project manager sees any project", () => {
    expect(
      canViewProjectV2({
        id: "me",
        rol: "ADMINISTRADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: false,
      }),
    ).toBe(true)
    expect(
      canViewProjectV2({
        id: "me",
        rol: "GERENCIA",
        puede_ver_tablero_gerencial: false,
        es_miembro: false,
      }),
    ).toBe(true)
  })

  it("canViewProjectV2: a COORDINADOR member sees the project", () => {
    expect(
      canViewProjectV2({
        id: "me",
        rol: "COORDINADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: true,
      }),
    ).toBe(true)
  })

  it("canViewProjectV2: a COORDINADOR non-member does not", () => {
    const nonMember: ProjectMembershipActor = {
      id: "me",
      rol: "COORDINADOR",
      puede_ver_tablero_gerencial: false,
      es_miembro: false,
    }
    expect(canViewProjectV2(nonMember)).toBe(false)
    expect(
      canViewProjectV2({
        id: "me",
        rol: "COLABORADOR",
        puede_ver_tablero_gerencial: false,
        es_miembro: true,
      }),
    ).toBe(false)
  })

  it("canViewPortfolio: a COORDINADOR without the flag does not get global portfolio access", () => {
    expect(
      canViewPortfolio({
        id: "me",
        rol: "COORDINADOR",
        puede_ver_tablero_gerencial: false,
      }),
    ).toBe(false)
  })

  it("canViewPortfolio: GERENCIA gets it", () => {
    expect(
      canViewPortfolio({
        id: "me",
        rol: "GERENCIA",
        puede_ver_tablero_gerencial: false,
      }),
    ).toBe(true)
  })

  it("canViewPortfolio: the gerencial flag grants it", () => {
    expect(
      canViewPortfolio({
        id: "me",
        rol: "COLABORADOR",
        puede_ver_tablero_gerencial: true,
      }),
    ).toBe(true)
  })
})
