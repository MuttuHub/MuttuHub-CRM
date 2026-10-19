import { describe, expect, it } from "vitest"
import type { CardTask } from "./task-card"
import {
  cardAction,
  columnOf,
  filterByPill,
  groupByColumn,
  isConvertedToProject,
  NEXT_ESTADO,
  NUEVO_PROYECTO,
} from "./board-logic"

function task(patch: Partial<CardTask> = {}): CardTask {
  return {
    id: "t1",
    titulo: "Tarea",
    estado: "POR_HACER",
    prioridad: null,
    etiquetas: [],
    cliente_nombre: null,
    responsable_id: "u1",
    responsable_nombre: "Ana",
    fecha_entrega: null,
    motivo_bloqueo: null,
    oportunidad_id: null,
    oportunidad_fase: null,
    puede_editar: true,
    ...patch,
  }
}

const none = new Set<string>()

describe("filterByPill", () => {
  const items = [
    task({ id: "a", oportunidad_id: "o1", oportunidad_fase: "PROSPECCION" }),
    task({ id: "b", oportunidad_id: "o2", oportunidad_fase: "EJECUCION", responsable_id: "u2" }),
    task({ id: "c" }),
  ]

  it("keeps everything for Todas", () => {
    expect(filterByPill(items, "todas", null)).toHaveLength(3)
  })

  it("filters by the linked opportunity phase", () => {
    expect(filterByPill(items, "PROSPECCION", "u1").map((t) => t.id)).toEqual(["a"])
    expect(filterByPill(items, "EJECUCION", "u1").map((t) => t.id)).toEqual(["b"])
  })

  it("Mías keeps only the signed-in user's tasks, and nothing while the user is unknown", () => {
    expect(filterByPill(items, "mias", "u1").map((t) => t.id)).toEqual(["a", "c"])
    expect(filterByPill(items, "mias", null)).toEqual([])
  })
})

describe("virtual Nuevo proyecto column", () => {
  it("holds completed tasks whose opportunity is already in EJECUCION", () => {
    const converted = task({ estado: "COMPLETADA", oportunidad_id: "o1", oportunidad_fase: "EJECUCION" })
    expect(isConvertedToProject(converted)).toBe(true)
    expect(columnOf(converted)).toBe(NUEVO_PROYECTO)
  })

  it("leaves open tasks, prospecting tasks and unlinked tasks in their own column", () => {
    expect(columnOf(task({ estado: "EN_CURSO", oportunidad_id: "o1", oportunidad_fase: "EJECUCION" }))).toBe("EN_CURSO")
    expect(columnOf(task({ estado: "COMPLETADA", oportunidad_id: "o1", oportunidad_fase: "PROSPECCION" }))).toBe("COMPLETADA")
    expect(columnOf(task({ estado: "COMPLETADA" }))).toBe("COMPLETADA")
  })

  it("groups every task into exactly one column", () => {
    const grouped = groupByColumn([
      task({ id: "a", estado: "COMPLETADA", oportunidad_id: "o1", oportunidad_fase: "EJECUCION" }),
      task({ id: "b", estado: "COMPLETADA" }),
      task({ id: "c", estado: "CANCELADA" }),
    ])
    expect(grouped.NUEVO_PROYECTO.map((t) => t.id)).toEqual(["a"])
    expect(grouped.COMPLETADA.map((t) => t.id)).toEqual(["b"])
    expect(grouped.CANCELADA.map((t) => t.id)).toEqual(["c"])
  })
})

describe("cardAction", () => {
  it("follows the v7 linear path", () => {
    expect(NEXT_ESTADO).toEqual({
      POR_HACER: "EN_CURSO",
      EN_CURSO: "EN_REVISION",
      EN_REVISION: "COMPLETADA",
      BLOQUEADA: "EN_CURSO",
      EN_ESPERA: "EN_CURSO",
    })
    expect(cardAction(task({ estado: "POR_HACER" }), none)).toEqual({ kind: "advance", to: "EN_CURSO", label: "Avanzar →" })
    expect(cardAction(task({ estado: "EN_REVISION" }), none)).toEqual({ kind: "advance", to: "COMPLETADA", label: "Avanzar →" })
  })

  it("offers Reanudar for blocked and waiting tasks", () => {
    expect(cardAction(task({ estado: "BLOQUEADA" }), none)).toEqual({ kind: "advance", to: "EN_CURSO", label: "Reanudar →" })
    expect(cardAction(task({ estado: "EN_ESPERA" }), none)).toEqual({ kind: "advance", to: "EN_CURSO", label: "Reanudar →" })
  })

  it("never advances into BLOQUEADA (that needs a reason)", () => {
    for (const to of Object.values(NEXT_ESTADO)) expect(to).not.toBe("BLOQUEADA")
  })

  it("offers nothing on read-only or cancelled tasks, and nothing on a plain completed task", () => {
    expect(cardAction(task({ puede_editar: false }), none)).toBeNull()
    expect(cardAction(task({ estado: "CANCELADA" }), none)).toBeNull()
    expect(cardAction(task({ estado: "COMPLETADA" }), none)).toBeNull()
  })

  it("converts a completed prospecting task once its opportunity is eligible, otherwise hints", () => {
    const done = task({ estado: "COMPLETADA", oportunidad_id: "o1", oportunidad_fase: "PROSPECCION" })
    expect(cardAction(done, new Set(["o1"]))).toEqual({
      kind: "convert",
      oportunidadId: "o1",
      label: "Pasar a nuevo proyecto →",
    })
    expect(cardAction(done, none)?.kind).toBe("hint")
  })

  it("links converted tasks to the projects", () => {
    const converted = task({ estado: "COMPLETADA", oportunidad_id: "o1", oportunidad_fase: "EJECUCION" })
    expect(cardAction(converted, none)?.kind).toBe("open-project")
  })

  it("links a converted task to its exact project and shows the code (F7)", () => {
    const converted = task({
      estado: "COMPLETADA",
      oportunidad_id: "o1",
      oportunidad_fase: "EJECUCION",
      proyecto: { id: "p-7", codigo: "PRY-2026-007" },
    })
    expect(cardAction(converted, none)).toEqual({
      kind: "open-project",
      href: "/proyectos/p-7",
      label: "✓ Proyecto PRY-2026-007 · abrir ficha",
    })
  })

  it("falls back to the project list when the project is unknown (F7)", () => {
    const converted = task({ estado: "COMPLETADA", oportunidad_id: "o1", oportunidad_fase: "EJECUCION", proyecto: null })
    expect(cardAction(converted, none)).toEqual({
      kind: "open-project",
      href: "/proyectos",
      label: "✓ Proyecto creado · ver proyectos",
    })
  })
})
