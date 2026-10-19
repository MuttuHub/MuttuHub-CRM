// U5/U7: controls come from the v6 primitives (Button 44/40/36, Input 44, SelectTrigger 44/40, radius 12). This guard
// reads the real sources of EVERY component under src/components (except the `ui/` primitives and print files) plus ALL
// the src/app routes (no pending scope) and fails on NEW occurrences of the patterns the sweep removed:
//   1. <Button>/<Input>/<SelectTrigger> overriding the height below the compact 36 px (h-6/h-7/h-8) or the radius
//      (rounded-lg/md/10/11/12/xl) the primitive already sets;
//   2. hand-rolled <select>/<input> or shared class constants (SELECT_*, SEL_*, CAPTURE_*, INLINE_*, *_INPUT_*, *_CLASS) below 40 px;
//   3. a lone `text-[Npx]` on an Input/SelectTrigger/select/input tag, or on a control class CONSTANT (one that sets a
//      height): it must come as `text-base md:text-[Npx]`.
// A justified exception carries the marker `/* v6-compact */` inside the tag (or on the constant's line).
// JSX tags are found with the tokenizer in src/test/guard-utils.ts, not a regex.

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { classConstants, COMPONENTS_ROOT, componentSources, lineOf, rel, scanTags } from "@/test/guard-utils"

const FILES = componentSources()
const MARKER = "v6-compact"
const SMALL_HEIGHT = /(?<![\w:[-])(?:[a-z]+:)*h-(?:[1-8]|\[\d+px\])(?![\w-])/
const CONTROL_HEIGHT = /(?<![\w:[-])(?:[a-z]+:)*h-(?:\d|\[)/
const RADIUS_OVERRIDE = /(?<![\w:[-])rounded-(?:lg|md|10|11|12|xl)(?![\w-])/
const LONE_SIZE = /(?<![\w:[-])text-\[\d+(?:\.\d+)?px\](?![\w-])/
const PAIRED = /(?<![\w:[-])md:text-\[\d/
const BASE_SIZE = /(?<![\w:-])text-base(?![\w-])/
// Constants the height rule has always read, in addition to the shared name patterns of classConstants().
const HEIGHT_CONSTANT = /^(?:CELDA\w*|\w*_(?:CLASS|FIELD))$/

// PENDING constants (outside the U7 edit surfaces): explicit file:name entries, each scoped out until its file is migrated.
const PENDING_CONSTANTS = [
  // src/components/crm/client-sheet.tsx, `mt-1 h-10 px-2 text-[13.5px]`: the client sheet was not part of the U7 edit surface.
  "components/crm/client-sheet.tsx:INLINE_INPUT_CLASS",
]

// PENDING files per rule (src-relative). Found by the tokenizer in U7, whose edit surface did not include them; each entry is
// an explicit, reviewable scope-out to clear in the next UI task, not a silent skip.
const PENDING_TAG_FILES: Record<string, string[]> = {
  // <Button> in the upload dialog footer carries `rounded-lg` (primitive radius is 12 px).
  radius: ["components/documents/document-dialog.tsx"],
  // two comment/bitacora <Input className="... text-[13px]"> (lone size).
  font: ["components/kanban/task-dialog.tsx"],
}

type Hit = (tag: string) => string | null

function scan(names: readonly string[], test: Hit, rule?: keyof typeof PENDING_TAG_FILES): string[] {
  const offenders: string[] = []
  const pending = rule ? PENDING_TAG_FILES[rule] : []
  for (const file of FILES.filter((f) => !pending.includes(rel(f)))) {
    const text = readFileSync(file, "utf8")
    for (const tag of scanTags(text, names)) {
      if (tag.text.includes(MARKER)) continue
      const hit = test(tag.text)
      if (hit) offenders.push(`${rel(file)}:${lineOf(text, tag.index)} <${tag.name}> ${hit}`)
    }
  }
  return offenders
}

const PRIMITIVES = ["Button", "Input", "SelectTrigger"] as const
const NATIVE = ["select", "input"] as const
const CONTROLS = ["Input", "SelectTrigger", "select", "input"] as const

describe("control sizes and radius", () => {
  it("no Button, Input or SelectTrigger overrides the primitive height below 36 px", () => {
    expect(scan(PRIMITIVES, (tag) => SMALL_HEIGHT.exec(tag)?.[0] ?? null)).toEqual([])
  })

  it("no Button, Input or SelectTrigger overrides the primitive radius", () => {
    expect(scan(PRIMITIVES, (tag) => RADIUS_OVERRIDE.exec(tag)?.[0] ?? null, "radius")).toEqual([])
  })

  it("hand-rolled <select> and <input> are at least 40 px", () => {
    expect(scan(NATIVE, (tag) => SMALL_HEIGHT.exec(tag)?.[0] ?? null)).toEqual([])
  })

  it("shared control class constants are at least 40 px", () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const text = readFileSync(file, "utf8")
      for (const c of classConstants(text)) {
        if (c.line.includes(MARKER) || !HEIGHT_CONSTANT.test(c.name) && !/^(?:SEL|SELECT|CAPTURE|INLINE)_/.test(c.name)) continue
        const hit = SMALL_HEIGHT.exec(c.value)
        if (hit) offenders.push(`${rel(file)}: ${c.name} ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("small font sizes on controls come as `text-base md:text-[Npx]` (every scanned file)", () => {
    // The primitives set `text-base md:text-sm`: a lone `text-[Npx]` only replaces `text-base`, so `md:text-sm` still wins from md up.
    expect(scan(CONTROLS, (tag) => (!PAIRED.test(tag) && LONE_SIZE.exec(tag)?.[0]) || null, "font")).toEqual([])
  })

  it("control class constants (those that set a height) keep `text-base md:text-[Npx]`, never a lone size", () => {
    // Constants are passed to the primitives as variables (`className={cn(SEL_CLASS, ...)}`), so the tag scan never sees them.
    const offenders: string[] = []
    for (const file of FILES) {
      const text = readFileSync(file, "utf8")
      for (const c of classConstants(text)) {
        if (c.line.includes(MARKER) || PENDING_CONSTANTS.includes(`${rel(file)}:${c.name}`)) continue
        const size = LONE_SIZE.exec(c.value)?.[0]
        if (size && CONTROL_HEIGHT.test(c.value) && !PAIRED.test(c.value) && !BASE_SIZE.test(c.value)) {
          offenders.push(`${rel(file)}:${lineOf(text, c.index)} ${c.name} ${size}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("native selects and textareas keep 16 px text below md (no iOS zoom)", () => {
    const text = readFileSync(path.join(COMPONENTS_ROOT, "proyectos", "ui.tsx"), "utf8")
    for (const m of text.matchAll(/export const (SELECT_CLASS(?:_LG)?|CAPTURE_TEXTAREA)\s*=\s*\n?\s*"([^"]*)"/g)) {
      expect(m[2], m[1]).toMatch(/(?<![\w:-])text-base(?![\w-])/)
    }
  })
})
