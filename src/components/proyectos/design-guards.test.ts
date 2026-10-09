// S10 WU5: design guards read from the real sources (no screenshots). 1) the semáforo tones keep >= 4.5:1
// text contrast in light and dark, computed from the tokens in globals.css; 2) the Projects components do
// not use raw palette utilities that would not flip in dark mode.

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8")

/** Merges every `<selector> { ... }` block of the stylesheet into one token map. */
function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g")
  for (const block of css.matchAll(re)) {
    for (const decl of block[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6}|color-mix\([^;]*\))\s*;/g)) out[decl[1]] = decl[2]
  }
  return out
}

const toRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

/** Resolves a token to an opaque hex. `color-mix(in srgb, var(--x) N%, transparent)` is composited over `surface`. */
function solid(theme: Record<string, string>, name: string, surface: string): string {
  const value = theme[name]
  const mix = /^color-mix\(in srgb,\s*var\(--([\w-]+)\)\s+(\d+)%,\s*transparent\)$/.exec(value ?? "")
  if (!mix) return value
  const alpha = Number(mix[2]) / 100
  const fg = toRgb(theme[mix[1]])
  const bg = toRgb(surface)
  return toHex(fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)))
}

function channel(hex: string, i: number): number {
  const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The StatusChip pairs: text token on its tinted background (see ui/status-chip.tsx TONE_CLASS).
const SEMAFORO_PAIRS = [
  ["verde", "exito", "exito-bg"],
  ["amarillo", "alerta", "alerta-bg"],
  ["rojo", "destructivo", "destructivo-bg"],
] as const

describe("semáforo chip contrast (WCAG AA, 4.5:1)", () => {
  const themes = { light: tokens(":root"), dark: tokens(".dark") }

  it("parses the tokens of both themes", () => {
    for (const theme of Object.values(themes)) {
      for (const [, fg, bg] of SEMAFORO_PAIRS) {
        expect(theme[fg]).toMatch(/^#/)
        expect(solid(theme, bg, theme.card)).toMatch(/^#/)
      }
    }
  })

  for (const [themeName, theme] of Object.entries(themes)) {
    it.each(SEMAFORO_PAIRS)(`${themeName}: %s text on its background`, (_color, fg, bg) => {
      const ratio = contrast(theme[fg], solid(theme, bg, theme.card))
      expect(ratio, `${themeName} ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    })
  }

  it("the contrast helper matches known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1)
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1)
  })
})

describe("raw palette utilities in the Projects components", () => {
  const RAW = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?:\/\d+)?(?![\w-])/g

  it("every raw palette utility has a dark: pair on the same line (otherwise use a token)", () => {
    const dir = __dirname
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))) {
      readFileSync(path.join(dir, file), "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.trim().startsWith("//") || line.trim().startsWith("*")) return
          const hits = [...line.replace(/dark:[^\s"'`]+/g, "").matchAll(RAW)].map((m) => m[0])
          // White text on a solid brand fill (rose-500/700) is the one allowed fixed pair: both themes keep >= 4.5:1.
          const solidBrandFill = /bg-rose-(?:500|700)/.test(line)
          // Theme tokens that flip on their own (rose-50/100/200) or are fixed brand fills (bg-rose-500/700).
          const isToken = (hit: string) => /-rose-(?:50|100|200)(?:\/\d+)?$/.test(hit) || /^bg-rose-(?:500|700)$/.test(hit)
          const effective = hits.filter((hit) => !isToken(hit) && !(solidBrandFill && hit === "text-white"))
          if (effective.length > 0 && !/dark:/.test(line)) offenders.push(`${file}:${index + 1} ${effective.join(", ")}`)
        })
    }
    expect(offenders).toEqual([])
  })
})
