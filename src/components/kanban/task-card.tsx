// Tarjeta de tarea del tablero (PRD §5.2): título, chips de prioridad/
// etiquetas/cliente, avatar del responsable, fecha de entrega (vencida en
// rojo), conteo de subtareas y banner de bloqueo. Es el item dnd a la
// vez (useSortable). El conteo de subtareas llega agregado en el listado
// (subtotal, una sola query para todo el tablero); el detalle con
// completadas/total se resuelve bajo demanda en el diálogo.

"use client";

import type { ReactNode } from "react";
import { Hexagon, Rocket, Target } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EstadoTarea, FaseOportunidad } from "@prisma/client";
import { cn } from "@/lib/utils";
import { esVencida, formatFecha } from "@/hooks/crm";
import { useSubtareas } from "@/hooks/kanban";
import { PrioridadChip } from "@/components/crm/shared";

export type CardTask = {
  id: string;
  titulo: string;
  estado: EstadoTarea;
  prioridad: "ALTA" | "MEDIA" | "BAJA" | null;
  etiquetas: string[];
  cliente_nombre: string | null;
  responsable_id?: string;
  responsable_nombre: string;
  fecha_entrega: string | null;
  motivo_bloqueo: string | null;
  subtotal?: number;
  subtotal_hechas?: number;
  /**
   * oportunidades-comerciales (RNF-C01): pure derivation of the DTO already
   * in scope — no new component, no new query. `null` when the task is not
   * linked to a commercial opportunity, or was never linked (see D1's "no
   * backfill" decision).
   */
  oportunidad_id?: string | null;
  oportunidad_nombre?: string | null;
  oportunidad_fase?: FaseOportunidad | null;
  /**
   * PR 2 + PR 4 (Slice B2): server-authoritative write flag. `false` ⇒
   * the current user would 403 on PATCH/DELETE, so the kanban card is
   * rendered off as a drag source and the task dialog's destructive
   * controls / edit fields are hidden or disabled. The server is the
   * authority — a spoofed `true` in any request body is ignored.
   */
  puede_editar?: boolean;
};

