// S4 U6: progreso por actividad y por entregable. Presentacional puro; el color
// y el progreso llegan derivados del servidor.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { describe, expect, it } from "vitest"
import type {
  ProjectActivity,
  ProjectDeliverable,
  ProjectDeliverableProgress,
  ProjectTechnicalActivity,
} from "@/hooks/projects"
import { EjecucionAvance } from "./ejecucion-avance"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return wrapper
}

const STAMP = { created_at: "2026-10-08T00:00:00.000Z", updated_at: "2026-10-08T00:00:00.000Z" }

const ACTIVIDAD: ProjectActivity = {
  ...STAMP,
  id: "a1",
  proyecto_id: "p1",
  objetivo_id: "o1",
  codigo: "1.1",
  nombre: "Taller de formación",
  semana_inicio: 1,
  semana_fin: 3,
  fecha_inicio: "2026-10-05",
  fecha_fin: "2026-10-25",
  peso: 1,
  peso_manual: false,
  responsable_id: null,
  fuera_de_duracion: false,
}

const TECNICO: ProjectTechnicalActivity = {
  id: "a1",
  codigo: "1.1",
  peso: 1,
  progreso: 100,
  estado: "FINALIZADA",
  fecha_cumplimiento: "2026-10-20",
}

const ENTREGABLE: ProjectDeliverable = {
  ...STAMP,
  id: "e1",
  proyecto_id: "p1",
  actividad_id: "a1",
  codigo: "ENT-1",
  descripcion: "Acta de asistencia",
  cantidad_meta: "2.00",
  unidad: "actas",
  tipo_medio_exigido: "PDF firmado",
}

const ENTREGABLE2: ProjectDeliverable = { ...ENTREGABLE, id: "e2", codigo: "ENT-2", descripcion: "Foto" }

function avance(overrides: Partial<ProjectDeliverableProgress["avances"][number]> = {}) {
  return {
    id: "av1",
    proyecto_id: "p1",
    entregable_id: "e1",
    fecha: "2026-10-20",
    cantidad: "2.00",
    observacion: null,
    justificacion_exceso: null,
    registrado_por_id: "u1",
    created_at: "2026-10-20T00:00:00.000Z",
    anulado_at: null,
    anulado_por_id: null,
    motivo_anulacion: null,
    medios: 1,
    cuenta: true,
    ...overrides,
  }
}

describe("EjecucionAvance", () => {
  it("renders the activity progress bar and its estado badge", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={TECNICO}
        entregables={[ENTREGABLE]}
        progreso={new Map([["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance()] }]])}
      />,
      { wrapper: createWrapper() },
    )

    const actividad = screen.getByTestId("ejecucion-actividad")
    expect(actividad).toHaveTextContent("1.1")
    expect(actividad).toHaveTextContent("Taller de formación")
    expect(actividad).toHaveTextContent("Finalizada")
    const barra = screen.getByRole("progressbar", { name: "Avance de la actividad 1.1" })
    expect(barra).toHaveAttribute("aria-valuenow", "100")
    expect(barra).toHaveAttribute("aria-valuemin", "0")
    expect(barra).toHaveAttribute("aria-valuemax", "100")
    expect(barra.tagName).not.toBe("PROGRESS")
  })

  it("shows each deliverable's goal and counted quantity", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={TECNICO}
        entregables={[ENTREGABLE]}
        progreso={
          new Map([
            ["e1", { estado: "EN_EJECUCION", meta: "2.00", avances: [avance(), avance({ id: "av2", cantidad: "1.00" })] }],
          ])
        }
      />,
      { wrapper: createWrapper() },
    )

    const entregable = screen.getByTestId("ejecucion-entregable")
    expect(entregable).toHaveTextContent("ENT-1")
    expect(entregable).toHaveTextContent("Meta 2 actas")
    expect(entregable).toHaveTextContent("Contado 3 actas")
    expect(within(entregable).queryByTestId("ejecucion-pendiente-soporte")).not.toBeInTheDocument()
  })

  it("flags non-voided avances without a live medio as pending support", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={TECNICO}
        entregables={[ENTREGABLE]}
        progreso={
          new Map([
            [
              "e1",
              {
                estado: "EN_EJECUCION",
                meta: "2.00",
                avances: [
                  avance(),
                  avance({ id: "av2", cantidad: "1.00", medios: 0, cuenta: false }),
                  avance({ id: "av3", cantidad: "5.00", anulado_at: "2026-10-21T00:00:00.000Z", motivo_anulacion: "error", cuenta: false }),
                ],
              },
            ],
          ])
        }
      />,
      { wrapper: createWrapper() },
    )

    const pendiente = screen.getByTestId("ejecucion-pendiente-soporte")
    expect(pendiente).toHaveTextContent("1 pendiente de soporte")
    // El anulado no cuenta como pendiente ni como contado.
    const entregable = screen.getByTestId("ejecucion-entregable")
    expect(entregable).toHaveTextContent("Contado 2 actas")
  })

  it("marks an uncounted deliverable as zero counted, even without progress loaded", () => {
    render(
      <EjecucionAvance
        proyectoId="p1"
        actividad={ACTIVIDAD}
        canWrite={false}
        canVoid={false}
        tecnico={{ ...TECNICO, progreso: 0, estado: "NO_INICIADA" }}
        entregables={[ENTREGABLE2]}
        progreso={new Map()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByTestId("ejecucion-actividad")).toHaveTextContent("No iniciada")
    const entregable = screen.getByTestId("ejecucion-entregable")
    expect(entregable).toHaveTextContent("Contado 0 actas")
  })
})
