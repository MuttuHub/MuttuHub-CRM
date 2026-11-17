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

const {
  dnd,
  moveMutation,
  updateFolderMutation,
  updateDocMutation,
  trashMutation,
  restoreMutation,
  useDocumentsMock,
  useTrashedMock,
  useActivityMock,
  currentUser,
  toastMock,
  searchGet,
} = vi.hoisted(() => ({
  dnd: { onDragEnd: null as null | ((event: unknown) => void) },
  moveMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  updateFolderMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  updateDocMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  trashMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  restoreMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
  useDocumentsMock: vi.fn(),
  useTrashedMock: vi.fn(),
  useActivityMock: vi.fn(),
  currentUser: {
    value: { id: "u-admin", nombre: "Admin", rol: "ADMINISTRADOR" } as {
      id: string
      nombre: string
      rol: string
    } | null,
  },
  toastMock: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
  searchGet: vi.fn<(key: string) => string | null>(() => null),
}))

vi.mock("sonner", () => ({ toast: toastMock }))

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
    useDocCategories: () => ({
      data: [
        { nombre: "Comercial", restringida: false },
        { nombre: "Contratos", restringida: true },
        { nombre: "Finanzas", restringida: false },
      ],
    }),
    useMoveDocument: () => moveMutation,
    useUpdateFolder: () => updateFolderMutation,
    useUpdateDocument: () => updateDocMutation,
    useTrashDocument: () => trashMutation,
    useRestoreDocument: () => restoreMutation,
    useTrashedDocuments: useTrashedMock,
    useDocumentActivity: useActivityMock,
    useUploadDocument: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useUploadVersion: () => ({ isPending: false, mutateAsync: vi.fn() }),
  }
})

vi.mock("@/hooks/crm", () => ({ useUsers: () => ({ data: [] }) }))

vi.mock("@/hooks/kanban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/kanban")>()
  return {
    ...actual,
    useClientOptions: () => ({ data: [{ id: "cli-1", nombre: "Acme" }] }),
    useCurrentUser: () => ({ data: currentUser.value }),
  }
})

vi.mock("@/components/documents/document-dialog", () => ({
  DocumentDialog: () => null,
  VersionUploadDialog: () => null,
}))

const A = new File(["a"], "acta.pdf", { type: "application/pdf" })
const B = new File(["b"], "balance.pdf", { type: "application/pdf" })

/** S1: the list (table) is the default view; folder tiles live in the grid. */
function showGrid() {
  fireEvent.click(screen.getByRole("button", { name: "Vista cuadrícula" }))
}

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

function resetMocks() {
  dnd.onDragEnd = null
  currentUser.value = { id: "u-admin", nombre: "Admin", rol: "ADMINISTRADOR" }
  moveMutation.mutate.mockReset()
  moveMutation.mutateAsync.mockReset()
  moveMutation.mutateAsync.mockResolvedValue({})
  updateDocMutation.mutateAsync.mockReset()
  updateDocMutation.mutateAsync.mockResolvedValue({})
  trashMutation.mutateAsync.mockReset()
  trashMutation.mutateAsync.mockResolvedValue({})
  restoreMutation.mutateAsync.mockReset()
  restoreMutation.mutateAsync.mockResolvedValue({})
  useTrashedMock.mockReset()
  useTrashedMock.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  useActivityMock.mockReset()
  useActivityMock.mockReturnValue({ data: [], isLoading: false, isError: false })
  toastMock.success.mockReset()
  toastMock.warning.mockReset()
  toastMock.error.mockReset()
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
}

