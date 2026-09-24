// gestion-proyectos-workspace, Phase 7 (project-workspace.tsx's Indicadores
// tab, owned by Phases 5-7 per the workspace's original comment). Backend
// already supports full CRUD (`GET/POST /api/v1/projects/:id/indicators`,
// `PATCH/DELETE /api/v1/projects/:id/indicators/:indicatorId` — see those
// route files, `INDICATOR_SCHEMA`) and the data layer already exists
// (`useIndicators`/`useCreateIndicator`/`useUpdateIndicator`/
// `useDeleteIndicator` in `src/hooks/projects.ts`). This file only adds the
// UI: a list with progress (`valor_actual` vs. `meta_valor`) plus a
// create/edit dialog.
//
// The dialog mirrors `ContactoFormDialog`'s conventions in
// `src/components/crm/entity-dialogs.tsx` — the closest existing form
// pattern in this codebase, already reused cross-module (`saved-views.tsx`,
// `document-dialog.tsx`): a `formKey`-driven reset-on-open effect, inline
// `role="alert"` validation, and `ConfirmDialog` reuse for delete instead of
// a bespoke confirmation.

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ConfirmDialog } from "@/components/crm/entity-dialogs";
import {
  useCreateIndicator,
  useDeleteIndicator,
  useGoals,
  useIndicators,
  useUpdateIndicator,
  type Indicador,
  type IndicatorInput,
  type Meta,
} from "@/hooks/projects";

/* ── List ──────────────────────────────────────────────────────────────── */

