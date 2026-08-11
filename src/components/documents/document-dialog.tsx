// Ficha de documento (PRD §6.2): versión activa, acciones de descarga,
// "Subir nueva versión" (explicito, nunca automático), eliminación con
// confirmación (soft delete de TODO el documento) e historial de versiones
// en dropdown: solo descarga por versión, sin editar ni eliminar versiones.

"use client";

import { useState } from "react";
import {
  ChevronDown,
  Download,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/hooks/kanban";
import {
  downloadActiveVersion,
  downloadDocumentVersion,
  extensionOf,
  formatVersionFecha,
  useDeleteDocument,
  useDocument,
  useDocumentVersions,
  useUploadVersion,
  type DocumentVersion,
} from "@/hooks/documents";
import { ToneBadge } from "@/components/crm/shared";
import { ConfirmDialog } from "@/components/crm/entity-dialogs";
import { FileDropzone } from "@/components/documents/upload-dialog";

export function DocumentDialog({
  documentId,
  onClose,
}: {
  documentId: string | null;
  onClose: () => void;
}) {
  const [versionUploadOpen, setVersionUploadOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [versionesOpen, setVersionesOpen] = useState(false);

  const query = useDocument(documentId);
  const versionsQuery = useDocumentVersions(documentId);
  const deleteMutation = useDeleteDocument(documentId ?? "");

  const documento = query.data;
  const versiones = versionsQuery.data ?? [];
  const activa = documento?.version_activa ?? null;
  const proximaVersion = activa ? activa.numero_version + 1 : 1;

  return (
    <Dialog open={documentId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto rounded-[24px] p-0 sm:max-w-[620px]">
        {!documento ? (
          <div className="flex flex-col gap-3 p-6">
            <Skeleton className="h-8 w-3/4 rounded-10" />
            <Skeleton className="h-4 w-1/2 rounded-[8px]" />
            <Skeleton className="h-24 w-full rounded-14" />
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-6">
            <DialogHeader className="gap-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-[15px_15px_15px_5px] text-[11px] font-bold",
                      activa ? "bg-rose-100 text-rose-700" : "bg-ink-100 text-ink-600",
                    )}
                  >
                    {extensionOf(activa?.tipo_archivo ?? "")?.toUpperCase() ?? "—"}
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="font-display text-[19px] leading-snug font-bold tracking-[-0.02em] text-ink-950">
                      {documento.titulo}
                    </DialogTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <ToneBadge tone="neutro" label={documento.categoria} />
                      {activa && (
                        <span className="inline-flex h-[24px] items-center rounded-full bg-ink-100 px-2.5 text-[11px] font-semibold text-ink-600">
                          {extensionOf(activa.tipo_archivo ?? "")?.toUpperCase() ??
                            "Archivo"}{" "}
                          · {formatBytes(activa.tamano_bytes)}
                        </span>
                      )}
                      {documento.etiquetas.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex h-[24px] items-center rounded-full bg-ink-100 px-2.5 text-[11px] font-medium text-ink-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar documento"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="shrink-0 text-ink-500 hover:text-destructivo"
                >
                  <Trash2 className="size-4" strokeWidth={1.8} />
                </Button>
              </div>

              {documento.clientes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {documento.clientes.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex h-[24px] items-center rounded-full bg-info-bg px-2.5 text-[11px] font-semibold text-info"
                    >
                      {c.nombre}
                    </span>
                  ))}
                </div>
              )}
            </DialogHeader>

            <div className="rounded-[16px] border border-ink-200 bg-ink-100/40 px-4 py-3 text-[12.5px] leading-relaxed text-ink-600">
              Creado por{" "}
              <span className="font-semibold text-ink-800">{documento.autor_nombre}</span> el{" "}
              {formatVersionFecha(documento.created_at)} · Actualizado con la v
              {activa?.numero_version ?? "—"} el{" "}
              {formatVersionFecha(activa?.created_at ?? null)}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={!activa}
                onClick={() => void downloadActiveVersion(documento).catch(() => undefined)}
                className="h-9 rounded-lg px-4 font-bold"
              >
                <Download className="size-4" strokeWidth={2} />
                {activa ? `Descargar v${activa.numero_version}` : "Sin versión"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVersionUploadOpen(true)}
                className="h-9 rounded-lg border-ink-200 bg-white px-4 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
              >
                <Upload className="size-4 text-exito" strokeWidth={1.9} />
                Subir nueva versión
              </Button>
            </div>

            <section className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setVersionesOpen((v) => !v)}
                className="flex items-center justify-between rounded-12 px-1 py-1 text-left"
              >
                <span className="text-[13px] font-bold text-ink-800">
                  Versiones{" "}
                  <span className="font-medium text-ink-500">
                    ({versionsQuery.isLoading ? "…" : versiones.length})
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-ink-500 transition-transform",
                    versionesOpen && "rotate-180",
                  )}
                  strokeWidth={2}
                />
              </button>

              {versionsQuery.isLoading &&
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-12" />
                ))}

              {!versionsQuery.isLoading && versiones.length === 0 && (
                <p className="text-[12.5px] text-ink-600">Sin versiones todavía.</p>
              )}

              {versionesOpen &&
                versiones.map((v) => (
                  <VersionRow
                    key={v.id}
                    version={v}
                    activa={v.id === activa?.version_id}
                    onDownload={() =>
                      void downloadDocumentVersion(documento, v).catch(() => undefined)
                    }
                  />
                ))}
            </section>
          </div>
        )}
      </DialogContent>

      {documento && (
        <VersionUploadDialog
          documentId={documento.id}
          open={versionUploadOpen}
          onOpenChange={setVersionUploadOpen}
          proximaVersion={proximaVersion}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Eliminar documento"
        description="Se eliminará el documento completo con todas sus versiones. Esta acción no se puede deshacer."
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!documentId) return;
          void deleteMutation
            .mutateAsync(undefined)
            .then(onClose)
            .catch(() => undefined);
        }}
      />
    </Dialog>
  );
}

