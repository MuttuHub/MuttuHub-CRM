// Vista principal del Tablero Kanban (PRD §5): control de alcance (Mi tabla
// / Equipo completo, persistido en localStorage), tabs Tablero | Lista |
// Reporte, filtros, drag & drop con optimismo (rollback + toast "No pudimos
// mover la tarea.") y diálogo de tarea compartido.
//
// Nota de alcance del API (Hito 3): el listado acepta q/cliente/responsable/
// estado/origen/vencidas. Los filtros de prioridad, etiqueta y rango de
// fecha que pide el PRD se aplican en el cliente sobre la página cargada
// (límite 100) — no hay parámetros de servidor para ellos todavía.

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Eye,
  FileSpreadsheet,
  Plus,
  Printer,
  RotateCcw,
  SquareKanban,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { EstadoTarea, PrioridadTarea } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ENUM_VALUES,
  ESTADO_TAREA_LABELS,
  PRIORIDAD_TAREA_LABELS,
  TASK_TAGS,
} from "@/lib/catalogs";
import { esVencida, formatFecha, iniciales, useUsers, type TaskListResponse } from "@/hooks/crm";
import { PrioridadChip, ToneBadge } from "@/components/crm/shared";
import {
  applyLocalFilters,
  buildTaskQueryString,
  taskQueryKeys,
  useClientOptions,
  useCurrentUser,
  useMoveTask,
  useTasks,
  type TaskFilters,
} from "@/hooks/kanban";
import { TaskCard, SortableTaskCard, type CardTask } from "@/components/kanban/task-card";
import { TaskDialog } from "@/components/kanban/task-dialog";
import { ReportView } from "@/components/kanban/report-view";
import { SinConexionCard } from "@/components/shared/sin-conexion-card";

// True when the Supabase env vars are missing (dev-only signal): the API
// returns 500 "Plataforma no configurada" — show the technical card.
const unconfigured =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Columnas visibles en el tablero en el orden del PRD §5.1; CANCELADA se
// mantiene oculta aquí y aparece en Lista/Reporte.
const BOARD_COLUMNS: EstadoTarea[] = [
  "POR_HACER",
  "EN_CURSO",
  "EN_REVISION",
  "BLOQUEADA",
  "EN_ESPERA",
  "COMPLETADA",
];

const SCOPE_KEY = "muttu:kanban:scope";
type Scope = "mis" | "equipo";
type View = "tablero" | "lista" | "reporte";

const VISTAS: { value: View; label: string }[] = [
  { value: "tablero", label: "Tablero" },
  { value: "lista", label: "Lista" },
  { value: "reporte", label: "Reporte" },
];

