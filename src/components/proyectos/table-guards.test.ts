// U4: table headers come from the v6 `TableHead` primitive (12 px, bold, tracking-widest, uppercase, ink-500).
// Scope: every component under src/components (except the `ui/table.tsx` primitive and print files; src/app is not scanned).
// This guard reads the real sources: no header may override the primitive's type scale, and raw `<th>`
// is only allowed in the print layouts (their own fixed scale, rendered outside the app shell).

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { COMPONENTS_ROOT, lineOf, rel, scanTags, walkSources } from "@/test/guard-utils"

// Every non-print component under src/components except the `TableHead` primitive itself (`ui/table.tsx`).
const FILES = walkSources(COMPONENTS_ROOT).filter((f) => rel(f) !== "components/ui/table.tsx")
const BANNED = /text-\[(?:10\.5|11|12|12\.5)px\]|tracking-\[[\d.]+em\]|\buppercase\b|text-ink-500|\bfont-(?:bold|semibold|medium)\b/

describe("table header styles", () => {
  it("no TableHead or th overrides the primitive's type scale, weight, tracking, case or colour", () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const text = readFileSync(file, "utf8")
      for (const tag of scanTags(text, ["TableHead", "th"])) {
        const hit = BANNED.exec(tag.text)
        if (hit) offenders.push(`${rel(file)}:${lineOf(text, tag.index)}: ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("raw <th> only appears in print layouts", () => {
    const offenders = FILES.filter((f) => /<th\b/.test(readFileSync(f, "utf8"))).map(rel)
    expect(offenders).toEqual([])
  })
})
