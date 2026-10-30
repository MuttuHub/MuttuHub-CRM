// Jefe 2026-10-28, lane 1 task 1.1 (S1): the Kanban board's tag filter must
// offer the LIVE task-tags catalog (`task_tags` setting) — the same one the
// admin panel edits — instead of the factory TASK_TAGS constant. The boss's
// report: tags created in admin showed up in the tag list but never in the
// places where tags are used.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { KanbanBoard } from "./kanban-board"

const { usersQuery, clientsQuery, meQuery, eligiblesQuery, tasksQuery, moveMutation, taskTagsQuery } =
  vi.hoisted(() => ({
    usersQuery: { data: [] as { id: string; nombre: string }[], isLoading: false, isError: false },
    clientsQuery: { data: [] as { id: string; nombre: string }[], isLoading: false, isError: false },
    meQuery: { data: null as { id: string; rol: string } | null, isLoading: false, isError: false },
    eligiblesQuery: { data: [] as { id: string }[], isLoading: false, isError: false },
    tasksQuery: {
      data: undefined as unknown,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    moveMutation: { isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) },
    taskTagsQuery: { data: null as string[] | null, isLoading: false, error: null as unknown },
  }))

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return {
    ...actual,
    useUsers: () => usersQuery,
  }
})

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>()
  return {
    ...actual,
    useClientOptions: () => clientsQuery,
    useCurrentUser: () => meQuery,
    useTasks: vi.fn(() => tasksQuery),
    useMoveTask: () => moveMutation,
  }
})

vi.mock("@/hooks/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/projects")>()
  return {
    ...actual,
    useEligibleOpportunities: () => eligiblesQuery,
  }
})

vi.mock("@/hooks/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/admin")>()
  return {
    ...actual,
    useTaskTags: () => taskTagsQuery,
  }
})

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <KanbanBoard />
    </QueryClientProvider>,
  )
}

/** Opens the collapsed advanced-filters row, then finds the Etiqueta select. */
async function openEtiquetaFilter(user: ReturnType<typeof userEvent.setup>) {
  // FiltersRow is collapsed by default (filtersOpen=false, no active
  // filters) — the production path is clicking «Filtros» first.
  await user.click(screen.getByRole("button", { name: "Filtros" }))
  const triggers = screen.getAllByRole("combobox")
  const trigger = triggers.find((t) => t.textContent?.includes("Etiqueta"))
  if (!trigger) throw new Error("Etiqueta filter trigger not found")
  return trigger
}

describe("KanbanBoard — live tag filter (jefe 1.1 / S1)", () => {
  beforeEach(() => {
    taskTagsQuery.data = ["Comercial", "Alianza regional"]
  })

  it("offers a tag created in admin that is not in the factory TASK_TAGS", async () => {
    const user = userEvent.setup()
    renderBoard()

    await user.click(await openEtiquetaFilter(user))

    expect(await screen.findByRole("option", { name: "Alianza regional" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Comercial" })).toBeInTheDocument()
  })

  it("falls back to the factory TASK_TAGS while the catalog loads", async () => {
    taskTagsQuery.data = null
    const user = userEvent.setup()
    renderBoard()

    await user.click(await openEtiquetaFilter(user))

    expect(await screen.findByRole("option", { name: "Todas las etiquetas" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Comercial" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Alianza regional" })).not.toBeInTheDocument()
  })
})

// Jefe 2026-10-28, lane 2 task 2.4b (S4): «Imprimir» opens the task report's
// print view in the same tab (the view brings its own «Volver»), never with
// window.open.
describe("KanbanBoard — Imprimir in the same tab (jefe 2.4b / S4)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("links Imprimir to the task report print view without a new tab", () => {
    const open = vi.fn()
    vi.stubGlobal("open", open)
    renderBoard()

    const imprimir = screen.getByRole("link", { name: "Imprimir" })
    expect(imprimir).toHaveAttribute("href", "/print/reportes/tareas?rango=month")
    expect(imprimir).not.toHaveAttribute("target")
    expect(open).not.toHaveBeenCalled()
  })
})
