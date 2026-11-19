import { describe, expect, it } from "vitest"
import { cardAction } from "@/components/kanban/board-logic"
import type { CardTask } from "@/components/kanban/task-card"
import { parseClientListFilters, toTaskItem, type TaskRow } from "./crm"

const VALID_TIPO = ["EMPRESA", "GOBIERNO_LOCAL"] as const
const VALID_ESTADO = ["PROSPECTO", "CLIENTE_ACTIVO"] as const
const VALID_PRIORIDAD = ["ALTA", "MEDIA", "BAJA"] as const

function parse(qs: string) {
  return parseClientListFilters(
    new URL(`http://test/api/v1/clients?${qs}`),
    VALID_TIPO,
    VALID_ESTADO,
    VALID_PRIORIDAD,
  )
}

describe("parseClientListFilters", () => {
  it("accepts a valid date range (desde <= hasta)", () => {
    const res = parse("desde=2026-01-01&hasta=2026-12-31")
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.filters.desde).toBe("2026-01-01")
      expect(res.filters.hasta).toBe("2026-12-31")
    }
  })

  it("accepts a single-sided date range and equal bounds", () => {
    expect(parse("desde=2026-01-01").ok).toBe(true)
    expect(parse("hasta=2026-01-01").ok).toBe(true)
    expect(parse("desde=2026-01-01&hasta=2026-01-01").ok).toBe(true)
  })

  it("rejects `desde` after `hasta` with a 400 VALIDATION_ERROR", async () => {
    const res = parse("desde=2026-12-31&hasta=2026-01-01")
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      const body = await res.response.json()
      expect(body).toEqual({
        error: "La fecha final no puede ser anterior a la inicial.",
        code: "VALIDATION_ERROR",
      })
    }
  })

  it("still rejects malformed dates", () => {
    expect(parse("desde=31-12-2026").ok).toBe(false)
    expect(parse("hasta=2026/01/01").ok).toBe(false)
  })
})
describe("toTaskItem project link (V2)", () => {
  function row(overrides: Partial<Record<string, unknown>> = {}): TaskRow {
    return {
      id: "t-1",
      titulo: "Tarea",
      descripcion: null,
      responsable_id: "u-1",
      cliente_id: "c-1",
      oportunidad_id: null,
      proyecto_id: null,
      estado: "POR_HACER",
      origen: "KANBAN",
      prioridad: null,
      fecha_entrega: null,
      etiquetas: [],
      motivo_bloqueo: null,
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-01"),
      responsable: { nombre: "Uno" },
      cliente: { nombre: "Cliente", responsable_id: "u-1" },
      oportunidad: null,
      proyecto: null,
      _count: { comentarios: 0, subtareas: 0 },
      ...overrides,
    } as TaskRow
  }

  it("exposes the direct proyecto_id and resolves proyecto from the direct link", () => {
    const item = toTaskItem(
      row({ proyecto_id: "p-1", proyecto: { id: "p-1", codigo: "PRY-2026-001", deleted_at: null } }),
    )
    expect(item.proyecto_id).toBe("p-1")
    expect(item.proyecto).toEqual({ id: "p-1", codigo: "PRY-2026-001" })
  })

  it("keeps the transitive link through the opportunity when the task has no direct link", () => {
    const item = toTaskItem(
      row({
        oportunidad_id: "o-1",
        oportunidad: {
          id: "o-1",
          nombre: "Op",
          fase: "EJECUCION",
          proyecto: { id: "p-2", codigo: "PRY-2026-002", deleted_at: null },
        },
      }),
    )
    expect(item.proyecto_id).toBeNull()
    expect(item.proyecto).toEqual({ id: "p-2", codigo: "PRY-2026-002" })
  })

  it("lets the board keep linking a converted task to its project ficha", () => {
    const item = toTaskItem(
      row({
        estado: "COMPLETADA",
        oportunidad_id: "o-1",
        proyecto_id: "p-1",
        oportunidad: {
          id: "o-1",
          nombre: "Op",
          fase: "EJECUCION",
          proyecto: { id: "p-1", codigo: "PRY-2026-001", deleted_at: null },
        },
        proyecto: { id: "p-1", codigo: "PRY-2026-001", deleted_at: null },
      }),
    )
    // Over the wire the DTO is JSON (dates become strings), which is what the board receives.
    const wire = { ...JSON.parse(JSON.stringify(item)), puede_editar: true } as CardTask
    expect(cardAction(wire, new Set())).toEqual({
      kind: "open-project",
      href: "/proyectos/p-1",
      label: "✓ Proyecto PRY-2026-001 · abrir ficha",
    })
  })

  it("hides a soft-deleted direct project", () => {
    const item = toTaskItem(
      row({ proyecto_id: "p-3", proyecto: { id: "p-3", codigo: "PRY-2026-003", deleted_at: new Date() } }),
    )
    expect(item.proyecto).toBeNull()
  })
})
