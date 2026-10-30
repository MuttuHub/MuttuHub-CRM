import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocumentItem, FolderNode } from "@/hooks/documents"
import { RepositoryList } from "./repository-list"

// Lane 1, task 1.3 (S3–S5): the repository uploads into the open folder,
// opens/creates a client's folder in one action, accepts several dropped files
// on the list or on a folder node, and moves documents dragged onto a folder.

const { dnd, moveMutation, clientFolderMutation, useDocumentsMock } = vi.hoisted(() => ({
  dnd: { onDragEnd: null as null | ((event: unknown) => void) },
  moveMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  clientFolderMutation: { isPending: false, mutateAsync: vi.fn() },
  useDocumentsMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}))

// dnd-kit needs real layout to resolve a drop in jsdom; the drop itself is
// the library's job. Capture the DndContext's onDragEnd to drive the drop.
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>()
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      dnd.onDragEnd = props.onDragEnd as (event: unknown) => void
      return createElement(actual.DndContext, props)
    },
  }
})

const FOLDERS: FolderNode[] = [
  {
    id: "f-acme",
    nombre: "Acme",
    parent_id: null,
    cliente_id: "cli-1",
    created_at: "2026-01-01",
    documentos_count: 0,
    hijos: [],
  },
  {
    id: "f-contratos",
    nombre: "Contratos",
    parent_id: null,
    cliente_id: null,
    created_at: "2026-01-01",
    documentos_count: 1,
    hijos: [],
  },
]

const DOC: DocumentItem = {
  id: "doc-1",
  titulo: "Informe final",
  categoria: "Comercial",
  etiquetas: [],
  autor_id: "u1",
  autor_nombre: "Ana",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: null,
  cliente_ids: [],
  clientes: [],
  version_activa: null,
}

vi.mock("@/hooks/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/documents")>()
  return {
    ...actual,
    useDocuments: useDocumentsMock,
    useFolders: () => ({ data: FOLDERS, isLoading: false }),
    useDocCategories: () => ({ data: [{ nombre: "Comercial", restringida: false }] }),
    useMoveDocument: () => moveMutation,
    useClientFolder: () => clientFolderMutation,
    useUploadDocument: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useUploadVersion: () => ({ isPending: false, mutateAsync: vi.fn() }),
  }
})

vi.mock("@/hooks/crm", () => ({ useUsers: () => ({ data: [] }) }))

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>()
  return { ...actual, useClientOptions: () => ({ data: [{ id: "cli-1", nombre: "Acme" }] }) }
})

vi.mock("@/components/documents/document-dialog", () => ({ DocumentDialog: () => null }))

const A = new File(["a"], "acta.pdf", { type: "application/pdf" })
const B = new File(["b"], "balance.pdf", { type: "application/pdf" })

function folderNode(name: string) {
  const tree = screen.getByRole("tree", { name: "Carpetas del repositorio" })
  return within(tree).getByRole("button", {
    name: (n) => n.startsWith(name) && !n.startsWith("Acciones"),
  })
}

function lastFilters() {
  return useDocumentsMock.mock.calls.at(-1)![0] as { carpeta?: string }
}

function dropFiles(target: Element, files: File[]) {
  const dataTransfer = { files, types: ["Files"] }
  fireEvent.dragOver(target, { dataTransfer })
  fireEvent.drop(target, { dataTransfer })
}

