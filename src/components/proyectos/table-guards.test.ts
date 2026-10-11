// U4: table headers come from the v6 `TableHead` primitive (12 px, bold, tracking-widest, uppercase, ink-500).
// This guard reads the real sources: no header may override the primitive's type scale, and raw `<th>`
// is only allowed in the print layouts (their own fixed scale, rendered outside the app shell).

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "..")

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx$/.test(name) && !name.includes(".test.") ? [full] : []
  })
}

const FILES = sources(ROOT).filter((f) => !f.endsWith(path.join("ui", "table.tsx")))
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/")
const OPENING_TAG = /<(TableHead|th)\b[^>]*>/g
const BANNED = /text-\[(?:10\.5|11|12|12\.5)px\]|tracking-\[[\d.]+em\]|\buppercase\b|text-ink-500|\bfont-(?:bold|semibold|medium)\b/

describe("table header styles", () => {
  it("no TableHead or th overrides the primitive's type scale, weight, tracking, case or colour", () => {
    const offenders: string[] = []
    for (const file of FILES.filter((f) => !/print-/.test(path.basename(f)))) {
      for (const tag of readFileSync(file, "utf8").matchAll(OPENING_TAG)) {
        const hit = BANNED.exec(tag[0])
        if (hit) offenders.push(`${rel(file)}: ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("raw <th> only appears in print layouts", () => {
    const offenders = FILES.filter((f) => !/print-/.test(path.basename(f)) && /<th\b/.test(readFileSync(f, "utf8"))).map(rel)
    expect(offenders).toEqual([])
  })
})
