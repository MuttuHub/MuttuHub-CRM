// Reportes › Proyecto (T9c: S15 sections, S5 hidden opportunities, S17 print and Excel): the screen only paints
// what the server computes.

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { REPORTE_PROYECTO, REPORTE_PROYECTO_SIN_COMERCIAL } from "./reporte-proyecto.fixture"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }))

const useReporteProyecto = vi.fn()
const downloadReporteProyecto = vi.fn<(proyectoId: string) => Promise<void>>(async () => undefined)
vi.mock("@/hooks/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/reportes")>()),
  useReporteProyecto: (proyectoId: string) => useReporteProyecto(proyectoId),
  downloadReporteProyecto: (proyectoId: string) => downloadReporteProyecto(proyectoId),
}))
vi.mock("@/hooks/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/projects")>()),
  useProjects: () => ({
    data: {
      proyectos: [
        { id: "p1", codigo: "PRY-0007", nombre: "Moda circular" },
        { id: "p2", codigo: "PRY-0008", nombre: "Ruta textil" },
      ],
    },
    isLoading: false,
  }),
}))

import { ReporteProyectoContenido, ReporteProyectoTab } from "./reporte-proyecto"

const SIN_DATOS = { data: undefined, isLoading: false, isError: false, error: null }
const CON_DATOS = { data: REPORTE_PROYECTO, isLoading: false, isError: false, error: null }

async function elegirProyecto(user: ReturnType<typeof userEvent.setup>, nombre = "PRY-0007 · Moda circular") {
  await user.click(screen.getByRole("combobox", { name: "Proyecto" }))
  await user.click(await screen.findByRole("option", { name: nombre }))
}

beforeEach(() => {
  useReporteProyecto.mockImplementation((proyectoId: string) => (proyectoId ? CON_DATOS : SIN_DATOS))
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("ReporteProyectoTab", () => {
  it("asks for a project before showing any report, with export and print unavailable", () => {
    render(<ReporteProyectoTab />)

    expect(screen.getByText("Elige un proyecto para ver su reporte.")).toBeInTheDocument()
    expect(useReporteProyecto).toHaveBeenLastCalledWith("")
    expect(screen.queryByRole("region", { name: "Resumen" })).toBeNull()
    expect(screen.getByRole("button", { name: "Exportar Excel" })).toBeDisabled()
    expect(screen.queryByRole("link", { name: "Generar reporte" })).toBeNull()
  })

  it("lists the projects as «código · nombre» and loads the chosen one", async () => {
    const user = userEvent.setup()
    render(<ReporteProyectoTab />)

    await elegirProyecto(user, "PRY-0008 · Ruta textil")

    expect(useReporteProyecto).toHaveBeenLastCalledWith("p2")
    expect(screen.getByRole("region", { name: "Resumen" })).toBeInTheDocument()
  })

  it("starts on the project of the deep link (S17, the ficha's «Reporte» button)", () => {
    render(<ReporteProyectoTab proyectoInicial="p1" />)

    expect(useReporteProyecto).toHaveBeenLastCalledWith("p1")
    expect(screen.getByRole("combobox", { name: "Proyecto" })).toHaveTextContent("PRY-0007 · Moda circular")
    expect(screen.getByText("Posición propia · 2 aliados · Corte 26 de nov de 2026")).toBeInTheDocument()
  })

  it("opens the printable project report in the same tab (S17)", () => {
    render(<ReporteProyectoTab proyectoInicial="p1" />)

    const generar = screen.getByRole("link", { name: "Generar reporte" })
    expect(generar).toHaveAttribute("href", "/print/reportes/proyecto?proyecto=p1")
    expect(generar).not.toHaveAttribute("target")
  })

  it("exports the project report to Excel and explains a failure (S17)", async () => {
    const user = userEvent.setup()
    render(<ReporteProyectoTab proyectoInicial="p1" />)

    await user.click(screen.getByRole("button", { name: "Exportar Excel" }))
    expect(downloadReporteProyecto).toHaveBeenCalledWith("p1")

    downloadReporteProyecto.mockRejectedValueOnce(new Error("No tienes permisos sobre este proyecto."))
    await user.click(screen.getByRole("button", { name: "Exportar Excel" }))
    expect(toastError).toHaveBeenCalledWith("No tienes permisos sobre este proyecto.")
  })

  it("shows the server error instead of the report", () => {
    useReporteProyecto.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("No tienes permisos sobre este proyecto."),
    })
    render(<ReporteProyectoTab proyectoInicial="p1" />)

    expect(screen.getByText("No tienes permisos sobre este proyecto.")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Resumen" })).toBeNull()
  })
})

describe("downloadReporteProyecto", () => {
  it("asks the export route for the xlsx of the project", async () => {
    const { downloadReporteProyecto: real } = await vi.importActual<typeof import("@/hooks/reportes")>("@/hooks/reportes")
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "No tienes permisos sobre este proyecto." }), { status: 403 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(real("p 1")).rejects.toThrow("No tienes permisos sobre este proyecto.")
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/reports/project/export?proyecto_id=p%201&formato=xlsx", { method: "GET" })
  })
})

