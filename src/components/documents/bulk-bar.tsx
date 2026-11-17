// Barra de acciones en lote (S5): aparece al seleccionar documentos en la
// tabla. Las acciones de escritura se deshabilitan con su motivo cuando
// ningún documento seleccionado es modificable por el usuario (S10).

"use client";

import { Download, FolderInput, LoaderCircle, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WRITE_DENIED_REASON } from "@/components/documents/document-permissions";

const ACTION_CLASS = "h-8 px-2.5 text-[12.5px] font-semibold text-ink-800";

export function BulkBar({
  count,
  writableCount,
  zipPending,
  busy,
  onMove,
  onCategory,
  onZip,
  onTrash,
  onCancel,
}: {
  count: number;
  /** Cuántos de los seleccionados puede modificar el usuario. */
  writableCount: number;
  zipPending: boolean;
  busy: boolean;
  onMove: () => void;
  onCategory: () => void;
  onZip: () => void;
  onTrash: () => void;
  onCancel: () => void;
}) {
  const writeDisabled = writableCount === 0 || busy;

  return (
    <div
      role="region"
      aria-label="Acciones en lote"
      className="flex flex-wrap items-center justify-between gap-2.5 border-b border-ink-200 bg-rose-50/70 px-4 py-2.5 dark:bg-rose-500/10"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1.5 text-[13px] font-semibold text-rose-700 dark:text-rose-400">
          {count} {count === 1 ? "seleccionado" : "seleccionados"}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={writeDisabled}
          onClick={onMove}
          className={ACTION_CLASS}
        >
          <FolderInput className="size-3.5" strokeWidth={1.9} />
          Mover a…
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={writeDisabled}
          onClick={onCategory}
          className={ACTION_CLASS}
        >
          <Tags className="size-3.5" strokeWidth={1.9} />
          Cambiar categoría
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={zipPending}
          onClick={onZip}
          className={ACTION_CLASS}
        >
          {zipPending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" strokeWidth={1.9} />
          )}
          Descargar .zip
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={writeDisabled}
          onClick={onTrash}
          className="h-8 border-destructivo/30 px-2.5 text-[12.5px] font-semibold text-destructivo hover:bg-destructivo-bg"
        >
          <Trash2 className="size-3.5" strokeWidth={1.9} />
          Eliminar
        </Button>
        {busy && <LoaderCircle aria-label="Procesando" className="size-4 animate-spin text-ink-500" />}
      </div>
      <div className="flex items-center gap-3">
        {writableCount < count && (
          <span className="max-w-[44ch] text-[12px] leading-snug text-ink-600">
            {writableCount === 0
              ? WRITE_DENIED_REASON
              : `${count - writableCount} sin permiso de edición; se omitirán al mover, recategorizar o eliminar.`}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-8 px-2 text-[12.5px] font-semibold text-rose-700 dark:text-rose-400"
        >
          Cancelar selección
        </Button>
      </div>
    </div>
  );
}
