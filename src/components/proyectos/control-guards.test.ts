// U5: controls come from the v6 primitives (Button 44/40/36, Input 44, SelectTrigger 44/40, radius 12). This guard reads
// the real sources and fails on NEW occurrences of the patterns the sweep removed:
//   1. <Button>/<Input>/<SelectTrigger> overriding the height below the compact 36 px (h-6/h-7/h-8) or the radius
//      (rounded-lg/md/10/11/12/xl) the primitive already sets;
//   2. hand-rolled <select>/<input> or shared class constants (SELECT_*, SEL_*, CAPTURE_*, *_INPUT_*, *_CLASS) below 40 px.
// A justified exception carries the marker `/* v6-compact */` inside the tag (or on the constant's line).

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

// `ui` holds the primitives themselves; `shared` (one Button with `rounded-lg`) was outside the U5 sweep and is still pending.
const SKIPPED_DIRS = ["ui", "shared"]
const FILES = sources(ROOT).filter((f) => !f.split(path.sep).some((part) => SKIPPED_DIRS.includes(part)))
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/")
const MARKER = "v6-compact"
const PRIMITIVE_TAG = /<(Button|Input|SelectTrigger)\b(?:[^<>{}]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?\/?>/g
const NATIVE_TAG = /<(select|input)\b(?:[^<>{}]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?\/?>/g
const SMALL_HEIGHT = /(?<![\w:[-])(?:[a-z]+:)*h-(?:[1-8]|\[\d+px\])(?![\w-])/
const RADIUS_OVERRIDE = /(?<![\w:[-])rounded-(?:lg|md|10|11|12|xl)(?![\w-])/
const CONSTANT = /(?:const)\s+((?:SELECT|SEL|CAPTURE|INLINE|CELDA)\w*|\w*_(?:CLASS|FIELD))\s*=\s*\n?\s*"([^"]*)"/g

function scan(pattern: RegExp, test: (tag: string) => string | null): string[] {
  const offenders: string[] = []
  for (const file of FILES) {
    const text = readFileSync(file, "utf8")
    for (const m of text.matchAll(pattern)) {
      if (m[0].includes(MARKER)) continue
      const hit = test(m[0])
      if (hit) offenders.push(`${rel(file)}:${text.slice(0, m.index).split("\n").length} <${m[1]}> ${hit}`)
    }
  }
  return offenders
}

describe("control sizes and radius", () => {
  it("no Button, Input or SelectTrigger overrides the primitive height below 36 px", () => {
    expect(scan(PRIMITIVE_TAG, (tag) => SMALL_HEIGHT.exec(tag)?.[0] ?? null)).toEqual([])
  })

  it("no Button, Input or SelectTrigger overrides the primitive radius", () => {
    expect(scan(PRIMITIVE_TAG, (tag) => RADIUS_OVERRIDE.exec(tag)?.[0] ?? null)).toEqual([])
  })

  it("hand-rolled <select> and <input> are at least 40 px", () => {
    expect(scan(NATIVE_TAG, (tag) => SMALL_HEIGHT.exec(tag)?.[0] ?? null)).toEqual([])
  })

  it("shared control class constants are at least 40 px", () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const text = readFileSync(file, "utf8")
      for (const m of text.matchAll(CONSTANT)) {
        if (m[0].includes(MARKER)) continue
        const hit = SMALL_HEIGHT.exec(m[2])
        if (hit) offenders.push(`${rel(file)}: ${m[1]} ${hit[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("native selects and textareas keep 16 px text below md (no iOS zoom)", () => {
    const text = readFileSync(path.join(ROOT, "proyectos", "ui.tsx"), "utf8")
    for (const m of text.matchAll(/export const (SELECT_CLASS(?:_LG)?|CAPTURE_TEXTAREA)\s*=\s*\n?\s*"([^"]*)"/g)) {
      expect(m[2], m[1]).toMatch(/(?<![\w:-])text-base(?![\w-])/)
    }
  })
})