describe("ReporteProyectoContenido", () => {
  it("renders the five sections of the proposal (S15)", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO} />)
    for (const titulo of ["Resumen", "Aliados", "Oportunidades", "Bitácora", "Tareas"]) {
      expect(screen.getByRole("region", { name: titulo })).toBeInTheDocument()
    }
  })

  it("summarises value, budget, state and meta against comprometido (S15.1)", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO} />)
    const resumen = screen.getByRole("region", { name: "Resumen" })
    expect(within(resumen).getByText("Valor total").parentElement).toHaveTextContent(/1\.000\.000/)
    expect(within(resumen).getByText("Estado").parentElement).toHaveTextContent("En ejecución")
    expect(within(resumen).getByText("Ejecución presupuestal").parentElement).toHaveTextContent(/150\.000.*400\.000/)
    expect(within(resumen).getByText("Meta").parentElement).toHaveTextContent(/1\.000\.000/)
    expect(within(resumen).getByText("Comprometido").parentElement).toHaveTextContent(/600\.000/)
    expect(within(resumen).getByText("En gestión").parentElement).toHaveTextContent(/250\.000/)
    expect(within(resumen).getByText("Sin cubrir").parentElement).toHaveTextContent(/150\.000/)
  })

  it("lists each ally with its role, state, contribution and last interaction (S15.2)", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO} />)
    const aliados = screen.getByRole("region", { name: "Aliados" })
    const telar = within(aliados).getByRole("row", { name: /Fundación Telar/ })
    expect(within(telar).getByText("Financiador")).toBeInTheDocument()
    expect(within(telar).getByText("Comprometido")).toBeInTheDocument()
    expect(within(telar).getByText(/600\.000/)).toBeInTheDocument()
    expect(within(telar).getByText("20 de nov de 2026")).toBeInTheDocument()

    const alcaldia = within(aliados).getByRole("row", { name: /Alcaldía de Itagüí/ })
    expect(within(alcaldia).getByText("Aliado")).toBeInTheDocument()
    expect(within(alcaldia).getByText("En gestión")).toBeInTheDocument()
    expect(within(alcaldia).getByText("Sin interacciones")).toBeInTheDocument()
  })

  it("lists the linked opportunities with their stage (S15.3)", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO} />)
    const fila = within(screen.getByRole("region", { name: "Oportunidades" })).getByRole("row", { name: /Convenio Telar 2027/ })
    expect(within(fila).getByText("Fundación Telar")).toBeInTheDocument()
    expect(within(fila).getByText("De un aliado")).toBeInTheDocument()
    expect(within(fila).getByText("Prospección")).toBeInTheDocument()
    expect(within(fila).getByText("En negociación")).toBeInTheDocument()
    expect(within(fila).getByText(/300\.000/)).toBeInTheDocument()
  })

  it("lists the bitácora about the project with the agreed next step (S15.4)", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO} />)
    const fila = within(screen.getByRole("region", { name: "Bitácora" })).getByRole("row", { name: /Firmamos el compromiso/ })
    expect(within(fila).getByText("Reunión")).toBeInTheDocument()
    expect(within(fila).getByText("Fundación Telar")).toBeInTheDocument()
    expect(within(fila).getByText("Enviar el acta firmada.")).toBeInTheDocument()
  })

  it("shows the task progress and lists overdue tasks before upcoming ones (S15.5)", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO} />)
    const tareas = screen.getByRole("region", { name: "Tareas" })
    expect(within(tareas).getByText("Avance").parentElement).toHaveTextContent("50 %")
    expect(within(tareas).getByText("Completadas").parentElement).toHaveTextContent("2 de 4")
    const filas = within(tareas).getAllByRole("row").slice(1)
    expect(filas.map((f) => within(f).getAllByRole("cell")[0].textContent)).toEqual([
      "Llamar a la alcaldía",
      "Preparar el informe de avance",
    ])
    expect(within(filas[0]).getByText("Vencida")).toBeInTheDocument()
    expect(within(filas[1]).queryByText("Vencida")).toBeNull()
    expect(within(filas[1]).getByText("Bruno")).toBeInTheDocument()
  })

  it("prints the assumption notes", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO} />)
    expect(screen.getByText("La meta es el valor total del proyecto.")).toBeInTheDocument()
    expect(screen.getByText(/Comprometido y en gestión suman los aportes/)).toBeInTheDocument()
    expect(screen.getByText(/nunca es menor que cero/)).toBeInTheDocument()
    expect(screen.getByText(/la que originó el proyecto; los aportes de los aliados/)).toBeInTheDocument()
  })

  it("hides the opportunities and the financing without them (S5), not shown empty", () => {
    render(<ReporteProyectoContenido data={REPORTE_PROYECTO_SIN_COMERCIAL} />)
    expect(screen.queryByRole("region", { name: "Oportunidades" })).toBeNull()
    expect(screen.queryByText(/la del propio proyecto/)).toBeNull()
    expect(screen.queryByText("Meta")).toBeNull()
    expect(screen.queryByText("La meta es el valor total del proyecto.")).toBeNull()
    expect(within(screen.getByRole("region", { name: "Resumen" })).getByText("Cliente").parentElement).toHaveTextContent("Acme")
  })

  it("explains empty lists instead of empty tables", () => {
    render(
      <ReporteProyectoContenido
        data={{
          ...REPORTE_PROYECTO,
          aliados: [],
          oportunidades: [],
          bitacora: [],
          tareas: { resumen: { total: 0, completadas: 0, canceladas: 0, avance_pct: null }, vencidas: [], proximas: [] },
        }}
      />,
    )
    for (const titulo of ["Aliados", "Oportunidades", "Bitácora", "Tareas"]) {
      expect(within(screen.getByRole("region", { name: titulo })).queryByRole("table")).toBeNull()
    }
  })
})
