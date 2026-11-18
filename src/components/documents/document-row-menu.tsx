// Menú de acciones de una fila de documento (S4). Las acciones de escritura
// se deshabilitan con su motivo cuando la API las rechazaría (S10).

"use client";

import {
  Download,
  Eye,
  FolderInput,
  Link2,
  MoreHorizontal,
  Pencil,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentItem } from "@/hooks/documents";
import { WRITE_DENIED_REASON } from "@/components/documents/document-permissions";

export type DocumentAction =
  | "open"
  | "download"
  | "version"
  | "rename"
  | "edit"
  | "clients"
  | "move"
  | "trash";

export function DocumentRowMenu({
  doc,
  canWrite,
  onAction,
}: {
  doc: DocumentItem;
  canWrite: boolean;
  onAction: (action: DocumentAction) => void;
}) {
  const activa = doc.version_activa;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Acciones de ${doc.titulo}`}
            onClick={(e) => e.stopPropagation()}
            className="text-ink-500 hover:text-ink-900"
          >
            <MoreHorizontal className="size-4" strokeWidth={2} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[232px]">
        <DropdownMenuItem onClick={() => onAction("open")}>
          <Eye className="size-3.5" strokeWidth={1.9} />
          Abrir detalle
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!activa} onClick={() => onAction("download")}>
          <Download className="size-3.5" strokeWidth={1.9} />
          {activa ? `Descargar v${activa.numero_version}` : "Descargar"}
        </DropdownMenuItem>
        {/* POST /versions only needs read access (loadDocumentForRead): any viewer may version it. */}
        <DropdownMenuItem onClick={() => onAction("version")}>
          <Upload className="size-3.5" strokeWidth={1.9} />
          Subir nueva versión
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canWrite} onClick={() => onAction("rename")}>
          <Pencil className="size-3.5" strokeWidth={1.9} />
          Renombrar
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canWrite} onClick={() => onAction("edit")}>
          <Tags className="size-3.5" strokeWidth={1.9} />
          Editar categoría y etiquetas
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canWrite} onClick={() => onAction("clients")}>
          <Link2 className="size-3.5" strokeWidth={1.9} />
          Vincular clientes
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canWrite} onClick={() => onAction("move")}>
          <FolderInput className="size-3.5" strokeWidth={1.9} />
          Mover a…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canWrite}
          onClick={() => onAction("trash")}
        >
          <Trash2 className="size-3.5" strokeWidth={1.9} />
          Eliminar
        </DropdownMenuItem>
        {!canWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="max-w-[232px] text-[11.5px] leading-snug whitespace-normal">
              {WRITE_DENIED_REASON}
            </DropdownMenuLabel>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
