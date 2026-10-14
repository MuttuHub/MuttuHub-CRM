import { describe, expect, it } from "vitest"
import { formatDiferenciaPp } from "./project-display"

describe("formatDiferenciaPp", () => {
  it("shows real - plan with its sign from the plan - real deviation of the API", () => {
    // PRY-2026-001: real 32,1 % vs plan 20,4 % -> desviacion_pp = -11,7 (plan - real) -> "+11,7 pp".
    expect(formatDiferenciaPp(-11.7)).toBe("+11,7 pp")
    expect(formatDiferenciaPp(35.7)).toBe("-35,7 pp")
  })

  it("never prints a signed zero", () => {
    expect(formatDiferenciaPp(0)).toBe("0 pp")
    expect(formatDiferenciaPp(0.04)).toBe("0 pp")
    expect(formatDiferenciaPp(-0.04)).toBe("0 pp")
  })
})
