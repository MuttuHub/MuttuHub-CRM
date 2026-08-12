import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type {
  ClientFilters,
  ClientListResponse,
  ClientListRow,
  UsuarioMini,
} from "@/hooks/crm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ClientList } from "./client-list"

type ClientsQueryState = {
  isLoading: boolean
  isError: boolean
  data: ClientListResponse | undefined
  refetch: ReturnType<typeof vi.fn>
}

type UsersQueryState = {
  isLoading: boolean
  data: UsuarioMini[] | undefined
}

const { router, toast, useClientsMock, useUsersMock, clientsQuery } = vi.hoisted(() => {
  const clientsQuery: ClientsQueryState = {
    isLoading: false,
    isError: false,
    data: undefined,
    refetch: vi.fn(),
  }
  return {
    router: { replace: vi.fn() },
    toast: { error: vi.fn(), success: vi.fn() },
    useClientsMock: vi.fn<(filters?: ClientFilters) => ClientsQueryState>(() => clientsQuery),
    useUsersMock: vi.fn<(_filters?: unknown) => UsersQueryState>(() => ({
      isLoading: false,
      data: undefined,
    })),
    clientsQuery,
  }
})

vi.mock("sonner", () => ({ toast }))

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock("@/hooks/crm", () => ({
  useClients: (...args: Parameters<typeof useClientsMock>) => useClientsMock(...args),
  useUsers: (...args: Parameters<typeof useUsersMock>) => useUsersMock(...args),
  useCreateClient: () => ({ isPending: false, mutateAsync: async () => ({}) }),
  useUpdateClient: () => ({ isPending: false, mutateAsync: async () => ({}) }),
  esVencida: (fecha: string | Date | null | undefined) => {
    if (!fecha) return false
    const date = typeof fecha === "string" ? new Date(fecha) : fecha
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
  },
  formatCOP: (value: number | null | undefined) =>
    value === null || value === undefined
      ? "—"
      : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value),
  formatFecha: (value: string | Date | null | undefined) => {
    if (!value) return "—"
    const date = typeof value === "string" ? new Date(value) : value
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
  },
  iniciales: (nombre: string) => {
    const parts = nombre.trim().split(/\s+/)
    const first = parts[0]?.[0] ?? ""
    const second = parts.length > 1 ? parts[parts.length - 1][0] : ""
    return (first + second).toUpperCase()
  },
}))

vi.mock("@/components/crm/client-sheet", () => ({ ClientSheet: () => null }))

const USERS = [{ id: "u1", nombre: "Ana Pérez" }]

const showing = (desde: number, hasta: number, total: number) => (_content: string, element?: Element | null) =>
  !!element && (element.textContent ?? "").trim() === `Mostrando ${desde}–${hasta} de ${total} clientes`

const EMPTY_RESPONSE: ClientListResponse = { page: 1, limit: 25, total: 0, items: [] }

const CLIENTE: ClientListRow = {
  id: "c1",
  nombre: "Alcaldía de Barranquilla",
  empresa: "Alcaldía Distrital",
  tipo_cliente: "GOBIERNO_LOCAL",
  estado: "CLIENTE_ACTIVO",
  prioridad: "ALTA",
  ubicacion: "Barranquilla, Atlántico",
  responsable_id: "u1",
  responsable_nombre: "Ana Pérez",
  valor_potencial: 1284500000,
  compromisos_abiertos: 2,
  next_compromiso: { id: "t1", titulo: "Seguimiento", fecha_entrega: "2026-12-31" },
  updated_at: "2026-08-01T12:00:00.000Z",
}