export function IndicadoresTab({ projectId }: { projectId: string }) {
  const query = useIndicators(projectId);
  const goalsQuery = useGoals(projectId);
  const deleteMutation = useDeleteIndicator(projectId);
  const metas = goalsQuery.data ?? [];
  const metaNombre = new Map(metas.map((m: Meta) => [m.id, m.nombre]));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Indicador | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Indicador | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(indicador: Indicador) {
    setEditing(indicador);
    setFormOpen(true);
  }

  if (query.isLoading) {
    return <p className="text-[12.5px] text-ink-600">Cargando…</p>;
  }

  const indicadores = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button type="button" onClick={openCreate} className="rounded-lg px-3 font-bold">
          <Plus className="size-4" strokeWidth={2.2} />
          Nuevo indicador
        </Button>
      </div>

      {indicadores.length === 0 ? (
        <p className="text-[12.5px] text-ink-600">Este proyecto no tiene indicadores todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {indicadores.map((indicador) => {
            const meta = indicador.meta_valor > 0 ? indicador.meta_valor : 0;
            const actual = indicador.valor_actual;
            const pct = actual !== null && meta > 0 ? Math.min(100, Math.max(0, (actual / meta) * 100)) : 0;

            return (
              <li
                key={indicador.id}
                className="flex flex-col gap-2 rounded-14 border border-ink-200 bg-panel px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink-950">{indicador.nombre}</p>
                    {indicador.meta_id && (
                      <p className="text-[11.5px] text-ink-600">
                        Meta: {metaNombre.get(indicador.meta_id) ?? "—"}
                      </p>
                    )}
                  </div>
                  {/* gap-4 (16px), not gap-1: icon-sm buttons expand their tap target
                      8px per side via `after:-inset-2` (button.tsx), so a smaller gap
                      lets the two expanded hit-areas overlap near the destructive
                      "Eliminar" action. */}
                  <div className="flex shrink-0 items-center gap-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${indicador.nombre}`}
                      onClick={() => openEdit(indicador)}
                      className="text-ink-500 hover:text-ink-900"
                    >
                      <Pencil className="size-3.5" strokeWidth={1.9} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Eliminar ${indicador.nombre}`}
                      onClick={() => setConfirmDelete(indicador)}
                      className="text-ink-500 hover:text-destructivo"
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.9} />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      data-testid="indicador-progreso"
                      className={cn("h-full rounded-full", pct >= 100 ? "bg-exito" : "bg-ink-400")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="shrink-0 text-[12.5px] font-medium text-ink-700">
                    {actual === null ? "Sin medir" : actual.toLocaleString()} / {meta.toLocaleString()}{" "}
                    {indicador.unidad}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <IndicadorFormDialog
        projectId={projectId}
        open={formOpen}
        onOpenChange={setFormOpen}
        indicador={editing}
        metas={metas}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Eliminar indicador"
        description={
          confirmDelete
            ? `¿Eliminar "${confirmDelete.nombre}"? Esta acción no se puede deshacer.`
            : ""
        }
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!confirmDelete) return;
          const id = confirmDelete.id;
          setConfirmDelete(null);
          void deleteMutation.mutateAsync(id).catch(() => undefined);
        }}
      />
    </div>
  );
}

/* ── Create/edit dialog ───────────────────────────────────────────────── */

type IndicadorFormState = {
  nombre: string;
  unidad: string;
  meta_valor: string;
  valor_actual: string;
  meta_id: string;
  cuenta_beneficiarios: boolean;
};

function emptyForm(): IndicadorFormState {
  return { nombre: "", unidad: "", meta_valor: "", valor_actual: "", meta_id: "", cuenta_beneficiarios: false };
}

function toForm(indicador: Indicador): IndicadorFormState {
  return {
    nombre: indicador.nombre,
    unidad: indicador.unidad,
    meta_valor: String(indicador.meta_valor),
    valor_actual: indicador.valor_actual === null ? "" : String(indicador.valor_actual),
    meta_id: indicador.meta_id ?? "",
    cuenta_beneficiarios: indicador.cuenta_beneficiarios,
  };
}

function IndicadorFormDialog({
  projectId,
  open,
  onOpenChange,
  indicador,
  metas,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicador?: Indicador | null;
  metas: Meta[];
}) {
  const isEdit = Boolean(indicador);
  const createMutation = useCreateIndicator(projectId);
  const updateMutation = useUpdateIndicator(projectId, indicador?.id ?? "");
  const pending = isEdit ? updateMutation.isPending : createMutation.isPending;

  const [form, setForm] = useState<IndicadorFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const formKey = `${open ? "open" : "closed"}:${indicador?.id ?? "nuevo"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      setForm(indicador ? toForm(indicador) : emptyForm());
    }
  }

  function set<K extends keyof IndicadorFormState>(key: K, value: IndicadorFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!form.nombre.trim()) return setError("El nombre del indicador es obligatorio.");
    if (!form.unidad.trim()) return setError("La unidad es obligatoria.");
    const metaValor = Number(form.meta_valor);
    if (!form.meta_valor || Number.isNaN(metaValor) || metaValor <= 0) {
      return setError("La meta debe ser un número mayor a cero.");
    }
    if (form.valor_actual && (Number.isNaN(Number(form.valor_actual)) || Number(form.valor_actual) < 0)) {
      return setError("El valor actual no puede ser negativo.");
    }

    const payload: IndicatorInput = {
      nombre: form.nombre.trim(),
      unidad: form.unidad.trim(),
      meta_valor: metaValor,
      cuenta_beneficiarios: form.cuenta_beneficiarios,
      ...(form.meta_id ? { meta_id: form.meta_id } : {}),
      ...(form.valor_actual ? { valor_actual: Number(form.valor_actual) } : {}),
    };

    try {
      if (isEdit && indicador) {
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      /* toast handled by the hook */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(520px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            {isEdit ? "Editar indicador" : "Agregar indicador"}
          </DialogTitle>
          <DialogDescription>Seguimiento de meta vs. valor alcanzado.</DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="rounded-12 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="indicador-nombre">
                Nombre <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="indicador-nombre"
                required
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Ej. Familias capacitadas"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="indicador-unidad">
                Unidad <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="indicador-unidad"
                required
                value={form.unidad}
                onChange={(e) => set("unidad", e.target.value)}
                placeholder="Ej. familias, personas"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="indicador-meta-valor">
                Valor meta <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="indicador-meta-valor"
                type="number"
                min={0}
                required
                value={form.meta_valor}
                onChange={(e) => set("meta_valor", e.target.value)}
                placeholder="100"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="indicador-valor-actual">Valor actual</Label>
              <Input
                id="indicador-valor-actual"
                type="number"
                min={0}
                value={form.valor_actual}
                onChange={(e) => set("valor_actual", e.target.value)}
                placeholder="Sin medir"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Meta asociada (opcional)</Label>
              <Select value={form.meta_id} onValueChange={(v) => set("meta_id", v ?? "")}>
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue placeholder="Sin meta asociada" />
                </SelectTrigger>
                <SelectContent>
                  {metas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="indicador-beneficiarios"
                checked={form.cuenta_beneficiarios}
                onCheckedChange={(v) => set("cuenta_beneficiarios", v === true)}
              />
              <Label htmlFor="indicador-beneficiarios" className="cursor-pointer font-normal">
                Cuenta como beneficiarios atendidos
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-lg px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar indicador"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
