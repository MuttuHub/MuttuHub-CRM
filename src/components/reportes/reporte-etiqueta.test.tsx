// Reportes › Etiqueta (T3: S2 footnote, S3 filters, S4 sections, S5 hidden sections, S6 print and Excel): the
// screen only paints what the server computes.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReporteEtiquetaParams } from "@/hooks/reportes"
import { REPORTE_ETIQUETA, REPORTE_ETIQUETA_SIN_COMERCIAL } from "./reporte-etiqueta.fixture"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }))

const useReporteEtiqueta = vi.fn()
const downloadReporteEtiqueta = vi.fn<(params: ReporteEtiquetaParams) => Promise<void>>(async () => undefined)
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteEtiqueta: (params: ReporteEtiquetaParams) => useReporteEtiqueta(params),
  downloadReporteEtiqueta: (params: ReporteEtiquetaParams) => downloadReporteEtiqueta(params),
}))
vi.mock("@/hooks/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/admin")>()),
  useTaskTags: () => ({ data: ["Comercial", "Aliado clave"] }),
}))

import { ReporteEtiquetaContenido, ReporteEtiquetaTab } from "./reporte-etiqueta"

const SIN_DATOS = { data: undefined, isLoading: false, isError: false, error: null }
const CON_DATOS = { data: REPORTE_ETIQUETA, isLoading: false, isError: false, error: null }

async function elegirEtiqueta(user: ReturnType<typeof userEvent.setup>, etiqueta = "Comercial") {
  await user.click(screen.getByRole("combobox", { name: "Etiqueta" }))
  await user.click(await screen.findByRole("option", { name: etiqueta }))
}

beforeEach(() => {
  useReporteEtiqueta.mockImplementation((params: ReporteEtiquetaParams) => (params.etiqueta ? CON_DATOS : SIN_DATOS))
})
afterEach(() => vi.clearAllMocks())

