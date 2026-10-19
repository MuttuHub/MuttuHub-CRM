import { describe, expect, it } from "vitest"
import {
  addLocalDays,
  alertTipo,
  alertWhere,
  emptyAlertBuckets,
  startOfLocalDay,
} from "./alerts"

const local = (y: number, m: number, d: number, h = 12, min = 0, s = 0, ms = 0) =>
  new Date(y, m, d, h, min, s, ms)

describe("startOfLocalDay", () => {
  it("zeroes the time of a given local date, keeping the day", () => {
    const start = startOfLocalDay(local(2026, 0, 5, 15, 30, 45, 123))
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(5)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
  })

  it("returns a new Date and does not mutate the input", () => {
    const input = local(2026, 6, 21, 18, 5)
    const start = startOfLocalDay(input)
    expect(start).not.toBe(input)
    expect(input.getHours()).toBe(18)
  })

  it("zeros the last day of a month without rolling into the next", () => {
    const start = startOfLocalDay(local(2026, 0, 31, 23, 59, 59, 999))
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(31)
    expect(start.getHours()).toBe(0)
  })

  it("keeps an already-zeroed date unchanged", () => {
    const start = startOfLocalDay(local(2026, 11, 31, 0))
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(11)
    expect(start.getDate()).toBe(31)
    expect(start.getTime()).toBe(local(2026, 11, 31, 0).getTime())
  })
})

describe("addLocalDays", () => {
  it("adds days keeping the time of day", () => {
    const next = addLocalDays(local(2026, 0, 10, 16, 45), 5)
    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(0)
    expect(next.getDate()).toBe(15)
    expect(next.getHours()).toBe(16)
    expect(next.getMinutes()).toBe(45)
  })

  it("rolls over from the end of a 31-day month", () => {
    const next = addLocalDays(local(2026, 0, 31), 1)
    expect(next.getMonth()).toBe(1)
    expect(next.getDate()).toBe(1)
  })

  it("handles non-leap February (2026) and leap year February (2028)", () => {
    expect(addLocalDays(local(2026, 1, 27), 1).getDate()).toBe(28)
    const leap = addLocalDays(local(2028, 1, 28), 1)
    expect(leap.getMonth()).toBe(1)
    expect(leap.getDate()).toBe(29)
  })

  it("rolls over the year boundary", () => {
    const next = addLocalDays(local(2026, 11, 31), 1)
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(0)
    expect(next.getDate()).toBe(1)
  })

  it("supports negative days and does not mutate the input", () => {
    const input = local(2026, 0, 1, 0)
    const prev = addLocalDays(input, -1)
    expect(prev.getFullYear()).toBe(2025)
    expect(prev.getMonth()).toBe(11)
    expect(prev.getDate()).toBe(31)
    expect(input.getTime()).toBe(new Date(2026, 0, 1, 0).getTime())
  })

  it("returns an equivalent time when adding zero days", () => {
    const input = local(2026, 5, 15, 9, 30)
    const same = addLocalDays(input, 0)
    expect(same.getTime()).toBe(input.getTime())
    expect(same).not.toBe(input)
  })
})

describe("emptyAlertBuckets", () => {
  it("returns three empty buckets", () => {
    expect(emptyAlertBuckets()).toEqual({ vencidos: [], hoy: [], proximos3: [] })
  })

  it("returns a fresh object on every call", () => {
    expect(emptyAlertBuckets()).not.toBe(emptyAlertBuckets())
  })
})

describe("alertTipo", () => {
  it("maps vencidos + KANBAN to TAREA_VENCIDA", () => {
    expect(alertTipo("vencidos", "KANBAN")).toBe("TAREA_VENCIDA")
  })

  it.each(["CRM", "AMBOS"] as const)(
    "maps vencidos + %s to COMPROMISO_VENCIDO",
    (origen) => {
      expect(alertTipo("vencidos", origen)).toBe("COMPROMISO_VENCIDO")
    },
  )

  it.each(["CRM", "KANBAN", "AMBOS"] as const)(
    "maps non-overdue buckets with origen %s to POR_VENCER",
    (origen) => {
      expect(alertTipo("hoy", origen)).toBe("POR_VENCER")
      expect(alertTipo("proximos3", origen)).toBe("POR_VENCER")
    },
  )
})

describe("alertWhere", () => {
  it("filters open, non-deleted tasks with a due date (scope own scopes to the user)", () => {
    expect(alertWhere("own", { id: "usuario-1" })).toEqual({
      deleted_at: null,
      fecha_entrega: { not: null },
      estado: { notIn: ["COMPLETADA", "CANCELADA"] },
      responsable_id: "usuario-1",
    })
  })

  it("omits responsable_id in scope all", () => {
    const where = alertWhere("all", { id: "usuario-1" })
    expect(where).toEqual({
      deleted_at: null,
      fecha_entrega: { not: null },
      estado: { notIn: ["COMPLETADA", "CANCELADA"] },
    })
    expect(where).not.toHaveProperty("responsable_id")
  })
})