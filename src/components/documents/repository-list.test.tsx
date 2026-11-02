import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocumentItem, FolderNode } from "@/hooks/documents"
import { RepositoryList } from "./repository-list"

// Lane 1, task 1.3 (S3–S5): the repository uploads into the open folder,
// creates folders (optionally linked to a client), accepts several dropped
// files on the list or on a folder node, and moves documents dragged onto a
// folder.

const { dnd, moveMutation, updateFolderMutation, useDocumentsMock, searchGet } = vi.hoisted(() => ({
  dnd: { onDragEnd: null as null | ((event: unknown) => void) },
  moveMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  updateFolderMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  useDocumentsMock: vi.fn(),
  searchGet: vi.fn<(key: string) => string | null>(() => null),
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: searchGet }),
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
    hijos: [
      {
        id: "f-renovaciones",
        nombre: "Renovaciones",
        parent_id: "f-contratos",
        cliente_id: null,
        created_at: "2026-02-01",
        documentos_count: 0,
        hijos: [],
      },
    ],
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
    useUpdateFolder: () => updateFolderMutation,
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

function folderTile(name: string) {
  const list = screen.getByRole("list", { name: "Subcarpetas" })
  return within(list).getByRole("button", {
    name: (n) =>
      typeof n === "string" && n.startsWith(name) && !n.startsWith("Acciones"),
  })
}

function lastFilters() {
  return useDocumentsMock.mock.calls.at(-1)![0] as {
    carpeta?: string;
    cliente?: string;
    sin_carpeta?: string;
  };
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
    updateFolderMutation.mutateAsync.mockReset()
    updateFolderMutation.mutateAsync.mockResolvedValue({})
    searchGet.mockReset()
    searchGet.mockReturnValue(null)
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

    await user.click(folderTile("Contratos"))
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

  it("explorer: folder tiles enter a folder and the breadcrumb navigates back", async () => {
    const user = userEvent.setup();
    render(<RepositoryList />);

    expect(folderTile("Acme")).toBeInTheDocument();
    await user.click(folderTile("Acme"));
    await waitFor(() => expect(lastFilters().carpeta).toBe("f-acme"));

    const ruta = screen.getByRole("navigation", { name: "Ruta de carpetas" });
    expect(within(ruta).getByText("Acme")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Atrás" }));
    await waitFor(() => expect(lastFilters().carpeta).toBeUndefined());
    expect(screen.getByRole("button", { name: "Adelante" })).toBeEnabled();
  });

  it("explorer: ignores the cliente query param and starts at the clean root", () => {
    searchGet.mockImplementation((key: string) => (key === "cliente" ? "cli-x" : null));
    render(<RepositoryList />);

    const filters = lastFilters();
    expect(filters.cliente).toBeUndefined();
    expect(filters.carpeta).toBeUndefined();
    // Raíz del explorador: solo documentos sin carpeta.
    expect(filters.sin_carpeta).toBe("1");
  });

  it("explorer: entering a folder clears the client filter chosen in Filtros", async () => {
    const user = userEvent.setup();
    render(<RepositoryList />);

    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    const combos = await screen.findAllByRole("combobox");
    const clienteCombo = combos.find((c) => c.textContent?.includes("Cliente"));
    expect(clienteCombo).toBeTruthy();
    await user.click(clienteCombo!);
    await user.click(await screen.findByRole("option", { name: "Acme" }));
    await waitFor(() => expect(lastFilters().cliente).toBe("cli-1"));

    await user.click(folderTile("Contratos"));

    await waitFor(() => expect(lastFilters().carpeta).toBe("f-contratos"));
    expect(lastFilters().cliente).toBeUndefined();
    expect(lastFilters().sin_carpeta).toBeUndefined();
  });

  it("explorer: tiles show only the open folder's subfolders", async () => {
    const user = userEvent.setup();
    render(<RepositoryList />);

    await user.click(folderTile("Contratos"));
    const tiles = screen.getByRole("list", { name: "Subcarpetas" });
    expect(folderTile("Renovaciones")).toBeInTheDocument();
    expect(within(tiles).queryByRole("button", { name: /Acme/ })).toBeNull();
  });

  it("dropping several files on the list uploads them into the open folder", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(folderTile("Acme"))
    await user.click(screen.getByRole("button", { name: "Vista lista" }))
    dropFiles(screen.getByRole("region", { name: "Listado de documentos" }), [A, B])

    expect(await screen.findByText(/Se guardará en la carpeta «Acme»/)).toBeInTheDocument()
    expect(screen.getByText("acta.pdf")).toBeInTheDocument()
    expect(screen.getByText("balance.pdf")).toBeInTheDocument()
    expect(screen.getByText(/Se vincula a Acme, el cliente de esta carpeta/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir 2 documentos" })).toBeInTheDocument()
  })

  it("dropping files on a folder node uploads them into that folder and opens it", async () => {
    render(<RepositoryList />)

    dropFiles(folderTile("Contratos"), [A, B])

    expect(await screen.findByText(/Se guardará en la carpeta «Contratos»/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir 2 documentos" })).toBeInTheDocument()
    await waitFor(() => expect(lastFilters().carpeta).toBe("f-contratos"))
  })

  it("explorer: documents render as icon tiles with their file type by default", () => {
    useDocumentsMock.mockReturnValue({
      data: {
        items: [
          {
            ...DOC,
            id: "doc-pdf",
            titulo: "Acta.pdf",
            version_activa: {
              version_id: "v1",
              numero_version: 1,
              tamano_bytes: 10,
              tipo_archivo: "application/pdf",
              created_at: "2026-01-01",
              subido_por_id: "u1",
              subido_por_nombre: "Ana",
            },
          },
          {
            ...DOC,
            id: "doc-xls",
            titulo: "Cuentas.xlsx",
            version_activa: {
              version_id: "v2",
              numero_version: 1,
              tamano_bytes: 10,
              tipo_archivo:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              created_at: "2026-01-01",
              subido_por_id: "u1",
              subido_por_nombre: "Ana",
            },
          },
        ],
        total: 2,
        page: 1,
        limit: 25,
      },
      isLoading: false,
      isError: false,
    });
    render(<RepositoryList />);

    const docs = screen.getByRole("list", { name: "Documentos" });
    expect(within(docs).getByRole("button", { name: /Acta\.pdf/ })).toHaveTextContent("PDF");
    expect(within(docs).getByRole("button", { name: /Cuentas\.xlsx/ })).toHaveTextContent("XLS");
  });

  it("explorer: dragging a folder tile onto another moves the hierarchy", () => {
    render(<RepositoryList />);

    const dataTransfer = {
      types: ["application/x-muttuhub-folder"],
      getData: (type: string) =>
        type === "application/x-muttuhub-folder" ? "f-acme" : "",
    };
    fireEvent.dragOver(folderTile("Contratos"), { dataTransfer });
    fireEvent.drop(folderTile("Contratos"), { dataTransfer });

    expect(updateFolderMutation.mutateAsync).toHaveBeenCalledWith({
      id: "f-acme",
      parent_id: "f-contratos",
    });
  });

  it("explorer: dragging a folder onto Todas moves it back to the root", async () => {
    const user = userEvent.setup();
    render(<RepositoryList />);

    await user.click(folderTile("Contratos"));
    await waitFor(() => expect(lastFilters().carpeta).toBe("f-contratos"));

    const dataTransfer = {
      types: ["application/x-muttuhub-folder"],
      getData: (type: string) =>
        type === "application/x-muttuhub-folder" ? "f-renovaciones" : "",
    };
    fireEvent.drop(screen.getByRole("button", { name: "Ir a Todas" }), { dataTransfer });

    expect(updateFolderMutation.mutateAsync).toHaveBeenCalledWith({
      id: "f-renovaciones",
      parent_id: null,
    });
  });

  it("explorer: right-clicking a folder tile opens its context menu with actions", async () => {
    render(<RepositoryList />);

    fireEvent.contextMenu(folderTile("Contratos"));

    expect(await screen.findByRole("menuitem", { name: /renombrar/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /mover/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /eliminar/i })).toBeInTheDocument();
  });

  it("dropping files on an empty area opens the upload dialog instead of navigating away", async () => {
    const { container } = render(<RepositoryList />);

    dropFiles(container.firstElementChild as Element, [A]);

    expect(await screen.findByRole("heading", { name: "Subir documento" })).toBeInTheDocument();
    expect(screen.queryByText(/Se guardará en la carpeta/)).not.toBeInTheDocument();
  });

  it("dropping files on an empty area with a folder open uploads into that folder", async () => {
    const user = userEvent.setup();
    const { container } = render(<RepositoryList />);

    await user.click(folderTile("Acme"));
    dropFiles(container.firstElementChild as Element, [A]);

    expect(await screen.findByText(/Se guardará en la carpeta «Acme»/)).toBeInTheDocument();
  });

  it("dragging a document onto a folder moves it there", async () => {
    render(<RepositoryList />)

    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: { id: "carpeta:f-acme" } })
    })

    expect(moveMutation.mutate).toHaveBeenCalledWith({ id: "doc-1", carpeta_id: "f-acme" })
  })

  it("dragging a document onto «Todas» takes it out of its folder", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(folderTile("Contratos"))
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

    await user.click(folderTile("Contratos"))
    expect(lastFilters().carpeta).toBe("f-contratos")
    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: { id: "carpeta:f-contratos" } })
    })

    expect(moveMutation.mutate).not.toHaveBeenCalled()
  })

  it("with a folder open, dragging a document onto another folder still moves it", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(folderTile("Contratos"))
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
