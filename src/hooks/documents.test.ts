import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  documentQueryKeys,
  DocumentDuplicateTitleError,
  useClientFolder,
  useDeleteDocument,
  useDocumentActivity,
  useDocuments,
  useMoveDocument,
  useRestoreDocument,
  useTrashDocument,
  useTrashedDocuments,
  useUpdateDocument,
  useUploadDocument,
  type DocumentUploadResponse,
} from "./documents"

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  wrapper.displayName = "QueryClientTestWrapper"
  return { wrapper, invalidateSpy }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const UPLOADED: DocumentUploadResponse = {
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
  version: 1,
}

describe("useUploadDocument / useDeleteDocument", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Bug report: uploading a document updated the Repository list but never
  // refreshed the sidebar's "documentos" badge (GET /api/v1/nav/counts just
  // counts Documento rows — nothing told it to refetch).
  //
  // ADR-13 (S0.9b item 1): document CREATION now uses sign -> PUT -> JSON
  // confirm, so a brand-new document larger than the hosting body limit can be
  // uploaded too. The bytes never pass through the route handler.
  it("uploads a new document via sign -> PUT -> JSON confirm and invalidates list + nav", async () => {
    const docId = "11111111-1111-4111-8111-111111111111";
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          storage_path: `documentos/general/${docId}/v1_informe.pdf`,
          token: "tok",
          signed_url: "https://storage.example/sign",
          max_bytes: 25 * 1024 * 1024,
          allowed_extensions: ["pdf"],
          documento_id: docId,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(UPLOADED, 201));
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUploadDocument(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        file: new File(["x"], "informe.pdf"),
        titulo: "Informe final",
        categoria: "Comercial",
        etiquetas: [],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const signCall = fetchMock.mock.calls[0]!;
    expect(String(signCall[0])).toBe("/api/v1/uploads/sign");
    expect(JSON.parse(String(signCall[1].body))).toMatchObject({
      kind: "documento_nuevo",
      nombre: "informe.pdf",
      tamano_bytes: 1,
      // Correction B1: the create gates run at sign time now, so the request
      // must describe the document row it will create.
      titulo: "Informe final",
      categoria: "Comercial",
    });
    const putCall = fetchMock.mock.calls[1]!;
    expect(String(putCall[0])).toBe("https://storage.example/sign");
    expect(putCall[1].method).toBe("PUT");
    expect((putCall[1].headers as Record<string, string>)["x-upsert"]).toBe("false");
    const confirmCall = fetchMock.mock.calls[2]!;
    expect(String(confirmCall[0])).toBe("/api/v1/documents");
    expect(JSON.parse(String(confirmCall[1].body))).toMatchObject({
      storage_path: `documentos/general/${docId}/v1_informe.pdf`,
      documento_id: docId,
      titulo: "Informe final",
      categoria: "Comercial",
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["nav", "counts"] });
  });

  // Correction B1: the duplicate-title 409 now arrives from the SIGN call, so
  // the hook must surface DocumentDuplicateTitleError AND must not PUT the bytes
  // (no orphan object on the normal duplicate-title flow).
  it("surfaces DocumentDuplicateTitleError from the sign 409 and never PUTs the bytes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "Ya existe un documento llamado \"Informe final\".", code: "CONFLICT", documento: { id: "doc-1", titulo: "Informe final" } },
        409,
      ),
    );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUploadDocument(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          file: new File(["x"], "informe.pdf"),
          titulo: "Informe final",
          categoria: "Comercial",
          etiquetas: [],
        });
      }),
    ).rejects.toBeInstanceOf(DocumentDuplicateTitleError);

    // Only the sign call happened: no PUT (no orphan) and no confirm.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/v1/uploads/sign");
  });

  // QA audit #4 must keep working through the signed flow: the confirm 409 is
  // not a real error, the dialog uses it to offer "nueva versión" vs
  // "documento aparte", so it must surface as DocumentDuplicateTitleError.
  it("surfaces DocumentDuplicateTitleError from the confirm 409", async () => {
    const docId = "11111111-1111-4111-8111-111111111111";
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          storage_path: `documentos/general/${docId}/v1_informe.pdf`,
          token: "tok",
          signed_url: "https://storage.example/sign",
          max_bytes: 25 * 1024 * 1024,
          allowed_extensions: ["pdf"],
          documento_id: docId,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: "Ya existe un documento llamado \"Informe final\".", code: "CONFLICT", documento: { id: "doc-1", titulo: "Informe final" } },
          409,
        ),
      );
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUploadDocument(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          file: new File(["x"], "informe.pdf"),
          titulo: "Informe final",
          categoria: "Comercial",
          etiquetas: [],
        });
      }),
    ).rejects.toBeInstanceOf(DocumentDuplicateTitleError);
  });

  it("invalidates the nav counts badge on delete too", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const { wrapper, invalidateSpy } = createWrapper()

    const { result } = renderHook(() => useDeleteDocument("doc-1"), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["nav", "counts"] })
  })
})