function VersionRow({
  version,
  activa,
  onDownload,
}: {
  version: DocumentVersion;
  activa: boolean;
  onDownload: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-12 border px-3.5 py-2.5",
        activa ? "border-exito/30 bg-exito-bg/50" : "border-ink-200 bg-white",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 font-mono text-[12.5px] font-bold text-ink-900">
          v{version.numero_version}
        </span>
        <span className="truncate text-[12.5px] text-ink-600">
          {formatVersionFecha(version.created_at)} · {version.subido_por_nombre}
        </span>
        {activa && <ToneBadge tone="exito" label="Activa" className="shrink-0 !px-2" />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11.5px] text-ink-500">
          {formatBytes(version.tamano_bytes)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Descargar versión v${version.numero_version}`}
          onClick={onDownload}
          className="text-ink-500 hover:text-exito"
        >
          <Download className="size-4" strokeWidth={1.8} />
        </Button>
      </div>
    </li>
  );
}

function VersionUploadDialog({
  documentId,
  open,
  onOpenChange,
  proximaVersion,
}: {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proximaVersion: number;
}) {
  const upload = useUploadVersion(documentId);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto rounded-[24px] p-0 sm:max-w-[520px]">
        <div className="flex flex-col gap-5 p-6">
          <DialogHeader className="gap-1">
            <DialogTitle className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
              Subir nueva versión
            </DialogTitle>
            <DialogDescription>
              El documento se actualizará a la versión v{proximaVersion}.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
            >
              {error}
            </div>
          )}

          <FileDropzone file={file} onChange={setFile} />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              className="rounded-lg px-4 font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!file || upload.isPending}
              onClick={() => {
                setError(null);
                void upload
                  .mutateAsync({ file: file! })
                  .then(() => {
                    reset();
                    onOpenChange(false);
                  })
                  .catch(() => undefined);
              }}
              className="rounded-lg px-4 font-bold"
            >
              {upload.isPending && <LoaderCircle className="size-4 animate-spin" />}
              {upload.isPending ? "Subiendo…" : "Subir versión"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}