import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// V0.1 (v6 visual alignment): `.dark` adopts the v6 token VALUES. U1b (D6): the
// light theme adopts the brand manual v2 values (it replaces the palette U1
// derived), verified against WCAG ratios below. These tests
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
  describe("light theme (:root) adopts the brand manual v2 palette", () => {
    it.each([
      ["--background", "#f6f1f3"],
      ["--foreground", "#281d20"],
      ["--card", "#ffffff"],
      ["--primary", "#cd1560"],
      ["--primary-foreground", "#ffffff"],
      ["--secondary", "#f7f3f4"],
      ["--border", "#ece5e7"],
      ["--page", "#f6f1f3"],
      ["--panel", "#ffffff"],
      ["--muted", "#f7f3f4"],
      ["--ink-100", "#f7f3f4"],
      ["--ink-500", "#725d62"],
      ["--muted-foreground", "#725d62"],
      ["--ring", "#cd1560"],
      ["--accent", "rgba(205, 21, 96, 0.08)"],
      ["--accent-foreground", "#940d44"],
      ["--radius", "0.75rem"],
      ["--exito-bg", "#e7f5ed"],
      ["--alerta-bg", "#fef4e6"],
      ["--destructivo-bg", "#fdecea"],
      ["--info-bg", "#eaf2fc"],
      ["--ink-700", "#5a474c"],
      ["--exito", "#127c4a"],
      ["--alerta", "#b45309"],
      ["--destructivo", "#b3261e"],
      ["--info", "#1e5fa8"],
    ])("%s is %s", (prop, value) => {
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
      ["--border", "#2e2227"],
      ["--exito", "#4cc38a"],
      ["--alerta", "#f0a04b"],
      ["--destructivo", "#f07163"],
      ["--info", "#6aa6f0"],
      ["--ink-700", "#c4b2b8"],
      ["--ink-500", "#a08a91"],
      ["--foreground", "#f8f2f4"],
      ["--muted-foreground", "#a08a91"],
      ["--destructive", "#f07163"],
      ["--input", "#34272c"],
      ["--ring", "#eb3f85"],
      ["--accent", "rgba(235, 63, 133, 0.14)"],
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

  describe("sidebar tokens (U1b/U3)", () => {
    // The manual wants a WHITE sidebar in light, but sidebar.tsx still hard-codes
    // light-on-dark text (shell-* tokens): flipping --sidebar now would make it
    // unreadable. U3 migrates the component and flips these tokens together.
    it("keep the dark shell until the sidebar component migrates (U3)", () => {
      expect(propValue(root, "--sidebar")).toBe("#191113")
      expect(propValue(dark, "--sidebar")).toBe("#0d0809")
    })
  })

  describe("semaphore and accent tokens pin the manual in both themes", () => {
    it.each([
      ["--exito", "#127c4a", "#4cc38a"],
      ["--alerta", "#b45309", "#f0a04b"],
      ["--destructivo", "#b3261e", "#f07163"],
      ["--info", "#1e5fa8", "#6aa6f0"],
    ])("%s light/dark", (prop, light, darkValue) => {
      expect(propValue(root, prop)).toBe(light)
      expect(propValue(dark, prop)).toBe(darkValue)
    })

    it("--color-rose-400 (dark-ready accent) is the manual's #eb3f85", () => {
      expect(propValue(block("@theme"), "--color-rose-400")).toBe("#eb3f85")
    })

    it("--border-strong light stays the accessible #9b8c91 (decision D6-3)", () => {
      expect(propValue(root, "--border-strong")).toBe("#9b8c91")
    })

    it("--destructive light #b3261e", () => {
      expect(propValue(root, "--destructive")).toBe("#b3261e")
    })
  })

  describe("v6 tokens exist in both themes", () => {
    it("--border-strong: light is a >= 3:1 control border, dark is the v6 #34272c", () => {
      expect(propValue(root, "--border-strong")).toBe("#9b8c91")
      expect(propValue(dark, "--border-strong")).toBe("#34272c")
    })

    it("--input-bg: light is a white field, dark is the v6 page color", () => {
      expect(propValue(root, "--input-bg")).toBe("#ffffff")
      expect(propValue(dark, "--input-bg")).toBe("#120c0e")
    })

    it("--overlay: light is a warm ink scrim, dark the v6 scrim", () => {
      expect(propValue(root, "--overlay")).toBe("rgba(40, 29, 32, 0.45)")
      expect(propValue(dark, "--overlay")).toBe("rgba(12, 6, 9, 0.66)")
    })

    it("--accent-brand / --accent-tint exist in both themes (manual accent)", () => {
      expect(propValue(root, "--accent-brand")).toBe("#b41153")
      expect(propValue(dark, "--accent-brand")).toBe("#eb3f85")
      expect(propValue(root, "--accent-tint")).toBe("var(--rose-50)")
      expect(propValue(dark, "--accent-tint")).toBe("var(--rose-50)")
    })

    it("--accent-bar (3px active rail): manual accent in light, brand pink in dark", () => {
      expect(propValue(root, "--accent-bar")).toBe("#b41153")
      expect(propValue(dark, "--accent-bar")).toBe("#cd1560")
      expect(propValue(block("@theme"), "--color-accent-bar")).toBe("var(--accent-bar)")
    })

    it("--input-bg and --border-strong are exposed as Tailwind colors", () => {
      expect(propValue(block("@theme"), "--color-border-strong")).toBe("var(--border-strong)")
      expect(propValue(block("@theme"), "--color-input-bg")).toBe("var(--input-bg)")
    })

    it("--shell-surface is the v6 surface #1b1316", () => {
      expect(propValue(block("@theme"), "--color-shell-surface")).toBe("#1b1316")
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

  describe("contrast (WCAG)", () => {
    const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const v = (body: string, prop: string) => propValue(body, prop) as string

    it.each([
      ["--ink-500 (table head, tertiary) on card", "--ink-500", "--card"],
      ["--ink-500 on page", "--ink-500", "--page"],
      ["--ink-500 on muted", "--ink-500", "--muted"],
      ["--muted-foreground on card", "--muted-foreground", "--card"],
      ["--foreground on card", "--foreground", "--card"],
      ["--primary on card (tab text/links)", "--primary", "--card"],
      ["--ink-700 (secondary) on page", "--ink-700", "--page"],
      ["--foreground on page", "--foreground", "--page"],
      ["--accent-foreground (accent-soft) on page", "--accent-foreground", "--page"],
      ["--destructivo on --destructivo-bg", "--destructivo", "--destructivo-bg"],
      ["--exito on --exito-bg", "--exito", "--exito-bg"],
      ["--alerta on --alerta-bg", "--alerta", "--alerta-bg"],
      ["--info on --info-bg", "--info", "--info-bg"],
    ])("light text: %s >= 4.5:1", (_n, fg, bg) => {
      expect(ratio(v(root, fg), v(root, bg))).toBeGreaterThanOrEqual(4.5)
    })

    it("accent #b41153 (manual light accent) passes AA on white and on the page", () => {
      expect(ratio("#b41153", "#ffffff")).toBeGreaterThanOrEqual(4.5)
      expect(ratio("#b41153", v(root, "--page"))).toBeGreaterThanOrEqual(4.5)
    })

    it("white on the brand primary is >= 4.5:1", () => {
      expect(ratio(v(root, "--primary-foreground"), v(root, "--primary"))).toBeGreaterThanOrEqual(4.5)
    })

    it.each([
      ["--ink-500 (table head, tertiary) on card", "--ink-500", "--card"],
      ["--ink-500 on page", "--ink-500", "--page"],
      ["--ink-700 (secondary) on card", "--ink-700", "--card"],
      ["--foreground on card", "--foreground", "--card"],
      ["--muted-foreground on card", "--muted-foreground", "--card"],
      ["--destructive on card", "--destructive", "--card"],
    ])("dark text: %s >= 4.5:1", (_n, fg, bg) => {
      expect(ratio(v(dark, fg), v(dark, bg))).toBeGreaterThanOrEqual(4.5)
    })

    it.each([
      ["--border-strong (control boundary) on --input-bg", "--border-strong", "--input-bg"],
      ["--border-strong on --card (D6-3: 2.87:1 on the page tint, fields sit on white)", "--border-strong", "--card"],
      ["--ring (focus) on --background", "--ring", "--background"],
      ["--primary (tab underline) on --card", "--primary", "--card"],
      ["--accent-bar on --card", "--accent-bar", "--card"],
    ])("light non-text: %s >= 3:1", (_n, fg, bg) => {
      expect(ratio(v(root, fg), v(root, bg))).toBeGreaterThanOrEqual(3)
    })

    it.each([
      ["--ring (focus) on --background", "--ring", "--background"],
      ["--accent-brand (underline/accent) on --card", "--accent-brand", "--card"],
      ["--accent-bar on --card", "--accent-bar", "--card"],
    ])("dark non-text: %s >= 3:1", (_n, fg, bg) => {
      expect(ratio(v(dark, fg), v(dark, bg))).toBeGreaterThanOrEqual(3)
    })
  })

  describe("shell radius and accent-soft are tokenized in @theme", () => {
    const theme = block("@theme")
    const themeInline = block("@theme inline")

    it("--radius-26 exists for the shell radius (26px)", () => {
      expect(propValue(themeInline, "--radius-26")).toBe("26px")
    })

    it("--color-accent-soft flips: manual #940d44 in light, #f5bad2 in dark", () => {
      expect(propValue(theme, "--color-accent-soft")).toBe("var(--accent-soft)")
      expect(propValue(root, "--accent-soft")).toBe("#940d44")
      expect(propValue(dark, "--accent-soft")).toBe("#f5bad2")
    })
  })
})
