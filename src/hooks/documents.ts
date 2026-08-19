// TanStack Query data layer for the documents repository (Hito 4 / PRD §6).
// DTOs mirror the server shapes from src/app/api/v1/documents (list, detail,
// versions, upload, version upload, delete) plus the zip multi-download.
// Mutations toast Spanish errors centrally (same convention as crm.ts and
// kanban.ts) and re-throw so callers can close dialogs on success only.
// Downloads go through fetch-blob->anchor so the filename is ours (título)
// instead of the storage key; the 302 redirects are followed by fetch.

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, ApiError, type ApiVoid } from "@/lib/api/http";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

export type DocumentVersionActiva = {
  version_id: string;
  numero_version: number;
  tamano_bytes: number | null;
  tipo_archivo: string | null;
  created_at: string;
  subido_por_id: string;
  subido_por_nombre: string;
};

export type DocumentItem = {
  id: string;
  titulo: string;
  categoria: string;
  etiquetas: string[];
  autor_id: string;
  autor_nombre: string;
  created_at: string;
  updated_at: string | null;
  cliente_ids: string[];
  clientes: { id: string; nombre: string }[];
  version_activa: DocumentVersionActiva | null;
};

export type DocumentListResponse = {
  page: number;
  limit: number;
  total: number;
  items: DocumentItem[];
};

export type DocumentVersion = {
  id: string;
  documento_id: string;
  numero_version: number;
  tamano_bytes: number | null;
  tipo_archivo: string | null;
  created_at: string;
  subido_por_id: string;
  subido_por_nombre: string;
};

export type DocumentDetail = DocumentItem & {
  versiones: DocumentVersion[];
  versiones_count: number;
};

export type DocumentUploadResponse = DocumentItem & { version: number };

export type DocumentVersionResponse = Omit<DocumentVersion, "documento_id">;

/* ── Filters (query params mirror parseDocumentFilters) ────────────────── */

export type DocumentFilters = {
  q?: string;
  categoria?: string;
  etiqueta?: string;
  cliente?: string;
  autor?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  limit?: number;
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const documentQueryKeys = {
  all: ["documents"] as const,
  list: (filters: DocumentFilters) => ["documents", "list", filters] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
  versions: (id: string) => ["documents", id, "versions"] as const,
  categories: ["documents", "categories"] as const,
};

/* ── Queries ───────────────────────────────────────────────────────────── */

/**
 * Catálogo de categorías EN VIVO (setting `doc_categories`, con fallback a
 * las constantes de fábrica) vía GET /api/v1/catalogs/settings — el mismo
 * endpoint que lee el admin, sin requerir su rol. Bug fix: el diálogo de
 * subida y el filtro del repositorio usaban el arreglo estático
 * DOC_CATEGORIES, que puede quedar desalineado con el catálogo que el
 * servidor realmente valida al crear un documento (POST /documents ->
 * loadDocCategories()), rechazando con "Categoría no válida" una opción que
 * la UI seguía ofreciendo.
 */
export function useDocCategories(): UseQueryResult<{ nombre: string; restringida: boolean }[]> {
  return useQuery({
    queryKey: documentQueryKeys.categories,
    queryFn: async () => {
      const res = await apiGet<{ doc_categories: { nombre: string; restringida: boolean }[] }>(
        "/api/v1/catalogs/settings",
      );
      return res.doc_categories;
    },
  });
}

export function useDocuments(filters: DocumentFilters): UseQueryResult<DocumentListResponse> {
  return useQuery({
    queryKey: documentQueryKeys.list(filters),
    queryFn: () => {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") sp.set(key, String(value));
      }
      return apiGet<DocumentListResponse>(`/api/v1/documents?${sp.toString()}`);
    },
  });
}

export function useDocument(id: string | null): UseQueryResult<DocumentDetail> {
  return useQuery({
    queryKey: documentQueryKeys.detail(id ?? "none"),
    enabled: id !== null,
    queryFn: async () => {
      const res = await apiGet<{ documento: DocumentDetail }>(`/api/v1/documents/${id}`);
      return res.documento;
    },
  });
}

export function useDocumentVersions(id: string | null): UseQueryResult<DocumentVersion[]> {
  return useQuery({
    queryKey: documentQueryKeys.versions(id ?? "none"),
    enabled: id !== null,
    queryFn: async () => {
      const res = await apiGet<{ versiones: DocumentVersion[] }>(
        `/api/v1/documents/${id}/versions`,
      );
      return res.versiones;
    },
  });
}

