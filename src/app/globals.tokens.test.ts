import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// V0.1 (v6 visual alignment): `.dark` adopts the v6 token VALUES; `:root`
// (light theme) must stay byte-for-byte frozen (decision D1). These tests
// read the raw CSS text instead of rendering it, since jsdom does not
// compute values from an unlinked stylesheet.

const cssPath = resolve(process.cwd(), "src/app/globals.css")
const css = readFileSync(cssPath, "utf8")

/** Extracts the declaration body of the first `selector {` block (brace-balanced). */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`selector not found: ${selector}`)
  let i = css.indexOf("{", start)
  let depth = 0
  const bodyStart = i + 1
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++
    else if (css[i] === "}") {
      depth--
      if (depth === 0) return css.slice(bodyStart, i)
    }
  }
  throw new Error(`unterminated block: ${selector}`)
}

function propValue(body: string, prop: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${prop.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}:\\s*([^;]+);`)
  return re.exec(body)?.[1]?.trim()
}

const root = block(":root")
const dark = block(".dark")

describe("globals.css design tokens (V0.1)", () => {
  describe("light theme (:root) stays frozen", () => {
    it.each([
      ["--background", "#fdfbfb"],
      ["--foreground", "#281d20"],
      ["--card", "#ffffff"],
      ["--primary", "#cd1560"],
      ["--primary-foreground", "#ffffff"],
      ["--secondary", "#f7f3f4"],
      ["--border", "#ece5e7"],
      ["--page", "#efeaeb"],
      ["--panel", "#fdfbfb"],
      ["--ink-500", "#846f74"],
      ["--ink-700", "#5a474c"],
      ["--exito", "#127c4a"],
      ["--alerta", "#b45309"],
      ["--destructivo", "#b3261e"],
      ["--info", "#1e5fa8"],
    ])("%s is unchanged (%s)", (prop, value) => {
      expect(propValue(root, prop)).toBe(value)
    })
  })

  describe(".dark adopts v6 values", () => {
    it.each([
      ["--background", "#120c0e"],
      ["--page", "#120c0e"],
      ["--card", "#1b1316"],
      ["--secondary", "#241a1e"],
      ["--muted", "#241a1e"],
      ["--accent", "#241a1e"],
      ["--border", "#2e2227"],
      ["--exito", "#4cc38a"],
      ["--alerta", "#f0a04b"],
      ["--destructivo", "#f07163"],
      ["--info", "#6aa6f0"],
      ["--ink-700", "#c4b2b8"],
      ["--ink-500", "#a08a91"],
    ])("%s -> %s", (prop, value) => {
      expect(propValue(dark, prop)).toBe(value)
    })

    it("--primary is v6 rose-500 with a white foreground (decision D1)", () => {
      expect(propValue(dark, "--primary")).toBe("#cd1560")
      expect(propValue(dark, "--primary-foreground")).toBe("#ffffff")
    })

    it("chip background tokens use a 15% color-mix instead of an opaque hex", () => {
      expect(propValue(dark, "--exito-bg")).toMatch(/color-mix\(in srgb, var\(--exito\) 15%, transparent\)/)
      expect(propValue(dark, "--alerta-bg")).toMatch(/color-mix\(in srgb, var\(--alerta\) 15%, transparent\)/)
      expect(propValue(dark, "--destructivo-bg")).toMatch(/color-mix\(in srgb, var\(--destructivo\) 15%, transparent\)/)
      expect(propValue(dark, "--info-bg")).toMatch(/color-mix\(in srgb, var\(--info\) 15%, transparent\)/)
    })

    it("--rose-50 (accent-tint) is an alpha mix of the accent-brand color", () => {
      expect(propValue(dark, "--rose-50")).toMatch(/color-mix\(in srgb, var\(--accent-brand\) 14%, transparent\)/)
    })
  })

  describe("new tokens added by V0.1", () => {
    it("--border-strong exists in both themes; :root reproduces the current single border weight", () => {
      expect(propValue(root, "--border-strong")).toBe("#ece5e7")
      expect(propValue(dark, "--border-strong")).toBe("#34272c")
    })

    it("--input-bg exists in both themes; :root reproduces the current (transparent-on-background) look", () => {
      expect(propValue(root, "--input-bg")).toBe("var(--background)")
      expect(propValue(dark, "--input-bg")).toBe("#120c0e")
    })

    it("--overlay exists in both themes; :root reproduces the current bg-black/10 overlay", () => {
      expect(propValue(root, "--overlay")).toBe("rgba(0, 0, 0, 0.1)")
      expect(propValue(dark, "--overlay")).toBe("rgba(12, 6, 9, 0.66)")
    })

    it("--accent-brand / --accent-tint exist in both themes", () => {
      expect(propValue(root, "--accent-brand")).toBe("#eb3f85")
      expect(propValue(dark, "--accent-brand")).toBe("#eb3f85")
      expect(propValue(root, "--accent-tint")).toBe("var(--rose-50)")
      expect(propValue(dark, "--accent-tint")).toBe("var(--rose-50)")
    })

    it("fixed-light toast tokens reproduce the current light card, unconditionally", () => {
      expect(propValue(root, "--toast-bg")).toBe("#ffffff")
      expect(propValue(root, "--toast-fg")).toBe("#281d20")
      expect(propValue(root, "--toast-border")).toBe("#ece5e7")
      // Not redefined in .dark: the value must fall through from :root.
      expect(propValue(dark, "--toast-bg")).toBeUndefined()
      expect(propValue(dark, "--toast-fg")).toBeUndefined()
      expect(propValue(dark, "--toast-border")).toBeUndefined()
    })
  })

  describe("shell radius and accent-soft are tokenized in @theme (fixed, non-flipping)", () => {
    const theme = block("@theme")
    const themeInline = block("@theme inline")

    it("--radius-26 exists for the shell radius (26px)", () => {
      expect(propValue(themeInline, "--radius-26")).toBe("26px")
    })

    it("--color-accent-soft is the fixed v6 accent-soft value", () => {
      expect(propValue(theme, "--color-accent-soft")).toBe("#f5bad2")
    })
  })
})
