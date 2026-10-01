import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { documentQueryKeys, DocumentDuplicateTitleError, useDeleteDocument, useUploadDocument, type DocumentUploadResponse } from "./documents"

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
