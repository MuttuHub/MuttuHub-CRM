// Guardado de vistas de filtros (PRD §4.5): los filtros activos pueden
// nombrarse y guardarse en localStorage (`crm.vistas`), aplicarse después con
// un clic y eliminarse. Componente pequeño y autocontenido.

"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Trash2, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/crm/entity-dialogs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClientFilters } from "@/hooks/crm";

export type SavedView = {
  id: string;
  nombre: string;
  filtros: ClientFilters;
};

const STORAGE_KEY = "crm.vistas";

function loadViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    return [];
  }
}

function persistViews(views: SavedView[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // localStorage no disponible (modo privado): la vista no sobrevive, no bloquea nada.
  }
}

/** True when no filter param has a value. */
export function filtersEmpty(filters: ClientFilters): boolean {
  return Object.values(filters).every((v) => v === undefined || v === "");
}

const FILTER_KEYS: (keyof ClientFilters)[] = [
  "q",
  "tipo",
  "estado",
  "prioridad",
  "responsable",
  "desde",
  "hasta",
  "valorMin",
  "valorMax",
];

/** Normalized snapshot (undefined instead of "") so saved views stay clean. */
export function snapshotFilters(filters: ClientFilters): ClientFilters {
  const out: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    // FILTER_KEYS son todas string (nunca page/limit); el cast descarta el
    // branch numérico que ClientFilters ganó con la paginación (PR 24).
    const value = filters[key] as string | undefined;
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

export function SavedViewsMenu({
  filters,
  onApply,
}: {
  filters: ClientFilters;
  onApply: (filters: ClientFilters) => void;
}) {
  const [views, setViews] = useState<SavedView[]>(loadViews);
  // Espejo del estado para handlers capturados por el toast: el closure del
  // action vive desde un render previo (pre-delete) y no debe leer `views`.
  const viewsRef = useRef(views);
  useEffect(() => {
    viewsRef.current = views;
  }, [views]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedView | null>(null);
  // Vistas eliminadas (5s de undo): por id para que cada toast de Deshacer
  // restaure SU vista aunque se elimine otra antes de expirar.
  const deletedViewsRef = useRef(new Map<string, { view: SavedView; index: number }>());

  function saveView() {
    const nombre = name.trim();
    if (!nombre) return;
    const next: SavedView[] = [
      ...views,
      { id: crypto.randomUUID(), nombre, filtros: snapshotFilters(filters) },
    ];
    setViews(next);
    persistViews(next);
    setName("");
    setSaveOpen(false);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const index = views.findIndex((v) => v.id === deleteTarget.id);
    deletedViewsRef.current.set(deleteTarget.id, { view: deleteTarget, index });
    const next = views.filter((v) => v.id !== deleteTarget.id);
    setViews(next);
    persistViews(next);
    setDeleteTarget(null);
    toast.success(`Vista "${deleteTarget.nombre}" eliminada.`, {
      action: { label: "Deshacer", onClick: () => restoreView(deleteTarget.id) },
      duration: 5000,
    });
  }

  /** Restaura una vista eliminada en su posición original (undo del toast). */
  function restoreView(id: string) {
    const entry = deletedViewsRef.current.get(id);
    if (!entry) return; // ya restaurada (doble click) o expiró el undo.
    deletedViewsRef.current.delete(id);
    try {
      const next = [...viewsRef.current];
      next.splice(Math.min(entry.index, next.length), 0, entry.view);
      setViews(next);
      persistViews(next);
    } catch {
      toast.error("No pudimos restaurar la vista. Inténtalo de nuevo.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="h-9 rounded-lg border-ink-200 bg-panel px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
            >
              <LayoutList className="size-4 text-ink-600" strokeWidth={1.8} />
              Vistas
              <span className="ml-0.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-bold text-ink-600">
                {views.length}
              </span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Vistas guardadas</DropdownMenuLabel>
          {views.length === 0 && (
            <div className="px-3 py-2 text-[12.5px] text-ink-600">
              Aún no hay vistas. Guarda los filtros actuales.
            </div>
          )}
          {views.map((view) => (
            <div key={view.id} className="group flex items-center">
              <DropdownMenuItem
                onClick={() => onApply({ ...view.filtros })}
                className="flex-1 truncate py-1.5"
              >
                {view.nombre}
              </DropdownMenuItem>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Eliminar vista ${view.nombre}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(view);
                }}
                className="mr-1 text-ink-500 opacity-0 hover:text-destructivo group-hover:opacity-100 after:-inset-1"
              >
                <Trash2 className="size-3.5" strokeWidth={1.8} />
              </Button>
            </div>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={filtersEmpty(filters)}
            onClick={() => setSaveOpen(true)}
            className="font-semibold text-rose-700 dark:text-rose-400"
          >
            <Star className="size-4" strokeWidth={1.8} />
            Guardar filtros actuales
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Eliminar vista "${deleteTarget.nombre}"` : "Eliminar vista"}
        description="La vista dejará de aparecer en el listado. Puedes deshacerlo desde el aviso."
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="rounded-[20px] sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
              Guardar vista
            </DialogTitle>
            <DialogDescription>
              Nombre para reutilizar esta combinación de filtros.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveView();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="vista-nombre">Nombre de la vista</Label>
              <Input
                id="vista-nombre"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Gobierno local activo"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Guardar vista
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}