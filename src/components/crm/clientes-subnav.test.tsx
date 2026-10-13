// v7 alignment, unit C1a: the Clientes sub-navigation shell. These tests pin the
// three behaviours the shell owes: (1) the seven sections render in the v7 order
// (and NOT Convocatorias, which v7 has but the user's list does not), (2) the
// active item follows the current route exactly, and (3) Aliados still renders
// the untouched ClientList. Interacciones (C3b), Relaciones (C4b), Salud (C5b)
// and Automatizaciones (C7b) left the placeholder set and now render their real
// sections; the remaining two still show the honest "en construcción"
// placeholder until units C2 and C6 land.

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CLIENTES_SECTIONS, ClientesSubNav } from "./clientes-subnav"

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/clientes" } }))

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }))

// jsdom cannot run Next's router; a plain anchor keeps the link semantics.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// The Aliados page must keep rendering ClientList; stub it so the test does not
// depend on the list's own data layer.
vi.mock("@/components/crm/client-list", () => ({
  ClientList: () => <div data-testid="client-list-stub" />,
}))

// Interacciones (C3b) renders a client feed that fetches its own data; stub both
// pieces so this shell test stays independent of the CRM data layer.
vi.mock("@/components/crm/interacciones-feed", () => ({
  InteraccionesFeed: () => <div data-testid="interacciones-feed-stub" />,
}))
vi.mock("@/components/crm/interaccion-form-dialog", () => ({
  RegistrarInteraccionButton: () => null,
}))

// Relaciones (C4b) renders the read-only quadrant map + contacts list, which
// fetches its own feed; stub it so this shell test stays independent of the CRM
// data layer.
vi.mock("@/components/crm/relaciones-vista", () => ({
  RelacionesVista: () => <div data-testid="relaciones-vista-stub" />,
}))

// Salud (C5b) renders the portfolio gauge + ranked list, which fetches its own
// feed; stub it so this shell test stays independent of the CRM data layer.
vi.mock("@/components/crm/salud-vista", () => ({
  SaludVista: () => <div data-testid="salud-vista-stub" />,
}))

// Automatizaciones (C7b) renders an admin settings form that reads its own
// settings query; stub it so this shell test stays independent of the CRM data
// layer.
vi.mock("@/components/crm/automatizaciones-vista", () => ({
  AutomatizacionesVista: () => <div data-testid="automatizaciones-vista-stub" />,
}))

import ClientesPage from "@/app/(app)/clientes/page"
import ClientesOportunidadesPage from "@/app/(app)/clientes/oportunidades/page"
import ClientesInteraccionesPage from "@/app/(app)/clientes/interacciones/page"
import ClientesRelacionesPage from "@/app/(app)/clientes/relaciones/page"
import ClientesSaludPage from "@/app/(app)/clientes/salud/page"
import ClientesMapaPage from "@/app/(app)/clientes/mapa/page"
import ClientesAutomatizacionesPage from "@/app/(app)/clientes/automatizaciones/page"

const PLACEHOLDER_PAGES = [
  ["Oportunidades", ClientesOportunidadesPage],
  ["Mapa", ClientesMapaPage],
] as const

beforeEach(() => {
  pathname.value = "/clientes"
})

describe("ClientesSubNav", () => {
  it("lists the seven v7 sections in order and leaves Convocatorias out", () => {
    expect(CLIENTES_SECTIONS.map((section) => section.label)).toEqual([
      "Aliados",
      "Oportunidades",
      "Interacciones",
      "Relaciones",
      "Salud",
      "Mapa",
      "Automatizaciones",
    ])
    render(<ClientesSubNav />)
    expect(screen.queryByRole("link", { name: "Convocatorias" })).not.toBeInTheDocument()
  })

  it.each(CLIENTES_SECTIONS.map((section) => [section.href, section.label] as const))(
    "marks only %s (%s) as the current page",
    (href, label) => {
      pathname.value = href
      render(<ClientesSubNav />)

      const active = screen.getByRole("link", { name: label })
      expect(active).toHaveAttribute("href", href)
      expect(active).toHaveAttribute("aria-current", "page")

      for (const other of CLIENTES_SECTIONS.filter((section) => section.href !== href)) {
        expect(screen.getByRole("link", { name: other.label })).not.toHaveAttribute("aria-current")
      }
    },
  )

  it("keeps Aliados inactive on a sibling route (exact match, no prefix)", () => {
    pathname.value = "/clientes/oportunidades"
    render(<ClientesSubNav />)
    expect(screen.getByRole("link", { name: "Aliados" })).not.toHaveAttribute("aria-current")
  })
})

describe("Clientes sections", () => {
  it("Aliados keeps rendering ClientList", () => {
    render(<ClientesPage />)
    expect(screen.getByTestId("client-list-stub")).toBeInTheDocument()
  })

  it.each(PLACEHOLDER_PAGES)("%s renders an honest 'en construcción' placeholder", (label, Page) => {
    render(<Page />)
    expect(screen.getByText(new RegExp(`${label}.*en construcción`, "i"))).toBeInTheDocument()
  })

  it("Interacciones renders the real feed instead of the placeholder", () => {
    render(<ClientesInteraccionesPage />)
    expect(screen.getByTestId("interacciones-feed-stub")).toBeInTheDocument()
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument()
  })

  it("Relaciones renders the real quadrant map instead of the placeholder", () => {
    render(<ClientesRelacionesPage />)
    expect(screen.getByTestId("relaciones-vista-stub")).toBeInTheDocument()
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument()
  })

  it("Salud renders the real section instead of the placeholder", () => {
    render(<ClientesSaludPage />)
    expect(screen.getByTestId("salud-vista-stub")).toBeInTheDocument()
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument()
  })

  it("Automatizaciones renders the real settings section instead of the placeholder", () => {
    render(<ClientesAutomatizacionesPage />)
    expect(screen.getByTestId("automatizaciones-vista-stub")).toBeInTheDocument()
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument()
  })
})
