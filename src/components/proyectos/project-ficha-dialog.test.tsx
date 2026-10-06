// Ficha de proyecto de solo lectura (E-06). Estas pruebas fijan lo observable:
// el estado cargado con sus campos (incluida la línea principal y los
// municipios), el esqueleto de carga y el estado de error legible para un
// 403/404. La query es real (`useProject`) y solo se burla `fetch`, igual que
// en projects.test.ts.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectFichaDialog } from "./project-ficha-dialog"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento de capacidades locales",
  estado: "EN_EJECUCION",
  origen: "OPORTUNIDAD",
  cliente: { id: "c1", nombre: "Alcaldía de Barranquilla" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: "-5000000.00",
  beneficiarios_meta: 1200,
  lineas: [
    { id: "l1", codigo: "LE-01", nombre: "Educación", principal: true },
    { id: "l2", codigo: "LE-02", nombre: "Salud", principal: false },
  ],
  municipios: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
}

function renderFicha(projectId = "p1") {
  return render(<ProjectFichaDialog projectId={projectId} onClose={vi.fn()} />, {
    wrapper: createWrapper(),
  })
}

describe("ProjectFichaDialog", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the loaded ficha fields, the principal line and the municipios", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ proyecto: PROYECTO })))

    renderFicha()

    expect(await screen.findByText(PROYECTO.nombre)).toBeInTheDocument()
    expect(screen.getByText("PRY-2026-001")).toBeInTheDocument()
    expect(screen.getByText("En ejecución")).toBeInTheDocument()
    expect(screen.getByText("Desde una oportunidad ganada")).toBeInTheDocument()
    expect(screen.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument()
    expect(screen.getByText("05 de ene de 2026")).toBeInTheDocument()
    expect(screen.getByText("30 de mar de 2026")).toBeInTheDocument()
    expect(screen.getByText("12 semanas")).toBeInTheDocument()
    expect(screen.getByText("$ 180.000.000")).toBeInTheDocument()
    expect(screen.getByText("1.200")).toBeInTheDocument()
    expect(screen.getByText("-$ 5.000.000")).toBeInTheDocument()

    // Las dos líneas, con la principal marcada de forma visible.
    expect(screen.getByText("Educación")).toBeInTheDocument()
    expect(screen.getByText("Salud")).toBeInTheDocument()
    expect(screen.getByText("Principal")).toBeInTheDocument()

    expect(screen.getByText("Barranquilla · Atlántico")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1", expect.any(Object))
  })

  it("omits the difference field when it is null (nothing writes it yet)", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ proyecto: { ...PROYECTO, diferencia_valor_oportunidad: null } }),
      ),
    )

    renderFicha()

    expect(await screen.findByText(PROYECTO.nombre)).toBeInTheDocument()
    expect(screen.queryByText("Diferencia valor oportunidad")).not.toBeInTheDocument()
    expect(screen.getByText("$ 180.000.000")).toBeInTheDocument()
  })

  it("shows a loading skeleton before the ficha arrives", () => {
    // Nunca resuelve: la query queda cargando.
    fetchMock.mockImplementation(() => new Promise(() => {}))

    renderFicha()

    // El diálogo se monta en un portal, fuera del contenedor de render.
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6)
    expect(screen.queryByText(PROYECTO.nombre)).not.toBeInTheDocument()
  })

  it("shows a readable error state instead of a blank dialog for a 403", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" },
          403,
        ),
      ),
    )

    renderFicha()

    const alerta = await screen.findByRole("alert")
    expect(alerta).toBeInTheDocument()
    expect(screen.getByText("No tienes permisos sobre este proyecto.")).toBeInTheDocument()
    expect(screen.queryByText(PROYECTO.nombre)).not.toBeInTheDocument()
  })

  it("shows the 404 envelope message when the project does not exist", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "El proyecto no existe.", code: "NOT_FOUND" }, 404)),
    )

    renderFicha()

    await waitFor(() =>
      expect(screen.getByText("El proyecto no existe.")).toBeInTheDocument(),
    )
  })
})
