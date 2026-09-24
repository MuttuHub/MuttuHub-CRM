import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AccesoPage } from "./acceso-page"

// C6 (Important #6, hydration mismatch): `inputStyle` built the `padding`
// and `border` CSS properties as dynamic shorthand template strings. React
// serializes that shorthand verbatim into the SSR HTML; the browser's CSSOM
// then reparses the `style` attribute and re-derives its own form, which
// doesn't match what React recomputes on the client — React flags a
// hydration mismatch on that subtree. The fix replaces the shorthand with
// explicit longhand properties (paddingTop/Right/Bottom/Left,
// borderWidth/Style/Color).
//
// A real regression test would need `hydrateRoot` over server-rendered HTML,
// which isn't a pattern this project uses (jsdom + Testing Library only ever
// render the client tree — they never parse an HTML string and diff it the
// way Next.js's actual hydration pipeline does), so introducing it here
// would be disproportionate infrastructure for one bug. Instead this test
// verifies the same observable signal the bug hinges on: jsdom's CSSOM
// (`cssstyle`, same engine class as browsers) can't resolve a `border`
// shorthand whose color argument is a CSS custom property — the whole
// declaration is dropped, so `input.style.borderColor` comes back empty —
// while the longhand `borderColor` alone parses correctly. That gives a
// genuine RED (fails against the old shorthand styles) / GREEN (passes
// against the longhand fix) test instead of a frozen-implementation string
// check.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithOAuth: vi.fn() },
  }),
}))

function renderAcceso() {
  return render(
    <AccesoPage
      next="/"
      expired={false}
      solicitud={false}
      errorOauth={false}
      errorInactivo={false}
    />,
  )
}

describe("AccesoPage inputs — hydration-safe inline styles (C6)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  it("gives the password input more right padding than email, both keep the same left padding", () => {
    renderAcceso()
    const email = screen.getByLabelText("Correo corporativo")
    const password = screen.getByLabelText("Contraseña")

    // Password reserves room on the right for the "Ver/Ocultar" toggle.
    expect(Number.parseInt(getComputedStyle(password).paddingRight, 10)).toBeGreaterThan(
      Number.parseInt(getComputedStyle(email).paddingRight, 10),
    )
    expect(getComputedStyle(email).paddingRight).toBe("14px")
    expect(getComputedStyle(password).paddingRight).toBe("86px")
    expect(getComputedStyle(email).paddingLeft).toBe("14px")
    expect(getComputedStyle(password).paddingLeft).toBe("14px")
  })

  it("resolves the input border color via longhand borderColor instead of a broken shorthand+var() declaration", () => {
    renderAcceso()
    const email = screen.getByLabelText("Correo corporativo") as HTMLInputElement

    // Untouched/valid state: neutral border.
    expect(email.style.borderColor).toBe("var(--color-ink-300)")

    // Force `emailMal` the same way the component itself does: touch the
    // field with a value that fails its own email regex.
    fireEvent.change(email, { target: { value: "correo-invalido" } })

    expect(email.style.borderColor).toBe("var(--color-destructivo)")
  })
})