export function KanbanBoard() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>(() => {
    if (typeof window === "undefined") return "mis";
    return localStorage.getItem(SCOPE_KEY) === "equipo" ? "equipo" : "mis";
  });
  const [view, setView] = useState<View>("tablero");
  const [cliente, setCliente] = useState<string>("");
  const [responsableEquipo, setResponsableEquipo] = useState<string>("");
  const [local, setLocal] = useState({
    prioridad: "" as PrioridadTarea | "",
    etiqueta: "",
    desde: "",
    hasta: "",
  });
  const [dialogTaskId, setDialogTaskId] = useState<string | null | "nueva">(null);
  const [draggedTask, setDraggedTask] = useState<CardTask | null>(null);

  const meQuery = useCurrentUser();
  const me = meQuery.data;
  const canEquipo = me == null || me.rol !== "COLABORADOR";

  useEffect(() => {
    localStorage.setItem(SCOPE_KEY, scope);
  }, [scope]);

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];
  const clientOptionsQuery = useClientOptions();
  const clients = clientOptionsQuery.data ?? [];

  /* Params que sí soporta el servidor (scope "mis" = responsable = yo). */
  const serverParams: TaskFilters = useMemo(() => {
    const responsable = scope === "mis" ? me?.id : undefined;
    return {
      cliente: cliente || undefined,
      responsable: scope === "equipo" ? responsableEquipo || undefined : responsable,
      limit: 100,
    };
  }, [scope, cliente, responsableEquipo, me?.id]);

  const tasksQuery = useTasks(serverParams);
  const items = useMemo(
    () => applyLocalFilters(tasksQuery.data?.items ?? [], local),
    [tasksQuery.data, local],
  );

  const moveMutation = useMoveTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const localActive = local.prioridad !== "" || local.etiqueta !== "" || local.desde !== "" || local.hasta !== "" || cliente !== "" || responsableEquipo !== "";

  /* ── Drag & drop: optimismo + PATCH status con rollback ── */
  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (!id.startsWith("task:")) return;
    const task = items.find((t) => t.id === id.slice(5));
    setDraggedTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggedTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId.startsWith("task:")) return;

    const taskId = activeId.slice(5);
    const task = items.find((t) => t.id === taskId);
    if (!task) return;

    const targetColumn =
      overId.startsWith("col:") ? overId.slice(4)
      : overId.startsWith("task:")
        ? (items.find((t) => t.id === overId.slice(5))?.estado ?? null)
        : null;
    if (!targetColumn || targetColumn === task.estado) return;

    const desde = task.estado;
    void qc.setQueryData<TaskListResponse>(taskQueryKeys.list(serverParams), (old) =>
      old ? { ...old, items: old.items.map((t) => (t.id === taskId ? { ...t, estado: targetColumn as EstadoTarea } : t)) } : old,
    );
    moveMutation
      .mutateAsync({ taskId, estado: targetColumn as EstadoTarea })
      .catch(() => {
        void qc.setQueryData<TaskListResponse>(taskQueryKeys.list(serverParams), (old) =>
          old ? { ...old, items: old.items.map((t) => (t.id === taskId ? { ...t, estado: desde } : t)) } : old,
        );
        toast.error("No pudimos mover la tarea.");
      });
  }

  /* ── Acciones de cabecera ── */
  function exportExcel() {
    const qs = buildTaskQueryString(serverParams);
    void descargarExcel(`/api/v1/tasks/export?${qs}`);
  }

  function openPrint() {
    const sp = new URLSearchParams();
    sp.set("rango", "month");
    if (scope === "equipo") {
      if (responsableEquipo) sp.set("responsable", responsableEquipo);
    } else if (me?.id) {
      sp.set("responsable", me.id);
    }
    if (cliente) sp.set("cliente", cliente);
    window.open(`/print/reportes/tareas?${sp.toString()}`, "_blank", "noopener");
  }

  function clearFilters() {
    setResponsableEquipo("");
    setCliente("");
    setLocal({ prioridad: "", etiqueta: "", desde: "", hasta: "" });
  }

  // Los filtros locales se aplican en vivo sobre la página cargada; un rango
  // inválido (desde > hasta) no se aplica y avisa — evita el "sin resultados"
  // silencioso.
  function applyLocalFilter(patch: Partial<typeof local>) {
    const next = { ...local, ...patch };
    if (next.desde && next.hasta && next.desde > next.hasta) {
      toast.error("La fecha final no puede ser anterior a la inicial.");
      return;
    }
    setLocal(next);
  }

  const columns: Record<EstadoTarea, CardTask[]> = useMemo(() => {
    const grouped: Record<EstadoTarea, CardTask[]> = {
      POR_HACER: [],
      EN_CURSO: [],
      EN_REVISION: [],
      BLOQUEADA: [],
      EN_ESPERA: [],
      COMPLETADA: [],
      CANCELADA: [],
    };
    for (const task of items) {
      (grouped[task.estado] ??= []).push(task);
    }
    return grouped;
  }, [items]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Alcance: Mi tablero / Equipo (solo roles con alcance amplio) */}
      {canEquipo && (
        <div className="flex items-center gap-2 self-end">
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as Scope)}
            options={[
              { value: "mis", label: "Mi tablero" },
              { value: "equipo", label: "Equipo completo" },
            ]}
          />
        </div>
      )}

      {/* Tabs Tablero / Lista / Reporte */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={(v) => setView(v as View)}
          options={VISTAS}
          className="w-full max-w-md"
        />

        {view === "tablero" || view === "lista" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setDialogTaskId("nueva")}
              className="h-9 rounded-lg px-4 font-bold"
            >
              <Plus className="size-4" strokeWidth={2} />
              Nueva tarea
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportExcel()}
              className="h-9 rounded-lg border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
            >
              <FileSpreadsheet className="size-4 text-exito" strokeWidth={1.8} />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openPrint}
              className="h-9 rounded-lg border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 hover:bg-ink-100"
            >
              <Printer className="size-4 text-ink-600" strokeWidth={1.8} />
              Imprimir
            </Button>
          </div>
        ) : null}
      </div>

      {/* Filtros */}
      {view === "tablero" || view === "lista" ? (
        <FiltersRow
          scope={scope}
          canEquipo={canEquipo}
          responsable={responsableEquipo}
          cliente={cliente}
          local={local}
          users={users}
          clients={clients}
          onResponsable={setResponsableEquipo}
          onCliente={setCliente}
          onLocal={applyLocalFilter}
          onClear={clearFilters}
          hasActive={localActive}
        />
      ) : null}

      {/* Contenido */}
      {view === "reporte" ? (
        <ReportView
          responsable={scope === "mis" ? me?.id ?? undefined : responsableEquipo || undefined}
          cliente={cliente || undefined}
          misTareas={scope === "mis"}
        />
      ) : tasksQuery.isError ? (
        <SinConexionCard unconfigured={unconfigured} onRetry={() => void tasksQuery.refetch()} />
      ) : tasksQuery.isLoading ? (
        <BoardSkeleton vista={view === "lista" ? "lista" : "board"} />
      ) : items.length === 0 ? (
        <TableroVacio vista={view === "lista" ? "lista" : "tablero"} />
      ) : view === "tablero" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-3">
            {BOARD_COLUMNS.map((estado) => (
              <BoardColumn
                key={estado}
                estado={estado}
                tareas={columns[estado]}
                onOpen={(id) => setDialogTaskId(id)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {draggedTask ? (
              <div className="w-[240px]">
                <TaskCard task={draggedTask} overlay onClick={() => undefined} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <ListaView items={items} onOpen={(id) => setDialogTaskId(id)} />
      )}

      {dialogTaskId !== null && (
        <TaskDialog
          taskId={dialogTaskId === "nueva" ? null : dialogTaskId}
          onClose={() => setDialogTaskId(null)}
          users={users}
          clients={clients}
        />
      )}
    </div>
  );
}

/* ── Columna del tablero (droppable) ───────────────────────────────────── */

function BoardColumn({
  estado,
  tareas,
  onOpen,
}: {
  estado: EstadoTarea;
  tareas: CardTask[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${estado}` });
  const label = ESTADO_TAREA_LABELS[estado]?.label ?? estado;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[248px] shrink-0 flex-col rounded-[18px] border border-ink-200 bg-ink-100/70 p-2.5 transition-colors",
        isOver && "border-rose-200 bg-rose-50/70 ring-2 ring-rose-200",
      )}
    >
      <div className="flex items-center justify-between px-1.5 pb-2">
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", dotTone(estado))} />
          <span className="text-[12.5px] font-bold text-ink-800">{label}</span>
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] font-bold text-ink-600 tabular-nums">
          {tareas.length}
        </span>
      </div>
      <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto pb-1">
        <SortableContext items={tareas.map((t) => `task:${t.id}`)} strategy={verticalListSortingStrategy}>
          {tareas.map((t) => (
            <SortableTaskCard key={t.id} task={t} onClick={() => onOpen(t.id)} />
          ))}
          {tareas.length === 0 && (
            <p className="py-6 text-center text-[11.5px] text-ink-600">Sin tareas</p>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function dotTone(estado: EstadoTarea): string {
  switch (estado) {
    case "POR_HACER": return "bg-ink-300";
    case "EN_CURSO": return "bg-rose-500";
    case "EN_REVISION": return "bg-alerta";
    case "BLOQUEADA": return "bg-destructivo";
    case "EN_ESPERA": return "bg-info";
    case "COMPLETADA": return "bg-exito";
    default: return "bg-ink-300";
  }
}

/* ── Vista lista ───────────────────────────────────────────────────────── */

function ListaView({ items, onOpen }: { items: CardTask[]; onOpen: (id: string) => void }) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-ink-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 text-left">
              {["Título", "Responsable", "Cliente", "Estado", "Prioridad", "Fecha entrega", "Etiquetas", ""].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr
                key={t.id}
                onClick={() => onOpen(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(t.id);
                  }
                }}
                tabIndex={0}
                className="cursor-pointer border-t border-ink-200 first:border-t-0 hover:bg-rose-50/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 outline-none"
              >
                <td className="px-5 py-3 font-semibold text-ink-950">{t.titulo}</td>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2 text-[12.5px] text-ink-700">
                    <span className="grid size-6 place-items-center rounded-[8px] bg-ink-100 text-[9.5px] font-bold text-ink-700">
                      {iniciales(t.responsable_nombre)}
                    </span>
                    {t.responsable_nombre}
                  </span>
                </td>
                <td className="px-5 py-3 text-[12.5px] text-ink-700">{t.cliente_nombre ?? "—"}</td>
                <td className="px-5 py-3">
                  <ToneBadge
                    tone={ESTADO_TAREA_LABELS[t.estado]?.tone ?? "neutro"}
                    label={ESTADO_TAREA_LABELS[t.estado]?.label ?? t.estado}
                  />
                </td>
                <td className="px-5 py-3">
                  <PrioridadChip prioridad={t.prioridad} />
                </td>
                <td className="px-5 py-3">
                  <FechaCell fecha={t.fecha_entrega} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {t.etiquetas.slice(0, 2).map((etq) => (
                      <span
                        key={etq}
                        className="inline-flex h-[20px] items-center rounded-full bg-ink-100 px-2 text-[10.5px] font-semibold text-ink-700"
                      >
                        {etq}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="grid size-7 place-items-center rounded-10 text-ink-500 hover:bg-rose-50 hover:text-rose-700">
                    <Eye className="size-4" strokeWidth={1.8} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FechaCell({ fecha }: { fecha: string | null }) {
  if (!fecha) return <span className="text-[12.5px] text-ink-500">Sin fecha</span>;
  return (
    <span
      className={cn(
        "font-mono text-[12px] tabular-nums",
        esVencida(fecha) ? "font-bold text-destructivo" : "text-ink-700",
      )}
    >
      {formatFecha(fecha)}
    </span>
  );
}

/* ── Fila de filtros ───────────────────────────────────────────────────── */

type LocalState = { prioridad: PrioridadTarea | ""; etiqueta: string; desde: string; hasta: string };

type FiltersRowProps = {
  scope: Scope;
  canEquipo: boolean;
  responsable: string;
  cliente: string;
  local: LocalState;
  users: { id: string; nombre: string }[];
  clients: { id: string; nombre: string }[];
  onResponsable: (id: string) => void;
  onCliente: (id: string) => void;
  onLocal: (patch: Partial<LocalState>) => void;
  hasActive: boolean;
  onClear: () => void;
};

const SEL_CLASS = "h-9 w-full rounded-12 border-ink-200 bg-white px-3 text-[12.5px]";

// FiltersRow real (definida debajo)

function FiltersRow(props: FiltersRowProps) {
  const { scope, canEquipo, responsable, cliente, local, users, clients, onResponsable, onCliente, onLocal, hasActive, onClear } = props;
  return (
    <section className="rounded-[20px] border border-ink-200 bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {scope === "equipo" && canEquipo && (
          <Select value={responsable} onValueChange={(v) => onResponsable(v === "todos" ? "" : (v ?? ""))}>
            <SelectTrigger className={cn(SEL_CLASS, "min-w-[160px]")}>
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los responsables</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={cliente} onValueChange={(v) => onCliente(v === "todos" ? "" : (v ?? ""))}>
          <SelectTrigger className={cn(SEL_CLASS, "min-w-[170px]")}>
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los clientes</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={local.prioridad as string} onValueChange={(v) => onLocal({ prioridad: v === "todas" ? "" : (v as PrioridadTarea) })}>
          <SelectTrigger className={cn(SEL_CLASS, "min-w-[130px]")}>
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda prioridad</SelectItem>
            {ENUM_VALUES.PrioridadTarea.map((p) => (
              <SelectItem key={p} value={p}>{PRIORIDAD_TAREA_LABELS[p as PrioridadTarea].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={local.etiqueta} onValueChange={(v) => onLocal({ etiqueta: v === "todas" ? "" : (v ?? "") })}>
          <SelectTrigger className={cn(SEL_CLASS, "min-w-[150px]")}>
            <SelectValue placeholder="Etiqueta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las etiquetas</SelectItem>
            {TASK_TAGS.map((etq) => (
              <SelectItem key={etq} value={etq}>{etq}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="kanban-desde" className="sr-only">Entrega desde</Label>
          <Input id="kanban-desde" type="date" value={local.desde} onChange={(e) => onLocal({ desde: e.target.value })} aria-label="Entrega desde" className="h-9 w-[148px] rounded-12 border-ink-200 bg-white px-3 text-[12px]" />
          <span className="text-[12px] text-ink-500">a</span>
          <Label htmlFor="kanban-hasta" className="sr-only">Entrega hasta</Label>
          <Input id="kanban-hasta" type="date" value={local.hasta} onChange={(e) => onLocal({ hasta: e.target.value })} aria-label="Entrega hasta" className="h-9 w-[148px] rounded-12 border-ink-200 bg-white px-3 text-[12px]" />
        </div>
      </div>
      {hasActive && (
        <div className="mt-2.5 flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={onClear} className="h-8 px-2 text-[12.5px] font-semibold text-ink-600">
            <RotateCcw className="size-3" strokeWidth={1.9} />
            Limpiar filtros
          </Button>
        </div>
      )}
    </section>
  );
}

/* Segmented control genérico */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 rounded-lg bg-ink-100 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "flex-1 rounded-[9px] px-3 py-1.5 text-[12px] font-bold whitespace-nowrap transition-colors",
            value === o.value ? "bg-white text-ink-950 shadow-sm" : "text-ink-600 hover:text-ink-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Estados: vacío / skeleton ─────────────────────────────────────────── */

function TableroVacio({ vista }: { vista: "tablero" | "lista" }) {
  return (
    <section className="grid min-h-[320px] place-items-center rounded-[24px] border border-ink-200 bg-white p-8">
      <div className="max-w-[44ch] text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700">
          <SquareKanban className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          Tablero vacío
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">
          {vista === "tablero"
            ? "Crea la primera tarea o ajusta los filtros para ver las tarjetas."
            : "No hay tareas que coincidan con los filtros de la lista."}
        </p>
      </div>
    </section>
  );
}

function BoardSkeleton({ vista }: { vista: "board" | "lista" }) {
  if (vista === "lista") {
    return (
      <section className="rounded-[22px] border border-ink-200 bg-white p-5">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-12" />
          ))}
        </div>
      </section>
    );
  }
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-[248px] shrink-0 space-y-2 rounded-[18px] bg-ink-100/70 p-2.5">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 2 }).map((_, j) => (
            <Skeleton key={j} className="h-[110px] w-full rounded-14" />
          ))}
        </div>
      ))}
    </div>
  );
}

async function descargarExcel(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      let msg = "No pudimos generar el archivo.";
      try {
        const body = (await res.json()) as { error?: string };
        msg = body.error ?? msg;
      } catch {
        /* mensaje por defecto */
      }
      toast.error(msg);
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "tareas.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    toast.success("Exportación completada: tareas.xlsx");
  } catch {
    toast.error("No pudimos generar el archivo.");
  }
}