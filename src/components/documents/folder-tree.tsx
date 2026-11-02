// Rail de carpetas del Repositorio (plan Fase 2, 4A). Árbol por lista de
// adyacencia armado en el cliente (decenas de nodos, sin virtualización).
// `<ul role="tree">` con el patrón de disclosure que ya usa document-dialog:
// un botón por nodo con ChevronDown. "Todas" es el nodo raíz implícito (sin
// carpeta) — no hay fila "root" en la base.
// Cada nodo (y "Todas") es destino de arrastre (S5): recibe archivos del
// sistema operativo (drop nativo -> onDropFiles) y documentos del listado
// (droppable de @dnd-kit con id `carpeta:<id>`, `carpeta:raiz` para "Todas").

"use client";

import { useMemo, useState, type DragEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  ChevronDown,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderNode } from "@/hooks/documents";

export type FolderAction = "rename" | "move" | "delete";

/** id del destino de @dnd-kit para una carpeta (null = "Todas", la raíz). */
export const FOLDER_DROP_PREFIX = "carpeta:";
export const ROOT_DROP_ID = `${FOLDER_DROP_PREFIX}raiz`;
/** MIME propio para arrastrar carpetas dentro del árbol (mover jerarquía). */
export const FOLDER_DRAG_TYPE = "application/x-muttuhub-folder";
export function folderDropId(id: string | null): string {
  return id === null ? ROOT_DROP_ID : `${FOLDER_DROP_PREFIX}${id}`;
}

type DropFiles = (folderId: string | null, files: File[]) => void;
type MoveFolder = (folderId: string, targetId: string | null) => void;

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function hasFolderDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(FOLDER_DRAG_TYPE);
}

/**
 * Destino de una carpeta: archivos soltados desde el sistema (drop nativo),
 * documentos arrastrados desde el listado (droppable de @dnd-kit) y carpetas
 * arrastradas dentro del árbol (mover jerarquía, con guarda de ciclos).
 */
export function useFolderDropTarget(
  folderId: string | null,
  onDropFiles?: DropFiles,
  onMoveFolder?: MoveFolder,
  canMoveFolder?: (sourceId: string, targetId: string | null) => boolean,
) {
  const { setNodeRef, isOver } = useDroppable({ id: folderDropId(folderId) });
  const [dragHighlight, setDragHighlight] = useState(false);
  const handlers =
    onDropFiles || onMoveFolder
      ? {
          onDragOver: (event: DragEvent) => {
            const folderDrag = hasFolderDrag(event);
            if (!folderDrag && !(onDropFiles && hasFiles(event))) return;
            if (folderDrag && !onMoveFolder) return;
            event.preventDefault();
            setDragHighlight(true);
          },
          onDragLeave: () => setDragHighlight(false),
          onDrop: (event: DragEvent) => {
            setDragHighlight(false);
            const sourceId = event.dataTransfer?.getData?.(FOLDER_DRAG_TYPE);
            if (sourceId && onMoveFolder) {
              event.preventDefault();
              if (!canMoveFolder || canMoveFolder(sourceId, folderId)) {
                onMoveFolder(sourceId, folderId);
              }
              return;
            }
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0) return;
            event.preventDefault();
            onDropFiles?.(folderId, files);
          },
        }
      : {};
  return { setNodeRef, isOver: isOver || dragHighlight, handlers };
}

