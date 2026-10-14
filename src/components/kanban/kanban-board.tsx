// Vista principal del Tablero Kanban (PRD §5): tablero global (todas las
// tareas de la organización, para todos los roles, sin toggle de alcance),
// tabs Tablero | Lista | Reporte, filtros, drag & drop con optimismo
// (rollback + toast "No pudimos mover la tarea.") y diálogo de tarea
// compartido.
//
// Nota de alcance del API (Hito 3): el listado acepta q/cliente/responsable/
// estado/origen/vencidas. Los filtros de prioridad, etiqueta y rango de
// fecha que pide el PRD se aplican en el cliente sobre la página cargada
// (límite 100) — no hay parámetros de servidor para ellos todavía.

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ChevronDown,
  Eye,
  FileSpreadsheet,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  SquareKanban,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { EstadoTarea, PrioridadTarea } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ENUM_VALUES,
  ESTADO_TAREA_LABELS,
  PRIORIDAD_TAREA_LABELS,
  TASK_TAGS,
} from "@/lib/catalogs";
import { esVencida, formatFecha, iniciales, useUsers, type TaskItem, type TaskListResponse } from "@/hooks/crm";
import { PrioridadChip, ToneBadge } from "@/components/crm/shared";
import {
  buildTaskQueryString,
  taskQueryKeys,
  useClientOptions,
  useCurrentUser,
  useMoveTask,
  useTasks,
  type TaskFilters,
} from "@/hooks/kanban";
import { useEligibleOpportunities } from "@/hooks/projects";
import { canCreateProject } from "@/lib/permissions";
import { TaskCard, SortableTaskCard, type CardTask } from "@/components/kanban/task-card";
import {
  BOARD_ESTADOS,
  BOARD_PILLS,
  cardAction,
  filterByPill,
  groupByColumn,
  type BoardPill,
  type CardAction,
} from "@/components/kanban/board-logic";
import { TaskDialog } from "@/components/kanban/task-dialog";
import { ReportView } from "@/components/kanban/report-view";
import { TruncationBanner } from "@/components/kanban/truncation-banner";
import { SinConexionCard } from "@/components/shared/sin-conexion-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// True when the Supabase env vars are missing (dev-only signal): the API
// returns 500 "Plataforma no configurada" — show the technical card.
const unconfigured =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type View = "tablero" | "lista" | "reporte";

const VISTAS: { value: View; label: string }[] = [
  { value: "tablero", label: "Tablero" },
  { value: "lista", label: "Lista" },
  { value: "reporte", label: "Reporte" },
];

// PR 7: useTasks ahora devuelve InfiniteData<TaskListResponse>. El helper
// de optimism actualiza el ítem por id a través de TODAS las páginas
// acumuladas (un solo mapa por set; defensa barata si la tarea aparece
// duplicada entre páginas).
function patchItemInPages(
  old: InfiniteData<TaskListResponse> | undefined,
  taskId: string,
  patch: (task: TaskItem) => TaskItem,
): InfiniteData<TaskListResponse> | undefined {
  if (!old) return old;
  let patched = false;
  const pages = old.pages.map((page) => {
    if (patched) return page;
    const idx = page.items.findIndex((t) => t.id === taskId);
    if (idx === -1) return page;
    patched = true;
    const items = page.items.slice();
    items[idx] = patch(items[idx]!);
    return { ...page, items };
  });
  return { ...old, pages };
}