describe("ReporteEtiquetaTab", () => {
  it("asks for a tag before showing any report, with export and print unavailable", () => {
    render(<ReporteEtiquetaTab />)

    expect(screen.getByText("Elige una etiqueta para ver su reporte.")).toBeInTheDocument()
    expect(useReporteEtiqueta).toHaveBeenLastCalledWith({ etiqueta: "", desde: "", hasta: "" })
    expect(screen.queryByRole("region", { name: "Resumen" })).toBeNull()
    expect(screen.getByRole("button", { name: "Exportar Excel" })).toBeDisabled()
    expect(screen.queryByRole("link", { name: "Generar reporte" })).toBeNull()
  })

  it("passes the chosen tag and period to the report (S3)", async () => {
    const user = userEvent.setup()
    render(<ReporteEtiquetaTab />)

    await elegirEtiqueta(user, "Aliado clave")
    await user.type(screen.getByLabelText("Desde"), "2026-10-01")
    await user.type(screen.getByLabelText("Hasta"), "2026-10-31")

    expect(useReporteEtiqueta).toHaveBeenLastCalledWith({ etiqueta: "Aliado clave", desde: "2026-10-01", hasta: "2026-10-31" })
  })

  it("opens the printable tag report in the same tab with the filters in the URL (S6)", async () => {
    const user = userEvent.setup()
    render(<ReporteEtiquetaTab />)

    await elegirEtiqueta(user)
    await user.type(screen.getByLabelText("Desde"), "2026-10-01")

    const generar = screen.getByRole("link", { name: "Generar reporte" })
    expect(generar).toHaveAttribute("href", "/print/reportes/etiqueta?etiqueta=Comercial&desde=2026-10-01")
    expect(generar).not.toHaveAttribute("target")
  })

  it("exports the tag report to Excel with the filters and explains a failure", async () => {
    const user = userEvent.setup()
    render(<ReporteEtiquetaTab />)
    await elegirEtiqueta(user)
    await user.type(screen.getByLabelText("Hasta"), "2026-10-31")

    await user.click(screen.getByRole("button", { name: "Exportar Excel" }))
    expect(downloadReporteEtiqueta).toHaveBeenCalledWith({ etiqueta: "Comercial", desde: "", hasta: "2026-10-31" })

    downloadReporteEtiqueta.mockRejectedValueOnce(new Error("No tienes permisos para exportar."))
    await user.click(screen.getByRole("button", { name: "Exportar Excel" }))
    expect(toastError).toHaveBeenCalledWith("No tienes permisos para exportar.")
  })

  it("shows the server error instead of the report", async () => {
    useReporteEtiqueta.mockImplementation((params: ReporteEtiquetaParams) =>
      params.etiqueta
        ? { data: undefined, isLoading: false, isError: true, error: new Error("No tienes permisos para ver el tablero de proyectos.") }
        : SIN_DATOS,
    )
    const user = userEvent.setup()
    render(<ReporteEtiquetaTab />)
    await elegirEtiqueta(user)

    expect(screen.getByText("No tienes permisos para ver el tablero de proyectos.")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Resumen" })).toBeNull()
  })
})

describe("ReporteEtiquetaContenido", () => {
  it("renders the summary figures (S4.1)", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA} />)
    const resumen = screen.getByRole("region", { name: "Resumen" })
    expect(within(resumen).getByText("Clientes").parentElement).toHaveTextContent("2")
    expect(within(resumen).getByText("Valor total").parentElement).toHaveTextContent(/2\.500\.000/)
    expect(within(resumen).getByText("Ejecución presupuestal").parentElement).toHaveTextContent(/120\.000.*500\.000/)
    expect(within(resumen).getByText("Pipeline abierto").parentElement).toHaveTextContent(/800\.000/)
    expect(within(resumen).getByText("Tareas completadas").parentElement).toHaveTextContent("1 de 3")
    expect(within(resumen).getByText("Tareas vencidas").parentElement).toHaveTextContent("1")
  })

  it("lists each project with its state, progress, budget and semáforos (S4.2)", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA} />)
    const fila = within(screen.getByRole("region", { name: "Proyectos" })).getByRole("row", { name: /PRY-0001/ })
    expect(within(fila).getByText("Ruta del emprendimiento")).toBeInTheDocument()
    expect(within(fila).getByText("En ejecución")).toBeInTheDocument()
    expect(within(fila).getByText("42,5 %")).toBeInTheDocument()
    expect(within(fila).getByText("50 %")).toBeInTheDocument()
    expect(within(fila).getByText(/120\.000/)).toBeInTheDocument()
    expect(within(fila).getByText(/500\.000/)).toBeInTheDocument()
    expect(within(fila).getByText("Verde")).toBeInTheDocument()
    expect(within(fila).getByText("Rojo")).toBeInTheDocument()
  })

  it("labels a posición propia project «Posición propia · N aliados» and keeps a client's name (S12, T6b)", () => {
    const conCliente = REPORTE_ETIQUETA.proyectos[0]
    const propia = { ...conCliente, id: "p2", codigo: "PRY-0002", cliente: null, aliados_count: 2 }
    render(<ReporteEtiquetaContenido data={{ ...REPORTE_ETIQUETA, proyectos: [conCliente, propia] }} />)
    const proyectos = screen.getByRole("region", { name: "Proyectos" })
    expect(within(within(proyectos).getByRole("row", { name: /PRY-0002/ })).getByText("Posición propia · 2 aliados")).toBeInTheDocument()
    expect(within(within(proyectos).getByRole("row", { name: /PRY-0001/ })).getByText("Acme")).toBeInTheDocument()
  })

  it("lists clients and labels those without a recent interaction in text, not only color (S4.3)", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA} />)
    const clientes = screen.getByRole("region", { name: "Clientes" })
    expect(within(clientes).getByRole("columnheader", { name: "Oportunidades abiertas" })).toBeInTheDocument()

    const acme = within(clientes).getByRole("row", { name: /Acme/ })
    expect(within(acme).getByText("28 de oct de 2026")).toBeInTheDocument()
    expect(within(acme).queryByText("Más de 15 días sin interacción")).toBeNull()

    const beta = within(clientes).getByRole("row", { name: /Beta Fundación/ })
    expect(within(beta).getByText("Más de 15 días sin interacción")).toBeInTheDocument()
  })

  it("lists the open opportunities with state and value (S4.4)", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA} />)
    const fila = within(screen.getByRole("region", { name: "Oportunidades abiertas" })).getByRole("row", { name: /Convenio 2027/ })
    expect(within(fila).getByText("Acme")).toBeInTheDocument()
    expect(within(fila).getByText("En negociación")).toBeInTheDocument()
    expect(within(fila).getByText(/800\.000/)).toBeInTheDocument()
  })

  it("lists the bitácora with its next step (S4.5)", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA} />)
    const fila = within(screen.getByRole("region", { name: "Bitácora" })).getByRole("row", { name: /Revisamos el convenio/ })
    expect(within(fila).getByText("Reunión")).toBeInTheDocument()
    expect(within(fila).getByText("Enviar la propuesta firmada.")).toBeInTheDocument()
    expect(within(fila).getByText("Acme")).toBeInTheDocument()
  })

  it("lists the tagged tasks overdue first, marking only the overdue ones (S4.6)", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA} />)
    const tareas = screen.getByRole("region", { name: "Tareas" })
    const filas = within(tareas).getAllByRole("row").slice(1)
    expect(filas.map((f) => within(f).getAllByRole("cell")[0].textContent)).toEqual([
      "Llamar a Beta",
      "Preparar informe",
      "Enviar acta",
    ])
    expect(within(filas[0]).getByText("Vencida")).toBeInTheDocument()
    expect(within(filas[1]).queryByText("Vencida")).toBeNull()
    expect(within(filas[0]).getByText("Ana")).toBeInTheDocument()
  })

  it("hides the commercial sections, tile and column without commercial access (S5)", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA_SIN_COMERCIAL} />)
    expect(screen.queryByRole("region", { name: "Oportunidades abiertas" })).toBeNull()
    expect(screen.queryByText("Pipeline abierto")).toBeNull()
    const clientes = screen.getByRole("region", { name: "Clientes" })
    expect(within(clientes).queryByRole("columnheader", { name: "Oportunidades abiertas" })).toBeNull()
  })

  it("prints the S2 footnote and the period notes", () => {
    render(<ReporteEtiquetaContenido data={REPORTE_ETIQUETA} />)
    expect(
      screen.getByText(
        "Si un cliente tiene dos etiquetas, aparece en los dos reportes. Por eso los totales de distintas etiquetas no se deben sumar entre sí.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("Las tareas con fecha de entrega anterior al inicio del período no se incluyen.")).toBeInTheDocument()
    expect(screen.getByText(/días sin interacción se cuentan hasta hoy/)).toBeInTheDocument()
    expect(screen.queryByText(/umbrales del semáforo son provisionales/)).toBeNull()
  })

  it("warns when the semáforo thresholds are not confirmed", () => {
    render(<ReporteEtiquetaContenido data={{ ...REPORTE_ETIQUETA, confirmado: false }} />)
    expect(screen.getByText("Los umbrales del semáforo son provisionales hasta que se confirmen.")).toBeInTheDocument()
  })

  it("explains empty lists instead of empty tables", () => {
    render(
      <ReporteEtiquetaContenido
        data={{ ...REPORTE_ETIQUETA, proyectos: [], clientes: [], oportunidades: [], bitacora: [], tareas: [] }}
      />,
    )
    expect(within(screen.getByRole("region", { name: "Proyectos" })).queryByRole("table")).toBeNull()
    expect(within(screen.getByRole("region", { name: "Tareas" })).queryByRole("table")).toBeNull()
  })
})
