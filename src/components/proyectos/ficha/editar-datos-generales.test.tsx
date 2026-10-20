// "Editar datos generales" (UX-3): campos por estado, validación compartida con la creación, cuerpo mínimo del
// PATCH, el enlace a Modificaciones en ejecución y el refresco al guardar. Las queries son reales; solo se
// burla `fetch`.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListRow } from "@/hooks/projects"
import { EditarDatosGenerales } from "./editar-datos-generales"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const PROYECTO: ProjectListRow = {
  id: "p1",
  codigo: "PRY-2026-001",
  nombre: "Fortalecimiento",
  descripcion: "Alcance inicial",
  estado: "BORRADOR",
  origen: "INDEPENDIENTE",
  cliente: { id: "c1", nombre: "Alcaldía" },
  responsable: { id: "u1", nombre: "Ana Pérez" },
  fecha_inicio: "2026-01-05",
  fecha_fin: "2026-03-30",
  duracion_semanas: 12,
  valor_total: "180000000.00",
  diferencia_valor_oportunidad: null,
  alertas: [],
  beneficiarios_meta: 120,
  lineas: [
    { id: "l1", codigo: "LE01", nombre: "Empleabilidad", principal: true },
    { id: "l2", codigo: "LE02", nombre: "Emprendimiento", principal: false },
  ],
  municipios: [{ id: "m1", nombre: "Barranquilla", departamento: "Atlántico" }],
}
const EN_EJECUCION: ProjectListRow = { ...PROYECTO, estado: "EN_EJECUCION" }

