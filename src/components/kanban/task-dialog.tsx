// Diálogo de tarea del tablero (PRD §5.2): creación (abre vacío) y edición
// completa — formulario, checklist de subtareas, hilo de comentarios
// inmutable, adjuntos y zona de peligro (soft delete con confirmación).
// El estado se guarda vía /tasks/:id/status (mismo criterio que el tablero);
// el resto de campos vía POST/PATCH /tasks. Los errores de API llegan como
// toasts desde los hooks; los de validación local usan el alert inline.

"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Download,
  LoaderCircle,
  MessageSquarePlus,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { EstadoTarea, OrigenTarea, PrioridadTarea } from "@prisma/client";
import { toast } from "sonner";
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
import {
  ENUM_VALUES,
  ESTADO_TAREA_LABELS,
  ORIGEN_TAREA_LABELS,
  PRIORIDAD_TAREA_LABELS,
  TASK_TAGS,
} from "@/lib/catalogs";
import { formatFechaHora, iniciales } from "@/hooks/crm";
import {
  attachmentValidationError,
  formatBytes,
  useAddComment,
  useAddSubtarea,
  useAttachments,
  useComments,
  useCreateTask,
  useDeleteSubtarea,
  useDeleteTask,
  useMoveTask,
  useSubtareas,
  useTask,
  useUpdateSubtarea,
  useUpdateTask,
  useUploadAttachment,
  type Adjunto,
  type ClientOption,
  type Subtarea,
} from "@/hooks/kanban";

type TaskDialogProps = {
  taskId: string | null;
  onClose: () => void;
  users: { id: string; nombre: string }[];
  clients: ClientOption[];
};

type FormState = {
  titulo: string;
  descripcion: string;
  responsable_id: string;
  cliente_id: string;
  fecha_entrega: string;
  prioridad: PrioridadTarea | "";
  etiquetas: string[];
  estado: EstadoTarea;
  motivo_bloqueo: string;
};

const EMPTY_FORM: FormState = {
  titulo: "",
  descripcion: "",
  responsable_id: "",
  cliente_id: "",
  fecha_entrega: "",
  prioridad: "",
  etiquetas: [],
  estado: "POR_HACER",
  motivo_bloqueo: "",
};

function toDateValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function TaskDialog({ taskId, onClose, users, clients }: TaskDialogProps) {
  const isEdit = taskId !== null;
  const detailQuery = useTask(taskId);
  const task = detailQuery.data;

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [error, setError] = useState<string | null>(null);

  /* Sincroniza el formulario cuando cambia la tarea abierta (editar) o al
     crear desde cero. Sigue el patrón de task-dialogs.tsx. */
  const formKey = `${taskId ?? "nueva"}:${task?.updated_at ?? "cargando"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setError(null);
    if (!isEdit) {
      setForm({ ...EMPTY_FORM });
    } else if (task) {
      setForm({
        titulo: task.titulo,
        descripcion: task.descripcion ?? "",
        responsable_id: task.responsable_id,
        cliente_id: task.cliente_id ?? "",
        fecha_entrega: toDateValue(task.fecha_entrega),
        prioridad: task.prioridad ?? "",
        etiquetas: task.etiquetas,
        estado: task.estado,
        motivo_bloqueo: task.motivo_bloqueo ?? "",
      });
    }
  }

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask(taskId ?? "");
  const statusMutation = useMoveTask();
  const pendingMutation =
    createMutation.isPending || updateMutation.isPending || statusMutation.isPending;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
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
    if (!form.titulo.trim()) {
      setError("El título de la tarea es obligatorio.");
      return;
    }
    if (!form.responsable_id) {
      setError("Asigna un responsable para activar la tarea.");
      return;
    }
    if (form.estado === "BLOQUEADA" && !form.motivo_bloqueo.trim()) {
      setError("Indica un motivo para bloquear.");
      return;
    }

    const motivo = form.estado === "BLOQUEADA" ? form.motivo_bloqueo.trim() : null;

    try {
      if (!isEdit) {
        await createMutation.mutateAsync({
          titulo: form.titulo.trim(),
          descripcion: form.descripcion.trim() || null,
          responsable_id: form.responsable_id,
          cliente_id: form.cliente_id || undefined,
          estado: "POR_HACER",
          origen: "KANBAN",
          prioridad: form.prioridad || null,
          fecha_entrega: form.fecha_entrega || null,
          etiquetas: form.etiquetas,
        });
        onClose();
        return;
      }
      if (!task) return;

      const patch = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        responsable_id: form.responsable_id,
        // PATCH no acepta null para cliente_id: omitirlo conserva el actual.
        ...(form.cliente_id ? { cliente_id: form.cliente_id } : {}),
        prioridad: form.prioridad || null,
        fecha_entrega: form.fecha_entrega || null,
        etiquetas: form.etiquetas,
        ...(form.estado === "BLOQUEADA" ? { motivo_bloqueo: motivo } : {}),
      };

      if (form.estado !== task.estado) {
        await statusMutation.mutateAsync({
          taskId: task.id,
          estado: form.estado,
          ...(motivo ? { motivo_bloqueo: motivo } : {}),
        });
      }
      await updateMutation.mutateAsync(patch);
      onClose();
    } catch {
      /* los toasts los lanzan los hooks */
    }
  }

  const isLoading = isEdit && detailQuery.isLoading;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-y-auto rounded-[24px] p-0 sm:max-w-[680px]">
        {isLoading ? (
          <div className="grid min-h-[320px] place-items-center text-[13px] text-ink-500">
            Cargando la tarea…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
            <DialogHeader className="gap-1">
              <DialogTitle className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
                {isEdit ? "Editar tarea" : "Nueva tarea"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Actualiza los campos, el estado o la zona de detalle."
                  : "Solo el título es obligatorio; el resto se completa en marcha."}
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
              >
                {error}
              </div>
            )}

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
                  className="h-10 rounded-12 bg-panel px-3"
                />
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="tarea-descripcion">Descripción</Label>
                <textarea
                  id="tarea-descripcion"
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => set("descripcion", e.target.value)}
                  placeholder="Detalle de la tarea"
                  className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                  <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                    <SelectValue placeholder="Selecciona un responsable" />
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
                <Label>Cliente</Label>
                <Select
                  value={form.cliente_id}
                  onValueChange={(v) =>
                    set("cliente_id", v === "ninguno" ? "" : (v ?? ""))
                  }
                >
                  <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                    <SelectValue placeholder="Sin cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin cliente</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tarea-fecha">Fecha de entrega</Label>
                <Input
                  id="tarea-fecha"
                  type="date"
                  value={form.fecha_entrega}
                  onChange={(e) => set("fecha_entrega", e.target.value)}
                  className="h-10 rounded-12 bg-panel px-3"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Prioridad</Label>
                <Select
                  value={form.prioridad}
                  onValueChange={(v) => set("prioridad", (v ?? "") as PrioridadTarea | "")}
                >
                  <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
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

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label>Etiquetas</Label>
                <div className="flex flex-wrap gap-2">
                  {TASK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleEtiqueta(tag)}
                      aria-pressed={form.etiquetas.includes(tag)}
                      className={cn(
                        "inline-flex h-7 items-center rounded-full border px-3 text-[12px] font-semibold transition-colors",
                        form.etiquetas.includes(tag)
                          ? "border-rose-500 bg-rose-50 text-rose-700 dark:text-rose-400"
                          : "border-ink-200 bg-panel text-ink-700 hover:bg-ink-100",
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {isEdit && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label>Estado</Label>
                    <Select
                      value={form.estado}
                      onValueChange={(v) => set("estado", (v ?? "POR_HACER") as EstadoTarea)}
                    >
                      <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
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

                  <div className="flex flex-col justify-end gap-1.5">
                    <Label>Origen</Label>
                    <p className="rounded-12 bg-ink-100 px-3 py-2.5 text-[13px] font-semibold text-ink-700">
                      {ORIGEN_TAREA_LABELS[(task?.origen ?? "KANBAN") as OrigenTarea].label}
                      {task?.origen === "CRM" || task?.origen === "AMBOS"
                        ? " · visible también en el CRM"
                        : ""}
                    </p>
                  </div>
                </>
              )}

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
                    placeholder="Por qué está bloqueada la tarea"
                    className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              )}
            </div>

            {isEdit && task && (
              <div className="flex flex-col gap-6 rounded-[16px] border border-ink-200 bg-ink-100/50 p-4">
                <SubtaskSection taskId={task.id} />
                <CommentSection taskId={task.id} />
                <AttachmentSection taskId={task.id} />
                <DangerZone taskId={task.id} onDeleted={onClose} />
              </div>
            )}

            <DialogFooter className="sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pendingMutation}
                className="rounded-lg px-4 font-bold"
              >
                {pendingMutation && <LoaderCircle className="size-4 animate-spin" />}
                {pendingMutation ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Subtareas ─────────────────────────────────────────────────────────── */

function SubtaskSection({ taskId }: { taskId: string }) {
  const { data: subtareas = [], isLoading } = useSubtareas(taskId);
  const addSubtarea = useAddSubtarea(taskId);
  const [texto, setTexto] = useState("");
  const hechas = subtareas.filter((s) => s.completada).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-bold text-ink-900">Subtareas</h4>
        <span className="font-mono text-[11.5px] font-bold text-ink-600 tabular-nums">
          {hechas}/{subtareas.length}
        </span>
      </div>
      {isLoading && <p className="text-[12px] text-ink-600">Cargando…</p>}
      {!isLoading && subtareas.length === 0 && (
        <p className="text-[12.5px] text-ink-600">Sin subtareas todavía.</p>
      )}
      <div className="flex flex-col gap-2">
        {subtareas.map((s) => (
          <SubtaskRow key={s.id} taskId={taskId} subtarea={s} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void agregar();
            }
          }}
          placeholder="Nueva subtarea…"
          className="h-9 rounded-10 bg-panel px-3 text-[13px]"
        />
        <Button
          type="button"
          size="sm"
          disabled={!texto.trim() || addSubtarea.isPending}
          onClick={() => void agregar()}
          className="h-9 shrink-0 rounded-10 px-3 font-bold"
        >
          <Plus className="size-4" strokeWidth={2} />
          Agregar
        </Button>
      </div>
    </section>
  );

  async function agregar() {
    if (!texto.trim()) return;
    try {
      await addSubtarea.mutateAsync({ titulo: texto.trim() });
      setTexto("");
    } catch {
      /* toast en el hook */
    }
  }
}

function SubtaskRow({ taskId, subtarea }: { taskId: string; subtarea: Subtarea }) {
  const toggle = useUpdateSubtarea(taskId, subtarea.id);
  const remove = useDeleteSubtarea(taskId, subtarea.id);
  return (
    <div className="flex items-center gap-2.5 rounded-10 border border-ink-200 bg-panel px-3 py-2 text-[13px]">
      <Checkbox
        checked={subtarea.completada}
        onCheckedChange={(checked) => {
          void toggle.mutateAsync({ completada: checked }).catch(() => undefined);
        }}
        aria-label={`Marcar ${subtarea.titulo}`}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          subtarea.completada && "text-ink-500 line-through",
        )}
      >
        {subtarea.titulo}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Eliminar ${subtarea.titulo}`}
        onClick={() => void remove.mutateAsync()}
        className="text-ink-500 hover:text-destructivo"
      >
        <X className="size-3.5" strokeWidth={2.2} />
      </Button>
    </div>
  );
}

