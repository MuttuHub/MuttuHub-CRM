// Shared pieces of the repository explorer (list and grid views): file-type
// meta, the pagination footer, the empty state and the folder action items.

"use client";

import type { DragEvent } from "react";
import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileUp,
  FileVideo,
  Folder,
  FolderOpen,
  Pencil,
  Presentation,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DocumentItem } from "@/hooks/documents";
import type { FolderAction } from "@/components/documents/folder-tree";

/** Id de @dnd-kit de un documento arrastrable del listado. */
export const DOC_DRAG_PREFIX = "doc:";

/** Archivos del sistema soltados (drop nativo); vacío si se arrastró otra cosa. */
export function droppedFiles(event: DragEvent): File[] {
  return Array.from(event.dataTransfer?.files ?? []);
}

/* ── Tipo de archivo ───────────────────────────────────────────────────── */

export type FileMeta = {
  Icon: typeof File;
  /** Icon color (grid tiles). */
  className: string;
  /** Badge colors (table rows); dark-mode aware. */
  badgeClassName: string;
  label: string;
};

export function documentFileMeta(doc: DocumentItem): FileMeta {
  const ext = (doc.titulo.split(".").pop() ?? "").toLowerCase();
  const mime = doc.version_activa?.tipo_archivo ?? "";
  if (mime.includes("pdf") || ext === "pdf")
    return {
      Icon: FileText,
      className: "text-rose-600",
      badgeClassName: "bg-rose-100 text-rose-700 dark:text-rose-400",
      label: "PDF",
    };
  if (mime.includes("word") || ["doc", "docx", "rtf", "odt"].includes(ext))
    return {
      Icon: FileType,
      className: "text-sky-600",
      badgeClassName: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
      label: "DOC",
    };
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    ["xls", "xlsx", "csv", "ods"].includes(ext)
  )
    return {
      Icon: FileSpreadsheet,
      className: "text-emerald-600",
      badgeClassName:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
      label: "XLS",
    };
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    ["ppt", "pptx", "odp"].includes(ext)
  )
    return {
      Icon: Presentation,
      className: "text-orange-500",
      badgeClassName:
        "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
      label: "PPT",
    };
  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)
  )
    return {
      Icon: FileImage,
      className: "text-violet-500",
      badgeClassName:
        "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
      label: "IMG",
    };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return {
      Icon: FileArchive,
      className: "text-amber-600",
      badgeClassName: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
      label: "ZIP",
    };
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm"].includes(ext))
    return {
      Icon: FileVideo,
      className: "text-indigo-500",
      badgeClassName:
        "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
      label: "VID",
    };
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext))
    return {
      Icon: FileAudio,
      className: "text-pink-500",
      badgeClassName: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
      label: "AUD",
    };
  return {
    Icon: File,
    className: "text-ink-500",
    badgeClassName: "bg-ink-100 text-ink-600",
    label: "FILE",
  };
}

export function FileTypeBadge({ doc, className }: { doc: DocumentItem; className?: string }) {
  const meta = documentFileMeta(doc);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-10 text-[10px] font-bold tracking-wide",
        meta.badgeClassName,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

/* ── Acciones de carpeta (menú desplegable y contextual) ───────────────── */

export function FolderDropdownItems({ onAction }: { onAction: (action: FolderAction) => void }) {
  return (
    <>
      <DropdownMenuItem onClick={() => onAction("rename")}>
        <Pencil className="size-3.5" strokeWidth={1.9} />
        Renombrar
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAction("move")}>
        <Folder className="size-3.5" strokeWidth={1.9} />
        Mover…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => onAction("delete")}>
        <Trash2 className="size-3.5" strokeWidth={1.9} />
        Eliminar
      </DropdownMenuItem>
    </>
  );
}

export function FolderContextItems({ onAction }: { onAction: (action: FolderAction) => void }) {
  return (
    <>
      <ContextMenuItem onClick={() => onAction("rename")}>
        <Pencil className="size-3.5" strokeWidth={1.9} />
        Renombrar
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onAction("move")}>
        <Folder className="size-3.5" strokeWidth={1.9} />
        Mover…
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => onAction("delete")}>
        <Trash2 className="size-3.5" strokeWidth={1.9} />
        Eliminar
      </ContextMenuItem>
    </>
  );
}

/* ── Paginación ────────────────────────────────────────────────────────── */

function pageList(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push("…");
    out.push(p);
  }
  return out;
}

export function PaginationFooter({
  page,
  totalPages,
  desde,
  hasta,
  total,
  onPage,
  prefix,
  noun = "documentos",
}: {
  page: number;
  totalPages: number;
  desde: number;
  hasta: number;
  total: number;
  onPage: (p: number) => void;
  /** Texto antes del rango, p. ej. "2 carpetas · ". */
  prefix?: string;
  noun?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-4 py-3">
      <p className="text-[12.5px] text-ink-600">
        {prefix}Mostrando{" "}
        <span className="font-semibold text-ink-900">
          {desde}–{hasta}
        </span>{" "}
        de <span className="font-semibold text-ink-900">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="px-2.5 text-[12.5px] font-semibold after:-inset-2"
        >
          Anterior
        </Button>
        {pageList(page, totalPages).map((p, i) =>
          typeof p === "number" ? (
            <Button
              key={`${p}-${i}`}
              variant={p === page ? "default" : "ghost"}
              size="sm"
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPage(p)}
              className={cn(
                "min-w-8 px-2 text-[12.5px] font-bold after:-inset-2",
                p === page &&
                  "bg-ink-950 text-white hover:bg-ink-800 dark:bg-ink-100 dark:text-white dark:hover:bg-ink-200",
              )}
            >
              {p}
            </Button>
          ) : (
            <span key={`e-${i}`} className="px-1 text-[12px] text-ink-500">
              …
            </span>
          ),
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="px-2.5 text-[12.5px] font-semibold after:-inset-2"
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/* ── Estado vacío ──────────────────────────────────────────────────────── */

export function EmptyDocuments({ onOpenUpload }: { onOpenUpload: () => void }) {
  return (
    <div className="grid min-h-[260px] place-items-center px-6 py-12 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
          <FolderOpen className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
          Sin documentos
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
          Sube el primer archivo de esta carpeta con el botón{" "}
          <span className="font-semibold text-ink-900">{'"Subir documento"'}</span> o
          ajusta los filtros para ver más resultados.
        </p>
        <Button onClick={onOpenUpload} className="mt-5 px-4 font-bold">
          <FileUp className="size-4" strokeWidth={1.9} />
          Subir documento
        </Button>
      </div>
    </div>
  );
}