export function TaskCard({
  task,
  overlay = false,
  onClick,
  action,
}: {
  task: CardTask;
  overlay?: boolean;
  onClick: () => void;
  /** v7 footer: the "Avanzar →" button or a hint. Sits outside the card's click target. */
  action?: ReactNode;
}) {
  const bloqueada = task.estado === "BLOQUEADA";

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={cn(
          "group relative cursor-pointer rounded-inner border border-border bg-muted p-3 text-left transition-colors hover:border-border-strong",
          "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
          overlay && "rotate-2 shadow-xl ring-2 ring-rose-200",
        )}
      >
        <p className="font-display text-[13.5px] leading-snug font-bold tracking-[-0.01em] text-ink-950">
          {task.titulo}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <PrioridadChip prioridad={task.prioridad} />
          {task.etiquetas.slice(0, 3).map((etq) => (
            <span
              key={etq}
              className="inline-flex h-[20px] items-center rounded-full bg-ink-100 px-2 text-[10.5px] font-semibold text-ink-700"
            >
              {etq}
            </span>
          ))}
          {task.cliente_nombre && (
            <span className="inline-flex h-[20px] items-center rounded-full bg-rose-100 px-2 text-[10.5px] font-semibold text-rose-700 dark:text-rose-400">
              <Hexagon className="mr-1 size-2.5" strokeWidth={1.8} />
              {task.cliente_nombre}
            </span>
          )}
          <OpportunityPhaseChip fase={task.oportunidad_fase} reference={task.oportunidad_nombre} />
        </div>

        <p className="mt-3 text-[12.5px] leading-snug text-ink-600">
          <span className="text-ink-800">{task.responsable_nombre}</span>
          {" · "}
          <TaskDate fecha={task.fecha_entrega} />
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <SubtaskBadge task={task} />
          {bloqueada && (
            <span className="max-w-[14rem] truncate rounded-[8px] bg-alerta-bg px-2 py-1 text-[10.5px] font-bold text-alerta">
              Bloqueada: {task.motivo_bloqueo || "sin motivo"}
            </span>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * RNF-C01: distinguishes a PROSPECCION-linked task from an EJECUCION-linked
 * one on the board — amber "prospecting" vs emerald "executing", nothing
 * when there is no linked opportunity (or it wasn't fetched at all).
 */
function OpportunityPhaseChip({
  fase,
  reference,
}: {
  fase?: FaseOportunidad | null;
  /** v7 "Prospección · ref": the opportunity name, truncated inside the chip. */
  reference?: string | null;
}) {
  if (fase !== "PROSPECCION" && fase !== "EJECUCION") return null;
  const prospeccion = fase === "PROSPECCION";
  const Icon = prospeccion ? Target : Rocket;
  return (
    <span
      className={cn(
        "inline-flex h-[20px] max-w-full items-center rounded-full px-2 text-[10.5px] font-semibold",
        // v7: prospecting is the accent (rose), execution is the success green.
        prospeccion
          ? "bg-rose-100 text-rose-700 dark:text-rose-400"
          : "bg-emerald-100 text-emerald-700 dark:text-emerald-400",
      )}
    >
      <Icon className="mr-1 size-2.5 shrink-0" strokeWidth={1.8} />
      <span>{prospeccion ? "Prospección" : "Ejecución"}</span>
      {reference ? <span className="ml-1 min-w-0 truncate font-medium opacity-80">· {reference}</span> : null}
    </span>
  );
}

/** v7 "responsable · fecha": plain text, red once the due date has passed. */
function TaskDate({ fecha }: { fecha: string | null }) {
  if (!fecha) return <span>Sin fecha</span>;
  const vencida = esVencida(fecha);
  return (
    <span className={cn("tabular-nums", vencida && "font-semibold text-destructivo")}>
      {formatFecha(fecha)}
      {vencida && " · vencida"}
    </span>
  );
}

function SubtaskBadge({ task }: { task: CardTask }) {
  if (task.subtotal !== undefined) {
    return <SubtotalChip subtotal={task.subtotal} subtotalHechas={task.subtotal_hechas} />;
  }
  return <LiveSubtaskBadge taskId={task.id} />;
}

function SubtotalChip({
  subtotal,
  subtotalHechas,
}: {
  subtotal: number;
  subtotalHechas?: number;
}) {
  if (subtotal === 0) return null;
  // Conteo agregado del listado: muestra progreso sin fetches por tarjeta.
  if (subtotalHechas !== undefined) {
    const done = subtotalHechas;
    return (
      <span
        className="flex min-w-0 items-center gap-1.5"
        title={`${done} de ${subtotal} subtareas completadas`}
      >
        <span className="font-mono text-[10.5px] font-bold text-ink-700 tabular-nums">
          {done}/{subtotal}
        </span>
        <span className="h-1 w-10 overflow-hidden rounded-full bg-ink-100">
          <span
            className="block h-full rounded-full bg-rose-400"
            style={{ width: `${Math.round((done / subtotal) * 100)}%` }}
          />
        </span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 font-mono text-[10.5px] font-bold text-ink-700 tabular-nums"
      title={`${subtotal} ${subtotal === 1 ? "subtarea" : "subtareas"}`}
    >
      {subtotal}
    </span>
  );
}

function LiveSubtaskBadge({ taskId }: { taskId: string }) {
  const { data, isError, isLoading } = useSubtareas(taskId);
  if (isLoading || isError || !data || data.length === 0) return null;
  const done = data.filter((s) => s.completada).length;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="font-mono text-[10.5px] font-bold text-ink-700 tabular-nums">
        {done}/{data.length}
      </span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-ink-100">
        <span
          className="block h-full rounded-full bg-rose-400"
          style={{ width: `${Math.round((done / data.length) * 100)}%` }}
        />
      </span>
    </span>
  );
}

export function SortableTaskCard({
  task,
  onClick,
  action,
}: {
  task: CardTask;
  onClick: () => void;
  action?: ReactNode;
}) {
  // PR 4 (Slice B2): gate the drag source on the server-emitted
  // `puede_editar`. dnd-kit's `useSortable({ disabled })` blocks BOTH
  // pointer and keyboard reordering for the same node, so a single prop
  // covers both interaction modes. The card body still renders (the
  // COLABORADOR must be able to OPEN the task to read it) — only the
  // drag affordance is taken away.
  //
  // `data-dnd-disabled` is the test-observable signal for the gate; the
  // `aria-disabled` below is the same fact for assistive tech.
  const puedeEditar = task.puede_editar !== false;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task:${task.id}`,
    disabled: !puedeEditar,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      data-dnd-disabled={puedeEditar ? "false" : "true"}
      aria-disabled={!puedeEditar}
      className={cn(isDragging && "opacity-30")}
    >
      <TaskCard task={task} onClick={onClick} action={action} />
    </div>
  );
}