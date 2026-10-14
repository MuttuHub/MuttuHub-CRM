// U7: text on the selected-state fills of the origin pills/buttons (project-create-form, task-dialogs) must reach
// WCAG AA (4.5:1) in BOTH themes, computed from the real hex tokens in globals.css (no copied numbers).
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(path.resolve(__dirname, "..", "app", "globals.css"), "utf8")
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"))
const darkBlock = css.slice(css.indexOf(".dark {"), css.indexOf("@layer base"))
const themeBlock = css.slice(css.indexOf("@theme {"), css.indexOf("@theme inline"))

type Rgb = [number, number, number]
const hex = (v: string): Rgb => {
  const m = /#([0-9a-f]{6})/i.exec(v)
  if (!m) throw new Error(`not a hex: ${v}`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as Rgb
}
const token = (block: string, name: string): Rgb => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)
  if (!m) throw new Error(`--${name} missing`)
  return hex(m[1])
}
const mix = (fg: Rgb, bg: Rgb, alpha: number): Rgb => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb
const lum = ([r, g, b]: Rgb) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("selected origin pill contrast", () => {
  it("light: accent-soft text on the rose-50 fill", () => {
    expect(ratio(token(rootBlock, "accent-soft"), token(rootBlock, "rose-50"))).toBeGreaterThanOrEqual(4.5)
  })

  it("dark: accent-soft text on `dark:bg-rose-500/10` (create dialog pill) and on the 14 % accent-brand fill (task dialog)", () => {
    const panel = token(darkBlock, "panel")
    const soft = token(darkBlock, "accent-soft")
    const rose500 = hex(/--color-rose-500:\s*([^;]+);/.exec(themeBlock)![1])
    expect(ratio(soft, mix(rose500, panel, 0.1))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(soft, mix(token(darkBlock, "accent-brand"), panel, 0.14))).toBeGreaterThanOrEqual(4.5)
  })

  it("the old `text-rose-700` (fixed #940d44) would fail in dark: the reason the pills use the theme-aware token", () => {
    const panel = token(darkBlock, "panel")
    const rose700 = hex(/--color-rose-700:\s*([^;]+);/.exec(themeBlock)![1])
    expect(ratio(rose700, mix(hex("#cd1560"), panel, 0.1))).toBeLessThan(3)
  })
})

describe("selected origin classes use the theme-aware text token", () => {
  const src = (...p: string[]) => readFileSync(path.resolve(__dirname, "..", "components", ...p), "utf8")

  it("project-create-dialog: the selected origin pill has no fixed text-rose-700", () => {
    const pill = /origen === opcion\.value\s*\?\s*"([^"]*)"/.exec(src("proyectos", "project-create-form.tsx"))?.[1] ?? ""
    expect(pill).toContain("text-accent-soft")
    expect(pill).not.toContain("text-rose-700")
  })

  it("task-dialogs: the selected origin label has no fixed rose-700/400 text", () => {
    const label = /form\.origen === option\.value \? "([^"]*)"/g
    const hits = [...src("crm", "task-dialogs.tsx").matchAll(label)].map((m) => m[1]).filter((c) => /text-/.test(c))
    expect(hits.some((c) => c.includes("text-accent-soft"))).toBe(true)
    for (const c of hits) expect(c).not.toMatch(/text-rose-/)
  })
})
