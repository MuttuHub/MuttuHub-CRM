// The stepper page loads its project with a local query so a `?proyecto=<id>` that does not exist (404) fails
// at once instead of after the shared default's retries, which would keep the page loading for seconds.

import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/http"
import { reintentarProyecto } from "./use-proyecto-nuevo"

describe("reintentarProyecto", () => {
  it("never retries a 404: the project does not exist", () => {
    expect(reintentarProyecto(0, new ApiError("El proyecto no existe.", 404))).toBe(false)
  })

  it("keeps retrying other failures a few times, like the shared default", () => {
    expect(reintentarProyecto(0, new ApiError("Error", 500))).toBe(true)
    expect(reintentarProyecto(2, new Error("network"))).toBe(true)
    expect(reintentarProyecto(3, new Error("network"))).toBe(false)
  })
})