export function KanbanBoard() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("tablero");
  // v7 filter pills (Todas / Prospección / Ejecución / Mías).
  const [pill, setPill] = useState<BoardPill>("todas");
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  // Announced via the sr-only live region when a sortable lands on a new
  // column (keyboard drags have no visual trail for the screen reader).
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  // A drop (pointer or keyboard) onto BLOQUEADA doesn't move the task right
  // away: the API requires a motivo_bloqueo (BUG: dragging straight into
  // BLOQUEADA always failed with "Indica un motivo para bloquear." — the
  // board never asked for one). This holds the pending drop while we do.
  const [blockPrompt, setBlockPrompt] = useState<{
    taskId: string;
    desde: EstadoTarea;
  } | null>(null);
  const [blockMotivo, setBlockMotivo] = useState("");

  // Limpieza: el toggle Mi tablero/Equipo completo se eliminó — el tablero
  // es global para todos los roles.
  useEffect(() => {
    try {
      localStorage.removeItem("muttu:kanban:scope");
    } catch {
      /* noop */
    }
  }, []);

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];
  const clientOptionsQuery = useClientOptions();
  const clients = clientOptionsQuery.data ?? [];
  const meQuery = useCurrentUser();
  const me = meQuery.data ?? null;
  // GANADA opportunities with no project yet: the cards of their completed
  // tasks offer "Pasar a nuevo proyecto →". Only managers may read the list
  // (the endpoint 403s for everyone else), so it stays off for them.
  const puedeCrearProyecto = me ? canCreateProject({ id: me.id, rol: me.rol }) : false;
  const eligiblesQuery = useEligibleOpportunities({ enabled: puedeCrearProyecto });
  const eligibleIds = useMemo(
    () => new Set((eligiblesQuery.data ?? []).map((o) => o.id)),
    [eligiblesQuery.data],
  );

  /* Params que sí soporta el servidor. PR 6: prioridad / etiqueta /
     fecha_entrega_* pasaron del cliente al servidor — el `local` state del
     tablero se mapea a los nombres de parámetro que parseTaskFilters
     acepta (fecha_entrega_desde / fecha_entrega_hasta) para no romper los
     ids de los inputs. */
  const serverParams: TaskFilters = useMemo(
    () => ({
      cliente: cliente || undefined,
      // "Mías" is resolved on the server so the truncation banner stays honest.
      responsable: (pill === "mias" ? me?.id : responsableEquipo) || undefined,
      prioridad: local.prioridad || undefined,
      etiqueta: local.etiqueta || undefined,
      fecha_entrega_desde: local.desde || undefined,
      fecha_entrega_hasta: local.hasta || undefined,
      limit: 100,
    }),
    [cliente, responsableEquipo, pill, me?.id, local.prioridad, local.etiqueta, local.desde, local.hasta],
  );

  const tasksQuery = useTasks(serverParams);
  // PR 7 (close-phase-1): useInfiniteQuery devuelve { pages }. Flatten
  // dentro de un useMemo para no recrear el array cada render — la
  // memoización de `columns` (grouping por estado) descubrió en PR 6 que
  // derivar aquí sin memo rompe el re-render de DnD.
  const items = useMemo(
    () => tasksQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [tasksQuery.data],
  );
  // Total excluye prioridad/etiqueta/fecha_entrega_* (D7) — es lo que
  // permite que el banner "Mostrando N de M" sea honesto sobre truncado.
  // Cada página trae el mismo `total`; tomamos el último para no depender
  // del orden de carga.
  const total =
    tasksQuery.data?.pages[tasksQuery.data.pages.length - 1]?.total ?? 0;
  const hasNextPage = tasksQuery.hasNextPage;
  const isFetchingNextPage = tasksQuery.isFetchingNextPage;

  const moveMutation = useMoveTask();
  // Pointer keeps the existing activation constraint; KeyboardSensor turns
  // the sortable cards into Space/Enter draggables moved with the arrows
  // (same sorting code path, so pointer behavior is untouched).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const localActive = local.prioridad !== "" || local.etiqueta !== "" || local.desde !== "" || local.hasta !== "" || cliente !== "" || responsableEquipo !== "";

  /* ── Drag & drop: optimismo + PATCH status con rollback ── */
  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (!id.startsWith("task:")) return;
    const task = items.find((t) => t.id === id.slice(5));
    setDraggedTask(task ?? null);
  }

  // Shared by the direct drop path and the BLOQUEADA-confirm dialog: applies
  // the optimistic move, announces it, and rolls back + toasts on failure.
  function commitMove(taskId: string, desde: EstadoTarea, estado: EstadoTarea, motivo_bloqueo?: string) {
    setMoveAnnouncement(`Tarea movida a ${ESTADO_TAREA_LABELS[estado]?.label ?? estado}`);
    void qc.setQueryData<InfiniteData<TaskListResponse>>(taskQueryKeys.list(serverParams), (old) =>
      patchItemInPages(old, taskId, (t) => ({ ...t, estado })),
    );
    moveMutation
      .mutateAsync({ taskId, estado, motivo_bloqueo })
      .catch(() => {
        void qc.setQueryData<InfiniteData<TaskListResponse>>(taskQueryKeys.list(serverParams), (old) =>
          patchItemInPages(old, taskId, (t) => ({ ...t, estado: desde })),
        );
        // BUG FIX: the optimistic announcement above already told screen
        // readers the move succeeded. On rollback, correct it — otherwise a
        // screen-reader user gets a false "movida" with no follow-up, while
        // sighted users at least see the error toast.
        setMoveAnnouncement(
          `No se pudo mover la tarea, se restauró a ${ESTADO_TAREA_LABELS[desde]?.label ?? desde}`,
        );
        toast.error("No pudimos mover la tarea.");
      });
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
    if (targetColumn === "BLOQUEADA") {
      // BUG fix: the API requires a motivo_bloqueo when entering BLOQUEADA
      // (src/app/api/v1/tasks/[id]/status/route.ts) — dropping straight in
      // used to always fail with "Indica un motivo para bloquear." Ask for
      // the reason first; nothing moves (optimistically or for real) until
      // it's confirmed.
      setBlockMotivo("");
      setBlockPrompt({ taskId, desde });
      return;
    }

    commitMove(taskId, desde, targetColumn as EstadoTarea);
  }

  function confirmBlock() {
    if (!blockPrompt || !blockMotivo.trim()) return;
    commitMove(blockPrompt.taskId, blockPrompt.desde, "BLOQUEADA", blockMotivo.trim());
    setBlockPrompt(null);
  }

  /* ── Acciones de cabecera ── */
  function exportExcel() {
    const qs = buildTaskQueryString(serverParams);
    void descargarExcel(`/api/v1/tasks/export?${qs}`);
  }

  function openPrint() {
    const sp = new URLSearchParams();
    sp.set("rango", "month");
    if (responsableEquipo) sp.set("responsable", responsableEquipo);
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

  const columns = useMemo(
    () => groupByColumn(filterByPill(items, pill, me?.id ?? null)),
    [items, pill, me?.id],
  );

  function handleCardAction(task: CardTask, action: CardAction) {
    if (action.kind === "advance") commitMove(task.id, task.estado, action.to);
  }

  function actionFor(task: CardTask) {
    const action = cardAction(task, eligibleIds);
    return action ? <CardActionView action={action} onRun={() => handleCardAction(task, action)} /> : undefined;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* v7 header: filter pills, right-aligned. The page title lives in the
          app shell header, so it is not repeated here. */}
      {view === "tablero" || view === "lista" ? (
        <div role="group" aria-label="Filtrar tareas" className="flex flex-wrap gap-2 sm:justify-end">
          {BOARD_PILLS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={pill === p.value}
              onClick={() => setPill(p.value)}
              className={cn(
                "h-10 rounded-full border px-4 text-[14px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                pill === p.value
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-border-strong bg-transparent text-ink-800 hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Secondary tools kept from the previous board: Lista / Reporte views,
          new task, exports and the advanced filters. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={(v) => setView(v as View)}
          options={VISTAS}
          className="w-full max-w-xs"
        />

        {view === "tablero" || view === "lista" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-expanded={filtersOpen || localActive}
              onClick={() => setFiltersOpen((open) => !open)}
              className="px-3.5 text-[13px] font-semibold text-ink-800"
            >
              <SlidersHorizontal className="size-4 text-ink-600" strokeWidth={1.8} />
              Filtros
              {localActive ? <span className="size-1.5 rounded-full bg-rose-500" aria-label="Filtros activos" /> : null}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportExcel()}
              className="px-3.5 text-[13px] font-semibold text-ink-800"
            >
              <FileSpreadsheet className="size-4 text-exito" strokeWidth={1.8} />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openPrint}
              className="px-3.5 text-[13px] font-semibold text-ink-800"
            >
              <Printer className="size-4 text-ink-600" strokeWidth={1.8} />
              Imprimir
            </Button>
            <Button
              size="sm"
              onClick={() => setDialogTaskId("nueva")}
              className="px-4 font-bold"
            >
              <Plus className="size-4" strokeWidth={2} />
              Nueva tarea
            </Button>
          </div>
        ) : null}
      </div>

      {/* Filtros avanzados (colapsados por defecto, visibles si hay alguno activo) */}
      {(view === "tablero" || view === "lista") && (filtersOpen || localActive) ? (
        <FiltersRow
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
          responsable={responsableEquipo || undefined}
          cliente={cliente || undefined}
        />
      ) : tasksQuery.isError ? (
        <SinConexionCard unconfigured={unconfigured} onRetry={() => void tasksQuery.refetch()} />
      ) : tasksQuery.isLoading ? (
        <BoardSkeleton vista={view === "lista" ? "lista" : "board"} />
      ) : items.length === 0 ? (
        <TableroVacio vista={view === "lista" ? "lista" : "tablero"} />
      ) : (
        <>
          {/* PR 6: banner de truncado — solo cuando items.length < total. El
              total excluye prioridad/etiqueta/fecha_entrega_*, así que cuando
              se aplica alguno de esos filtros el banner aparece aunque la
              página no esté "llena". */}
          <TruncationBanner shown={items.length} total={total} />
          {view === "tablero" ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <p role="status" aria-live="polite" className="sr-only">
                {moveAnnouncement}
              </p>
              {/* v7: 7 columnas de 264 px con scroll lateral arriba de lg, grupos
                  apilados debajo — mismo DOM, mismo SortableContext. La séptima
                  ("Nuevo proyecto") es derivada y no recibe drops. */}
              <div className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-start lg:overflow-x-auto">
                {BOARD_ESTADOS.map((estado) => (
                  <BoardColumn
                    key={estado}
                    estado={estado}
                    tareas={columns[estado]}
                    onOpen={(id) => setDialogTaskId(id)}
                    actionFor={actionFor}
                  />
                ))}
                <ProjectColumn
                  tareas={columns.NUEVO_PROYECTO}
                  onOpen={(id) => setDialogTaskId(id)}
                  actionFor={actionFor}
                />
              </div>
              <DragOverlay dropAnimation={null}>
                {draggedTask ? (
                  <div className="w-[264px]">
                    <TaskCard task={draggedTask} overlay onClick={() => undefined} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <ListaView items={items} onOpen={(id) => setDialogTaskId(id)} />
          )}
          {/* PR 7: "Cargar más" reemplaza el tope silencioso de 100. Botón
              explícito (no IntersectionObserver) para que el scroll listener
              no pelee con los handlers de @dnd-kit (D8). Desaparece cuando
              useInfiniteQuery ya no tiene próxima página. */}
          {hasNextPage ? (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void tasksQuery.fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-4 text-[12.5px] font-semibold text-ink-800"
                data-testid="kanban-load-more"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
                ) : (
                  <ChevronDown className="size-4" strokeWidth={1.8} />
                )}
                {isFetchingNextPage ? "Cargando…" : "Cargar más"}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {dialogTaskId !== null && (
        <TaskDialog
          taskId={dialogTaskId === "nueva" ? null : dialogTaskId}
          onClose={() => setDialogTaskId(null)}
          users={users}
          clients={clients}
        />
      )}

      <Dialog
        open={blockPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setBlockPrompt(null);
        }}
      >
        <DialogContent className="sm:max-w-[min(420px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
              Bloquear tarea
            </DialogTitle>
            <DialogDescription>
              Indica por qué queda bloqueada antes de moverla.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kanban-block-motivo">
              Motivo del bloqueo <span className="text-rose-500">*</span>
            </Label>
            <textarea
              id="kanban-block-motivo"
              autoFocus
              rows={2}
              value={blockMotivo}
              onChange={(e) => setBlockMotivo(e.target.value)}
              placeholder="Por qué está bloqueada la tarea"
              className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockPrompt(null)}>
              Cancelar
            </Button>
            <Button disabled={!blockMotivo.trim()} onClick={confirmBlock}>
              Bloquear tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Columnas del tablero ──────────────────────────────────────────────── */

const COLUMN_BASE = "flex w-full shrink-0 flex-col gap-2 rounded-card border p-3 transition-colors lg:w-[264px]";

function ColumnHeader({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <div className="flex items-center justify-between px-1 pb-0.5">
      <span className="flex items-center gap-2">
        <span className={cn("size-[9px] rounded-full", dot)} />
        <span className="text-[14.5px] font-semibold whitespace-nowrap text-ink-950">{label}</span>
      </span>
      <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[12.5px] text-ink-700 tabular-nums">
        {count}
      </span>
    </div>
  );
}

/** A real state column: droppable, cards are sortable (dnd-kit drag stays available). */
function BoardColumn({
  estado,
  tareas,
  onOpen,
  actionFor,
}: {
  estado: EstadoTarea;
  tareas: CardTask[];
  onOpen: (id: string) => void;
  actionFor: (task: CardTask) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${estado}` });
  const label = ESTADO_TAREA_LABELS[estado]?.label ?? estado;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        COLUMN_BASE,
        "min-h-[120px] border-border bg-panel lg:min-h-[320px]",
        isOver && "border-rose-300 bg-rose-50/70 ring-2 ring-rose-200",
      )}
    >
      <ColumnHeader label={label} count={tareas.length} dot={dotTone(estado)} />
      <div className="flex min-h-[80px] flex-1 flex-col gap-2 pb-1">
        <SortableContext items={tareas.map((t) => `task:${t.id}`)} strategy={verticalListSortingStrategy}>
          {tareas.map((t) => (
            <SortableTaskCard key={t.id} task={t} onClick={() => onOpen(t.id)} action={actionFor(t)} />
          ))}
          {tareas.length === 0 && (
            <p className="rounded-12 border border-dashed border-border-strong px-2 py-5 text-center text-[13px] text-ink-600">
              Sin tareas
            </p>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

/**
 * v7 7th column: "Nuevo proyecto". Dashed and tinted; it only shows the tasks
 * already converted (derived, see board-logic.ts) and is not a drop target.
 */
function ProjectColumn({
  tareas,
  onOpen,
  actionFor,
}: {
  tareas: CardTask[];
  onOpen: (id: string) => void;
  actionFor: (task: CardTask) => ReactNode;
}) {
  return (
    <div
      data-testid="kanban-col-nuevo-proyecto"
      className={cn(COLUMN_BASE, "min-h-[120px] border-dashed border-rose-400/50 bg-rose-500/[0.07] lg:min-h-[320px]")}
    >
      <ColumnHeader label="Nuevo proyecto" count={tareas.length} dot="bg-rose-600" />
      <p className="px-1 pb-1 text-[12.5px] leading-snug text-ink-700">
        Cada tarjeta crea el proyecto en Seguimiento con los datos del cliente y la propuesta.
      </p>
      <div className="flex min-h-[80px] flex-1 flex-col gap-2 pb-1">
        {tareas.map((t) => (
          <TaskCard key={t.id} task={t} onClick={() => onOpen(t.id)} action={actionFor(t)} />
        ))}
        {tareas.length === 0 && (
          <p className="rounded-12 border border-dashed border-border-strong px-2 py-5 text-center text-[13px] text-ink-600">
            Completa una tarea comercial de una oportunidad aceptada
          </p>
        )}
      </div>
    </div>
  );
}

/** The footer of a card: the v7 "Avanzar →" family, a hint, or the link to the project. */
export function CardActionView({ action, onRun }: { action: CardAction; onRun: () => void }) {
  // The card sits inside a dnd-kit draggable: keep pointer/keyboard events on
  // the button from reaching its sensors so a click never starts a drag.
  const isolate = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };
  if (action.kind === "hint") {
    return <p className="px-0.5 text-[12.5px] leading-snug text-ink-600">{action.text}</p>;
  }
  if (action.kind === "open-project") {
    return (
      <Link
        href="/proyectos"
        {...isolate}
        className="inline-flex h-9 items-center rounded-12 border border-exito/50 px-3 text-[13px] font-semibold text-exito outline-none hover:bg-exito/10 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {action.label}
      </Link>
    );
  }
  if (action.kind === "convert") {
    // "Pasar a nuevo proyecto →" opens the stepper page with the opportunity preselected.
    return (
      <div {...isolate}>
        <Link
          href={`/proyectos/nuevo?oportunidad=${encodeURIComponent(action.oportunidadId)}`}
          className={cn(
            buttonVariants({ size: "sm" }),
            "w-full justify-start px-3 text-[13px] font-semibold",
          )}
        >
          {action.label}
        </Link>
      </div>
    );
  }
  return (
    <div {...isolate}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRun}
        className="w-full justify-start px-3 text-[13px] font-semibold"
      >
        {action.label}
      </Button>
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
    <section className="overflow-hidden surface">
      <div className="overflow-x-auto">
        <Table className="text-[12.5px]">
          <TableHeader>
            <TableRow>
              {["Título", "Responsable", "Cliente", "Estado", "Prioridad", "Fecha entrega", "Etiquetas", ""].map((h) => (
                <TableHead key={h}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t) => (
              <TableRow
                key={t.id}
                onClick={() => onOpen(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(t.id);
                  }
                }}
                tabIndex={0}
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 outline-none"
              >
                <TableCell className="font-semibold text-ink-950">{t.titulo}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 text-[12.5px] text-ink-700">
                    <span className="grid size-6 place-items-center rounded-[8px] bg-ink-100 text-[9.5px] font-bold text-ink-700">
                      {iniciales(t.responsable_nombre)}
                    </span>
                    {t.responsable_nombre}
                  </span>
                </TableCell>
                <TableCell className="text-[12.5px] text-ink-700 whitespace-normal">{t.cliente_nombre ?? "—"}</TableCell>
                <TableCell>
                  <ToneBadge
                    tone={ESTADO_TAREA_LABELS[t.estado]?.tone ?? "neutro"}
                    label={ESTADO_TAREA_LABELS[t.estado]?.label ?? t.estado}
                  />
                </TableCell>
                <TableCell>
                  <PrioridadChip prioridad={t.prioridad} />
                </TableCell>
                <TableCell>
                  <FechaCell fecha={t.fecha_entrega} />
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell numeric>
                  <span className="grid size-7 place-items-center rounded-10 text-ink-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:text-rose-400">
                    <Eye className="size-4" strokeWidth={1.8} />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

const SEL_CLASS = "h-10 flex-1 basis-0 px-3 text-base md:text-[12.5px]";

// FiltersRow real (definida debajo)

function FiltersRow(props: FiltersRowProps) {
  const { responsable, cliente, local, users, clients, onResponsable, onCliente, onLocal, hasActive, onClear } = props;
  return (
    <section className="surface p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
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
          <Input id="kanban-desde" type="date" value={local.desde} onChange={(e) => onLocal({ desde: e.target.value })} aria-label="Entrega desde" className="h-10 w-[148px] px-3 text-base md:text-[12px]" />
          <span className="text-[12px] text-ink-500">a</span>
          <Label htmlFor="kanban-hasta" className="sr-only">Entrega hasta</Label>
          <Input id="kanban-hasta" type="date" value={local.hasta} onChange={(e) => onLocal({ hasta: e.target.value })} aria-label="Entrega hasta" className="h-10 w-[148px] px-3 text-base md:text-[12px]" />
        </div>
      </div>
      {hasActive && (
        <div className="mt-2.5 flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={onClear} className="px-2 text-[12.5px] font-semibold text-ink-600">
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
            value === o.value ? "bg-card text-ink-950 shadow-sm" : "text-ink-600 hover:text-ink-900",
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
    <section className="grid min-h-[320px] place-items-center surface p-8">
      <div className="max-w-[44ch] text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
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
      <section className="surface p-5">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-12" />
          ))}
        </div>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-3 overflow-hidden lg:flex-row">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="w-full shrink-0 space-y-2 rounded-card bg-muted p-3 lg:w-[264px]">
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