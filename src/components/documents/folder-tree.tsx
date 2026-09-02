// Rail de carpetas del Repositorio (plan Fase 2, 4A). Árbol por lista de
// adyacencia armado en el cliente (decenas de nodos, sin virtualización).
// `<ul role="tree">` con el patrón de disclosure que ya usa document-dialog:
// un botón por nodo con ChevronDown. "Todas" es el nodo raíz implícito (sin
// carpeta) — no hay fila "root" en la base.

"use client";

import { useState } from "react";
import { ChevronDown, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FolderNode } from "@/hooks/documents";

function FolderBranch({
  node,
  depth,
  activeId,
  onSelect,
  defaultOpen,
}: {
  node: FolderNode;
  depth: number;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = node.hijos.length > 0;
  const isActive = activeId === node.id;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-10 py-1 pr-2",
          isActive ? "bg-ink-100" : "hover:bg-ink-100/60",
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
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
          {node.documentos_count > 0 && (
            <span className="ml-auto shrink-0 text-[11px] text-ink-500">
              {node.documentos_count}
            </span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <ul role="group">
          {node.hijos.map((child) => (
            <FolderBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
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
}: {
  folders: FolderNode[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const isRoot = activeId === null;

  return (
    <nav aria-label="Carpetas" className="flex flex-col">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-1.5 rounded-10 px-2 py-1.5 text-left",
          isRoot ? "bg-ink-100" : "hover:bg-ink-100/60",
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
            defaultOpen={false}
          />
        ))}
      </ul>
    </nav>
  );
}