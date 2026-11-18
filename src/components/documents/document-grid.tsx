// Vista cuadrícula del explorador: carpetas y documentos como iconos por tipo.
// Las carpetas aceptan clic derecho, arrastrar/soltar (archivos, documentos y
// otras carpetas) y el menú de acciones; los documentos se arrastran a una
// carpeta con @dnd-kit.

"use client";

import { useDraggable } from "@dnd-kit/core";
import { Folder, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { DocumentItem, FolderNode } from "@/hooks/documents";
import {
  FOLDER_DRAG_TYPE,
  useFolderDropTarget,
  type FolderAction,
} from "@/components/documents/folder-tree";
import {
  DOC_DRAG_PREFIX,
  EmptyDocuments,
  FolderContextItems,
  FolderDropdownItems,
  documentFileMeta,
} from "@/components/documents/document-shared";

export type FolderHandlers = {
  onOpenFolder: (id: string) => void;
  onFolderAction: (id: string, action: FolderAction) => void;
  onFolderDropFiles: (folderId: string | null, files: File[]) => void;
  onFolderMove: (folderId: string, targetId: string | null) => void;
  canMoveFolder: (sourceId: string, targetId: string | null) => boolean;
};

function FolderTile({
  node,
  handlers: h,
}: {
  node: FolderNode;
  handlers: FolderHandlers;
}) {
  const { setNodeRef, isOver, handlers } = useFolderDropTarget(
    node.id,
    h.onFolderDropFiles,
    h.onFolderMove,
    h.canMoveFolder,
    "contenido",
  );
  const onAction = (action: FolderAction) => h.onFolderAction(node.id, action);

  return (
    <ContextMenu>
      <div className="group relative">
        <ContextMenuTrigger className="contents">
          <div
            ref={setNodeRef}
            {...handlers}
            className={cn("rounded-12", isOver && "bg-exito-bg ring-2 ring-exito/50")}
          >
            <button
              type="button"
              onClick={() => h.onOpenFolder(node.id)}
              draggable
              onDragStart={(event) => {
                if (!event.dataTransfer) return;
                event.dataTransfer.setData(FOLDER_DRAG_TYPE, node.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              className="flex w-full cursor-grab flex-col items-center gap-1 rounded-12 px-2 py-3 text-center transition-colors hover:bg-ink-100/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
            >
              <Folder
                className="size-10 text-amber-400 transition-colors group-hover:text-amber-500"
                strokeWidth={1.3}
              />
              <span className="line-clamp-2 w-full text-[12px] font-semibold text-ink-800">
                {node.nombre}
              </span>
              <span className="text-[10.5px] tracking-wide text-ink-500">
                {node.documentos_count} doc{node.documentos_count === 1 ? "" : "s"}
              </span>
            </button>
          </div>
        </ContextMenuTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Acciones de ${node.nombre}`}
                className="absolute top-0 right-0 text-ink-400 opacity-0 group-hover:opacity-100 hover:bg-transparent hover:text-ink-800 focus-visible:opacity-100"
              >
                <MoreHorizontal className="size-3.5" strokeWidth={2} />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-[150px]">
            <FolderDropdownItems onAction={onAction} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-52 truncate">{node.nombre}</ContextMenuLabel>
        <ContextMenuSeparator />
        <FolderContextItems onAction={onAction} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function GridDocTile({ doc, onOpen }: { doc: DocumentItem; onOpen: () => void }) {
  const meta = documentFileMeta(doc);
  const Icon = meta.Icon;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${DOC_DRAG_PREFIX}${doc.id}`,
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      title={doc.titulo}
      className={cn(
        "flex w-full cursor-grab flex-col items-center gap-1 rounded-12 px-2 py-3 text-center transition-colors hover:bg-ink-100/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Icon className={cn("size-10", meta.className)} strokeWidth={1.3} />
      <span className="line-clamp-2 w-full text-[12px] font-semibold text-ink-800">
        {doc.titulo}
      </span>
      <span className="text-[10.5px] tracking-wide text-ink-500">{meta.label}</span>
    </button>
  );
}

export function DocumentsGrid({
  isLoading,
  items,
  folders,
  folderHandlers,
  onOpenFicha,
  onOpenUpload,
  footer,
}: {
  isLoading: boolean;
  items: DocumentItem[];
  folders: FolderNode[];
  folderHandlers: FolderHandlers;
  onOpenFicha: (id: string) => void;
  onOpenUpload: () => void;
  footer: React.ReactNode;
}) {
  return (
    <section aria-label="Documentos" className="flex min-w-0 flex-1 flex-col">
      {folders.length > 0 && (
        <ul
          aria-label="Subcarpetas"
          className="grid grid-cols-2 gap-2 border-b border-ink-200 px-4 py-4 sm:grid-cols-4 xl:grid-cols-6"
        >
          {folders.map((n) => (
            <li key={n.id}>
              <FolderTile node={n} handlers={folderHandlers} />
            </li>
          ))}
        </ul>
      )}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-inner" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyDocuments onOpenUpload={onOpenUpload} />
      ) : (
        <>
          <ul
            aria-label="Documentos"
            className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 xl:grid-cols-6"
          >
            {items.map((doc) => (
              <li key={doc.id}>
                <GridDocTile doc={doc} onOpen={() => onOpenFicha(doc.id)} />
              </li>
            ))}
          </ul>
          {footer}
        </>
      )}
    </section>
  );
}