describe("ClientList", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    router.replace.mockClear()
    toast.error.mockClear()
    toast.success.mockClear()
    useClientsMock.mockClear()
    useUsersMock.mockClear()
    clientsQuery.isLoading = false
    clientsQuery.isError = false
    clientsQuery.data = EMPTY_RESPONSE
    clientsQuery.refetch.mockClear()
    useClientsMock.mockReturnValue(clientsQuery)
    useUsersMock.mockReturnValue({ isLoading: false, data: USERS })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders skeletons while the list query is loading", () => {
    clientsQuery.isLoading = true
    useUsersMock.mockReturnValue({ isLoading: true, data: undefined })
    const { container } = render(<ClientList />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6)
    expect(screen.getByText("Cargando…")).toBeInTheDocument()
    expect(screen.queryByText("No encontramos clientes")).not.toBeInTheDocument()
  })

  it("shows the empty state for an empty list", () => {
    render(<ClientList />)
    expect(screen.getByText("No encontramos clientes")).toBeInTheDocument()
    expect(screen.queryByText("Alcaldía de Barranquilla")).not.toBeInTheDocument()
  })

  it("renders client cards with formatted values and badges", () => {
    clientsQuery.data = { page: 1, limit: 25, total: 1, items: [CLIENTE] }
    render(<ClientList />)
    expect(screen.getByText("Alcaldía de Barranquilla")).toBeInTheDocument()
    expect(screen.getByText("Gobierno local")).toBeInTheDocument()
    expect(screen.getByText("Cliente activo")).toBeInTheDocument()
    expect(screen.getByText("Alta")).toBeInTheDocument()
    expect(screen.getByText(/· Barranquilla, Atlántico/)).toBeInTheDocument()
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument()
    expect(screen.getByText(/1\.284\.500\.000/)).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText(showing(1, 1, 1))).toBeInTheDocument()
  })

  it("marks a client with an overdue next compromiso as 'Vencido'", () => {
    clientsQuery.data = {
      page: 1,
      limit: 25,
      total: 1,
      items: [CLIENTE],
    }
    clientsQuery.data!.items[0].next_compromiso = { id: "t9", titulo: "Viejo", fecha_entrega: "2020-01-01" }
    render(<ClientList />)
    expect(screen.getByText("Vencido")).toBeInTheDocument()
  })

  it("shows the pagination footer and pages through results", () => {
    clientsQuery.data = {
      page: 1,
      limit: 25,
      total: 60,
      items: Array.from({ length: 25 }, (_, i) => ({ ...CLIENTE, id: `c${i}`, nombre: `Cliente ${i}` })),
    }
    render(<ClientList />)
    expect(screen.getByText(showing(1, 25, 60))).toBeInTheDocument()
    const prev = screen.getByRole("button", { name: "Anterior" })
    expect(prev).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
    expect(screen.getByText(showing(26, 50, 60))).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Siguiente" })).not.toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
    expect(screen.getByText(showing(51, 60, 60))).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled()
  })

  it("opens the ficha and requests ?cliente=<id> via router.replace on card click", () => {
    clientsQuery.data = { page: 1, limit: 25, total: 1, items: [CLIENTE] }
    render(<ClientList />)
    fireEvent.click(screen.getByRole("article", { name: /Abrir ficha de Alcaldía/ }))
    expect(router.replace).toHaveBeenCalledWith("/clientes?cliente=c1", { scroll: false })
  })

  it("opens the ficha from the 'Ver detalle' button without double-firing", () => {
    clientsQuery.data = { page: 1, limit: 25, total: 1, items: [CLIENTE] }
    render(<ClientList />)
    fireEvent.click(screen.getByRole("button", { name: /Ver detalle/ }))
    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith("/clientes?cliente=c1", { scroll: false })
  })

  it("opens the ficha when pressing Enter on a card", () => {
    clientsQuery.data = { page: 1, limit: 25, total: 1, items: [CLIENTE] }
    render(<ClientList />)
    fireEvent.keyDown(screen.getByRole("article", { name: /Abrir ficha/ }), { key: "Enter" })
    expect(router.replace).toHaveBeenCalledWith("/clientes?cliente=c1", { scroll: false })
  })

  it("shows the disconnected card on query error and retries", () => {
    clientsQuery.isError = true
    render(<ClientList />)
    expect(screen.getByText("Plataforma no conectada")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(clientsQuery.refetch).toHaveBeenCalledTimes(1)
  })

  it("applies the search query only after the 350ms debounce window (no request per keystroke)", () => {
    render(<ClientList />)
    const input = screen.getByLabelText("Buscar clientes")
    expect(useClientsMock).toHaveBeenLastCalledWith({})
    // Cada tecla actualiza el draft, pero NO debe disparar fetch:
    fireEvent.change(input, { target: { value: "g" } })
    expect(useClientsMock).toHaveBeenLastCalledWith({})
    fireEvent.change(input, { target: { value: "go" } })
    expect(useClientsMock).toHaveBeenLastCalledWith({})
    fireEvent.change(input, { target: { value: "gobierno" } })
    expect(useClientsMock).toHaveBeenLastCalledWith({})
    // Tras la pausa de debounce, se aplica UNA sola vez:
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(useClientsMock).toHaveBeenLastCalledWith({ q: "gobierno" })
    expect(screen.getByLabelText("Buscar clientes")).toHaveValue("gobierno")
  })

  it("applies non-search filters immediately without debounce", async () => {
    // Radix Select necesita timers reales para abrir el content (rAF).
    vi.useRealTimers()
    render(<ClientList />)
    const user = userEvent.setup()
    // El placeholder no expone accessible name; el primer combobox es "Tipo de cliente".
    await user.click(screen.getAllByRole("combobox")[0])
    await user.click(await screen.findByRole("option", { name: "Gobierno local" }))
    expect(useClientsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ tipo: "GOBIERNO_LOCAL" })
    )
  })

  it("keeps the debounce timer from leaking between tests", () => {
    render(<ClientList />)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(useClientsMock).toHaveBeenLastCalledWith({})
  })

  it("blocks the fetch when `desde` is after `hasta` and shows the friendly error", () => {
    render(<ClientList />)
    fireEvent.change(screen.getByLabelText("Primer contacto desde"), {
      target: { value: "2026-10-01" },
    })
    expect(useClientsMock).toHaveBeenLastCalledWith({ desde: "2026-10-01" })
    fireEvent.change(screen.getByLabelText("Primer contacto hasta"), {
      target: { value: "2026-01-01" },
    })
    expect(toast.error).toHaveBeenCalledWith(
      "La fecha final no puede ser anterior a la inicial.",
    )
    expect(useClientsMock).toHaveBeenLastCalledWith({ desde: "2026-10-01" })
    expect(useClientsMock).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ hasta: "2026-01-01" }),
    )
  })

  it("applies a valid date range (desde <= hasta) to the fetch", () => {
    render(<ClientList />)
    fireEvent.change(screen.getByLabelText("Primer contacto desde"), {
      target: { value: "2026-01-01" },
    })
    expect(useClientsMock).toHaveBeenLastCalledWith({ desde: "2026-01-01" })
    fireEvent.change(screen.getByLabelText("Primer contacto hasta"), {
      target: { value: "2026-10-01" },
    })
    expect(useClientsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ desde: "2026-01-01", hasta: "2026-10-01" }),
    )
    expect(toast.error).not.toHaveBeenCalled()
  })
})
