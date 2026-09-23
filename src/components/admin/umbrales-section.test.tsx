import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { UmbralesSection } from "./umbrales-section"

// admin-umbrales-semaforo-ui: same mocking pattern as
// documents/upload-dialog.test.tsx — mock the hooks module directly so the
// component test stays focused on UI/validation logic instead of wiring
// react-query + fetch end to end.
const { mutateMock, settingsQuery } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  settingsQuery: {
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      task_tags: ["Comercial"],
      doc_categories: [{ nombre: "Comercial", restringida: false }],
      semaforo_umbrales: {
        confirmado: true,
        tecnico: { verde: 0.85, rojo: 0.6 },
        financiero: { verde_min: 0.85, verde_max: 1.15, amarillo_min: 0.6, amarillo_max: 1.4 },
      },
    },
  },
}))

vi.mock("@/hooks/admin", () => ({
  useSettings: () => settingsQuery,
  useSaveSettings: () => ({ mutate: mutateMock, isPending: false }),
}))

function guardarButton() {
  return screen.getByRole("button", { name: /Guardar cambios/ })
}

function descartarButton() {
  return screen.getByRole("button", { name: "Descartar" })
}

describe("UmbralesSection", () => {
  beforeEach(() => {
    mutateMock.mockReset()
  })

  it("renders the default thresholds converted to percentages", () => {
    render(<UmbralesSection />)

    expect(screen.getByLabelText("Verde igual o mayor a (%)")).toHaveValue(85)
    expect(screen.getByLabelText("Rojo menor a (%)")).toHaveValue(60)
    expect(screen.getByLabelText("Verde mínimo (%)")).toHaveValue(85)
    expect(screen.getByLabelText("Verde máximo (%)")).toHaveValue(115)
    expect(screen.getByLabelText("Amarillo mínimo (%)")).toHaveValue(60)
    expect(screen.getByLabelText("Amarillo máximo (%)")).toHaveValue(140)
    expect(screen.getByRole("checkbox", { name: "Umbrales confirmados por el negocio" })).toBeChecked()
  })

  it("disables Guardar and Descartar until a field changes", () => {
    render(<UmbralesSection />)

    expect(guardarButton()).toBeDisabled()
    expect(descartarButton()).toBeDisabled()
  })

  it("shows an inline error and disables Guardar when tecnico.rojo exceeds tecnico.verde", async () => {
    const user = userEvent.setup()
    render(<UmbralesSection />)

    const rojoInput = screen.getByLabelText("Rojo menor a (%)")
    await user.clear(rojoInput)
    await user.type(rojoInput, "95")

    expect(
      screen.getByText("El umbral técnico 'rojo' no puede ser mayor que 'verde'."),
    ).toBeInTheDocument()
    expect(guardarButton()).toBeDisabled()
  })

  it("shows an inline error when financiero.verde_min exceeds financiero.verde_max", async () => {
    const user = userEvent.setup()
    render(<UmbralesSection />)

    const verdeMaxInput = screen.getByLabelText("Verde máximo (%)")
    await user.clear(verdeMaxInput)
    await user.type(verdeMaxInput, "80")

    expect(
      screen.getByText("El umbral financiero 'verde_min' no puede ser mayor que 'verde_max'."),
    ).toBeInTheDocument()
    expect(guardarButton()).toBeDisabled()
  })

  it("shows an inline error when financiero.amarillo_min exceeds financiero.amarillo_max", async () => {
    const user = userEvent.setup()
    render(<UmbralesSection />)

    const amarilloMaxInput = screen.getByLabelText("Amarillo máximo (%)")
    await user.clear(amarilloMaxInput)
    await user.type(amarilloMaxInput, "50")

    expect(
      screen.getByText("El umbral financiero 'amarillo_min' no puede ser mayor que 'amarillo_max'."),
    ).toBeInTheDocument()
    expect(guardarButton()).toBeDisabled()
  })

  it("marks the section dirty when toggling 'confirmado'", async () => {
    const user = userEvent.setup()
    render(<UmbralesSection />)

    await user.click(screen.getByRole("checkbox", { name: "Umbrales confirmados por el negocio" }))

    expect(guardarButton()).not.toBeDisabled()
  })

  it("saves the parsed ratios together with the current task_tags/doc_categories", async () => {
    const user = userEvent.setup()
    render(<UmbralesSection />)

    const verdeInput = screen.getByLabelText("Verde igual o mayor a (%)")
    await user.clear(verdeInput)
    await user.type(verdeInput, "90")

    await user.click(guardarButton())

    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task_tags: settingsQuery.data.task_tags,
        doc_categories: settingsQuery.data.doc_categories,
        semaforo_umbrales: {
          confirmado: true,
          tecnico: { verde: 0.9, rojo: 0.6 },
          financiero: { verde_min: 0.85, verde_max: 1.15, amarillo_min: 0.6, amarillo_max: 1.4 },
        },
      }),
      expect.anything(),
    )
  })
})