/* ── Comentarios (inmutables, más recientes primero) ───────────────────── */

function CommentSection({ taskId }: { taskId: string }) {
  const { data: comentarios = [], isLoading } = useComments(taskId);
  const addComment = useAddComment(taskId);
  const [texto, setTexto] = useState("");
  const sorted = [...comentarios].reverse();

  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-[13px] font-bold text-ink-900">Comentarios</h4>
      {isLoading ? (
        <p className="text-[12px] text-ink-600">Cargando…</p>
      ) : sorted.length === 0 ? (
        <p className="text-[12.5px] text-ink-600">Todavía no hay comentarios.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((c) => (
            <div key={c.id} className="rounded-12 bg-panel px-3 py-2.5">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-800">
                <span className="grid size-5 place-items-center rounded-full bg-rose-100 text-[9px] font-bold text-rose-700 dark:text-rose-400">
                  {iniciales(c.autor_nombre)}
                </span>
                {c.autor_nombre}
                <span className="ml-auto font-mono text-[10.5px] font-medium text-ink-500">
                  {formatFechaHora(c.created_at)}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-800">{c.texto}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escribe un comentario…"
          className="h-9 rounded-10 bg-panel px-3 text-[13px]"
        />
        <Button
          type="button"
          size="sm"
          disabled={!texto.trim() || addComment.isPending}
          onClick={() => void enviar()}
          className="h-9 shrink-0 rounded-10 px-3 font-bold"
        >
          <MessageSquarePlus className="size-4" strokeWidth={1.9} />
          Comentar
        </Button>
      </div>
    </section>
  );

  async function enviar() {
    if (!texto.trim()) return;
    try {
      await addComment.mutateAsync({ texto: texto.trim() });
      setTexto("");
    } catch {
      /* toast en el hook */
    }
  }
}

/* ── Adjuntos (validación cliente: tipo + 10 MB) ───────────────────────── */

function AttachmentSection({ taskId }: { taskId: string }) {
  const { data: adjuntos = [], isLoading } = useAttachments(taskId);
  const upload = useUploadAttachment(taskId);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-[13px] font-bold text-ink-900">Adjuntos</h4>
      {isLoading ? (
        <p className="text-[12px] text-ink-600">Cargando…</p>
      ) : adjuntos.length === 0 ? (
        <p className="text-[12.5px] text-ink-600">Sin archivos adjuntos todavía.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {adjuntos.map((a) => (
            <AdjuntoRow key={a.id} taskId={taskId} adjunto={a} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void subir(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
          className="h-9 rounded-10 px-3 font-semibold"
        >
          {upload.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" strokeWidth={1.9} />
          )}
          Subir archivo
        </Button>
        <span className="text-[11.5px] text-ink-600">
          PDF, Word, Excel, JPG o PNG · máx 10 MB
        </span>
      </div>
    </section>
  );

  function subir(file: File) {
    const validation = attachmentValidationError(file);
    if (validation) {
      toast.error(validation);
      return;
    }
    void upload.mutateAsync(file);
  }
}

function AdjuntoRow({ taskId, adjunto }: { taskId: string; adjunto: Adjunto }) {
  return (
    <div className="flex items-center gap-2.5 rounded-10 bg-panel px-3 py-2 text-[13px]">
      <Paperclip className="size-4 shrink-0 text-ink-500" strokeWidth={1.9} />
      <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{adjunto.nombre}</span>
      <span className="font-mono text-[10.5px] text-ink-500">
        {formatBytes(adjunto.tamano_bytes)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Descargar ${adjunto.nombre}`}
        onClick={() => {
          window.open(
            `/api/v1/tasks/${taskId}/attachments/${adjunto.id}/download`,
            "_blank",
            "noopener",
          );
        }}
        className="text-ink-500 hover:text-rose-700 dark:hover:text-rose-400"
      >
        <Download className="size-3.5" strokeWidth={1.9} />
      </Button>
    </div>
  );
}

/* ── Zona de peligro: soft delete con confirmación ─────────────────────── */

function DangerZone({ taskId, onDeleted }: { taskId: string; onDeleted: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useDeleteTask(taskId);

  return (
    <section className="flex flex-col gap-3 border-t border-ink-200 pt-4">
      <h4 className="text-[13px] font-bold text-destructivo">Zona de peligro</h4>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setConfirmOpen(true)}
        className="self-start rounded-10 px-3 font-semibold"
      >
        <Trash2 className="size-4" strokeWidth={1.8} />
        Eliminar tarea
      </Button>
      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={deleteMutation.isPending}
        onConfirm={() => {
          setConfirmOpen(false);
          void deleteMutation
            .mutateAsync()
            .then(onDeleted)
            .catch(() => undefined);
        }}
      />
    </section>
  );
}

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[22px] sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            Eliminar tarea
          </DialogTitle>
          <DialogDescription>
            La tarea se eliminará de forma permanente y dejará de aparecer en
            el tablero. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-12 font-bold"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}