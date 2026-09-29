import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocumentItem } from "@/hooks/documents"
import { RepositoryList } from "./repository-list"

const { listQuery, categoriesQuery } = vi.hoisted(() => ({
  listQuery: {
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: undefined as
      | { page: number; limit: number; total: number; items: DocumentItem[] }
      | undefined,
  },
  categoriesQuery: {
    data: [
      { nombre: "Contratos", restringida: true },
      { nombre: "Comercial", restringida: false },
    ],
  },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock("@/hooks/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/documents")>()
  return {
    ...actual,
    useDocuments: () => listQuery,
    useFolders: () => ({ isLoading: false, data: [] }),
    useDocCategories: () => categoriesQuery,
    useDocument: () => ({ data: undefined }),
    useDocumentVersions: () => ({ data: [], isLoading: false }),
    useDeleteDocument: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useUploadVersion: () => ({ isPending: false, mutateAsync: vi.fn() }),
  }
})

vi.mock("@/hooks/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/crm")>()
  return { ...actual, useUsers: () => ({ data: [] }) }
})

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>()
  return { ...actual, useClientOptions: () => ({ data: [] }) }
})

function doc(over: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: "d1",
    titulo: "Contrato marco",
    categoria: "Contratos",
    etiquetas: ["2026"],
    autor_id: "u1",
    autor_nombre: "Ana",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    cliente_ids: [],
    clientes: [],
    version_activa: {
      version_id: "v1",
      numero_version: 2,
      tamano_bytes: 1024,
      tipo_archivo: "application/pdf",
      created_at: "2026-02-01T00:00:00Z",
      subido_por_id: "u1",
      subido_por_nombre: "Ana",
    },
    ...over,
  }
}

function setItems(items: DocumentItem[]) {
  listQuery.data = { page: 1, limit: 25, total: items.length, items }
}

describe("RepositoryList v6 restyle", () => {
  beforeEach(() => {
    listQuery.isLoading = false
    listQuery.isError = false
    setItems([
      doc(),
      doc({ id: "d2", titulo: "Propuesta", categoria: "Comercial", version_activa: null }),
    ])
  })

  it("uses the 44px default control size for the upload and search controls", () => {
    render(<RepositoryList />)
    const upload = screen.getByRole("button", { name: "Subir documento" })
    expect(upload).toHaveClass("h-11")
    expect(upload).not.toHaveClass("h-9")
    const search = screen.getByRole("textbox", { name: "Buscar documentos" })
    expect(search).toHaveClass("h-11")
    expect(search).not.toHaveClass("h-10")
  })

  it("renders the category through the shared StatusChip", () => {
    render(<RepositoryList />)
    const chip = screen.getByText("Comercial").closest('[data-slot="status-chip"]')
    expect(chip).toHaveAttribute("data-tone", "neutro")
  })

  it("flags rows of a restricted category with a destructive 'Restringido' chip", () => {
    render(<RepositoryList />)
    const rows = screen.getAllByRole("row")
    const contrato = rows.find((r) => within(r).queryByText("Contrato marco"))!
    const propuesta = rows.find((r) => within(r).queryByText("Propuesta"))!
    const chip = within(contrato).getByText("Restringido").closest('[data-slot="status-chip"]')
    expect(chip).toHaveAttribute("data-tone", "destructivo")
    expect(within(propuesta).queryByText("Restringido")).toBeNull()
  })

  it("shows the active version metadata in mono", () => {
    render(<RepositoryList />)
    const meta = screen.getByText(/^v2 ·/)
    expect(meta).toHaveClass("font-mono")
  })

  it("marks a selected row so the table rail shows", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)
    const row = screen.getAllByRole("row").find((r) => within(r).queryByText("Contrato marco"))!
    expect(row).not.toHaveAttribute("data-state")
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar Contrato marco" }))
    expect(row).toHaveAttribute("data-state", "selected")
  })

  it("lets the shared table own the header styling", () => {
    render(<RepositoryList />)
    const th = screen.getByRole("columnheader", { name: "Documento" })
    expect(th).not.toHaveClass("text-[11px]")
    expect(th).toHaveClass("uppercase")
  })

  it("uses the shared EmptyState for an empty list, keeping the copy", () => {
    setItems([])
    const { container } = render(<RepositoryList />)
    const empty = container.querySelector('[data-slot="empty-state"]')
    expect(empty).not.toBeNull()
    expect(empty).toHaveTextContent("Sin documentos")
    expect(within(empty as HTMLElement).getByRole("button", { name: "Subir documento" })).toBeInTheDocument()
  })

  it("pagination buttons follow the 40px small control size", () => {
    listQuery.data = { page: 1, limit: 25, total: 60, items: [doc()] }
    render(<RepositoryList />)
    const next = screen.getByRole("button", { name: "Siguiente" })
    expect(next).toHaveClass("h-10")
    expect(next).not.toHaveClass("h-8")
  })
})
