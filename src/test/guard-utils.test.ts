// Tests for the shared source-guard helpers (tokenizer and class-constant reader).
import path from "node:path"
import { describe, expect, it } from "vitest"
import { classConstants, componentSources, lineOf, rel, scanTags, SRC_ROOT } from "./guard-utils"

const OLD_TAG = /<([A-Za-z][\w.]*)\b(?:[^<>{}]|\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\})*?\/?>/g

describe("scanTags", () => {
  it("keeps scanning past a bare `>` inside a className variant (the old regex stopped there)", () => {
    const src = `<Input className="[&>svg]:size-4 bg-panel rounded-xl" />`
    expect([...src.matchAll(OLD_TAG)][0][0]).not.toContain("rounded-xl")
    const [tag] = scanTags(src)
    expect(tag.name).toBe("Input")
    expect(tag.text).toBe(src)
    expect(tag.text).toContain("rounded-xl")
  })

  it("ignores `>` inside expression braces, arrow functions, strings and template literals", () => {
    const src = [
      "<Button onClick={() => go(a > b ? '>' : `x${y > 1 ? \"}\" : \"{\"}>`)} className=\"h-8\">ok</Button>",
      '<SelectTrigger className={cn("a>b", cond && "h-7")} />',
    ].join("\n")
    const tags = scanTags(src)
    expect(tags.map((t) => t.name)).toEqual(["Button", "SelectTrigger"])
    expect(tags[0].text.endsWith('className="h-8">')).toBe(true)
    expect(tags[1].text).toContain('"h-7"')
  })

  it("keeps a marker comment inside the tag", () => {
    const src = `<Input /* v6-compact */ className="h-7" />`
    expect(scanTags(src)[0].text).toContain("v6-compact")
  })

  it("does not treat comparisons or generics as tags", () => {
    expect(scanTags("const a = i<n && j>0; useState<Foo | null>(null)")).toEqual([])
  })

  it("filters by tag name and reports the start index", () => {
    const src = `<div>\n  <Input className="x" />\n  <span />\n</div>`
    const tags = scanTags(src, ["Input"])
    expect(tags).toHaveLength(1)
    expect(lineOf(src, tags[0].index)).toBe(2)
  })

  it("skips an unterminated tag without throwing", () => {
    expect(scanTags(`<Input className="x" <b>`)).toHaveLength(1)
  })
})

describe("classConstants", () => {
  it("reads *_CLASS, CLASS_*, SEL_*, SELECT_*, CAPTURE_* and INLINE_* string constants (also exported and on the next line)", () => {
    const src = [
      'const SEL_CLASS = "h-10 text-[12px]"',
      'export const SELECT_CLASS_LG =\n  "h-11 text-base"',
      'const CLASS_BOX = "a"',
      'const CAPTURE_FIELD = "h-11"',
      'const INLINE_X = "b"',
      'const OTHER = "nope"',
    ].join("\n")
    expect(classConstants(src).map((c) => c.name)).toEqual(["SEL_CLASS", "SELECT_CLASS_LG", "CLASS_BOX", "CAPTURE_FIELD", "INLINE_X"])
    expect(classConstants(src)[1].value).toBe("h-11 text-base")
  })
})

describe("componentSources", () => {
  it("returns src-relative paths, skips ui/ and print files, and uses one base for the skip list", () => {
    const files = componentSources().map(rel)
    expect(files.length).toBeGreaterThan(50)
    expect(files.every((f) => f.startsWith("components/") || f.startsWith("app/"))).toBe(true)
    expect(files.some((f) => f.startsWith("components/ui/"))).toBe(false)
    expect(files.some((f) => path.basename(f).startsWith("print-"))).toBe(false)
    expect(path.isAbsolute(SRC_ROOT)).toBe(true)
  })
})
