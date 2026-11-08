// Historial › Versiones del plan (rediseño «Versiones-propuesta» / «Interacciones-Historial»): una tarjeta por
// versión, el comparador solo con dos o más, «Cómo cambia el plan» y las solicitudes. Las queries son reales; solo
// se burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { ProjectVersiones } from "./project-versiones"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  estado: "EN_EJECUCION",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: null,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  duracion_semanas: 17,
  valor_total: "177360000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 500,
  lineas: [],
  municipios: [],
}

const VERSIONES = [
  { numero: 1, tipo: "MODIFICACION", aprobado_at: "2026-10-20T15:00:00.000Z", aprobado_por: { id: "g1", nombre: "Gina Gerente" }, motivo: "Mover transporte a dotación", solicitud_id: "s1" },
  { numero: 0, tipo: "LINEA_BASE", aprobado_at: "2026-10-08T15:00:00.000Z", aprobado_por: { id: "g1", nombre: "Gina Gerente" }, motivo: null, solicitud_id: null },
]

const DIFERENCIAS = [
  { elemento: "presupuesto", clave: "R12", campo: "asignado", desde: "24000000.00", hasta: "23000000.00" },
  { elemento: "presupuesto", clave: "R13", campo: "asignado", desde: "12800000.00", hasta: "13800000.00" },
  { elemento: "programacion", clave: "R12|2027-01", campo: "valor", desde: "6000000.00", hasta: "5000000.00" },
  { elemento: "actividad", clave: "1.4", campo: "semana_fin", desde: "6", hasta: "8" },
  { elemento: "indicador", clave: "IND-03", campo: "existencia", desde: null, hasta: "presente" },
]

