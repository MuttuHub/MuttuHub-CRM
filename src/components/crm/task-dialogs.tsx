// Diálogos del motor unificado de compromisos (PRD §4.2 / §8.2): creación,
// edición, cambio de estado rápido y borrado suave con confirmación.
// `origen` se expone como radio: "Solo CRM" (CRM) o "CRM y tablero" (AMBOS).

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import type { EstadoTarea, OrigenTarea, PrioridadTarea } from "@prisma/client";
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
  ENUM_VALUES,
  ESTADO_TAREA_LABELS,
  PRIORIDAD_TAREA_LABELS,
  TASK_TAGS,
} from "@/lib/catalogs";
import {
  useCreateTarea,
  useUpdateTarea,
  type TaskItem,
} from "@/hooks/crm";
import { useTaskTags } from "@/hooks/admin";

function toDateValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export type TareaFormState = {
  titulo: string;
  descripcion: string;
  responsable_id: string;
  fecha_entrega: string;
  prioridad: PrioridadTarea | "";
  estado: EstadoTarea;
  origen: "CRM" | "AMBOS";
  motivo_bloqueo: string;
  etiquetas: string[];
};

type TareaFormDialogProps = {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tarea?: TaskItem | null;
  users: { id: string; nombre: string }[];
};

export function TareaFormDialog({
  clientId,
  open,
  onOpenChange,
  tarea,
  users,
}: TareaFormDialogProps) {
  const isEdit = Boolean(tarea);
  const createMutation = useCreateTarea();
  const updateMutation = useUpdateTarea();
  const pending = isEdit ? updateMutation.isPending : createMutation.isPending;

  const [form, setForm] = useState<TareaFormState>({
    titulo: "",
    descripcion: "",
    responsable_id: "",
    fecha_entrega: "",
    prioridad: "",
    estado: "POR_HACER",
    origen: "CRM",
    motivo_bloqueo: "",
    etiquetas: [],
  });
  const [error, setError] = useState<string | null>(null);

  // Jefe 2026-10-28 lane 1 task 1.1 (S1): etiquetas desde el catálogo LIVE
  // (task_tags) — el mismo que edita el panel de administración. Fallback a
  // las de fábrica mientras carga; al editar se conservan como chips las
  // etiquetas guardadas que ya no están en el catálogo.
  const tagsQuery = useTaskTags();
  const catalogTags = tagsQuery.data ?? [...TASK_TAGS];
  const storedNotInCatalog = form.etiquetas.filter((t) => !catalogTags.includes(t));
  const chipTags = storedNotInCatalog.length
    ? [...catalogTags, ...storedNotInCatalog]
    : catalogTags;

  const formKey = `${open ? "open" : "closed"}:${tarea?.id ?? "nuevo"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      if (tarea) {
        setForm({
          titulo: tarea.titulo,
          descripcion: tarea.descripcion ?? "",
          responsable_id: tarea.responsable_id,
          fecha_entrega: toDateValue(tarea.fecha_entrega),
          prioridad: tarea.prioridad ?? "",
          estado: tarea.estado,
          origen: tarea.origen === "CRM" || tarea.origen === "AMBOS" ? tarea.origen : "CRM",
          motivo_bloqueo: tarea.motivo_bloqueo ?? "",
          etiquetas: [...(tarea.etiquetas ?? [])],
        });
      } else {
        setForm({
          titulo: "",
          descripcion: "",
          responsable_id: "",
          fecha_entrega: "",
          prioridad: "",
          estado: "POR_HACER",
          origen: "CRM",
          motivo_bloqueo: "",
          etiquetas: [],
        });
      }
    }
  }

  function set<K extends keyof TareaFormState>(key: K, value: TareaFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleEtiqueta(tag: string) {
    setForm((f) => ({
      ...f,
      etiquetas: f.etiquetas.includes(tag)
        ? f.etiquetas.filter((t) => t !== tag)
        : [...f.etiquetas, tag],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!form.titulo.trim()) return setError("El título del compromiso es obligatorio.");
    if (!form.responsable_id) return setError("El responsable es obligatorio.");
    if (form.estado === "BLOQUEADA" && !form.motivo_bloqueo.trim()) {
      return setError("Indica un motivo para bloquear.");
    }

    const input = {
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      responsable_id: form.responsable_id,
      fecha_entrega: form.fecha_entrega || null,
      prioridad: form.prioridad ? (form.prioridad as PrioridadTarea) : null,
      estado: form.estado,
      origen: form.origen as OrigenTarea,
      motivo_bloqueo: form.estado === "BLOQUEADA" ? form.motivo_bloqueo.trim() : null,
      etiquetas: form.etiquetas,
      cliente_id: clientId,
    };

    try {
      if (isEdit && tarea) {
        const patch = { ...input };
        delete (patch as { cliente_id?: string }).cliente_id;
        await updateMutation.mutateAsync({
          taskId: tarea.id,
          clienteId: clientId,
          input: patch,
        });
      } else {
        await createMutation.mutateAsync(input);
      }
      onOpenChange(false);
    } catch {
      /* toast handled by the hook */
    }
  }

  const origenOptions: { value: "CRM" | "AMBOS"; label: string; hint: string }[] = [
    { value: "CRM", label: "Solo CRM", hint: "Visible únicamente en la ficha" },
    { value: "AMBOS", label: "CRM y tablero", hint: "Aparece también en el Kanban" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-[min(540px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            {isEdit ? "Editar compromiso" : "Nuevo compromiso"}
          </DialogTitle>
          <DialogDescription>
            Compromiso vinculado al cliente; se puede reflejar también en el tablero.
          </DialogDescription>
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
              <Label htmlFor="tarea-titulo">
                Título <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="tarea-titulo"
                required
                value={form.titulo}
                onChange={(e) => set("titulo", e.target.value)}
                placeholder="Ej. Entregar informe trimestral"
                className="px-3"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="tarea-descripcion">Descripción</Label>
              <textarea
                id="tarea-descripcion"
                rows={2}
                value={form.descripcion}
                onChange={(e) => set("descripcion", e.target.value)}
                placeholder="Detalle del compromiso"
                className="w-full resize-none rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>
                Responsable <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={form.responsable_id}
                onValueChange={(v) => set("responsable_id", v ?? "")}
              >
                <SelectTrigger aria-label="Responsable" className="w-full px-3">
                  <SelectValue placeholder="Selecciona el responsable" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="tarea-fecha">Fecha límite</Label>
              <Input
                id="tarea-fecha"
                type="date"
                value={form.fecha_entrega}
                onChange={(e) => set("fecha_entrega", e.target.value)}
                className="px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Prioridad</Label>
              <Select
                value={form.prioridad}
                onValueChange={(v) => set("prioridad", v as PrioridadTarea | "")}
              >
                <SelectTrigger aria-label="Prioridad" className="w-full px-3">
                  <SelectValue placeholder="Sin prioridad" />
                </SelectTrigger>
                <SelectContent>
                  {ENUM_VALUES.PrioridadTarea.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDAD_TAREA_LABELS[p as PrioridadTarea].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(v) => set("estado", v as EstadoTarea)}
              >
                <SelectTrigger aria-label="Estado" className="w-full px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENUM_VALUES.EstadoTarea.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ESTADO_TAREA_LABELS[s as EstadoTarea].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm leading-none font-medium">
                Visible en
              </span>
              <div className="flex flex-wrap gap-2">
                {origenOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => set("origen", option.value)}
                    className={cn(
                      "flex-1 rounded-12 border px-3 py-2.5 text-left transition-colors sm:flex-none sm:min-w-[180px]",
                      form.origen === option.value
                        ? "border-rose-500 bg-rose-50"
                        : "border-ink-200 bg-panel hover:bg-ink-100/60",
                    )}
                    aria-pressed={form.origen === option.value}
                  >
                    <span
                      className={cn(
                        "block text-[13px] font-bold",
                        form.origen === option.value ? "text-accent-soft" : "text-ink-800",
                      )}
                    >
                      {option.label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11.5px]",
                        form.origen === option.value ? "text-ink-700" : "text-ink-600",
                      )}
                    >
                      {option.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label id="tarea-etiquetas-label">Etiquetas</Label>
              <div role="group" aria-labelledby="tarea-etiquetas-label" className="flex flex-wrap gap-2">
                {chipTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleEtiqueta(tag)}
                    aria-pressed={form.etiquetas.includes(tag)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-full border px-3 text-[12px] font-semibold transition-colors",
                      form.etiquetas.includes(tag)
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-ink-200 bg-panel hover:bg-ink-100/60",
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {form.estado === "BLOQUEADA" && (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="tarea-motivo">
                  Motivo del bloqueo <span className="text-rose-500">*</span>
                </Label>
                <textarea
                  id="tarea-motivo"
                  rows={2}
                  value={form.motivo_bloqueo}
                  onChange={(e) => set("motivo_bloqueo", e.target.value)}
                  placeholder="Por qué está bloqueado este compromiso"
                  className="w-full resize-none rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear compromiso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}