describe("RepositoryList — folders, client folders and drag and drop (S3–S5)", () => {
  beforeEach(resetMocks)

  it("«Subir documento» uploads into the open folder", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)
    showGrid()

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
    showGrid();

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
    showGrid();

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
    showGrid();

    await user.click(folderTile("Contratos"));
    const tiles = screen.getByRole("list", { name: "Subcarpetas" });
    expect(folderTile("Renovaciones")).toBeInTheDocument();
    expect(within(tiles).queryByRole("button", { name: /Acme/ })).toBeNull();
  });

  it("dropping several files on the list uploads them into the open folder", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)
    showGrid()

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
    showGrid()

    dropFiles(folderTile("Contratos"), [A, B])

    expect(await screen.findByText(/Se guardará en la carpeta «Contratos»/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subir 2 documentos" })).toBeInTheDocument()
    await waitFor(() => expect(lastFilters().carpeta).toBe("f-contratos"))
  })

  it("explorer: documents render as icon tiles with their file type in the grid view", () => {
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
    showGrid();

    const docs = screen.getByRole("list", { name: "Documentos" });
    expect(within(docs).getByRole("button", { name: /Acta\.pdf/ })).toHaveTextContent("PDF");
    expect(within(docs).getByRole("button", { name: /Cuentas\.xlsx/ })).toHaveTextContent("XLS");
  });

  it("explorer: dragging a folder tile onto another moves the hierarchy", () => {
    render(<RepositoryList />);
    showGrid();

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
    showGrid();

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
    showGrid();

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
    showGrid();

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
    showGrid()

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
    showGrid()

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
    showGrid()

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

  // Rail, breadcrumb and content can show the same folder at once: their
  // @dnd-kit droppable ids carry a scope suffix that the drop handler drops.
  it("dragging a document onto a scoped folder target (content tile) moves it there", () => {
    render(<RepositoryList />)

    act(() => {
      dnd.onDragEnd!({ active: { id: "doc:doc-1" }, over: { id: "carpeta:f-contratos@contenido" } })
    })

    expect(moveMutation.mutate).toHaveBeenCalledWith({ id: "doc-1", carpeta_id: "f-contratos" })
  })
})

// Documentos redesign (T2: S1, S2, S4–S7, S9, S10): explorer with the tree
// rail, the table as the default view, row and bulk actions, filter chips and
// the role-aware Papelera / Actividad tabs.

function version(numero: number, bytes: number) {
  return {
    version_id: `v-${numero}`,
    numero_version: numero,
    tamano_bytes: bytes,
    tipo_archivo: "application/pdf",
    created_at: "2026-11-10T10:00:00.000Z",
    subido_por_id: "u1",
    subido_por_nombre: "Laura Méndez",
  }
}

const DOCS: DocumentItem[] = [
  {
    ...DOC,
    id: "doc-1",
    titulo: "Propuesta.pdf",
    categoria: "Comercial",
    etiquetas: ["2027"],
    autor_id: "u1",
    version_activa: version(3, 2_516_582),
  },
  {
    ...DOC,
    id: "doc-2",
    titulo: "Contrato.pdf",
    categoria: "Contratos",
    autor_id: "u2",
    version_activa: version(1, 880_640),
  },
  { ...DOC, id: "doc-3", titulo: "Cronograma.pdf", autor_id: "u1" },
]

function withDocs(items: DocumentItem[] = DOCS) {
  useDocumentsMock.mockReturnValue({
    data: { items, total: items.length, page: 1, limit: 25 },
    isLoading: false,
    isError: false,
  })
}

function docRow(titulo: string) {
  const table = screen.getByRole("table", { name: "Documentos de la carpeta" })
  return within(table)
    .getAllByRole("row")
    .find((row) => row.textContent?.includes(titulo))!
}