describe("RepositoryList — folders, client folders and drag and drop (S3–S5)", () => {
  beforeEach(() => {
    dnd.onDragEnd = null
    moveMutation.mutate.mockReset()
    clientFolderMutation.mutateAsync.mockReset()
    useDocumentsMock.mockReset()
    useDocumentsMock.mockReturnValue({
      data: { items: [DOC], total: 1, page: 1, limit: 25 },
      isLoading: false,
      isError: false,
    })
  })

  it("«Subir documento» uploads into the open folder", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(folderNode("Contratos"))
    await user.click(screen.getByRole("button", { name: "Subir documento" }))

    expect(await screen.findByText(/Se guardará en la carpeta «Contratos»/)).toBeInTheDocument()
  })

  // Existing behavior: with «Todas» selected the upload has no folder.
  it("«Subir documento» with no folder open keeps uploading to «Todas»", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("button", { name: "Subir documento" }))

    expect(await screen.findByRole("heading", { name: "Subir documento" })).toBeInTheDocument()
    expect(screen.queryByText(/Se guardará en la carpeta/)).not.toBeInTheDocument()
  })

  it("«Carpeta de cliente» finds or creates the client's folder and opens it", async () => {
    const user = userEvent.setup()
    clientFolderMutation.mutateAsync.mockResolvedValueOnce({
      carpeta: { id: "f-acme", nombre: "Acme", parent_id: null, cliente_id: "cli-1", created_at: "2026-01-01" },
      creada: false,
    })
    render(<RepositoryList />)

    await user.click(screen.getByRole("button", { name: "Carpeta de cliente" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("combobox", { name: "Cliente" }))
    await user.click(await screen.findByRole("option", { name: "Acme" }))
    await user.click(within(dialog).getByRole("button", { name: "Abrir carpeta" }))

    expect(clientFolderMutation.mutateAsync).toHaveBeenCalledWith("cli-1")
    await waitFor(() => expect(lastFilters().carpeta).toBe("f-acme"))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("«Abrir carpeta» needs a client first", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("button", { name: "Carpeta de cliente" }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByRole("button", { name: "Abrir carpeta" })).toBeDisabled()
    expect(clientFolderMutation.mutateAsync).not.toHaveBeenCalled()
  })

  it("dropping several files on the list uploads them into the open folder", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(folderNode("Acme"))
    dropFiles(screen.getByRole("region", { name: "Listado de documentos" }), [A, B])

    expect(await screen.findByText(/Se guardará en la carpeta «Acme»/)).toBeInTheDocument()
    expect(screen.getByText("acta.pdf")).toBeInTheDocument()
    expect(screen.getByText("balance.pdf")).toBeInTheDocument()
    expect(screen.getByText(/Se vincula a Acme, el cliente de esta carpeta/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir 2 documentos" })).toBeInTheDocument()
  })

  it("dropping files on a folder node uploads them into that folder and opens it", async () => {
    render(<RepositoryList />)

    dropFiles(folderNode("Contratos"), [A, B])

    expect(await screen.findByText(/Se guardará en la carpeta «Contratos»/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir 2 documentos" })).toBeInTheDocument()
    await waitFor(() => expect(lastFilters().carpeta).toBe("f-contratos"))
  })

  it("dragging a document onto a folder moves it there", async () => {
    render(<RepositoryList />)

    expect(screen.getByRole("button", { name: "Mover Informe final a una carpeta" })).toBeInTheDocument()
    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: { id: "carpeta:f-acme" } })
    })

    expect(moveMutation.mutate).toHaveBeenCalledWith({ id: "doc-1", carpeta_id: "f-acme" })
  })

  it("dragging a document onto «Todas» takes it out of its folder", () => {
    render(<RepositoryList />)

    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: { id: "carpeta:raiz" } })
    })

    expect(moveMutation.mutate).toHaveBeenCalledWith({ id: "doc-1", carpeta_id: null })
  })

  // 1.5 (S7): dropping a document on the folder it already sits in used to
  // PATCH and toast «Documento movido.» for a move that changed nothing.
  it("dragging a document onto the folder it is already in does nothing", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(folderNode("Contratos"))
    expect(lastFilters().carpeta).toBe("f-contratos")
    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: { id: "carpeta:f-contratos" } })
    })

    expect(moveMutation.mutate).not.toHaveBeenCalled()
  })

  it("with a folder open, dragging a document onto another folder still moves it", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(folderNode("Contratos"))
    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: { id: "carpeta:f-acme" } })
    })

    expect(moveMutation.mutate).toHaveBeenCalledWith({ id: "doc-1", carpeta_id: "f-acme" })
  })

  it("dropping a document outside any folder does nothing", () => {
    render(<RepositoryList />)

    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: null })
    })

    expect(moveMutation.mutate).not.toHaveBeenCalled()
  })
})
