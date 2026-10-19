/**
 * WHY: S1.1b extends the suspended-rubro report with the amount sitting on those
 * lines (the number the team must reassign by hand). The planner is read-only, so
 * a fake client that only exposes `$queryRawUnsafe` proves it opens no write path.
 */
import { describe, expect, it, vi } from "vitest"

import { buildPlan } from "./s1-rubros-report-plan"

function fakeClient(responses: unknown[][]) {
  const queryRawUnsafe = vi.fn()
  for (const response of responses) queryRawUnsafe.mockResolvedValueOnce(response)
  return { client: { $queryRawUnsafe: queryRawUnsafe }, queryRawUnsafe }
}

describe("s1-rubros-report buildPlan", () => {
  it("reports zero rows when the budget tables are absent", async () => {
    const { client, queryRawUnsafe } = fakeClient([[{ lineas: null, rubros: "rubros" }]])
    const plan = await buildPlan(client)
    expect(plan.counts[0].existing).toBe(0)
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it("reports the line count and the summed amount per project", async () => {
    const { client, queryRawUnsafe } = fakeClient([
      [{ lineas: "lineas_presupuestales", rubros: "rubros" }],
      [
        { proyecto_id: "p1", lineas: 2, monto: "1500000.50" },
        { proyecto_id: "p2", lineas: 1, monto: "0.00" },
      ],
    ])
    const plan = await buildPlan(client)

    expect(plan.counts[0]).toMatchObject({ existing: 3 })
    expect(plan.decisions).toHaveLength(2)
    expect(plan.decisions[0].detail).toBe("2 budget line(s) on a suspended rubro, total 1500000.50 COP")
    expect(plan.decisions[1].detail).toContain("total 0.00 COP")
    expect(plan.actions).toEqual([])
    const sql = String(queryRawUnsafe.mock.calls[1][0])
    expect(sql).toContain("sum(lp.monto_proyectado_cop)")
    expect(sql.toLowerCase()).not.toMatch(/insert|update|delete/)
  })
})