describe("EditarDatosGenerales", () => {
  const fetchMock = vi.fn()
  let queryClient: QueryClient

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  function patches() {
    return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
  }

  function mockApi(patchResponse: () => Response = () => jsonResponse({ proyecto: PROYECTO })) {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "PATCH") return Promise.resolve(patchResponse())
      if (url.includes("/catalogs/users")) {
        return Promise.resolve(
          jsonResponse({ users: [{ id: "u1", nombre: "Ana Pérez" }, { id: "u2", nombre: "Luis Mora" }] }),
        )
      }
      if (url.includes("/strategic-lines")) {
        return Promise.resolve(
          jsonResponse({ lineas: [{ id: "l1", nombre: "Empleabilidad" }, { id: "l2", nombre: "Emprendimiento" }, { id: "l3", nombre: "Innovación" }] }),
        )
      }
      if (url.includes("/municipalities")) {
        return Promise.resolve(
          jsonResponse({
            municipios: [
              { id: "m1", nombre: "Barranquilla", departamento: "Atlántico" },
              { id: "m2", nombre: "Soledad", departamento: "Atlántico" },
            ],
          }),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
  }

  function renderDialog(proyecto: ProjectListRow = PROYECTO) {
    const onOpenChange = vi.fn()
    const onSolicitarModificacion = vi.fn()
    render(
      <EditarDatosGenerales
        proyecto={proyecto}
        open
        onOpenChange={onOpenChange}
        onSolicitarModificacion={onSolicitarModificacion}
      />,
      { wrapper },
    )
    return { onOpenChange, onSolicitarModificacion }
  }

  beforeEach(() => {
    fetchMock.mockReset()
    toast.success.mockReset()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.stubGlobal("fetch", fetchMock)
    mockApi()
  })

  afterEach(() => vi.unstubAllGlobals())

  describe("BORRADOR", () => {
    it("is an accessible dialog with every general field prefilled", async () => {
      renderDialog()

      const dialog = await screen.findByRole("dialog", { name: "Editar datos generales" })
      expect(within(dialog).getByLabelText("Nombre")).toHaveValue("Fortalecimiento")
      expect(within(dialog).getByLabelText(/Descripción/)).toHaveValue("Alcance inicial")
      expect(within(dialog).getByLabelText("Valor total")).toHaveValue(180000000)
      expect(within(dialog).getByLabelText("Fecha de inicio")).toHaveValue("2026-01-05")
      expect(within(dialog).getByLabelText("Fecha de fin")).toHaveValue("2026-03-30")
      expect(within(dialog).getByLabelText(/^Beneficiarios/)).toHaveValue(120)
      expect(await within(dialog).findByRole("combobox", { name: "Responsable" })).toBeInTheDocument()
      expect(await within(dialog).findByRole("checkbox", { name: "Incluir Innovación" })).not.toBeChecked()
      expect(within(dialog).getByRole("checkbox", { name: "Principal Empleabilidad" })).toBeChecked()
      expect(within(dialog).getByRole("button", { name: "Quitar Barranquilla" })).toBeInTheDocument()
      expect(within(dialog).queryByTestId("editar-solo-lectura")).not.toBeInTheDocument()
    })

    it("sends only what changed, then closes, refreshes the project and confirms", async () => {
      const user = userEvent.setup()
      const { onOpenChange } = renderDialog()
      const invalidate = vi.spyOn(queryClient, "invalidateQueries")
      const dialog = await screen.findByRole("dialog")

      const nombre = within(dialog).getByLabelText("Nombre")
      await user.clear(nombre)
      await user.type(nombre, "Fortalecimiento v2")
      await user.click(within(dialog).getByRole("combobox", { name: "Departamento" }))
      await user.click(await screen.findByRole("option", { name: "Atlántico" }))
      await user.click(within(dialog).getByRole("combobox", { name: "Municipio" }))
      await user.click(await screen.findByRole("option", { name: "Soledad" }))
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))

      await waitFor(() => expect(patches()).toHaveLength(1))
      const [url, init] = patches()[0]!
      expect(url).toBe("/api/v1/projects/p1")
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        nombre: "Fortalecimiento v2",
        municipio_ids: ["m1", "m2"],
      })
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects"] })
      expect(toast.success).toHaveBeenCalledWith("Datos generales guardados.")
    })

    it("closes without a request when nothing changed", async () => {
      const user = userEvent.setup()
      const { onOpenChange } = renderDialog()

      await user.click(await screen.findByRole("button", { name: "Guardar cambios" }))

      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(patches()).toHaveLength(0)
    })

    it("blocks an end date that is not after the start (F4), announces it and focuses the field", async () => {
      const user = userEvent.setup()
      renderDialog()
      const dialog = await screen.findByRole("dialog")

      const fin = within(dialog).getByLabelText("Fecha de fin")
      await user.clear(fin)
      await user.type(fin, "2026-01-05")
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))

      const alerta = await within(dialog).findByRole("alert")
      expect(alerta).toHaveTextContent("La fecha de fin debe ser posterior a la fecha de inicio.")
      expect(fin).toHaveAttribute("aria-invalid", "true")
      expect(fin).toHaveAttribute("aria-describedby", alerta.id)
      expect(fin).toHaveFocus()
      expect(patches()).toHaveLength(0)
    })

    it("blocks a value of zero (F5) and a description over 2000 characters is capped by the field", async () => {
      const user = userEvent.setup()
      renderDialog()
      const dialog = await screen.findByRole("dialog")

      const valor = within(dialog).getByLabelText("Valor total")
      await user.clear(valor)
      await user.type(valor, "0")
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("El valor total debe ser mayor que cero.")
      expect(within(dialog).getByLabelText(/Descripción/)).toHaveAttribute("maxlength", "2000")
      expect(patches()).toHaveLength(0)
    })

    it("requires exactly one principal line and at least one municipio", async () => {
      const user = userEvent.setup()
      renderDialog()
      const dialog = await screen.findByRole("dialog")

      await user.click(await within(dialog).findByRole("checkbox", { name: "Principal Empleabilidad" }))
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Marca una línea estratégica como principal.")

      await user.click(within(dialog).getByRole("checkbox", { name: "Principal Empleabilidad" }))
      // El proyecto ya tiene Barranquilla: se quita con su chip para dejar la selección vacía.
      await user.click(within(dialog).getByRole("button", { name: "Quitar Barranquilla" }))
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Selecciona al menos un municipio.")
      expect(patches()).toHaveLength(0)
    })

    it("shows the server message inline when the save is refused", async () => {
      mockApi(() => jsonResponse({ error: "El proyecto cambió de estado mientras lo editabas.", code: "INVALID_STATE" }, 409))
      const user = userEvent.setup()
      const { onOpenChange } = renderDialog()
      const dialog = await screen.findByRole("dialog")

      await user.type(within(dialog).getByLabelText("Nombre"), " bis")
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("El proyecto cambió de estado mientras lo editabas.")
      expect(onOpenChange).not.toHaveBeenCalled()
    })
  })

  describe("EN_EJECUCION", () => {
    it("edits only description and beneficiaries; dates and value are read-only with the explanation", async () => {
      renderDialog(EN_EJECUCION)

      const dialog = await screen.findByRole("dialog", { name: "Editar datos generales" })
      expect(within(dialog).getByLabelText(/Descripción/)).toHaveValue("Alcance inicial")
      expect(within(dialog).getByLabelText(/^Beneficiarios/)).toHaveValue(120)
      for (const label of ["Nombre", "Valor total", "Fecha de inicio", "Fecha de fin"]) {
        expect(within(dialog).queryByLabelText(label)).not.toBeInTheDocument()
      }
      expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument()
      const lectura = within(dialog).getByTestId("editar-solo-lectura")
      expect(lectura).toHaveTextContent("Cambian la línea base: solicítalo como modificación.")
      expect(lectura).toHaveTextContent("$")
      expect(within(dialog).getByText("La versión aprobada conserva el número original.")).toBeInTheDocument()
    })

    it("sends only descripcion and beneficiarios_meta", async () => {
      const user = userEvent.setup()
      const { onOpenChange } = renderDialog(EN_EJECUCION)
      const dialog = await screen.findByRole("dialog")

      const descripcion = within(dialog).getByLabelText(/Descripción/)
      await user.clear(descripcion)
      await user.type(descripcion, "Alcance ajustado")
      const beneficiarios = within(dialog).getByLabelText(/^Beneficiarios/)
      await user.clear(beneficiarios)
      await user.type(beneficiarios, "150")
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))

      await waitFor(() => expect(patches()).toHaveLength(1))
      expect(JSON.parse((patches()[0]![1] as RequestInit).body as string)).toEqual({
        descripcion: "Alcance ajustado",
        beneficiarios_meta: 150,
      })
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    it("does not let the beneficiaries be emptied or zero (same rule as the baseline approval)", async () => {
      const user = userEvent.setup()
      renderDialog(EN_EJECUCION)
      const dialog = await screen.findByRole("dialog")

      await user.clear(within(dialog).getByLabelText(/^Beneficiarios/))
      await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))

      expect(await within(dialog).findByRole("alert")).toHaveTextContent("El número de beneficiarios debe ser mayor que cero.")
      expect(patches()).toHaveLength(0)
    })

    it("links to the modification request from the read-only block", async () => {
      const user = userEvent.setup()
      const { onSolicitarModificacion } = renderDialog(EN_EJECUCION)

      await user.click(await screen.findByRole("button", { name: "Solicitar modificación" }))

      expect(onSolicitarModificacion).toHaveBeenCalledTimes(1)
    })
  })

  it("renders nothing for a state whose general data cannot be edited", () => {
    renderDialog({ ...PROYECTO, estado: "CERRADO" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
