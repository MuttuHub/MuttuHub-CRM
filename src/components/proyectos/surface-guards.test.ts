// U6: surfaces come from the v6 vocabulary (`surface`, `surface-inner`, `rounded-card`, `rounded-inner` in globals.css).
// Scope: every component under src/components (except the `ui/` primitives and print files) plus the src/app route
// components EXCEPT the explicit PENDING_DIRS below. It fails on NEW hard-coded surface containers: an element carrying
// `bg-panel` together with one of rounded-xl / rounded-2xl / rounded-[12..26px] / rounded-14.
// A justified exception carries `/* v6-surface */` inside the tag.

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { APP_ROOT, COMPONENTS_ROOT, lineOf, PRIMITIVES_DIR, rel, scanTags, walkSources } from "@/test/guard-utils"

const MARKER = "v6-surface"

// PENDING (still carrying the old surfaces, scoped out until migrated): the `(app)` route group (skeleton fallbacks in the
// clientes/documentos/proyectos/inicio pages and the shell frame in its layout) and the `api` handlers.
const PENDING_DIRS = ["app/(app)", "app/api"]

const subdirs = (root: string) =>
  readdirSync(root)
    .map((name) => path.join(root, name))
    .filter((dir) => statSync(dir).isDirectory())

const AREA_DIRS = [
  ...subdirs(COMPONENTS_ROOT).filter((dir) => rel(dir) !== PRIMITIVES_DIR),
  ...subdirs(APP_ROOT).filter((dir) => !PENDING_DIRS.includes(rel(dir))),
]

const BG_PANEL = /(?<![\w:[-])(?:[a-z]+:)*bg-panel(?:\/\d+)?(?![\w-])/
const RADIUS = /(?<![\w:[-])rounded-(?:xl|2xl|14|\[(?:1[2-9]|2[0-6])px\])(?![\w-])/

describe("surface vocabulary", () => {
  it("lists real source files for every area it scans", () => {
    for (const dir of AREA_DIRS) expect(walkSources(dir).length, rel(dir)).toBeGreaterThan(0)
  })

  it("no element combines bg-panel with a hard-coded card radius (use `surface` / `surface-inner`)", () => {
    const offenders: string[] = []
    for (const dir of AREA_DIRS) {
      for (const file of walkSources(dir)) {
        const text = readFileSync(file, "utf8")
        for (const tag of scanTags(text)) {
          if (tag.text.includes(MARKER)) continue
          const radius = RADIUS.exec(tag.text)?.[0]
          if (radius && BG_PANEL.test(tag.text)) {
            offenders.push(`${rel(file)}:${lineOf(text, tag.index)} <${tag.name}> bg-panel + ${radius}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
