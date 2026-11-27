"use client";

/* ── Etiquetas (jefe 2026-10-28, lane 2 task 2.6 / S6; T1 S1 for projects) ──
 * Chips del catálogo LIVE `task_tags` — el mismo de las tareas (A1) y el que
 * edita el panel de administración. Fallback a las de fábrica mientras
 * carga; al editar se conservan como chips (presionados, quitables) las
 * etiquetas guardadas que ya no están en el catálogo — mismo patrón que
 * TareaFormDialog (task-dialogs.tsx). Lo usan la ficha del cliente y el
 * proyecto (creación y «Editar datos generales»). El catálogo se pide solo
 * cuando el campo se monta, no en cada render del formulario que lo contiene. */

import { Label } from "@/components/ui/label";
import { useTaskTags } from "@/hooks/admin";
import { TASK_TAGS } from "@/lib/catalogs";
import { cn } from "@/lib/utils";

/** Adds the tag when absent and removes it when present, keeping the order of the rest. */
export function alternarEtiqueta(etiquetas: readonly string[], tag: string): string[] {
  return etiquetas.includes(tag) ? etiquetas.filter((t) => t !== tag) : [...etiquetas, tag];
}

export function EtiquetasField({
  labelId,
  selected,
  onToggle,
  className,
  label = "Etiquetas",
}: {
  /** Id of the visible label; the chip group is named by it. */
  labelId: string;
  selected: string[];
  onToggle: (tag: string) => void;
  className?: string;
  /** Visible label; S18 forms pass «Etiquetas (opcional)». */
  label?: string;
}) {
  const tagsQuery = useTaskTags();
  const catalogTags = tagsQuery.data ?? [...TASK_TAGS];
  const storedNotInCatalog = selected.filter((t) => !catalogTags.includes(t));
  const chipTags = storedNotInCatalog.length
    ? [...catalogTags, ...storedNotInCatalog]
    : catalogTags;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label id={labelId}>{label}</Label>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {chipTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            aria-pressed={selected.includes(tag)}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-3 text-[12px] font-semibold transition-colors",
              selected.includes(tag)
                ? "border-rose-500 bg-rose-50 text-rose-700"
                : "border-ink-200 bg-panel hover:bg-ink-100/60",
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