describe("RepositoryList — explorer redesign (S1, S2, S4–S7, S9, S10)", () => {
  beforeEach(() => {
    resetMocks()
    withDocs()
  })

  it("S1: the list (table) is the default view and the tree rail is rendered", () => {
    render(<RepositoryList />)

    expect(screen.getByRole("button", { name: "Vista lista" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("region", { name: "Listado de documentos" })).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Documentos" })).toBeNull()
    const rail = screen.getByRole("navigation", { name: "Carpetas" })
    expect(within(rail).getByRole("button", { name: "Todas" })).toBeInTheDocument()
    expect(within(rail).getByRole("tree", { name: "Carpetas del repositorio" })).toBeInTheDocument()
  })

  it("S2: the table shows Nombre, Categoría, Versión, Tamaño, Modificado with folders first", () => {
    render(<RepositoryList />)

    const table = screen.getByRole("table", { name: "Documentos de la carpeta" })
    for (const name of [/^Nombre/, /^Categoría/, /^Versión/, /^Tamaño/, /^Modificado/]) {
      expect(within(table).getByRole("columnheader", { name })).toBeInTheDocument()
    }
    const rows = within(table).getAllByRole("row")
    expect(rows[1]).toHaveTextContent("Acme")
    expect(rows[1]).toHaveTextContent("Carpeta · 0 docs")
    expect(rows[2]).toHaveTextContent("Contratos")
    expect(rows[2]).toHaveTextContent("Carpeta · 1 doc")

    const propuesta = docRow("Propuesta.pdf")
    expect(propuesta).toHaveTextContent("PDF")
    expect(propuesta).toHaveTextContent("2027")
    expect(propuesta).toHaveTextContent("v3")
    expect(propuesta).toHaveTextContent("2.4 MB")
    expect(propuesta).toHaveTextContent("Laura Méndez")
  })

  it("S2: a restricted category shows the lock; a regular one does not", () => {
    render(<RepositoryList />)

    expect(
      within(docRow("Contrato.pdf")).getByRole("img", { name: "Categoría restringida" }),
    ).toBeInTheDocument()
    expect(
      within(docRow("Propuesta.pdf")).queryByRole("img", { name: "Categoría restringida" }),
    ).toBeNull()
  })

  it("S3 UI: the sort control passes orden to useDocuments", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)
    expect((lastFilters() as { orden?: string }).orden).toBeUndefined()

    await user.click(screen.getByRole("combobox", { name: "Ordenar documentos" }))
    await user.click(await screen.findByRole("option", { name: "Nombre A–Z" }))

    await waitFor(() => expect((lastFilters() as { orden?: string }).orden).toBe("nombre_asc"))
  })

  it("S4: «Editar categoría y etiquetas» opens «Editar documento» and saves title, category, tags and clients", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("button", { name: "Acciones de Propuesta.pdf" }))
    await user.click(await screen.findByRole("menuitem", { name: "Editar categoría y etiquetas" }))
    const dialog = await screen.findByRole("dialog", { name: "Editar documento" })

    const titulo = within(dialog).getByRole("textbox", { name: "Título" })
    await user.clear(titulo)
    await user.type(titulo, "Propuesta 2027.pdf")
    await user.click(within(dialog).getByRole("combobox", { name: "Categoría" }))
    await user.click(await screen.findByRole("option", { name: "Finanzas" }))
    await user.type(within(dialog).getByRole("textbox", { name: "Agregar etiqueta" }), "fase 2{Enter}")
    await user.click(within(dialog).getByRole("combobox", { name: "Agregar cliente" }))
    await user.click(await screen.findByRole("option", { name: "Acme" }))
    await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }))

    await waitFor(() =>
      expect(updateDocMutation.mutateAsync).toHaveBeenCalledWith({
        id: "doc-1",
        titulo: "Propuesta 2027.pdf",
        categoria: "Finanzas",
        etiquetas: ["2027", "fase 2"],
        cliente_ids: ["cli-1"],
      }),
    )
  })

  it("S4: «Mover a…» moves the document to the chosen folder", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("button", { name: "Acciones de Propuesta.pdf" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mover a…" }))
    const dialog = await screen.findByRole("dialog", { name: "Mover «Propuesta.pdf»" })
    await user.click(within(dialog).getByRole("combobox", { name: "Destino" }))
    await user.click(await screen.findByRole("option", { name: "Contratos / Renovaciones" }))
    await user.click(within(dialog).getByRole("button", { name: "Mover" }))

    await waitFor(() =>
      expect(moveMutation.mutateAsync).toHaveBeenCalledWith({
        id: "doc-1",
        carpeta_id: "f-renovaciones",
      }),
    )
  })

  it("S5: the bulk bar trashes each selected document after confirming and reports partial failures", async () => {
    // COLABORADOR u1: authored doc-1 and doc-3, not doc-2.
    currentUser.value = { id: "u1", nombre: "Laura", rol: "COLABORADOR" }
    trashMutation.mutateAsync.mockImplementation((id: string) =>
      id === "doc-3" ? Promise.reject(new Error("boom")) : Promise.resolve({}),
    )
    const user = userEvent.setup()
    render(<RepositoryList />)

    for (const titulo of ["Propuesta.pdf", "Contrato.pdf", "Cronograma.pdf"]) {
      await user.click(screen.getByRole("checkbox", { name: `Seleccionar ${titulo}` }))
    }
    const bar = screen.getByRole("region", { name: "Acciones en lote" })
    expect(bar).toHaveTextContent("3 seleccionados")

    await user.click(within(bar).getByRole("button", { name: "Eliminar" }))
    expect(trashMutation.mutateAsync).not.toHaveBeenCalled()
    await user.click(await screen.findByRole("button", { name: "Enviar a la papelera" }))

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        "1 de 3 enviados a la papelera; 1 sin permiso; 1 con error",
      ),
    )
    expect(trashMutation.mutateAsync).toHaveBeenCalledTimes(2)
    expect(trashMutation.mutateAsync).toHaveBeenCalledWith("doc-1")
    expect(trashMutation.mutateAsync).toHaveBeenCalledWith("doc-3")
    // The failed one stays selected to retry.
    expect(screen.getByRole("region", { name: "Acciones en lote" })).toHaveTextContent(
      "1 seleccionado",
    )
  })

  it("S5: «Cancelar selección» hides the bulk bar", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("checkbox", { name: "Seleccionar Propuesta.pdf" }))
    await user.click(screen.getByRole("button", { name: "Cancelar selección" }))

    expect(screen.queryByRole("region", { name: "Acciones en lote" })).toBeNull()
  })

  it("S6: an active filter shows as a chip and removing it clears that filter", async () => {
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("button", { name: /Filtros/ }))
    const combos = await screen.findAllByRole("combobox")
    await user.click(combos.find((c) => c.textContent?.includes("Cliente"))!)
    await user.click(await screen.findByRole("option", { name: "Acme" }))
    await waitFor(() => expect(lastFilters().cliente).toBe("cli-1"))

    await user.click(await screen.findByRole("button", { name: "Quitar filtro Cliente: Acme" }))

    await waitFor(() => expect(lastFilters().cliente).toBeUndefined())
    expect(screen.queryByRole("list", { name: "Filtros activos" })).toBeNull()
  })

  it("S7: COLABORADOR sees no tabs; COORDINADOR sees Papelera; only ADMINISTRADOR sees Actividad", () => {
    currentUser.value = { id: "u1", nombre: "Laura", rol: "COLABORADOR" }
    const colaborador = render(<RepositoryList />)
    expect(screen.queryByRole("tab")).toBeNull()
    colaborador.unmount()

    currentUser.value = { id: "u3", nombre: "Coord", rol: "COORDINADOR" }
    const coordinador = render(<RepositoryList />)
    expect(screen.getByRole("tab", { name: "Papelera" })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Actividad" })).toBeNull()
    coordinador.unmount()

    currentUser.value = { id: "u-admin", nombre: "Admin", rol: "ADMINISTRADOR" }
    render(<RepositoryList />)
    expect(screen.getByRole("tab", { name: "Documentos" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Papelera" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Actividad" })).toBeInTheDocument()
  })

  it("S8 UI: Papelera lists trashed documents and «Restaurar» restores one", async () => {
    currentUser.value = { id: "u3", nombre: "Coord", rol: "COORDINADOR" }
    useTrashedMock.mockReturnValue({
      data: {
        items: [
          {
            ...DOC,
            id: "doc-9",
            titulo: "Viejo.pdf",
            deleted_at: "2026-11-12T09:00:00.000Z",
            eliminado_por_nombre: "Camila Rojas",
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
      },
      isLoading: false,
      isError: false,
    })
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("tab", { name: "Papelera" }))
    const papelera = await screen.findByRole("region", { name: "Papelera" })
    expect(within(papelera).getByText("Viejo.pdf")).toBeInTheDocument()
    expect(within(papelera).getByText("Camila Rojas")).toBeInTheDocument()

    await user.click(within(papelera).getByRole("button", { name: "Restaurar Viejo.pdf" }))

    expect(restoreMutation.mutateAsync).toHaveBeenCalledWith("doc-9")
  })

  it("S9: Actividad renders the document audit events", async () => {
    useActivityMock.mockReturnValue({
      data: [
        {
          id: "a1",
          accion: "crear",
          documento_id: "doc-1",
          documento_titulo: "Propuesta.pdf",
          usuario_nombre: "Laura Méndez",
          created_at: "2026-11-15T14:00:00.000Z",
        },
        {
          id: "a2",
          accion: "eliminar",
          documento_id: "doc-2",
          documento_titulo: null,
          usuario_nombre: "Admin",
          created_at: "2026-11-14T14:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
    })
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("tab", { name: "Actividad" }))

    const feed = await screen.findByRole("list", { name: "Eventos de documentos" })
    const items = within(feed).getAllByRole("listitem")
    expect(items[0]).toHaveTextContent("Laura Méndez subió Propuesta.pdf")
    expect(items[1]).toHaveTextContent("Admin envió a la papelera un documento")
  })

  it("S10: write actions on someone else's document are disabled with the reason", async () => {
    currentUser.value = { id: "u1", nombre: "Laura", rol: "COLABORADOR" }
    const user = userEvent.setup()
    render(<RepositoryList />)

    await user.click(screen.getByRole("button", { name: "Acciones de Contrato.pdf" }))

    expect(await screen.findByRole("menuitem", { name: "Eliminar" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    expect(screen.getByRole("menuitem", { name: "Mover a…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
    expect(screen.getByRole("menuitem", { name: "Abrir detalle" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    )
    expect(
      screen.getByText(/Solo su autor o Coordinación, Gerencia y Administración/),
    ).toBeInTheDocument()
  })
})
