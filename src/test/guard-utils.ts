// Shared helpers for the source-reading guard tests (surface, control and table guards). Test-only: it lives in
// src/test, outside src/components and src/app (the trees the guards scan) and is never imported by app code.
// ONE base for every path: `rel()` and the skip list are both relative to `src/` and use forward slashes.

import { readdirSync, statSync } from "node:fs"
import path from "node:path"

export const SRC_ROOT = path.resolve(__dirname, "..")
export const COMPONENTS_ROOT = path.join(SRC_ROOT, "components")
export const APP_ROOT = path.join(SRC_ROOT, "app")

/** src-relative, forward-slash path (e.g. `components/crm/client-list.tsx`). */
export const rel = (file: string): string => path.relative(SRC_ROOT, file).split(path.sep).join("/")

/** Directories (src-relative prefixes) that hold the primitives themselves. */
export const PRIMITIVES_DIR = "components/ui"

type WalkOptions = {
  /** src-relative directory prefixes to skip (matched on whole path segments). */
  skip?: string[]
  /** Include the `print` directories and `print-*` files (default: excluded). */
  includePrint?: boolean
}

const isUnder = (relative: string, prefix: string) => relative === prefix || relative.startsWith(`${prefix}/`)

/** Production `.tsx` files under `dir` (tests excluded). */
export function walkSources(dir: string, { skip = [], includePrint = false }: WalkOptions = {}): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    const relative = rel(full)
    if (skip.some((prefix) => isUnder(relative, prefix))) return []
    if (statSync(full).isDirectory()) return !includePrint && name === "print" ? [] : walkSources(full, { skip, includePrint })
    if (!/\.tsx$/.test(name) || name.includes(".test.")) return []
    return !includePrint && name.startsWith("print-") ? [] : [full]
  })
}

/** Every component (minus the `ui/` primitives and print files) plus all the `src/app` routes. */
export function componentSources(): string[] {
  return [...walkSources(COMPONENTS_ROOT, { skip: [PRIMITIVES_DIR] }), ...walkSources(APP_ROOT)]
}

export const lineOf = (text: string, index: number): number => text.slice(0, index).split("\n").length

export type JsxTag = { name: string; text: string; index: number }

function skipString(text: string, i: number): number {
  const quote = text[i]
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === "\\") j++
    else if (text[j] === quote) return j + 1
  }
  return text.length
}

function skipTemplate(text: string, i: number): number {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === "\\") j++
    else if (text[j] === "`") return j + 1
    else if (text[j] === "$" && text[j + 1] === "{") j = skipBraces(text, j + 1) - 1
  }
  return text.length
}

/** `i` points at `{`; returns the index just after the matching `}` (strings, templates and comments are skipped). */
function skipBraces(text: string, i: number): number {
  let depth = 0
  for (let j = i; j < text.length; j++) {
    const c = text[j]
    if (c === "{") depth++
    else if (c === "}" && --depth === 0) return j + 1
    else if (c === '"' || c === "'") j = skipString(text, j) - 1
    else if (c === "`") j = skipTemplate(text, j) - 1
    else if (c === "/" && text[j + 1] === "*") j = (text.indexOf("*/", j + 2) + 1 || text.length) - 1
    else if (c === "/" && text[j + 1] === "/") j = (text.indexOf("\n", j) + 1 || text.length) - 1
  }
  return text.length
}

/** End index (exclusive) of the JSX opening tag that starts at `<` position `start`, or -1 when malformed. */
function tagEnd(text: string, start: number, nameEnd: number): number {
  for (let j = nameEnd; j < text.length; j++) {
    const c = text[j]
    if (c === ">") return j + 1
    if (c === "<") return -1
    if (c === "{") j = skipBraces(text, j) - 1
    else if (c === '"' || c === "'") j = skipString(text, j) - 1
    else if (c === "`") j = skipTemplate(text, j) - 1
    else if (c === "/" && text[j + 1] === "*") j = (text.indexOf("*/", j + 2) + 1 || text.length) - 1
  }
  return -1
}

/**
 * JSX opening tags of `text` (optionally only those named in `names`). Unlike a regex it tracks string quotes, template
 * literals, comments and `{...}` nesting, so a bare `>` inside a className (`[&>svg]:size-4`) or an expression does not end
 * the tag. A `<` preceded by an identifier char, `)` or `]` is a comparison or a generic, not a tag.
 */
export function scanTags(text: string, names?: readonly string[]): JsxTag[] {
  const tags: JsxTag[] = []
  const open = /<([A-Za-z][\w.]*)/g
  let m: RegExpExecArray | null
  while ((m = open.exec(text))) {
    if (/[\w$)\]]/.test(text[m.index - 1] ?? "")) continue
    if (names && !names.includes(m[1])) continue
    const end = tagEnd(text, m.index, m.index + m[0].length)
    if (end < 0) continue
    tags.push({ name: m[1], text: text.slice(m.index, end), index: m.index })
    open.lastIndex = end
  }
  return tags
}

export type ClassConstant = { name: string; value: string; index: number; line: string }

const CLASS_CONSTANT = /\bconst\s+(\w*_CLASS\w*|CLASS_\w+|(?:SEL|SELECT|CAPTURE|INLINE)_\w+)\s*=\s*\n?\s*"([^"]*)"/g

/** String class constants (`*_CLASS`, `CLASS_*`, `SEL_*`, `SELECT_*`, `CAPTURE_*`, `INLINE_*`) with their source line. */
export function classConstants(text: string): ClassConstant[] {
  return [...text.matchAll(CLASS_CONSTANT)].map((m) => ({
    name: m[1],
    value: m[2],
    index: m.index,
    line: m[0],
  }))
}
