// Import guards for the Projects v3 boundary (plan section 6, B0.2). The rules read the real sources,
// so a crossing fails here instead of showing up in review:
//   1. v1 — the Projects section shipped today — imports nothing from proyectos-v3;
//   2. v3 imports from src/components/proyectos/ only the pure modules in ALLOWED_FROM_V1.
// Crossing either line would break the promise that, with the flag off, v1 behaves exactly like main.

import path from "node:path"
import { describe, expect, it } from "vitest"
import { ALLOWED_FROM_V1, V1_ROOTS, V1_UI, V3_ROOTS, V3_UI, findViolations, readSources } from "./import-guards"

const allowed = [...ALLOWED_FROM_V1].join(", ")
const rel = (file: string) => path.relative(path.join(__dirname, "../.."), file).replace(/\\/g, "/")

describe("the boundary detector", () => {
  it("lets v3 reuse an allowed pure v1 module", () => {
    const sources = [
      {
        file: path.join(V3_UI, "portafolio.tsx"),
        text: 'import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display"\n',
      },
    ]
    expect(findViolations(sources)).toEqual([])
  })

  it("lets v3 reuse an allowed module through a relative path", () => {
    const sources = [
      {
        file: path.join(V3_UI, "data", "filas.ts"),
        text: 'import { formatFechaCalendario } from "../../proyectos/project-display"\n',
      },
    ]
    expect(findViolations(sources)).toEqual([])
  })

  it("flags v3 importing a v1 component outside the allowed list", () => {
    const file = path.join(V3_UI, "portafolio.tsx")
    const violations = findViolations([{ file, text: 'import { ProjectFicha } from "@/components/proyectos/project-ficha"\n' }])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(rel(file))
    expect(violations[0]).toContain("project-ficha")
    expect(violations[0]).toContain(allowed)
  })

  it("flags a relative crossing into a v1 component too", () => {
    const file = path.join(V3_UI, "data", "filas.ts")
    const violations = findViolations([{ file, text: 'import { FichaHeader } from "../../proyectos/ficha/ficha-header"\n' }])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("ficha-header")
  })

  it("flags a dynamic import of a v1 component", () => {
    const file = path.join(V3_UI, "portafolio.tsx")
    const violations = findViolations([{ file, text: 'const ficha = await import("@/components/proyectos/project-ficha")\n' }])
    expect(violations).toHaveLength(1)
  })

  it("flags v1 importing anything from v3", () => {
    const file = path.join(V1_UI, "project-list.tsx")
    const violations = findViolations([{ file, text: 'import { PortafolioV3 } from "@/components/proyectos-v3/portafolio"\n' }])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(rel(file))
    expect(violations[0]).toContain("v1 must not import v3")
  })

  it("ignores packages and imports inside the same side", () => {
    const sources = [
      { file: path.join(V1_UI, "project-ficha.tsx"), text: 'import { useState } from "react"\nimport { ESTADO_PROYECTO_META } from "./project-display"\n' },
      { file: path.join(V3_UI, "portafolio.tsx"), text: 'import path from "node:path"\nimport { ESTADO_PROYECTO_META } from "./data/filas"\n' },
    ]
    expect(findViolations(sources)).toEqual([])
  })
})

describe("the real sources", () => {
  it("v1 imports nothing from v3 and v3 reuses only the allowed v1 modules", () => {
    expect(findViolations(readSources([...V1_ROOTS, ...V3_ROOTS]))).toEqual([])
  })
})
