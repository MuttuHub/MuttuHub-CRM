// Vista lista del explorador (S2): las subcarpetas de la carpeta abierta van
// primero; luego los documentos con selección, tipo de archivo, categoría
// (candado si es restringida), versión, tamaño, modificación y acciones.
// La región entera es destino de archivos del sistema (S5).

"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Folder, GripVertical, Lock, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/hooks/kanban";
import {
  formatVersionFecha,
  type DocumentItem,
  type DocumentOrder,
  type FolderNode,
} from "@/hooks/documents";
import { etiquetasVisibles } from "@/lib/documents/etiquetas";
import {
  FOLDER_DRAG_TYPE,
  useFolderDropTarget,
  type FolderAction,
} from "@/components/documents/folder-tree";
import type { FolderHandlers } from "@/components/documents/document-grid";
import {
  DOC_DRAG_PREFIX,
  EmptyDocuments,
  FileTypeBadge,
  FolderContextItems,
  FolderDropdownItems,
  droppedFiles,
} from "@/components/documents/document-shared";
import {
  DocumentRowMenu,
  type DocumentAction,
} from "@/components/documents/document-row-menu";
import { SnippetText } from "@/components/documents/snippet-text";

/** Fecha y autor de la última modificación: la versión activa manda. */
function modificado(doc: DocumentItem): { fecha: string; autor: string } {
  const activa = doc.version_activa;
  return {
    fecha: formatVersionFecha(activa?.created_at ?? doc.updated_at ?? doc.created_at),
    autor: activa?.subido_por_nombre ?? doc.autor_nombre,
  };
}

function sortMark(orden: DocumentOrder, column: "nombre" | "modificado"): string {
  if (column === "modificado") return orden === "reciente" ? " ↓" : orden === "antiguo" ? " ↑" : "";
  return orden === "nombre_asc" ? " ↑" : orden === "nombre_desc" ? " ↓" : "";
}

export function DocumentsTable({
  isLoading,
  items,
  folders,
  folderHandlers,
  selectedIds,
  allPageSelected,
  onTogglePage,
  onToggleOne,
  restricted,
  canWrite,
  onDocAction,
  onOpenUpload,
  onDropFiles,
  dropFolderName,
  orden,
  footer,
}: {
  isLoading: boolean;
  items: DocumentItem[];
  folders: FolderNode[];
  folderHandlers: FolderHandlers;
  selectedIds: Set<string>;
  allPageSelected: boolean;
  onTogglePage: () => void;
  onToggleOne: (doc: DocumentItem) => void;
  /** Categorías restringidas del catálogo (candado en la píldora). */
  restricted: Set<string>;
  canWrite: (doc: DocumentItem) => boolean;
  onDocAction: (doc: DocumentItem, action: DocumentAction) => void;
  onOpenUpload: () => void;
  /** Archivos soltados sobre el listado (S5): se suben a la carpeta abierta. */
  onDropFiles: (files: File[]) => void;
  dropFolderName: string | null;
  orden: DocumentOrder;
  footer: React.ReactNode;
}) {
  const [filesOver, setFilesOver] = useState(false);
  const isEmpty = !isLoading && items.length === 0 && folders.length === 0;

  return (
    <section
      aria-label="Listado de documentos"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
        e.preventDefault();
        setFilesOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFilesOver(false);
      }}
      onDrop={(e) => {
        setFilesOver(false);
        // Una carpeta de la tabla ya manejó el drop (sube a esa carpeta).
        if (e.defaultPrevented) return;
        const files = droppedFiles(e);
        if (files.length === 0) return;
        e.preventDefault();
        onDropFiles(files);
      }}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col",
        filesOver && "ring-2 ring-exito/50 ring-inset",
      )}
    >
      {filesOver && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-exito-bg/85 text-center">
          <p className="px-6 text-[14px] font-semibold text-ink-900">
            {dropFolderName
              ? `Suelta los archivos para subirlos a «${dropFolderName}»`
              : "Suelta los archivos para subirlos al repositorio"}
          </p>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-12" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyDocuments onOpenUpload={onOpenUpload} />
      ) : (
        <>
          {/* min-w para que scrollee en vez de aplastarse (Table ya envuelve en overflow-x-auto) */}
          <Table aria-label="Documentos de la carpeta" className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-ink-100/40 hover:bg-ink-100/40">
                <TableHead className="w-12 pl-4">
                  <Checkbox
                    checked={allPageSelected}
                    disabled={items.length === 0}
                    onCheckedChange={onTogglePage}
                    aria-label="Seleccionar todos los de la página"
                  />
                </TableHead>
                <TableHead>Nombre{sortMark(orden, "nombre")}</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Versión</TableHead>
                <TableHead className="text-right">Tamaño</TableHead>
                <TableHead>Modificado{sortMark(orden, "modificado")}</TableHead>
                <TableHead className="w-14 pr-4">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map((node) => (
                <FolderRow key={node.id} node={node} handlers={folderHandlers} />
              ))}
              {items.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  selected={selectedIds.has(doc.id)}
                  restricted={restricted.has(doc.categoria)}
                  canWrite={canWrite(doc)}
                  onToggle={() => onToggleOne(doc)}
                  onAction={(action) => onDocAction(doc, action)}
                />
              ))}
            </TableBody>
          </Table>
          {items.length === 0 && (
            <p className="border-t border-ink-200 px-5 py-6 text-center text-[13px] text-ink-600">
              Esta carpeta no tiene documentos sueltos; abre una subcarpeta o sube uno nuevo.
            </p>
          )}
          {footer}
        </>
      )}
    </section>
  );
}

