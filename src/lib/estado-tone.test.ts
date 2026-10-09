import { describe, expect, it } from "vitest"
import { toneFromSemaforo } from "./estado-tone"

// V0.3: bridges the semáforo bands (src/lib/semaforo.ts — verde/amarillo/rojo)
// onto the UiTone palette (src/lib/catalogs.ts) so ProgressBar/StatusChip can
// render a semáforo-derived state with the same tinted visual language as
// every other estado chip in the app.

describe("toneFromSemaforo", () => {
  it("maps verde to exito", () => {
    expect(toneFromSemaforo("verde")).toBe("exito")
  })

  it("maps amarillo to alerta", () => {
    expect(toneFromSemaforo("amarillo")).toBe("alerta")
  })

  it("maps rojo to destructivo", () => {
    expect(toneFromSemaforo("rojo")).toBe("destructivo")
  })
})
