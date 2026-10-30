/**
 * S3.6b: pure layout of the week Gantt. One bar per activity from
 * `semana_inicio` to `semana_fin`; weeks beyond the project duration are
 * flagged, never clamped (A-03); no dates or no activities means no chart.
 */

import { describe, expect, it } from "vitest"
import { ganttLayout, type GanttActividad } from "./gantt"

function act(partial: Partial<GanttActividad> & { id: string }): GanttActividad {
  return {
    objetivo_id: "o1",
    codigo: partial.id.toUpperCase(),
    nombre: `Actividad ${partial.id}`,
    semana_inicio: 1,
    semana_fin: 1,
    ...partial,
  }
}

describe("ganttLayout", () => {
  it("renders one bar per activity from semana_inicio to semana_fin", () => {
    const layout = ganttLayout(
      [act({ id: "a1", semana_inicio: 1, semana_fin: 3 }), act({ id: "a2", semana_inicio: 4, semana_fin: 4 })],
      6,
    )

    expect(layout.totalSemanas).toBe(6)
    expect(layout.barras).toHaveLength(2)
    expect(layout.barras[0]).toMatchObject({ id: "a1", columnaInicio: 1, columnaFin: 4, semanas: 3 })
    expect(layout.barras[1]).toMatchObject({ id: "a2", columnaInicio: 4, columnaFin: 5, semanas: 1 })
  })

  it("orders bars by start week, then code", () => {
    const layout = ganttLayout(
      [
        act({ id: "b", codigo: "ACT-2", semana_inicio: 2, semana_fin: 2 }),
        act({ id: "c", codigo: "ACT-3", semana_inicio: 1, semana_fin: 1 }),
        act({ id: "a", codigo: "ACT-1", semana_inicio: 2, semana_fin: 2 }),
      ],
      4,
    )

    expect(layout.barras.map((b) => b.id)).toEqual(["c", "a", "b"])
  })

  it("returns bars in start-week order", () => {
    const layout = ganttLayout(
      [act({ id: "a2", semana_inicio: 2 }), act({ id: "a1", semana_inicio: 1 })],
      2,
    )

    expect(layout.barras.map((b) => b.id)).toEqual(["a1", "a2"])
  })

  it("flags activities beyond the duration without clamping them", () => {
    const layout = ganttLayout(
      [
        act({ id: "a1", semana_inicio: 3, semana_fin: 6 }),
        act({ id: "a2", semana_inicio: 5, semana_fin: 8 }),
      ],
      6,
    )

    const [dentro, fuera] = layout.barras
    expect(dentro.fueraDeDuracion).toBe(false)
    expect(fuera).toMatchObject({ fueraDeDuracion: true, columnaInicio: 5, columnaFin: 9, semanas: 4 })
    // The grid grows to show the overflow instead of cutting the bar.
    expect(layout.duracionSemanas).toBe(6)
    expect(layout.totalSemanas).toBe(8)
  })

  it("has no chart without a duration (project without dates)", () => {
    expect(ganttLayout([act({ id: "a1" })], null)).toEqual({
      duracionSemanas: 0,
      totalSemanas: 0,
      barras: [],
    })
  })

  it("has no chart without activities", () => {
    expect(ganttLayout([], 8)).toEqual({ duracionSemanas: 8, totalSemanas: 0, barras: [] })
  })
})