describe("ProjectVersiones", () => {
  const fetchMock = vi.fn()

  function setup({
    proyecto = {},
    versiones = VERSIONES as unknown,
    compare = { desde: "0", hasta: "vigente", diferencias: DIFERENCIAS } as unknown,
    versionesStatus = 200,
    solicitudes = [] as unknown[],
    rol = "GERENCIA",
    onVerSolicitudes,
  }: {
    proyecto?: Partial<ProjectListRow>
    versiones?: unknown
    compare?: unknown
    versionesStatus?: number
    solicitudes?: unknown[]
    rol?: string
    onVerSolicitudes?: () => void
  } = {}) {
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input)
      if (url.endsWith("/modifications")) return Promise.resolve(jsonResponse({ solicitudes }))
      if (url.endsWith("/members")) return Promise.resolve(jsonResponse({ miembros: [] }))
      if (url === "/api/v1/auth/me") return Promise.resolve(jsonResponse({ usuario: { id: "u1", nombre: "Yo", rol } }))
      if (url.includes("/versions/compare")) return Promise.resolve(jsonResponse(compare))
      if (url.endsWith("/versions")) {
        return Promise.resolve(
          versionesStatus === 200
            ? jsonResponse({ versiones })
            : jsonResponse({ error: "No tienes permisos sobre este proyecto.", code: "FORBIDDEN" }, versionesStatus),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
    return render(<ProjectVersiones proyecto={{ ...PROYECTO, ...proyecto }} onVerSolicitudes={onVerSolicitudes} />, {
      wrapper: createWrapper(),
    })
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("says the baseline is not approved yet for a BORRADOR project, and reads nothing", () => {
    setup({ proyecto: { estado: "BORRADOR" } })

    expect(screen.getByRole("heading", { name: "Versiones del plan" })).toBeInTheDocument()
    expect(screen.getByText("La línea base aún no está aprobada.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows one card per version, newest first, «Versión original» instead of v0 and «Vigente» on the latest", async () => {
    setup()

    const tarjetas = await screen.findAllByTestId("version-tarjeta")
    expect(tarjetas).toHaveLength(2)
    expect(within(tarjetas[0]).getByRole("heading", { level: 4 })).toHaveTextContent("Versión 1")
    expect(tarjetas[0]).toHaveTextContent("Modificación")
    expect(tarjetas[0]).toHaveTextContent("Vigente")
    expect(tarjetas[0]).toHaveTextContent("Aprobada por Gina Gerente el 20 oct 2026. Motivo: «Mover transporte a dotación»")
    expect(within(tarjetas[1]).getByRole("heading", { level: 4 })).toHaveTextContent("Versión original")
    expect(tarjetas[1]).toHaveTextContent("Línea base")
    expect(tarjetas[1]).not.toHaveTextContent("Vigente")
    expect(tarjetas[1]).toHaveTextContent(
      "Aprobada por Gina Gerente el 08 oct 2026. Es el plan contra el que se mide el avance programado.",
    )
    expect(screen.queryByText(/\bv0\b/)).not.toBeInTheDocument()
  })

  it("explains what a version of the plan is behind an ⓘ", async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole("button", { name: "Ayuda: Qué es una versión del plan" }))
    expect(await screen.findByText(/Cada modificación aprobada crea una versión nueva/)).toBeInTheDocument()
  })

  it("hides the comparator with a single version and says when it will appear, without comparing", async () => {
    setup({ versiones: [VERSIONES[1]] })

    const tarjeta = await screen.findByTestId("version-tarjeta")
    // T10 C11: white card with a border, as the prototype's `.card`.
    expect(tarjeta.className).toMatch(/(^|\s)surface-tile(\s|$)/)
    expect(tarjeta).toHaveTextContent("Versión original")
    expect(tarjeta).toHaveTextContent("Vigente")
    expect(
      screen.getByText(
        "Cuando Gerencia apruebe una solicitud de modificación, aquí aparecerá la versión 1 y podrás compararla con la original.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Desde" })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/versions/compare"))).toBe(false)
  })

  it("names the comparator options «Versión original», «Versión N» and «Vigente»", async () => {
    setup()

    await screen.findByTestId("versiones-diferencias")
    const desde = screen.getByRole("combobox", { name: "Desde" })
    expect(within(desde).getAllByRole("option").map((o) => o.textContent)).toEqual(["Versión original", "Versión 1"])
    const hasta = screen.getByRole("combobox", { name: "Hasta" })
    expect(within(hasta).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Versión original",
      "Versión 1",
      "Vigente",
    ])
  })

  it("explains how the plan changes, linking to the requests", async () => {
    const user = userEvent.setup()
    const onVerSolicitudes = vi.fn()
    setup({ onVerSolicitudes })

    const pasos = await screen.findByRole("region", { name: "Cómo cambia el plan" })
    expect(within(pasos).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1El equipo pide el cambio (presupuesto, cronograma o entregables) en «Solicitudes de modificación».",
      "2Gerencia la aprueba o la rechaza, con su motivo.",
      "3Si se aprueba, nace una versión nueva del plan; la original queda guardada.",
    ])
    await user.click(within(pasos).getByRole("button", { name: "«Solicitudes de modificación»" }))
    expect(onVerSolicitudes).toHaveBeenCalledTimes(1)
  })

  it("offers the request button in the empty requests block to who may request", async () => {
    setup()

    const titulo = await screen.findByText("Aún no hay solicitudes de modificación")
    const vacio = titulo.closest("[data-slot='empty-state']") as HTMLElement
    expect(await within(vacio).findByRole("button", { name: "Solicitar modificación" })).toBeInTheDocument()
  })

  it("points to the existing requests instead of the empty block", async () => {
    const user = userEvent.setup()
    const onVerSolicitudes = vi.fn()
    setup({ solicitudes: [{ id: "s1" }, { id: "s2" }], onVerSolicitudes })

    expect(await screen.findByText("Hay 2 solicitudes de modificación.")).toBeInTheDocument()
    expect(screen.queryByText("Aún no hay solicitudes de modificación")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Ver solicitudes" }))
    expect(onVerSolicitudes).toHaveBeenCalledTimes(1)
  })

  it("compares v0 against the vigente by default, grouped by element, with money formatted", async () => {
    setup()

    const comparacion = await screen.findByTestId("versiones-diferencias")
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions/compare?from=0&to=vigente", expect.any(Object))
    expect(screen.getByRole("heading", { name: "Comparar versiones" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Desde" })).toHaveValue("0")
    expect(screen.getByRole("combobox", { name: "Hasta" })).toHaveValue("vigente")

    const grupos = within(comparacion).getAllByTestId("diferencias-grupo")
    expect(grupos.map((g) => g.getAttribute("data-elemento"))).toEqual(["presupuesto", "programacion", "actividad", "indicador"])
    expect(grupos[0]).toHaveTextContent("Presupuesto")
    expect(grupos[0]).toHaveTextContent("R12")
    expect(grupos[0]).toHaveTextContent("$ 24.000.000")
    expect(grupos[0]).toHaveTextContent("$ 23.000.000")
    expect(grupos[1]).toHaveTextContent("R12 · 2027-01")
    expect(grupos[1]).toHaveTextContent("$ 5.000.000")
    expect(grupos[2]).toHaveTextContent("Semana final")
    expect(grupos[2]).toHaveTextContent("6")
    expect(grupos[2]).toHaveTextContent("8")
    expect(grupos[3]).toHaveTextContent("Aparece")
  })

  it("refetches when another version is chosen and shows the empty comparison", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByTestId("versiones-diferencias")

    fetchMock.mockImplementation((input: unknown) =>
      Promise.resolve(String(input).includes("/versions/compare") ? jsonResponse({ desde: "0", hasta: "0", diferencias: [] }) : jsonResponse({ versiones: VERSIONES })),
    )
    await user.selectOptions(screen.getByRole("combobox", { name: "Hasta" }), "0")
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects/p1/versions/compare?from=0&to=0", expect.any(Object)),
    )
    expect(await screen.findByText("Las dos versiones son iguales.")).toBeInTheDocument()
  })

  it("shows the API error inline when the versions cannot be read", async () => {
    setup({ versionesStatus: 403 })

    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permisos sobre este proyecto.")
    expect(screen.queryByTestId("version-tarjeta")).not.toBeInTheDocument()
  })
})
