import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { filtersEmpty, SavedViewsMenu, snapshotFilters, type SavedView } from "./saved-views"

const STORAGE_KEY = "crm.vistas"

function seedViews(views: SavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
}

describe("filtersEmpty", () => {
  it("is true when no filter has a value", () => {
    expect(filtersEmpty({})).toBe(true)
    expect(filtersEmpty({ q: undefined, estado: undefined })).toBe(true)
    expect(filtersEmpty({ q: "", tipo: "" })).toBe(true)
  })

  it("is false when at least one filter has a value", () => {
    expect(filtersEmpty({ q: "municipio" })).toBe(false)
    expect(filtersEmpty({ q: "", estado: "activo" })).toBe(false)
  })
})

describe("snapshotFilters", () => {
  it("drops empty strings and undefined values", () => {
    const snap = snapshotFilters({
      q: "gobierno",
      estado: "",
      desde: undefined,
      prioridad: "alta",
      valorMax: "",
    })
    expect(snap).toEqual({ q: "gobierno", prioridad: "alta" })
  })

  it("keeps only known filter keys", () => {
    const snap = snapshotFilters({ q: "x", foo: "bar" } as never)
    expect(snap).toEqual({ q: "x" })
  })

  it("returns an empty object (not undefined) for empty filters", () => {
    expect(snapshotFilters({ q: "", estado: "" })).toEqual({})
  })
})

describe("SavedViewsMenu", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("renders the trigger with a view count badge", () => {
    render(<SavedViewsMenu filters={{}} onApply={vi.fn()} />)
    expect(screen.getByRole("button", { name: /Vistas/ })).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("shows the empty state when there are no saved views", async () => {
    const user = userEvent.setup()
    render(<SavedViewsMenu filters={{}} onApply={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /Vistas/ }))
    expect(await screen.findByText("Aún no hay vistas. Guarda los filtros actuales.")).toBeInTheDocument()
  })

  it("applies a saved view on click", async () => {
    const user = userEvent.setup()
    seedViews([{ id: "v1", nombre: "Activos", filtros: { estado: "activo" } }])
    const onApply = vi.fn()
    render(<SavedViewsMenu filters={{}} onApply={onApply} />)
    await user.click(screen.getByRole("button", { name: /Vistas/ }))
    await user.click(await screen.findByText("Activos"))
    expect(onApply).toHaveBeenCalledWith({ estado: "activo" })
  })

  it("saves the current filters under a name and persists them", async () => {
    const user = userEvent.setup()
    const filters = { q: "gobierno", estado: "activo" }
    render(<SavedViewsMenu filters={filters} onApply={vi.fn()} />)
    expect(screen.getByText("0")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Vistas/ }))
    await user.click(await screen.findByText("Guardar filtros actuales"))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toBeInTheDocument()

    await user.type(screen.getByLabelText("Nombre de la vista"), "Gobierno activo")
    await user.click(screen.getByRole("button", { name: "Guardar vista" }))

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedView[]
    expect(stored).toHaveLength(1)
    expect(stored[0].nombre).toBe("Gobierno activo")
    expect(stored[0].filtros).toEqual({ q: "gobierno", estado: "activo" })
    expect(stored[0].id).toBeTruthy()
  })

  it("deletes a saved view from storage", async () => {
    const user = userEvent.setup()
    seedViews([
      { id: "v1", nombre: "Activos", filtros: { estado: "activo" } },
      { id: "v2", nombre: "Gobierno", filtros: { q: "gobierno" } },
    ])
    render(<SavedViewsMenu filters={{}} onApply={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /Vistas/ }))
    await user.click(await screen.findByRole("button", { name: "Eliminar vista Activos" }))

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as SavedView[]
    expect(stored.map((v) => v.id)).toEqual(["v2"])
  })
})