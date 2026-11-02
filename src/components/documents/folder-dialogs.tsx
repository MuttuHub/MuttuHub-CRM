// Diálogos de carpetas en el Repositorio (plan Fase 2, 4A): crear, renombrar,
// mover y eliminar. El rail permite crear en la raíz o dentro de la carpeta
// seleccionada. Renombrar/mover/eliminar salen del menú de acciones del nodo.
// "Carpeta de cliente" (S4, A5) abre la carpeta de un cliente o la crea.

"use client";

import { useState } from "react";
import { toast } from "sonner";
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
import { ClienteCombobox, type ClienteOpcion } from "@/components/proyectos/cliente-combobox";
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

/** Hijos directos de una carpeta (null = raíz del repositorio). */
function childrenOf(nodes: FolderNode[], id: string | null): FolderNode[] {
  if (id === null) return nodes;
  for (const n of nodes) {
    if (n.id === id) return n.hijos;
    const found = childrenOf(n.hijos, id);
    if (found.length > 0) return found;
  }
  return [];
}

/** ids de la carpeta y de todos sus descendientes (para excluirlos al mover). */function descendantsOf(nodes: FolderNode[], id: string): Set<string> {
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
  clientes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultParentId: string | null;
  folders: FolderNode[];
  /** Clientes a los que se puede vincular la carpeta (opcional). */
  clientes: ClienteOpcion[];
}) {
  const [nombre, setNombre] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [clienteId, setClienteId] = useState("");

  const createFolder = useCreateFolder();
  const flat = flattenFolderOptions(folders);

  async function submit() {
    // Enter no pasa por el botón deshabilitado: sin este guard, dos Enter
    // seguidos creaban la carpeta dos veces.
    if (!nombre.trim() || createFolder.isPending) return;
    // "" = la carpeta seleccionada por defecto; "raiz" = raíz explícita.
    const parentDestino =
      parentId === "raiz" ? null : parentId === "" ? defaultParentId : parentId;
    // Espejo de UX: dos carpetas con el mismo nombre en el mismo nivel son
    // indistinguibles en el explorador; el servidor no lo impide, la UI sí.
    const nombreNormalizado = nombre.trim().toLocaleLowerCase("es");
    const repetida = childrenOf(folders, parentDestino).some(
      (f) => f.nombre.trim().toLocaleLowerCase("es") === nombreNormalizado,
    );
    if (repetida) {
      toast.error(`Ya existe una carpeta «${nombre.trim()}» en ese nivel.`);
      return;
    }
    try {
      await createFolder.mutateAsync({
        nombre: nombre.trim(),
        parent_id: parentDestino,
        cliente_id: clienteId || null,
      });
    } catch {
      return; /* el hook muestra el error; el diálogo sigue abierto */
    }
    setNombre("");
    setParentId("");
    setClienteId("");
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
              className="text-base md:text-[13px]"
            />
          </div>

          {flat.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="folder-parent">Dentro de</Label>
              <Select
                value={
                  parentId === ""
                    ? defaultParentId
                      ? "seleccionada"
                      : "raiz"
                    : parentId
                }
                onValueChange={(v) =>
                  setParentId(
                    v === "seleccionada" ? "" : v === "raiz" ? "raiz" : (v ?? ""),
                  )
                }
              >
                <SelectTrigger
                  id="folder-parent"
                  className={cn(
                    "w-full px-3 text-base md:text-[13px]",
                  )}
                >
                  <SelectValue placeholder="Raíz del repositorio" />
                </SelectTrigger>
                <SelectContent>
                  {defaultParentId && (
                    <SelectItem value="seleccionada">Carpeta seleccionada</SelectItem>
                  )}
                  <SelectItem value="raiz">Raíz del repositorio</SelectItem>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-cliente">Cliente (opcional)</Label>
            <ClienteCombobox
              id="folder-cliente"
              clientes={clientes}
              value={clienteId}
              onChange={setClienteId}
            />
            <p className="text-[11.5px] leading-snug text-ink-600">
              Al vincularla, los documentos que subas en esta carpeta quedan
              asociados a ese cliente.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createFolder.isPending}
            className="px-4 text-[13px] font-semibold text-ink-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!nombre.trim() || createFolder.isPending}
            onClick={() => void submit()}
            className="px-4 font-bold"
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
    if (!nombre.trim() || renameFolder.isPending) return;
    try {
      await renameFolder.mutateAsync({ id: folder.id, nombre: nombre.trim() });
    } catch {
      return; /* el hook muestra el error; el diálogo sigue abierto */
    }
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
            className="text-base md:text-[13px]"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={renameFolder.isPending}
            className="px-4 text-[13px] font-semibold text-ink-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!nombre.trim() || renameFolder.isPending}
            onClick={() => void submit()}
            className="px-4 font-bold"
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
    try {
      await moveFolder.mutateAsync({
        id: folder.id,
        parent_id: parentId === "" ? null : parentId,
      });
    } catch {
      return; /* el hook muestra el error; el diálogo sigue abierto */
    }
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
          <Select
            value={parentId === "" ? "raiz" : parentId}
            onValueChange={(v) =>
              setParentId(v === "raiz" ? "" : (v ?? ""))
            }
          >
            <SelectTrigger
              id="folder-move"
              className="w-full px-3 text-base md:text-[13px]"
            >
              <SelectValue placeholder="Elige destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raiz">Raíz del repositorio</SelectItem>
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
            disabled={moveFolder.isPending}
            className="px-4 text-[13px] font-semibold text-ink-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={moveFolder.isPending}
            onClick={() => void submit()}
            className="px-4 font-bold"
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
    try {
      await deleteFolder.mutateAsync(folder.id);
    } catch {
      return; /* el hook muestra el error; el diálogo sigue abierto */
    }
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
            disabled={deleteFolder.isPending}
            className="px-4 text-[13px] font-semibold text-ink-800"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteFolder.isPending}
            onClick={() => void submit()}
            className="px-4 font-bold"
          >
            {deleteFolder.isPending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
