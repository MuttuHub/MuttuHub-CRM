// Diálogos de carpetas en el Repositorio (plan Fase 2, 4A): crear, renombrar,
// mover y eliminar. El rail permite crear en la raíz o dentro de la carpeta
// seleccionada. Renombrar/mover/eliminar salen del menú de acciones del nodo.

"use client";

import { useState } from "react";
import { FolderPlus, Folder, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useCreateFolder,
  useDeleteFolder,
  useUpdateFolder,
  type FolderNode,
} from "@/hooks/documents";

/** Todas las carpetas en una lista plana con su path como label. */
function flattenFolderOptions(nodes: FolderNode[], prefix = ""): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${prefix}${n.nombre}` });
    out.push(...flattenFolderOptions(n.hijos, `${prefix}${n.nombre} / `));
  }
  return out;
}

/** ids de la carpeta y de todos sus descendientes (para excluirlos al mover). */
function descendantsOf(nodes: FolderNode[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (list: FolderNode[], parentActive: boolean) => {
    for (const n of list) {
      const active = parentActive || n.id === id;
      if (active) out.add(n.id);
      walk(n.hijos, active);
    }
  };
  walk(nodes, false);
  return out;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  defaultParentId,
  folders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultParentId: string | null;
  folders: FolderNode[];
}) {
  const [nombre, setNombre] = useState("");
  const [parentId, setParentId] = useState<string>("");

  const createFolder = useCreateFolder();
  const flat = flattenFolderOptions(folders);

  async function submit() {
    if (!nombre.trim()) return;
    await createFolder.mutateAsync({
      nombre: nombre.trim(),
      parent_id: parentId === "" ? defaultParentId : parentId,
    });
    setNombre("");
    setParentId("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(400px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="size-5 text-exito" strokeWidth={1.9} />
            Nueva carpeta
          </DialogTitle>
          <DialogDescription>
            Crea una carpeta para organizar documentos. Las carpetas no cambian
            quién puede ver un documento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-nombre">Nombre</Label>
            <Input
              id="folder-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Contratos 2026"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              className="h-10 rounded-lg border-ink-200 bg-panel text-[13px]"
            />
          </div>

          {flat.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="folder-parent">Dentro de</Label>
              <Select
                value={parentId}
                onValueChange={(v) => setParentId(v ?? "")}
              >
                <SelectTrigger
                  id="folder-parent"
                  className={cn(
                    "h-10 w-full rounded-lg border-ink-200 bg-panel px-3 text-[13px]",
                  )}
                >
                  <SelectValue placeholder={defaultParentId ? "Carpeta seleccionada" : "Raíz del repositorio"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    {defaultParentId ? "Carpeta seleccionada" : "Raíz del repositorio"}
                  </SelectItem>
                  {flat
                    .filter((f) => f.id !== defaultParentId)
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border-ink-200 bg-panel px-4 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!nombre.trim() || createFolder.isPending}
            onClick={() => void submit()}
            className="h-9 rounded-lg px-4 font-bold"
          >
            {createFolder.isPending ? "Creando…" : "Crear carpeta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RenameFolderDialog({
  open,
  onOpenChange,
  folder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderNode;
}) {
  const [nombre, setNombre] = useState(folder.nombre);
  const renameFolder = useUpdateFolder();

  async function submit() {
    if (!nombre.trim()) return;
    await renameFolder.mutateAsync({ id: folder.id, nombre: nombre.trim() });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(400px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-exito" strokeWidth={1.9} />
            Renombrar carpeta
          </DialogTitle>
          <DialogDescription>Cambia el nombre de la carpeta.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="folder-rename">Nombre</Label>
          <Input
            id="folder-rename"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            className="h-10 rounded-lg border-ink-200 bg-panel text-[13px]"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border-ink-200 bg-panel px-4 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!nombre.trim() || renameFolder.isPending}
            onClick={() => void submit()}
            className="h-9 rounded-lg px-4 font-bold"
          >
            {renameFolder.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoveFolderDialog({
  open,
  onOpenChange,
  folder,
  folders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderNode;
  folders: FolderNode[];
}) {
  const [parentId, setParentId] = useState<string>("");
  const moveFolder = useUpdateFolder();

  // Excluir la carpeta misma y sus descendientes: moverla dentro de su propio
  // árbol es el ciclo que el servidor rechaza (validateFolderParent).
  const excluded = descendantsOf(folders, folder.id);
  const options = flattenFolderOptions(folders).filter((f) => !excluded.has(f.id));

  async function submit() {
    await moveFolder.mutateAsync({
      id: folder.id,
      parent_id: parentId === "" ? null : parentId,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(400px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="size-5 text-exito" strokeWidth={1.9} />
            Mover &quot;{folder.nombre}&quot;
          </DialogTitle>
          <DialogDescription>
            Elige la carpeta destino. &quot;Raíz del repositorio&quot; la mueve
            al nivel superior.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="folder-move">Destino</Label>
          <Select value={parentId} onValueChange={(v) => setParentId(v ?? "")}>
            <SelectTrigger
              id="folder-move"
              className="h-10 w-full rounded-lg border-ink-200 bg-panel px-3 text-[13px]"
            >
              <SelectValue placeholder="Elige destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Raíz del repositorio</SelectItem>
              {options.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border-ink-200 bg-panel px-4 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={moveFolder.isPending}
            onClick={() => void submit()}
            className="h-9 rounded-lg px-4 font-bold"
          >
            {moveFolder.isPending ? "Moviendo…" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFolderDialog({
  open,
  onOpenChange,
  folder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderNode;
}) {
  const deleteFolder = useDeleteFolder();

  async function submit() {
    await deleteFolder.mutateAsync(folder.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[min(400px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-5 text-rose-500" strokeWidth={1.9} />
            Eliminar carpeta
          </DialogTitle>
          <DialogDescription>
            ¿Eliminar &quot;{folder.nombre}&quot;? Solo se borra si está vacía;
            con documentos o subcarpetas el sistema lo rechaza para no perder
            nada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border-ink-200 bg-panel px-4 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteFolder.isPending}
            onClick={() => void submit()}
            className="h-9 rounded-lg px-4 font-bold"
          >
            {deleteFolder.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}