/* ── Lane 1, task 1.3 (S3–S5): folder-aware upload, client folders, moves ── */

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }))

function signedResponse(docId: string) {
  return jsonResponse({
    storage_path: `documentos/general/${docId}/v1_informe.pdf`,
    token: "tok",
    signed_url: "https://storage.example/sign",
    max_bytes: 25 * 1024 * 1024,
    allowed_extensions: ["pdf"],
    documento_id: docId,
  })
}

describe("folder-aware document hooks (S3–S5)", () => {
  const fetchMock = vi.fn()
  const docId = "11111111-1111-4111-8111-111111111111"

  beforeEach(() => {
    fetchMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // S3: «no se guarda dentro de esa carpeta … sino que queda en la carpeta "Todas"».
  it("sends carpeta_id at sign AND confirm when uploading into a folder", async () => {
    fetchMock
      .mockResolvedValueOnce(signedResponse(docId))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(UPLOADED, 201))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useUploadDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        file: new File(["x"], "informe.pdf"),
        titulo: "Informe final",
        categoria: "Comercial",
        etiquetas: [],
        carpeta_id: "carpeta-1",
      })
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toMatchObject({
      kind: "documento_nuevo",
      carpeta_id: "carpeta-1",
    })
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1].body))).toMatchObject({
      documento_id: docId,
      carpeta_id: "carpeta-1",
    })
  })

  // Existing behavior: with no folder open the document still lands in «Todas».
  it("sends no carpeta_id when no folder is given", async () => {
    fetchMock
      .mockResolvedValueOnce(signedResponse(docId))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(UPLOADED, 201))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useUploadDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        file: new File(["x"], "informe.pdf"),
        titulo: "Informe final",
        categoria: "Comercial",
        etiquetas: [],
      })
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).not.toHaveProperty("carpeta_id")
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1].body))).not.toHaveProperty("carpeta_id")
  })

  // 1.5 (S7): a batch upload toasts once for the whole batch, so each file
  // of the batch asks the hook not to toast its own success.
  it("a silent upload does not toast its own success and sends no extra field", async () => {
    fetchMock
      .mockResolvedValueOnce(signedResponse(docId))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(UPLOADED, 201))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useUploadDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        file: new File(["x"], "informe.pdf"),
        titulo: "Informe final",
        categoria: "Comercial",
        etiquetas: [],
        silent: true,
      })
    })

    expect(toastSuccess).not.toHaveBeenCalled()
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).not.toHaveProperty("silent")
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1].body))).not.toHaveProperty("silent")
  })

  // Existing behavior: a single upload still toasts «Documento subido.».
  it("a regular upload still toasts «Documento subido.»", async () => {
    fetchMock
      .mockResolvedValueOnce(signedResponse(docId))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(UPLOADED, 201))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useUploadDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        file: new File(["x"], "informe.pdf"),
        titulo: "Informe final",
        categoria: "Comercial",
        etiquetas: [],
      })
    })

    expect(toastSuccess).toHaveBeenCalledWith("Documento subido.")
  })

  // S5: «Existing documents can be moved by dragging them onto a folder.»
  it("useMoveDocument PATCHes carpeta_id and refreshes documents and folders", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ documento: { ...UPLOADED, id: "doc-1" } }))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useMoveDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: "doc-1", carpeta_id: "carpeta-1" })
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("/api/v1/documents/doc-1")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(String(init.body))).toEqual({ carpeta_id: "carpeta-1" })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.folders })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all })
    expect(toastSuccess).toHaveBeenCalledWith("Documento movido.")
  })

  it("useMoveDocument to the root sends carpeta_id null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ documento: UPLOADED }))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useMoveDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: "doc-1", carpeta_id: null })
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toEqual({ carpeta_id: null })
  })

  it("useMoveDocument toasts the server error and does not refresh", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "La carpeta no existe.", code: "NOT_FOUND" }, 404))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useMoveDocument(), { wrapper })

    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: "doc-1", carpeta_id: "gone" })
      }),
    ).rejects.toBeTruthy()

    expect(toastError).toHaveBeenCalledWith("La carpeta no existe.")
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  // S5: bulk actions show one summary toast, so a silent mutation toasts nothing
  // on success or on error but still refreshes the lists.
  it("a silent useMoveDocument does not toast on success or error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ documento: UPLOADED }))
      .mockResolvedValueOnce(jsonResponse({ error: "Sin permiso.", code: "FORBIDDEN" }, 403))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useMoveDocument({ silent: true }), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: "doc-1", carpeta_id: "carpeta-1" })
    })
    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: "doc-2", carpeta_id: "carpeta-1" })
      }),
    ).rejects.toBeTruthy()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all })
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("a silent useTrashDocument does not toast its success", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useTrashDocument({ silent: true }), { wrapper })

    await act(async () => {
      await result.current.mutateAsync("doc-1")
    })

    expect(fetchMock.mock.calls[0]![1].method).toBe("DELETE")
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  // S4: «One action creates (or opens, if it exists) the folder of a chosen client.»
  it("useClientFolder find-or-creates the client folder and refreshes the tree", async () => {
    const carpeta = { id: "carpeta-9", nombre: "Acme", parent_id: null, cliente_id: "cli-1", created_at: "2026-01-01" }
    fetchMock.mockResolvedValueOnce(jsonResponse({ carpeta, creada: true }, 201))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useClientFolder(), { wrapper })

    let res: unknown
    await act(async () => {
      res = await result.current.mutateAsync("cli-1")
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("/api/v1/clients/cli-1/folder")
    expect(init.method).toBe("POST")
    expect(res).toEqual({ carpeta, creada: true })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.folders })
    expect(toastSuccess).toHaveBeenCalledWith("Carpeta del cliente creada.")
  })

  it("useClientFolder opens an existing folder without a creation toast", async () => {
    const carpeta = { id: "carpeta-9", nombre: "Acme", parent_id: null, cliente_id: "cli-1", created_at: "2026-01-01" }
    fetchMock.mockResolvedValueOnce(jsonResponse({ carpeta, creada: false }))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useClientFolder(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync("cli-1")
    })

    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe("explorer admin hooks (S3, S8, S4, S9)", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // S3: sorting is server-side through `orden`.
  it("useDocuments sends orden in the query string and keys the cache by it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ page: 1, limit: 25, total: 0, items: [] }))
    const { wrapper } = createWrapper()
    const filters = { carpeta: "folder-1", orden: "nombre_asc" as const, page: 1 }
    const { result } = renderHook(() => useDocuments(filters), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const url = new URL(String(fetchMock.mock.calls[0]![0]), "http://localhost")
    expect(url.pathname).toBe("/api/v1/documents")
    expect(url.searchParams.get("orden")).toBe("nombre_asc")
    expect(url.searchParams.get("carpeta")).toBe("folder-1")
    expect(documentQueryKeys.list(filters)).toEqual(["documents", "list", filters])
  })

  // S8: Papelera.
  it("useTrashedDocuments GETs the requested trash page", async () => {
    const page = { page: 2, limit: 25, total: 26, items: [] }
    fetchMock.mockResolvedValueOnce(jsonResponse(page))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useTrashedDocuments({ page: 2 }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/v1/documents/trash?page=2")
    expect(result.current.data).toEqual(page)
  })

  it("useTrashedDocuments does not fetch when disabled", async () => {
    const { wrapper } = createWrapper()
    renderHook(() => useTrashedDocuments({ page: 1, enabled: false }), { wrapper })

    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("useRestoreDocument POSTs the restore and refreshes documents, trash and folders", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useRestoreDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync("doc-1")
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("/api/v1/documents/doc-1/restore")
    expect(init.method).toBe("POST")
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.trashAll })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.folders })
    expect(toastSuccess).toHaveBeenCalledWith("Documento restaurado.")
  })

  it("useRestoreDocument toasts the server error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "El documento no existe.", code: "NOT_FOUND" }, 404))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useRestoreDocument(), { wrapper })

    await expect(
      act(async () => {
        await result.current.mutateAsync("doc-1")
      }),
    ).rejects.toBeTruthy()

    expect(toastError).toHaveBeenCalledWith("El documento no existe.")
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  // S4: one "Editar documento" dialog over the existing PATCH.
  it("useUpdateDocument PATCHes only the metadata fields and refreshes list, detail and folders", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ documento: UPLOADED }))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useUpdateDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        id: "doc-1",
        titulo: "Nuevo",
        categoria: "Comercial",
        etiquetas: ["a"],
        cliente_ids: ["cli-1"],
      })
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("/api/v1/documents/doc-1")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(String(init.body))).toEqual({
      titulo: "Nuevo",
      categoria: "Comercial",
      etiquetas: ["a"],
      cliente_ids: ["cli-1"],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.detail("doc-1") })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.folders })
    expect(toastSuccess).toHaveBeenCalledWith("Documento actualizado.")
  })

  it("useTrashDocument DELETEs by id and refreshes list, trash, folders and nav counts", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { wrapper, invalidateSpy } = createWrapper()
    const { result } = renderHook(() => useTrashDocument(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync("doc-7")
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("/api/v1/documents/doc-7")
    expect(init.method).toBe("DELETE")
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.trashAll })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: documentQueryKeys.folders })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["nav", "counts"] })
    expect(toastSuccess).toHaveBeenCalledWith("Documento enviado a la papelera.")
  })

  // S9: Actividad, mapped from the real GET /api/v1/auditoria shape.
  it("useDocumentActivity maps the auditoria rows of entidad=documento", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        registros: [
          {
            id: "aud-1",
            entidad: "documento",
            entidad_id: "doc-1",
            accion: "crear",
            cambios: { titulo: "Contrato marco", categoria: "Legal" },
            created_at: "2026-11-10T12:00:00.000Z",
            usuario: { email: "ana@example.com", nombre: "Ana" },
          },
          {
            id: "aud-2",
            entidad: "documento",
            entidad_id: "doc-2",
            accion: "eliminar",
            cambios: null,
            created_at: "2026-11-09T12:00:00.000Z",
            usuario: null,
          },
        ],
        next_before: null,
      }),
    )
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useDocumentActivity({ enabled: true }), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/v1/auditoria?entidad=documento")
    expect(result.current.data).toEqual([
      {
        id: "aud-1",
        accion: "crear",
        documento_id: "doc-1",
        documento_titulo: "Contrato marco",
        usuario_nombre: "Ana",
        created_at: "2026-11-10T12:00:00.000Z",
      },
      {
        id: "aud-2",
        accion: "eliminar",
        documento_id: "doc-2",
        documento_titulo: null,
        usuario_nombre: null,
        created_at: "2026-11-09T12:00:00.000Z",
      },
    ])
  })

  it("useDocumentActivity does not fetch when disabled", async () => {
    const { wrapper } = createWrapper()
    renderHook(() => useDocumentActivity({ enabled: false }), { wrapper })

    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
