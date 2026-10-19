// dada629 fixed the one-day UTC-5 shift for date-input calendar days. The
// print ficha renders `fecha_ultima_gestion` too, and it is a calendar day
// captured by an `<input type="date">`: the form sends YYYY-MM-DD and
// `parseDate` stores UTC midnight, so the print view must render that UTC day.
// Under TZ=America/Bogota a viewer-zone formatter shows the previous day.

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ClientDetail, Oportunidad } from "@/hooks/crm"
import { ApiError, apiGet } from "@/lib/api/http"
import { PrintFicha } from "./print-ficha"

vi.mock("@/lib/api/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/http")>()
  return { ...actual, apiGet: vi.fn() }
})

const CLIENTE: ClientDetail = {
  id: "c1",
  nombre: "Alcaldía de Barranquilla",
  empresa: "Alcaldía Distrital",
  tamano_org: "50–200 personas",
  ubicacion: "Barranquilla, Atlántico",
  canal_contacto_inicial: "Feria",
  fecha_primer_contacto: "2026-08-01T00:00:00.000Z",
  tipo_cliente: "GOBIERNO_LOCAL",
  estado: "PROSPECTO",
  prioridad: "ALTA",
  responsable_id: "u1",
  responsable_nombre: "Ana Pérez",
  prioridades_identificadas: "Transición energética",
  riesgos_barreras: "Presupuesto 2027",
  resumen_relacion: "Relación desde 2024",
  valor_potencial: 1284500000,
  compromisos_abiertos: 2,
  next_compromiso: null,
  updated_at: "2026-08-01T12:00:00.000Z",
  created_at: "2025-01-01T00:00:00.000Z",
  contactos_count: 0,
  oportunidades_count: 1,
  bitacora_count: 0,
  tareas_abiertas_count: 0,
  puede_editar: true,
  puede_gestionar_oportunidades: true,
}

const OPORTUNIDAD: Oportunidad = {
  id: "o1",
  nombre: "Diagnóstico de participación ciudadana",
  problema_detectado: null,
  solucion_propuesta: null,
  servicios_interes: null,
  valor_estimado_cop: 45_000_000,
  estado: "PRESENTADA",
  fecha_ultima_gestion: "2026-08-01T00:00:00.000Z",
  fase: "PROSPECCION",
  fecha_adjudicacion: null,
  fecha_envio_propuesta: null,
  proyectos_relacionados: null,
  created_at: "2026-07-01T00:00:00.000Z",
}

describe("PrintFicha — Oportunidades", () => {
  beforeEach(() => {
    window.print = vi.fn()
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.endsWith("/contacts")) return { contactos: [] }
      if (path.endsWith("/opportunities")) return { oportunidades: [OPORTUNIDAD] }
      if (path.endsWith("/log")) return { entradas: [] }
      if (path.includes("/tasks")) return { items: [] }
      return { cliente: CLIENTE }
    })
  })

  it("renders fecha_ultima_gestion as its UTC calendar day", async () => {
    render(<PrintFicha clientId="c1" />)

    const line = await screen.findByText(/última gestión:/)
    expect(line).toHaveTextContent("01 de ago de 2026")
  })
})

// Z1-2: a 401/500 used to tell any user to configure a `.env` file with Supabase.
describe("PrintFicha — load errors", () => {
  beforeEach(() => {
    window.print = vi.fn()
  })

  it("asks for a new login on 401, without developer text", async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiError("Unauthorized", 401, "UNAUTHORIZED"))
    render(<PrintFicha clientId="c1" />)

    expect(await screen.findByText("Sesión vencida")).toBeInTheDocument()
    expect(screen.getByText(/Tu sesión expiró\. Inicia sesión de nuevo/)).toBeInTheDocument()
    expect(screen.queryByText(/\.env|Supabase/)).not.toBeInTheDocument()
  })

  it("shows a generic Spanish message on 500 without leaking the raw error", async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiError("Internal error: prisma", 500, "INTERNAL_ERROR"))
    render(<PrintFicha clientId="c1" />)

    expect(await screen.findByText("No pudimos cargar la ficha. Inténtalo de nuevo.")).toBeInTheDocument()
    expect(screen.queryByText(/prisma|\.env|Supabase/)).not.toBeInTheDocument()
  })
})
