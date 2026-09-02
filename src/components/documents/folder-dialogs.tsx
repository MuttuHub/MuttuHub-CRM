// Diálogo de crear carpeta en el Repositorio (plan Fase 2, 4A). El rail
// permite crear en la raíz o dentro de la carpeta seleccionada; opcionalmente
// se puede elegir otra padre del árbol.

"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";
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
import { useCreateFolder, type FolderNode } from "@/hooks/documents";

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

  // La lista de padres posibles = todas las carpetas existentes (sin ciclos
  // posibles: una carpeta nueva no puede ser padre de nada).
  const flat: { id: string; label: string }[] = [];
  const walk = (nodes: FolderNode[], prefix: string) => {
    for (const n of nodes) {
      flat.push({ id: n.id, label: `${prefix}${n.nombre}` });
      walk(n.hijos, `${prefix}${n.nombre} / `);
    }
  };
  walk(folders, "");

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
      <DialogContent className="sm:max-w-[400px]">
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