function FolderRow({ node, handlers: h }: { node: FolderNode; handlers: FolderHandlers }) {
  const { setNodeRef, isOver, handlers } = useFolderDropTarget(
    node.id,
    h.onFolderDropFiles,
    h.onFolderMove,
    h.canMoveFolder,
    "contenido",
  );
  const onAction = (action: FolderAction) => h.onFolderAction(node.id, action);
  const count = node.documentos_count;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={setNodeRef}
        {...handlers}
        render={<TableRow />}
        className={cn(
          "group/fila hover:bg-muted",
          isOver && "bg-exito-bg ring-2 ring-exito/40 ring-inset",
        )}
      >
        <TableCell className="pl-4" />
        <TableCell>
          <button
            type="button"
            onClick={() => h.onOpenFolder(node.id)}
            draggable
            onDragStart={(event) => {
              if (!event.dataTransfer) return;
              event.dataTransfer.setData(FOLDER_DRAG_TYPE, node.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            className="inline-flex max-w-[340px] cursor-pointer items-center gap-2.5 rounded-10 text-left text-[13.5px] font-semibold text-ink-950 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:text-rose-400"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-10 bg-amber-100 dark:bg-amber-500/15"
            >
              <Folder className="size-4 fill-amber-400 text-amber-600" strokeWidth={1.6} />
            </span>
            <span className="truncate">{node.nombre}</span>
          </button>
        </TableCell>
        <TableCell className="text-[12.5px] text-ink-600">
          Carpeta · {count} doc{count === 1 ? "" : "s"}
        </TableCell>
        <TableCell className="text-ink-500">—</TableCell>
        <TableCell className="text-right text-ink-500">—</TableCell>
        <TableCell className="text-[12.5px] whitespace-nowrap text-ink-700">
          {formatVersionFecha(node.created_at)}
        </TableCell>
        <TableCell className="pr-4 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Acciones de ${node.nombre}`}
                  className="text-ink-500 hover:text-ink-900"
                >
                  <MoreHorizontal className="size-4" strokeWidth={2} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <FolderDropdownItems onAction={onAction} />
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-52 truncate">{node.nombre}</ContextMenuLabel>
        <ContextMenuSeparator />
        <FolderContextItems onAction={onAction} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DocumentRow({
  doc,
  selected,
  restricted,
  canWrite,
  onToggle,
  onAction,
}: {
  doc: DocumentItem;
  selected: boolean;
  restricted: boolean;
  canWrite: boolean;
  onToggle: () => void;
  onAction: (action: DocumentAction) => void;
}) {
  const activa = doc.version_activa;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${DOC_DRAG_PREFIX}${doc.id}`,
  });
  const tags = etiquetasVisibles(doc.etiquetas, doc.categoria);
  const subline = [
    ...(doc.clientes[0]
      ? [doc.clientes[0].nombre + (doc.clientes.length > 1 ? ` +${doc.clientes.length - 1}` : "")]
      : []),
    ...tags,
  ];
  const mod = modificado(doc);

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      onClick={() => onAction("open")}
      className={cn("group/fila cursor-pointer hover:bg-muted", selected && "bg-rose-50/60")}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAction("open");
        }
      }}
    >
      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            aria-label={`Mover ${doc.titulo} a una carpeta`}
            title="Arrastra a una carpeta para moverlo"
            className={cn(
              "-ml-3 grid h-7 w-4 shrink-0 cursor-grab touch-none place-items-center rounded text-ink-400 hover:text-ink-700 active:cursor-grabbing",
              isDragging && "opacity-40",
            )}
          >
            <GripVertical className="size-3.5" strokeWidth={1.8} />
          </button>
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Seleccionar ${doc.titulo}`}
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <FileTypeBadge doc={doc} />
          <div className="min-w-0 max-w-[300px] xl:max-w-[380px]">
            <div className="truncate text-[13.5px] font-semibold text-ink-950" title={doc.titulo}>
              {doc.titulo}
            </div>
            {subline.length > 0 && (
              <div className="truncate text-[12px] text-ink-600" title={subline.join(" · ")}>
                {subline.join(" · ")}
              </div>
            )}
            {doc.match === "contenido" && (
              <div className="mt-1 space-y-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-exito/10 px-2 py-0.5 text-[10.5px] font-bold text-exito">
                  Coincide en el contenido
                </span>
                {doc.snippet && (
                  <p className="line-clamp-2 text-[12px] leading-relaxed whitespace-normal text-ink-600">
                    <SnippetText snippet={doc.snippet} />
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap",
            restricted
              ? "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300"
              : "bg-ink-100 text-ink-700",
          )}
        >
          {restricted && (
            <span role="img" aria-label="Categoría restringida" title="Categoría restringida">
              <Lock aria-hidden="true" className="size-3" strokeWidth={2.2} />
            </span>
          )}
          {doc.categoria}
        </span>
      </TableCell>
      <TableCell className="font-mono text-[12.5px] text-ink-800">
        {activa ? `v${activa.numero_version}` : "—"}
      </TableCell>
      <TableCell className="text-right text-[12.5px] whitespace-nowrap text-ink-700">
        {formatBytes(activa?.tamano_bytes)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-[12.5px] whitespace-nowrap text-ink-900">{mod.fecha}</span>
          <span className="max-w-[160px] truncate text-[11.5px] text-ink-600">{mod.autor}</span>
        </div>
      </TableCell>
      <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
        <DocumentRowMenu doc={doc} canWrite={canWrite} onAction={onAction} />
      </TableCell>
    </TableRow>
  );
}
