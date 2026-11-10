// v7 alignment, unit C1a: the Clientes sub-navigation shell. These tests pin the
// three behaviours the shell owes: (1) the built sections render in the v7 order
// — NOT Convocatorias (which v7 has but the user's list does not) and NOT Mapa
// (still hidden by M4) — including Oportunidades, which V1 turned into a real
// section, (2) the active item follows the current route exactly, and (3)
// Aliados still renders the untouched ClientList. Interacciones (C3b),
// Relaciones (C4b), Salud (C5b), Automatizaciones (C7b) and Oportunidades (V1)
// render their real sections; Mapa still redirects to `/clientes`.

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CLIENTES_SECTIONS, ClientesSubNav } from "./clientes-subnav"

const { pathname, redirect } = vi.hoisted(() => ({ pathname: { value: "/clientes" }, redirect: vi.fn() }))

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, redirect }))

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

// Oportunidades (V1) renders the global kanban, which fetches its own feed;
// stub it so this shell test stays independent of the CRM data layer.
vi.mock("@/components/crm/oportunidades-kanban", () => ({
  OportunidadesKanban: () => <div data-testid="oportunidades-kanban-stub" />,
}))

import ClientesPage from "@/app/(app)/clientes/page"
import ClientesOportunidadesPage from "@/app/(app)/clientes/oportunidades/page"
import ClientesInteraccionesPage from "@/app/(app)/clientes/interacciones/page"
import ClientesRelacionesPage from "@/app/(app)/clientes/relaciones/page"
import ClientesSaludPage from "@/app/(app)/clientes/salud/page"
import ClientesMapaPage from "@/app/(app)/clientes/mapa/page"
import ClientesAutomatizacionesPage from "@/app/(app)/clientes/automatizaciones/page"

const REDIRECTED_PAGES = [{ label: "Mapa", Page: ClientesMapaPage }] as const

beforeEach(() => {
  pathname.value = "/clientes"
  redirect.mockClear()
})

describe("ClientesSubNav", () => {
  it("lists the built sections in order, including Oportunidades but without Mapa or Convocatorias", () => {
    expect(CLIENTES_SECTIONS.map((section) => section.label)).toEqual([
      "Aliados",
      "Oportunidades",
      "Interacciones",
      "Relaciones",
      "Salud",
      "Automatizaciones",
    ])
    render(<ClientesSubNav />)
    expect(screen.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
      "href",
      "/clientes/oportunidades",
    )
    expect(screen.queryByRole("link", { name: "Mapa" })).not.toBeInTheDocument()
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

  it.each(REDIRECTED_PAGES)("$label redirects to /clientes instead of a placeholder", ({ Page }) => {
    render(<Page />)
    expect(redirect).toHaveBeenCalledWith("/clientes")
  })

  it("Oportunidades renders the global kanban instead of redirecting", () => {
    render(<ClientesOportunidadesPage />)
    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByTestId("oportunidades-kanban-stub")).toBeInTheDocument()
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
