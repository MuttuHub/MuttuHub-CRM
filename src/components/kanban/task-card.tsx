// Tarjeta de tarea del tablero (PRD §5.2): título, chips de prioridad/
// etiquetas/cliente, avatar del responsable, fecha de entrega (vencida en
// rojo), conteo de subtareas y banner de bloqueo. Es el item dnd a la
// vez (useSortable). El conteo de subtareas llega agregado en el listado
// (subtotal, una sola query para todo el tablero); el detalle con
// completadas/total se resuelve bajo demanda en el diálogo.

"use client";

import { CalendarDays, Hexagon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EstadoTarea } from "@prisma/client";
import { cn } from "@/lib/utils";
import { esVencida, formatFecha, iniciales } from "@/hooks/crm";
import { useSubtareas } from "@/hooks/kanban";
import { PrioridadChip } from "@/components/crm/shared";

export type CardTask = {
  id: string;
  titulo: string;
  estado: EstadoTarea;
  prioridad: "ALTA" | "MEDIA" | "BAJA" | null;
  etiquetas: string[];
  cliente_nombre: string | null;
  responsable_nombre: string;
  fecha_entrega: string | null;
  motivo_bloqueo: string | null;
  subtotal?: number;
};

export function TaskCard({
  task,
  overlay = false,
  onClick,
}: {
  task: CardTask;
  overlay?: boolean;
  onClick: () => void;
}) {
  const bloqueada = task.estado === "BLOQUEADA";

  return (
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
        "group relative cursor-pointer rounded-14 border border-ink-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md",
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
          <span className="inline-flex h-[20px] items-center rounded-full bg-rose-100 px-2 text-[10.5px] font-semibold text-rose-700">
            <Hexagon className="mr-1 size-2.5" strokeWidth={1.8} />
            {task.cliente_nombre}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <TaskDate fecha={task.fecha_entrega} />
        </div>
        <span className="grid size-6 shrink-0 place-items-center rounded-[8px] bg-ink-100 text-[9.5px] font-bold text-ink-700">
          {iniciales(task.responsable_nombre)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <SubtaskBadge task={task} />
        {bloqueada && (
          <span className="max-w-[14rem] truncate rounded-[8px] bg-alerta-bg px-2 py-1 text-[10.5px] font-bold text-alerta">
            Bloqueada: {task.motivo_bloqueo || "sin motivo"}
          </span>
        )}
      </div>
    </div>
  );
}

function TaskDate({ fecha }: { fecha: string | null }) {
  if (!fecha) {
    return (
      <span className="inline-flex h-[20px] items-center rounded-full bg-ink-100 px-2 text-[10.5px] font-semibold text-ink-600">
        <Hexagon className="mr-1 size-2.5" strokeWidth={1.8} />
        Sin fecha
      </span>
    );
  }
  const vencida = esVencida(fecha);
  return (
    <span
      className={cn(
        "inline-flex h-[20px] items-center gap-1 rounded-full px-2 font-mono text-[10.5px] font-semibold tabular-nums",
        vencida ? "bg-destructivo-bg text-destructivo" : "bg-ink-100 text-ink-700",
      )}
    >
      <CalendarDays className="size-2.5" strokeWidth={1.8} />
      {formatFecha(fecha)}
      {vencida && <b>· vencido</b>}
    </span>
  );
}

function SubtaskBadge({ task }: { task: CardTask }) {
  if (task.subtotal !== undefined) {
    return <SubtotalChip subtotal={task.subtotal} />;
  }
  return <LiveSubtaskBadge taskId={task.id} />;
}

function SubtotalChip({ subtotal }: { subtotal: number }) {
  if (subtotal === 0) return null;
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
}: {
  task: CardTask;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task:${task.id}`,
    // Orden de la columna COMPLETADA no se persiste: solo se puede entrar,
    // no reordenar dentro.
    disabled: task.estado === "COMPLETADA",
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
      className={cn(isDragging && "opacity-30")}
    >
      <TaskCard task={task} onClick={onClick} />
    </div>
  );
}