function FolderBranch({
  node,
  depth,
  activeId,
  onSelect,
  onAction,
  onDropFiles,
  onMoveFolder,
  canMoveFolder,
  defaultOpen,
}: {
  node: FolderNode;
  depth: number;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onAction: (id: string, action: FolderAction) => void;
  onDropFiles?: DropFiles;
  onMoveFolder?: MoveFolder;
  canMoveFolder?: (sourceId: string, targetId: string | null) => boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.hijos.length > 0;
  const isActive = activeId === node.id;
  const { setNodeRef, isOver, handlers } = useFolderDropTarget(
    node.id,
    onDropFiles,
    onMoveFolder,
    canMoveFolder,
  );

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger className="contents">
          <div
            ref={setNodeRef}
            {...handlers}
            draggable
            onDragStart={(event) => {
              if (!event.dataTransfer) return;
              event.dataTransfer.setData(FOLDER_DRAG_TYPE, node.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            className={cn(
              "group flex items-center gap-1 rounded-10 py-1 pr-1",
              isActive ? "bg-ink-100" : "hover:bg-ink-100/60",
              isOver && "bg-exito-bg ring-2 ring-exito/40",
            )}
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
          >
            {hasChildren ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                /* v6-compact: tree-row chevron, a 24 px affordance inside a dense row (hit area extends via after:) */
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="h-6 w-6 shrink-0 rounded-md p-0 text-ink-500 hover:bg-transparent hover:text-ink-800"
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
                  strokeWidth={2}
                />
                <span className="sr-only">{open ? "Contraer" : "Expandir"}</span>
              </Button>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
            >
              <FolderOpen
                className={cn("size-3.5 shrink-0", isActive ? "text-exito" : "text-ink-400")}
                strokeWidth={1.8}
              />
              <span className="truncate text-[13px] font-medium text-ink-800">{node.nombre}</span>
              {node.cliente_id && (
                <UserRound
                  className="size-3 shrink-0 text-ink-400"
                  strokeWidth={2}
                  aria-label="carpeta de cliente"
                />
              )}
              {node.documentos_count > 0 && (
                <span className="ml-auto shrink-0 text-[11px] text-ink-500">
                  {node.documentos_count}
                </span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    /* v6-compact: tree-row actions trigger, same dense row */
                    aria-label={`Acciones de ${node.nombre}`}
                    className="h-6 w-6 shrink-0 rounded-md p-0 text-ink-400 opacity-0 hover:bg-transparent hover:text-ink-800 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" strokeWidth={2} />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="min-w-[150px]">
                <DropdownMenuItem onClick={() => onAction(node.id, "rename")}>
                  <Pencil className="size-3.5" strokeWidth={1.9} />
                  Renombrar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction(node.id, "move")}>
                  <Folder className="size-3.5" strokeWidth={1.9} />
                  Mover…
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onAction(node.id, "delete")}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.9} />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel className="max-w-52 truncate">{node.nombre}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onAction(node.id, "rename")}>
            <Pencil className="size-3.5" strokeWidth={1.9} />
            Renombrar
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onAction(node.id, "move")}>
            <Folder className="size-3.5" strokeWidth={1.9} />
            Mover…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => onAction(node.id, "delete")}
          >
            <Trash2 className="size-3.5" strokeWidth={1.9} />
            Eliminar
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {open && hasChildren && (
        <ul role="group">
          {node.hijos.map((child) => (
            <FolderBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              onAction={onAction}
              onDropFiles={onDropFiles}
              onMoveFolder={onMoveFolder}
              canMoveFolder={canMoveFolder}
              defaultOpen={false}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree({
  folders,
  activeId,
  onSelect,
  onAction,
  onDropFiles,
  onMoveFolder,
}: {
  folders: FolderNode[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onAction: (id: string, action: FolderAction) => void;
  /** Archivos soltados sobre una carpeta (null = "Todas"). */
  onDropFiles?: DropFiles;
  /** Carpeta arrastrada dentro del árbol: moverla bajo `targetId` (null = raíz). */
  onMoveFolder?: MoveFolder;
}) {
  const isRoot = activeId === null;

  // Guarda de movimientos: no mover una carpeta dentro de sí misma o de su
  // propio subárbol, ni repetir el padre que ya tiene. Cada nodo guarda su
  // camino desde la raíz: si el destino ya contiene al origen, el drop es
  // inválido (sería un ciclo).
  const canMoveFolder = useMemo(() => {
    const pathSets = new Map<string, Set<string>>();
    const parentOf = new Map<string, string | null>();
    const walk = (list: FolderNode[], ancestors: string[], parentId: string | null) => {
      for (const n of list) {
        parentOf.set(n.id, parentId);
        pathSets.set(n.id, new Set([...ancestors, n.id]));
        walk(n.hijos, [...ancestors, n.id], n.id);
      }
    };
    walk(folders, [], null);
    return (sourceId: string, targetId: string | null) => {
      if (sourceId === targetId) return false;
      if (targetId !== null && pathSets.get(targetId)?.has(sourceId)) return false;
      return parentOf.get(sourceId) !== targetId;
    };
  }, [folders]);

  const {
    setNodeRef: setRootRef,
    isOver: rootOver,
    handlers: rootHandlers,
  } = useFolderDropTarget(null, onDropFiles, onMoveFolder, canMoveFolder);

  return (
    <nav aria-label="Carpetas" className="flex flex-col">
      <button
        type="button"
        ref={setRootRef}
        {...rootHandlers}
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-1.5 rounded-10 px-2 py-1.5 text-left",
          isRoot ? "bg-ink-100" : "hover:bg-ink-100/60",
          rootOver && "bg-exito-bg ring-2 ring-exito/40",
        )}
      >
        <Folder className={cn("size-3.5 shrink-0", isRoot ? "text-exito" : "text-ink-400")} strokeWidth={1.8} />
        <span className="text-[13px] font-medium text-ink-800">Todas</span>
      </button>
      <ul role="tree" aria-label="Carpetas del repositorio" className="mt-1 flex flex-col gap-0.5">
        {folders.map((node) => (
          <FolderBranch
            key={node.id}
            node={node}
            depth={0}
            activeId={activeId}
            onSelect={onSelect}
            onAction={onAction}
            onDropFiles={onDropFiles}
            onMoveFolder={onMoveFolder}
            canMoveFolder={canMoveFolder}
            defaultOpen={false}
          />
        ))}
      </ul>
    </nav>
  );
}