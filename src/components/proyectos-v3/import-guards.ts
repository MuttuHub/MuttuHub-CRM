// Boundary rules for the Projects v3 section (plan section 6, B0.2). v3 is built beside v1, not on top
// of it: v1 must not import v3, and v3 may reuse only pure presentation modules from v1. The rules read
// real sources through import-guards.test.ts, so a crossing fails in the suite before it reaches review.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

const SRC = path.resolve(__dirname, "../..")

/** v3 surfaces: the components folder and the route added by B0.1. */
export const V3_UI = path.join(SRC, "components", "proyectos-v3")
export const V3_APP = path.join(SRC, "app", "(app)", "proyectos-v3")

/** v1 user interface, the side v3 must not couple to. */
export const V1_UI = path.join(SRC, "components", "proyectos")

/**
 * Extensionless module ids under V1_UI that v3 may import. A module belongs here only when it is pure
 * presentation: no React, no I/O, no v1 state. Adding one is a deliberate edit of this list.
 */
export const ALLOWED_FROM_V1: ReadonlySet<string> = new Set(["project-display"])

/** Every root that makes up each side of the frontier. */
export const V1_ROOTS = [
  path.join(SRC, "app", "(app)", "proyectos"),
  V1_UI,
  path.join(SRC, "lib", "proyectos"),
  path.join(SRC, "hooks", "projects.ts"),
]
export const V3_ROOTS = [V3_UI, V3_APP]

export type Source = { file: string; text: string }

const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs)$/

/** Every import specifier of one source, including `export … from`, `require` and dynamic `import()`. */
function specifiers(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map((imported) => imported.fileName)
}

/** Resolves a specifier to a path inside src, or null when it points at a package. */
function resolve(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith("@/")) return path.join(SRC, specifier.slice(2))
  if (specifier.startsWith(".")) return path.resolve(path.dirname(fromFile), specifier)
  return null
}

function isInside(target: string, root: string): boolean {
  const rel = path.relative(root, target)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

const isUnder = (target: string, roots: string[]) => roots.some((root) => isInside(target, root))
const display = (file: string) => path.relative(SRC, file).replace(/\\/g, "/")

/** The crossings of the frontier, one readable line each. Empty means the frontier holds. */
export function findViolations(sources: Source[]): string[] {
  const allowed = [...ALLOWED_FROM_V1].sort().join(", ")
  const violations: string[] = []
  for (const { file, text } of sources) {
    const fromV1 = isUnder(file, V1_ROOTS)
    const fromV3 = isUnder(file, V3_ROOTS)
    if (!fromV1 && !fromV3) continue
    for (const specifier of specifiers(text)) {
      const target = resolve(specifier, file)
      if (!target) continue
      if (fromV1 && isUnder(target, V3_ROOTS)) {
        violations.push(`${display(file)} imports ${specifier}: v1 must not import v3`)
      }
      if (fromV3 && isInside(target, V1_UI)) {
        const moduleId = path.relative(V1_UI, target).replace(/\\/g, "/").replace(SOURCE_FILE, "")
        if (!ALLOWED_FROM_V1.has(moduleId)) {
          violations.push(`${display(file)} imports ${specifier}: v3 may only reuse ${allowed} from v1`)
        }
      }
    }
  }
  return violations
}

/** Reads every source under the given roots; a root may be a file or a directory, and missing ones are skipped. */
export function readSources(roots: string[]): Source[] {
  const files: string[] = []
  const walk = (entry: string) => {
    if (!existsSync(entry)) return
    if (statSync(entry).isDirectory()) {
      for (const child of readdirSync(entry)) walk(path.join(entry, child))
    } else if (SOURCE_FILE.test(entry)) {
      files.push(entry)
    }
  }
  for (const root of roots) walk(root)
  return files.map((file) => ({ file, text: readFileSync(file, "utf8") }))
}