/* ── Mutations (multipart: no Content-Type header for FormData) ────────── */

async function multipartUpload<T>(url: string, form: FormData): Promise<T> {
  try {
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) {
      let message = "No pudimos subir el archivo.";
      try {
        const body = (await res.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        /* fallback message */
      }
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) toast.error(err.message);
    throw err;
  }
}

export type UploadDocumentInput = {
  file: File;
  titulo: string;
  categoria: string;
  etiquetas: string[];
  cliente_id?: string;
};

export function useUploadDocument(): UseMutationResult<
  DocumentUploadResponse,
  Error,
  UploadDocumentInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("titulo", input.titulo);
      form.append("categoria", input.categoria);
      form.append("etiquetas", JSON.stringify(input.etiquetas));
      if (input.cliente_id) form.append("cliente_id", input.cliente_id);
      return multipartUpload<DocumentUploadResponse>("/api/v1/documents", form);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentQueryKeys.all });
      toast.success("Documento subido.");
    },
  });
}

export function useUploadVersion(id: string): UseMutationResult<
  DocumentVersionResponse,
  Error,
  { file: File }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file }) => {
      const form = new FormData();
      form.append("file", file);
      return multipartUpload<DocumentVersionResponse>(
        `/api/v1/documents/${id}/versions`,
        form,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentQueryKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: documentQueryKeys.versions(id) });
      void qc.invalidateQueries({ queryKey: documentQueryKeys.all });
      toast.success("Versión subida.");
    },
  });
}

export function useDeleteDocument(id: string): UseMutationResult<ApiVoid, Error, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/documents/${id}`);
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.message);
        throw err;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentQueryKeys.all });
      toast.success("Documento eliminado.");
    },
  });
}

/* ── Formatting helpers ────────────────────────────────────────────────── */

/** "5 jul 2026" (sin cero inicial ni punto del mes corto). */
export function formatVersionFecha(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })
    .replace(/\./g, "");
}

/* ── Download helpers (fetch-blob -> anchor; covers the 302 redirect) ──── */

export function extensionOf(tipoArchivo: string | null | undefined): string | null {
  if (!tipoArchivo) return null;
  const t = tipoArchivo.toLowerCase();
  const known: [string, string][] = [
    ["pdf", "pdf"],
    ["wordprocessingml", "docx"],
    ["spreadsheetml", "xlsx"],
    ["jpeg", "jpg"],
    ["png", "png"],
  ];
  for (const [needle, ext] of known) {
    if (t.includes(needle)) return ext;
  }
  return null;
}

function fileNameFor(doc: { titulo: string; version_activa: DocumentVersionActiva | null }) {
  const ext = extensionOf(doc.version_activa?.tipo_archivo);
  return `${doc.titulo}${ext ? `.${ext}` : ""}`;
}

function versionFileName(doc: DocumentItem, version: DocumentVersion): string {
  const ext = extensionOf(version.tipo_archivo);
  return `${doc.titulo}_v${version.numero_version}${ext ? `.${ext}` : ""}`;
}

async function downloadBlob(url: string, fileName: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      let message = "No pudimos generar la descarga.";
      try {
        const body = (await res.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        /* fallback message */
      }
      throw new ApiError(message, res.status);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    if (err instanceof ApiError) toast.error(err.message);
    else toast.error("No pudimos generar la descarga.");
    throw err;
  }
}

export function downloadActiveVersion(doc: DocumentItem | DocumentDetail): Promise<void> {
  return downloadBlob(`/api/v1/documents/${doc.id}/download`, fileNameFor(doc));
}

export function downloadDocumentVersion(
  doc: DocumentItem | DocumentDetail,
  version: DocumentVersion,
): Promise<void> {
  return downloadBlob(
    `/api/v1/documents/${doc.id}/versions/${version.id}/download`,
    versionFileName(doc, version),
  );
}

export function downloadSelectionZip(ids: string[]): Promise<void> {
  return downloadBlobJson("/api/v1/documents/zip", { ids }, "documentos.zip");
}

async function downloadBlobJson(
  url: string,
  body: unknown,
  fileName: string,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let message = "No pudimos generar la descarga.";
      try {
        const parsed = (await res.json()) as { error?: string };
        message = parsed.error ?? message;
      } catch {
        /* fallback message */
      }
      throw new ApiError(message, res.status);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    toast.success(`Descarga completada: ${fileName}`);
  } catch (err) {
    if (err instanceof ApiError) toast.error(err.message);
    else toast.error("No pudimos generar la descarga.");
    throw err;
  }
}