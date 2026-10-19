// S9 U2: the gerencial flag read from the real actor of `projects.ts`, never a hand-built fixture.
// It widens the read axes only; every write/execute/approve gate and the support gate stay closed.
import { describe, expect, it, vi } from "vitest"
import type { Usuario } from "@prisma/client"

vi.mock("@/lib/db", () => ({ db: {} }))

import { canReadProject, canReadProjectList, projectListWhere, projectReadActor } from "@/lib/api/projects"
import {
  canApproveBaseline,
  canApproveModification,
  canExecuteProject,
  canManageProjects,
  canValidateExpense,
  canViewFinancialSupports,
} from "@/lib/permissions"

const user = (rol: Usuario["rol"], puede_ver_tablero_gerencial: boolean) =>
  ({ id: "u-1", rol, activo: true, puede_ver_tablero_gerencial }) as Usuario

describe("gerencial flag through the real project actor", () => {
  it("a flagged COLABORADOR reads the portfolio and any project", () => {
    expect(canReadProjectList(user("COLABORADOR", true))).toBe(true)
    expect(canReadProject(user("COLABORADOR", true), false)).toBe(true)
  })

  it("an unflagged COLABORADOR reads nothing", () => {
    expect(canReadProjectList(user("COLABORADOR", false))).toBe(false)
    expect(canReadProject(user("COLABORADOR", false), false)).toBe(false)
  })

  it("the flag lifts the list scope of a COLABORADOR to every project", () => {
    expect(projectListWhere(user("COLABORADOR", true), {})).toEqual({ deleted_at: null })
    // S3: without the flag the list is the memberships, never an empty list.
    expect(projectListWhere(user("COLABORADOR", false), {})).toEqual({
      deleted_at: null,
      miembros: { some: { usuario_id: "u-1", removed_at: null } },
    })
  })

  it("the flag never opens a write, execute, approve or validate gate", () => {
    // es_miembro: false isolates the flag: membership is what grants execution.
    const actor = projectReadActor(user("COLABORADOR", true), false)
    expect(canManageProjects(actor)).toBe(false)
    expect(canExecuteProject(actor)).toBe(false)
    expect(canApproveBaseline(actor)).toBe(false)
    expect(canApproveModification(actor)).toBe(false)
    expect(canValidateExpense({ registrado_por_id: "otro" }, actor)).toBe(false)
  })

  it("the flag does not widen the financial supports gate", () => {
    expect(canViewFinancialSupports(projectReadActor(user("COLABORADOR", true), false))).toBe(false)
    expect(canViewFinancialSupports(projectReadActor(user("GERENCIA", true), false))).toBe(true)
  })
})
