// U6: surfaces come from the v6 vocabulary (`surface`, `surface-inner`, `rounded-card`, `rounded-inner` in globals.css).
// This guard reads the real sources of EVERY component under src/components (except the `ui/` primitives and `print-*`
// files) plus the route components of src/app, and fails on NEW hard-coded surface containers: an element carrying
// `bg-panel` together with one of rounded-xl / rounded-2xl / rounded-[12..26px] / rounded-14.
// A justified exception carries `/* v6-surface */` inside the tag.

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "..")
const APP_ROOT = path.resolve(ROOT, "..", "app")
const MARKER = "v6-surface"
const SKIPPED_DIRS = ["ui"]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === "print" ? [] : sources(full)
    return /\.tsx$/.test(name) && !name.includes(".test.") && !name.startsWith("print-") ? [full] : []
  })
}

// Every area directory under src/components (minus the primitives) plus the src/app routes.
// PENDING (outside the U6c edit surfaces, still carrying the old surfaces): the `(app)` route group (skeleton
// fallbacks in the clientes/documentos/proyectos/inicio pages and the shell frame in its layout). Scoped out until migrated.
const PENDING_DIRS = ["(app)", "api"]
const APP_AREAS = readdirSync(APP_ROOT)
  .filter((name) => statSync(path.join(APP_ROOT, name)).isDirectory() && !PENDING_DIRS.includes(name))
  .map((name) => path.join(APP_ROOT, name))
const AREA_DIRS = readdirSync(ROOT)
  .filter((name) => statSync(path.join(ROOT, name)).isDirectory() && !SKIPPED_DIRS.includes(name))
  .map((name) => path.join(ROOT, name))
  .concat(APP_AREAS)

const rel = (f: string) => path.relative(path.resolve(ROOT, ".."), f).split(path.sep).join("/")
const TAG = /<([A-Za-z][\w.]*)\b(?:[^<>{}]|\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\})*?\/?>/g
const BG_PANEL = /(?<![\w:[-])(?:[a-z]+:)*bg-panel(?:\/\d+)?(?![\w-])/
const RADIUS = /(?<![\w:[-])rounded-(?:xl|2xl|14|\[(?:1[2-9]|2[0-6])px\])(?![\w-])/

describe("surface vocabulary", () => {
  it("lists real source files for every area it scans", () => {
    for (const dir of AREA_DIRS) expect(sources(dir).length, rel(dir)).toBeGreaterThan(0)
  })

  it("no element combines bg-panel with a hard-coded card radius (use `surface` / `surface-inner`)", () => {
    const offenders: string[] = []
    for (const dir of AREA_DIRS) {
      for (const file of sources(dir)) {
        const text = readFileSync(file, "utf8")
        for (const m of text.matchAll(TAG)) {
          if (m[0].includes(MARKER)) continue
          const radius = RADIUS.exec(m[0])?.[0]
          if (radius && BG_PANEL.test(m[0])) {
            offenders.push(`${rel(file)}:${text.slice(0, m.index).split("\n").length} <${m[1]}> bg-panel + ${radius}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
