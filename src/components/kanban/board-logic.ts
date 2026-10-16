// Pure board logic for the "Tareas" view of the v7 prototype: filter pills,
// the seven columns (six real states plus the virtual "Nuevo proyecto"
// column) and the per-card "Avanzar →" action. No React, no network, so every
// rule here is unit-tested without rendering.

import type { EstadoTarea } from "@prisma/client";
import type { CardTask } from "@/components/kanban/task-card";

/* ── Filter pills ──────────────────────────────────────────────────────── */

export type BoardPill = "todas" | "PROSPECCION" | "EJECUCION" | "mias";

export const BOARD_PILLS: { value: BoardPill; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "PROSPECCION", label: "Prospección" },
  { value: "EJECUCION", label: "Ejecución" },
  { value: "mias", label: "Mías" },
];

/**
 * Applies the active pill. `fase` comes from the linked opportunity, so a task
 * with no opportunity only shows under "Todas" and "Mías". `meId` is the
 * signed-in user: while it is unknown "Mías" matches nothing instead of
 * leaking everyone's tasks.
 */
export function filterByPill(items: CardTask[], pill: BoardPill, meId: string | null): CardTask[] {
  if (pill === "todas") return items;
  if (pill === "mias") return meId ? items.filter((t) => t.responsable_id === meId) : [];
  return items.filter((t) => t.oportunidad_fase === pill);
}

/* ── Columns ───────────────────────────────────────────────────────────── */

/** Real columns, in board order (CANCELADA stays out of the board; see Lista/Reporte). */
export const BOARD_ESTADOS: EstadoTarea[] = [
  "POR_HACER",
  "EN_CURSO",
  "EN_REVISION",
  "BLOQUEADA",
  "EN_ESPERA",
  "COMPLETADA",
];

export const NUEVO_PROYECTO = "NUEVO_PROYECTO" as const;
export type BoardColumnKey = EstadoTarea | typeof NUEVO_PROYECTO;

/**
 * "Nuevo proyecto" is derived, never stored: converting an opportunity to a
 * project is the only writer of `Oportunidad.fase = EJECUCION` (see
 * `.../opportunities/[opportunityId]/project/route.ts`), so an opportunity in
 * EJECUCION is exactly an opportunity that has a `proyecto`. A completed task
 * linked to it is a task that already became a project.
 */
export function isConvertedToProject(task: CardTask): boolean {
  return task.estado === "COMPLETADA" && !!task.oportunidad_id && task.oportunidad_fase === "EJECUCION";
}

export function columnOf(task: CardTask): BoardColumnKey {
  return isConvertedToProject(task) ? NUEVO_PROYECTO : task.estado;
}

export function groupByColumn(items: CardTask[]): Record<BoardColumnKey, CardTask[]> {
  const grouped: Record<BoardColumnKey, CardTask[]> = {
    POR_HACER: [],
    EN_CURSO: [],
    EN_REVISION: [],
    BLOQUEADA: [],
    EN_ESPERA: [],
    COMPLETADA: [],
    CANCELADA: [],
    NUEVO_PROYECTO: [],
  };
  for (const task of items) grouped[columnOf(task)].push(task);
  return grouped;
}

/* ── Card action ───────────────────────────────────────────────────────── */

/** v7 `NEXT`: the linear path a card follows. BLOQUEADA/EN_ESPERA resume to EN_CURSO. */
export const NEXT_ESTADO: Partial<Record<EstadoTarea, EstadoTarea>> = {
  POR_HACER: "EN_CURSO",
  EN_CURSO: "EN_REVISION",
  EN_REVISION: "COMPLETADA",
  BLOQUEADA: "EN_CURSO",
  EN_ESPERA: "EN_CURSO",
};

export const CONVERT_HINT = "Pasa a nuevo proyecto cuando la oportunidad esté aceptada.";

export type CardAction =
  | { kind: "advance"; to: EstadoTarea; label: string }
  | { kind: "convert"; oportunidadId: string; label: string }
  | { kind: "hint"; text: string }
  | { kind: "open-project"; label: string; href: string };

/**
 * What a card offers besides opening its dialog.
 * - `eligibleOpportunityIds`: GANADA opportunities with no project yet (the
 *   same set the "Convertir en proyecto" dialog action reads).
 * - Read-only tasks (`puede_editar === false`) get no mutating button.
 */
export function cardAction(
  task: CardTask,
  eligibleOpportunityIds: ReadonlySet<string>,
): CardAction | null {
  if (isConvertedToProject(task)) {
    // D3: link the exact project when the DTO carries it; otherwise the project list.
    return task.proyecto
      ? { kind: "open-project", href: `/proyectos/${encodeURIComponent(task.proyecto.id)}`, label: `✓ Proyecto ${task.proyecto.codigo} · abrir ficha` }
      : { kind: "open-project", href: "/proyectos", label: "✓ Proyecto creado · ver proyectos" };
  }
  if (task.puede_editar === false) return null;

  if (task.estado === "COMPLETADA") {
    if (task.oportunidad_fase !== "PROSPECCION" || !task.oportunidad_id) return null;
    if (eligibleOpportunityIds.has(task.oportunidad_id)) {
      return { kind: "convert", oportunidadId: task.oportunidad_id, label: "Pasar a nuevo proyecto →" };
    }
    return { kind: "hint", text: CONVERT_HINT };
  }

  const to = NEXT_ESTADO[task.estado];
  if (!to) return null;
  const resume = task.estado === "BLOQUEADA" || task.estado === "EN_ESPERA";
  return { kind: "advance", to, label: resume ? "Reanudar →" : "Avanzar →" };
}
