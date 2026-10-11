// U6: surfaces come from the v6 vocabulary (`surface`, `surface-inner`, `rounded-card`, `rounded-inner` in globals.css).
// This guard reads the real sources of the AREAS ALREADY MIGRATED and fails on NEW hard-coded surface containers: an
// element carrying `bg-panel` together with one of rounded-xl / rounded-2xl / rounded-[16..26px] / rounded-14.
// Later U6 batches add their area to MIGRATED_AREAS. A justified exception carries `/* v6-surface */` inside the tag.

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "..")
const MIGRATED_AREAS = ["crm", "dashboard"]
const MARKER = "v6-surface"

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx$/.test(name) && !name.includes(".test.") ? [full] : []
  })
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/")
const TAG = /<([A-Za-z][\w.]*)\b(?:[^<>{}]|\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\})*?\/?>/g
const BG_PANEL = /(?<![\w:[-])(?:[a-z]+:)*bg-panel(?:\/\d+)?(?![\w-])/
const RADIUS = /(?<![\w:[-])rounded-(?:xl|2xl|14|\[(?:1[6-9]|2[0-6])px\])(?![\w-])/

describe("surface vocabulary", () => {
  it("lists real source files for every migrated area", () => {
    for (const area of MIGRATED_AREAS) expect(sources(path.join(ROOT, area)).length, area).toBeGreaterThan(0)
  })

  it("no element combines bg-panel with a hard-coded card radius (use `surface` / `surface-inner`)", () => {
    const offenders: string[] = []
    for (const area of MIGRATED_AREAS) {
      for (const file of sources(path.join(ROOT, area))) {
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
