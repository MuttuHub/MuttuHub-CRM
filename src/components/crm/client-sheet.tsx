// Ficha de cliente en panel lateral (PRD §4.2): se abre desde el listado sin
// recargar la página. El id llega por `?cliente=<id>` (deep-link/reanudable)
// y el panel se sincroniza con esa URL en ambas direcciones. Pestañas:
// General, Contactos, Oportunidades, Compromisos, Bitácora, Documentos y
// Tareas relacionadas.
//
// Permisos (v1): los controles de edición/borrado se muestran para cualquier
// rol; el servidor aplica el alcance por rol y los 403 llegan como toasts.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Download,
  ExternalLink,
  MessageSquarePlus,
  Pencil,
  Send,
  Trash2,
  Upload,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ESTADO_CLIENTE_LABELS,
  ESTADO_OPORTUNIDAD_LABELS,
  ESTADO_TAREA_LABELS,
  ROL_CONTACTO_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import {
  esVencida,
  formatCOP,
  formatFecha,
  formatFechaHora,
  iniciales,
  useAddLogEntry,
  useBitacora,
  useClientDetail,
  useContacts,
  useDeleteClient,
  useDeleteContacto,
  useDeleteOportunidad,
  useDeleteTarea,
  useOpportunities,
  useTasksByClient,
  useUpdateTareaStatus,
  useUsers,
  type ClientDetail,
  type Contacto,
  type Oportunidad,
  type TaskItem,
} from "@/hooks/crm";
import {
  FieldValue,
  InitialsAvatar,
  PrioridadChip,
  ToneBadge,
} from "@/components/crm/shared";
import { ClientFormDialog } from "@/components/crm/client-form";
import {
  ContactoFormDialog,
  ConfirmDialog,
  OportunidadFormDialog,
} from "@/components/crm/entity-dialogs";
import { TareaFormDialog } from "@/components/crm/task-dialogs";
import {
  downloadActiveVersion,
  extensionOf,
  formatVersionFecha,
  useDocuments,
} from "@/hooks/documents";

type DeleteTarget = { ref: "contacto" | "oportunidad" | "tarea"; id: string } | null;

export function ClientSheet({
  clientId,
  onClose,
}: {
  clientId: string | null;
  onClose: () => void;
}) {
  const open = clientId !== null;
  const clienteQuery = useClientDetail(clientId);
  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [oppFormOpen, setOppFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contacto | null>(null);
  const [editingOpp, setEditingOpp] = useState<Oportunidad | null>(null);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const cliente = clienteQuery.data;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-none p-0 sm:max-w-[760px] sm:rounded-l-[26px]"
      >
        <SheetTitle className="sr-only">
          {cliente ? `Ficha de ${cliente.nombre}` : "Ficha de cliente"}
        </SheetTitle>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!cliente ? (
            <SheetLoading error={Boolean(clienteQuery.error)} />
          ) : (
            <>
              <SheetHeaderContent
                cliente={cliente}
                onEditar={() => setEditOpen(true)}
                onDesactivar={() => setDeactivateOpen(true)}
              />

              <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-ink-200 px-6">
                  <TabsList
                    variant="line"
                    className="h-10 w-full justify-start gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    <TabsTrigger value="general" className="flex-none px-3">General</TabsTrigger>
                    <TabsTrigger value="contactos" className="flex-none px-3">Contactos</TabsTrigger>
                    <TabsTrigger value="oportunidades" className="flex-none px-3">Oportunidades</TabsTrigger>
                    <TabsTrigger value="compromisos" className="flex-none px-3">Compromisos</TabsTrigger>
                    <TabsTrigger value="bitacora" className="flex-none px-3">Bitácora</TabsTrigger>
                    <TabsTrigger value="documentos" className="flex-none px-3">Documentos</TabsTrigger>
                    <TabsTrigger value="tareas" className="flex-none px-3">Tareas relacionadas</TabsTrigger>
                  </TabsList>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <TabsContent value="general" className="mt-0">
                    <GeneralTab cliente={cliente} />
                  </TabsContent>

                  <TabsContent value="contactos" className="mt-0">
                    <ContactosTab
                      clientId={clientId!}
                      onNew={() => {
                        setEditingContact(null);
                        setContactFormOpen(true);
                      }}
                      onEdit={(c) => {
                        setEditingContact(c);
                        setContactFormOpen(true);
                      }}
                      onDelete={(c) => setDeleteTarget({ ref: "contacto", id: c.id })}
                    />
                  </TabsContent>

                  <TabsContent value="oportunidades" className="mt-0">
                    <OportunidadesTab
                      clientId={clientId!}
                      onNew={() => {
                        setEditingOpp(null);
                        setOppFormOpen(true);
                      }}
                      onEdit={(o) => {
                        setEditingOpp(o);
                        setOppFormOpen(true);
                      }}
                      onDelete={(o) => setDeleteTarget({ ref: "oportunidad", id: o.id })}
                    />
                  </TabsContent>

                  <TabsContent value="compromisos" className="mt-0">
                    <CompromisosTab
                      clientId={clientId!}
                      onNew={() => {
                        setEditingTask(null);
                        setTaskFormOpen(true);
                      }}
                      onEdit={(t) => {
                        setEditingTask(t);
                        setTaskFormOpen(true);
                      }}
                      onDelete={(t) => setDeleteTarget({ ref: "tarea", id: t.id })}
                    />
                  </TabsContent>

                  <TabsContent value="bitacora" className="mt-0">
                    <BitacoraTab clientId={clientId!} />
                  </TabsContent>

                  <TabsContent value="documentos" className="mt-0">
                    <DocumentosTab clientId={clientId!} />
                  </TabsContent>

                  <TabsContent value="tareas" className="mt-0">
                    <TareasRelacionadasTab clientId={clientId!} />
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </div>

        <ClientFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          cliente={cliente}
          users={users}
          onSaved={() => setEditOpen(false)}
        />
        <ContactoFormDialog
          clientId={clientId ?? ""}
          open={contactFormOpen}
          onOpenChange={setContactFormOpen}
          contacto={editingContact}
        />
        <OportunidadFormDialog
          clientId={clientId ?? ""}
          open={oppFormOpen}
          onOpenChange={setOppFormOpen}
          oportunidad={editingOpp}
        />
        <TareaFormDialog
          clientId={clientId ?? ""}
          open={taskFormOpen}
          onOpenChange={setTaskFormOpen}
          tarea={editingTask}
          users={users}
        />
        <DeleteGuard
          clientId={clientId}
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
        <DeactivateClientDialog
          clientId={clientId}
          open={deactivateOpen}
          onClose={() => setDeactivateOpen(false)}
          onDeactivated={onClose}
        />
      </SheetContent>
    </Sheet>
  );
}

/* ── Encabezado fijo ───────────────────────────────────────────────────── */

function SheetLoading({ error }: { error: boolean }) {
  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="size-9 rounded-12" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="mt-2 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/12" />
      </div>
      {error && (
        <ErrorState message="No pudimos cargar la ficha de este cliente." />
      )}
    </div>
  );
}

function SheetHeaderContent({
  cliente,
  onEditar,
  onDesactivar,
}: {
  cliente: ClientDetail;
  onEditar: () => void;
  onDesactivar: () => void;
}) {
  const vencido = cliente.next_compromiso
    ? esVencida(cliente.next_compromiso.fecha_entrega)
    : false;

  return (
    <div className="shrink-0 border-b border-ink-200 px-6 py-5">
      <div className="flex items-start gap-3.5">
        <InitialsAvatar
          nombre={cliente.nombre}
          className="mt-0.5 size-11 rounded-[15px_15px_15px_5px] text-[13px]"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[19px] leading-tight font-bold tracking-[-0.02em] text-ink-950 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {cliente.nombre}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-ink-600">
            {[cliente.empresa, cliente.ubicacion].filter(Boolean).join(" · ") ||
              "Sin empresa ni ubicación registradas"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onEditar}
          className="shrink-0 rounded-10 px-3 text-[12.5px] font-semibold"
        >
          <Pencil className="size-3.5" strokeWidth={1.9} />
          Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDesactivar}
          className="shrink-0 rounded-10 px-3 text-[12.5px] font-semibold text-ink-500 hover:border-destructivo/40 hover:text-destructivo"
        >
          <UserX className="size-3.5" strokeWidth={1.9} />
          Desactivar cliente
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ToneBadge
          tone={TIPO_CLIENTE_LABELS[cliente.tipo_cliente].tone}
          label={TIPO_CLIENTE_LABELS[cliente.tipo_cliente].label}
        />
        <ToneBadge
          tone={ESTADO_CLIENTE_LABELS[cliente.estado].tone}
          label={ESTADO_CLIENTE_LABELS[cliente.estado].label}
        />
        <PrioridadChip prioridad={cliente.prioridad} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-ink-600">
        <span>
          Responsable:{" "}
          <span className="font-semibold text-ink-900">
            {cliente.responsable_nombre}
          </span>
        </span>
        {cliente.next_compromiso ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              vencido && "font-bold text-destructivo",
            )}
          >
            <CalendarClock className="size-3.5" strokeWidth={1.9} />
            Próximo compromiso: {formatFecha(cliente.next_compromiso.fecha_entrega)}
            {vencido && " · Vencido"}
          </span>
        ) : (
          <span className="text-ink-500">Sin compromisos abiertos</span>
        )}
        <span className="ml-auto font-mono text-[11.5px] text-ink-500">
          Actualizado {formatFechaHora(cliente.updated_at)}
        </span>
      </div>
    </div>
  );
}

/* ── Pestaña General ───────────────────────────────────────────────────── */

function GeneralTab({ cliente }: { cliente: ClientDetail }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
      <FieldValue label="Nombre" value={cliente.nombre} />
      <FieldValue label="Empresa u organización" value={cliente.empresa ?? "—"} />
      <FieldValue
        label="Tipo de cliente"
        value={TIPO_CLIENTE_LABELS[cliente.tipo_cliente].label}
      />
      <FieldValue label="Tamaño de la organización" value={cliente.tamano_org ?? "—"} />
      <FieldValue label="Ubicación" value={cliente.ubicacion ?? "—"} />
      <FieldValue
        label="Canal de contacto inicial"
        value={cliente.canal_contacto_inicial ?? "—"}
      />
      <FieldValue
        label="Fecha de primer contacto"
        value={formatFecha(cliente.fecha_primer_contacto)}
      />
      <FieldValue label="Prioridad" value={<PrioridadChip prioridad={cliente.prioridad} />} />
      <FieldValue label="Estado" value={ESTADO_CLIENTE_LABELS[cliente.estado].label} />
      <FieldValue label="Responsable interno" value={cliente.responsable_nombre} />
      <FieldValue label="Valor potencial" value={formatCOP(cliente.valor_potencial)} mono />
      <FieldValue label="Compromisos abiertos" value={cliente.compromisos_abiertos} mono />
      <div className="sm:col-span-2">
        <FieldValue
          label="Prioridades identificadas del cliente"
          value={cliente.prioridades_identificadas ?? "—"}
        />
      </div>
      <div className="sm:col-span-2">
        <FieldValue label="Riesgos o barreras" value={cliente.riesgos_barreras ?? "—"} />
      </div>
      <div className="sm:col-span-2">
        <FieldValue label="Resumen de la relación" value={cliente.resumen_relacion ?? "—"} />
      </div>
    </dl>
  );
}

/* ── Pestaña Contactos ─────────────────────────────────────────────────── */

function ContactosTab({
  clientId,
  onNew,
  onEdit,
  onDelete,
}: {
  clientId: string;
  onNew: () => void;
  onEdit: (c: Contacto) => void;
  onDelete: (c: Contacto) => void;
}) {
  const query = useContacts(clientId);
  const contactos = query.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-600">
          {query.isLoading
            ? "Cargando contactos…"
            : `${contactos.length} contacto${contactos.length === 1 ? "" : "s"}`}
        </p>
        <Button size="sm" onClick={onNew} className="rounded-10 font-bold">
          Agregar contacto
        </Button>
      </div>

      {query.isError && <ErrorState message="No pudimos cargar los contactos." />}
      {!query.isLoading && !query.isError && contactos.length === 0 && (
        <EmptyState copy="Aún no hay contactos para este cliente." />
      )}

      <ul className="flex flex-col gap-2.5">
        {contactos.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-3.5 rounded-14 border border-ink-200 bg-panel p-4"
          >
            <InitialsAvatar nombre={c.nombre} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink-950">{c.nombre}</span>
                {c.rol_decision && (
                  <ToneBadge
                    tone={ROL_CONTACTO_LABELS[c.rol_decision].tone}
                    label={ROL_CONTACTO_LABELS[c.rol_decision].label}
                  />
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] text-ink-600">{c.cargo ?? "Sin cargo"}</p>
              <p className="font-mono text-[12px] text-ink-800">
                {[c.correo, c.telefono].filter(Boolean).join(" · ") || "—"}
              </p>
              {c.notas && (
                <p className="mt-1.5 text-[12.5px] leading-snug text-ink-700">{c.notas}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${c.nombre}`}
                onClick={() => onEdit(c)}
                className="after:-inset-1"
              >
                <Pencil className="size-3.5" strokeWidth={1.9} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Eliminar ${c.nombre}`}
                onClick={() => onDelete(c)}
                className="text-ink-500 hover:text-destructivo after:-inset-1"
              >
                <Trash2 className="size-3.5" strokeWidth={1.9} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Pestaña Oportunidades ─────────────────────────────────────────────── */

function OportunidadesTab({
  clientId,
  onNew,
  onEdit,
  onDelete,
}: {
  clientId: string;
  onNew: () => void;
  onEdit: (o: Oportunidad) => void;
  onDelete: (o: Oportunidad) => void;
}) {
  const query = useOpportunities(clientId);
  const oportunidades = query.data ?? [];
  const [expandida, setExpandida] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-600">
          {query.isLoading
            ? "Cargando oportunidades…"
            : `${oportunidades.length} oportunidad${oportunidades.length === 1 ? "" : "es"}`}
        </p>
        <Button size="sm" onClick={onNew} className="rounded-10 font-bold">
          Nueva oportunidad
        </Button>
      </div>

      {query.isError && <ErrorState message="No pudimos cargar las oportunidades." />}
      {!query.isLoading && !query.isError && oportunidades.length === 0 && (
        <EmptyState copy="Aún no hay oportunidades registradas para este cliente." />
      )}

      <ul className="flex flex-col gap-2.5">
        {oportunidades.map((o) => {
          const abierta = expandida === o.id;
          return (
            <li key={o.id} className="rounded-14 border border-ink-200 bg-panel p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandida(abierta ? null : o.id)}
                      className="text-left text-[14px] font-semibold text-ink-950 hover:text-rose-700 dark:hover:text-rose-400"
                    >
                      {o.nombre}
                    </button>
                    <ToneBadge
                      tone={ESTADO_OPORTUNIDAD_LABELS[o.estado].tone}
                      label={ESTADO_OPORTUNIDAD_LABELS[o.estado].label}
                    />
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-500">
                    <span className="font-mono font-medium text-ink-800">
                      {formatCOP(o.valor_estimado_cop)}
                    </span>
                    <span>Última gestión: {formatFecha(o.fecha_ultima_gestion)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${o.nombre}`}
                    onClick={() => onEdit(o)}
                    className="after:-inset-1"
                  >
                    <Pencil className="size-3.5" strokeWidth={1.9} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Eliminar ${o.nombre}`}
                    onClick={() => onDelete(o)}
                    className="text-ink-500 hover:text-destructivo after:-inset-1"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.9} />
                  </Button>
                </div>
              </div>

              {abierta && (
                <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-[12.5px] leading-relaxed text-ink-700">
                  <p>
                    <span className="font-bold text-ink-900">Problema detectado:</span>{" "}
                    {o.problema_detectado ?? "—"}
                  </p>
                  <p>
                    <span className="font-bold text-ink-900">Solución propuesta:</span>{" "}
                    {o.solucion_propuesta ?? "—"}
                  </p>
                  <p>
                    <span className="font-bold text-ink-900">Servicios de interés:</span>{" "}
                    {o.servicios_interes ?? "—"}
                  </p>
                  {o.proyectos_relacionados && (
                    <p>
                      <span className="font-bold text-ink-900">Proyectos relacionados:</span>{" "}
                      {o.proyectos_relacionados}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Pestaña Compromisos (motor unificado) ─────────────────────────────── */

function CompromisosTab({
  clientId,
  onNew,
  onEdit,
  onDelete,
}: {
  clientId: string;
  onNew: () => void;
  onEdit: (t: TaskItem) => void;
  onDelete: (t: TaskItem) => void;
}) {
  const query = useTasksByClient(clientId);
  const tasks = query.data ?? [];
  const statusMutation = useUpdateTareaStatus(clientId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-600">
          {query.isLoading
            ? "Cargando compromisos…"
            : `${tasks.length} compromiso${tasks.length === 1 ? "" : "s"}`}
        </p>
        <Button size="sm" onClick={onNew} className="rounded-10 font-bold">
          Nuevo compromiso
        </Button>
      </div>

      {query.isError && <ErrorState message="No pudimos cargar los compromisos." />}
      {!query.isLoading && !query.isError && tasks.length === 0 && (
        <EmptyState copy="Sin compromisos: crea el primero con el botón de arriba." />
      )}

      <ul className="flex flex-col gap-2.5">
        {tasks.map((t) => {
          const vencida = t.fecha_entrega ? esVencida(t.fecha_entrega) : false;
          const abierta = t.estado !== "COMPLETADA" && t.estado !== "CANCELADA";
          return (
            <li key={t.id} className="rounded-14 border border-ink-200 bg-panel p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink-950">{t.titulo}</span>
                    <ToneBadge
                      tone={ESTADO_TAREA_LABELS[t.estado].tone}
                      label={ESTADO_TAREA_LABELS[t.estado].label}
                    />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-600">
                    {t.responsable_nombre}
                    {t.origen !== "CRM" && (
                      <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-700 uppercase">
                        {t.origen === "AMBOS" ? "CRM y tablero" : "Tablero"}
                      </span>
                    )}
                  </p>
                  {t.descripcion && (
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-ink-700">
                      {t.descripcion}
                    </p>
                  )}
                  {t.motivo_bloqueo && (
                    <p className="mt-1.5 text-[12.5px] text-destructivo">
                      Motivo del bloqueo: {t.motivo_bloqueo}
                    </p>
                  )}
                  <p
                    className={cn(
                      "mt-1.5 font-mono text-[12px] tabular-nums",
                      vencida && abierta ? "font-bold text-destructivo" : "text-ink-600",
                    )}
                  >
                    {t.fecha_entrega
                      ? `${formatFecha(t.fecha_entrega)}${vencida && abierta ? " · Vencido" : ""}`
                      : "Sin fecha límite"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {abierta ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-[9px] px-2.5 text-[11.5px] font-bold text-exito hover:bg-exito-bg hover:text-exito after:-inset-1"
                      onClick={() => statusMutation.mutate({ taskId: t.id, estado: "COMPLETADA" })}
                      disabled={statusMutation.isPending}
                    >
                      Cumplido
                    </Button>
                  ) : (
                    <span className="inline-flex h-7 items-center rounded-full bg-exito-bg px-2.5 text-[11px] font-bold text-exito">
                      ✓ Cumplido
                    </span>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar ${t.titulo}`} onClick={() => onEdit(t)} className="after:-inset-1">
                    <Pencil className="size-3.5" strokeWidth={1.9} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Eliminar ${t.titulo}`}
                    onClick={() => onDelete(t)}
                    className="text-ink-500 hover:text-destructivo after:-inset-1"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.9} />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Pestaña Bitácora (inmutable) ──────────────────────────────────────── */

function BitacoraTab({ clientId }: { clientId: string }) {
  const query = useBitacora(clientId);
  const addMutation = useAddLogEntry(clientId);
  const [texto, setTexto] = useState("");
  const entradas = query.data ?? [];

  async function submit() {
    if (!texto.trim()) return;
    try {
      await addMutation.mutateAsync({ texto: texto.trim() });
      setTexto("");
    } catch {
      /* toast handled by the hook */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Composer fijo: sticky al final del área scrolleable */}
      <div className="sticky bottom-0 z-20 rounded-14 border border-ink-200 bg-panel/95 p-4 shadow-[0_-8px_24px_rgba(25,17,19,0.05)] backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-700 dark:text-rose-400">
            <MessageSquarePlus className="size-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <textarea
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Agrega una nota de seguimiento…"
              className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[11.5px] text-ink-500">
                Una vez guardada, la nota no se puede editar ni eliminar.
              </p>
              <Button
                size="sm"
                onClick={() => void submit()}
                disabled={!texto.trim() || addMutation.isPending}
                className="rounded-10 font-bold"
              >
                {addMutation.isPending ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="size-3.5" strokeWidth={1.9} />
                )}
                {addMutation.isPending ? "Guardando…" : "Agregar nota"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {query.isError && <ErrorState message="No pudimos cargar la bitácora." />}
      {!query.isLoading && !query.isError && entradas.length === 0 && (
        <EmptyState copy="La bitácora está vacía: las notas de seguimiento se verán aquí en orden." />
      )}

      <ul className="flex flex-col gap-2.5">
        {[...entradas].reverse().map((e) => (
          <li key={e.id} className="rounded-14 border border-ink-200 bg-panel p-4">
            <div className="flex items-center gap-2 text-[11.5px] text-ink-500">
              <span className="grid size-6 place-items-center rounded-full bg-ink-100 text-[9.5px] font-bold text-ink-700">
                {iniciales(e.autor_nombre) || "?"}
              </span>
              <span className="font-semibold text-ink-800">{e.autor_nombre}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{formatFechaHora(e.created_at)}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-800">
              {e.texto}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Documentos y Tareas relacionadas ─────────────────────────────────── */

// Pestaña compacta del Repositorio (PRD §4.2): últimos 10 documentos del
// cliente con la versión activa. El CRUD completo vive en /documentos
// (?cliente=<id> deep-linkea el filtro); acá solo descarga directa.
function DocumentosTab({ clientId }: { clientId: string }) {
  const router = useRouter();
  const query = useDocuments({ cliente: clientId, limit: 10 });
  const items = query.data?.items ?? [];

  function irAlRepositorio() {
    router.push(`/documentos?cliente=${clientId}`);
  }

  function subirVinculado() {
    toast.info("Elige \"Subir documento\" y vincula el cliente en el Repositorio.");
    router.push(`/documentos?cliente=${clientId}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-600">
        Los documentos vinculados a este cliente viven en el Repositorio
        documental: desde ahí puedes descargar la versión activa o subir
        nuevos.
      </p>
      {query.isLoading &&
        Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-14" />
        ))}
      {query.isError && (
        <p className="text-[12.5px] text-ink-600">
          Servicio no disponible.
        </p>
      )}
      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState copy="Este cliente no tiene documentos vinculados todavía." />
      )}
      <ul className="flex flex-col gap-2">
        {items.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-14 border border-ink-200 bg-panel px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[11px_11px_11px_4px] bg-ink-100 text-[9px] font-bold text-ink-700">
                {doc.version_activa
                  ? (extensionOf(doc.version_activa.tipo_archivo) ?? "").toUpperCase()
                  : "—"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink-950">
                  {doc.titulo}
                </p>
                <p className="text-[12px] text-ink-600">
                  {doc.version_activa
                    ? `v${doc.version_activa.numero_version} · ${formatVersionFecha(doc.version_activa.created_at)}`
                    : "sin versión"}
                </p>
              </div>
            </div>
            {doc.version_activa && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Descargar ${doc.titulo}`}
                onClick={() => void downloadActiveVersion(doc).catch(() => undefined)}
                className="shrink-0 text-ink-500 hover:text-exito"
              >
                <Download className="size-4" strokeWidth={1.8} />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={irAlRepositorio}
          className="h-9 rounded-12 border-ink-200 bg-panel px-3 text-[12.5px] font-semibold text-ink-800 hover:bg-ink-100"
        >
          <ExternalLink className="size-3.5 text-ink-500" strokeWidth={1.8} />
          Ver todos
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={subirVinculado}
          className="h-9 rounded-12 border-ink-200 bg-panel px-3 text-[12.5px] font-semibold text-ink-800 hover:bg-ink-100"
        >
          <Upload className="size-4 text-exito" strokeWidth={1.8} />
          Subir documento vinculado
        </Button>
      </div>
    </div>
  );
}

function TareasRelacionadasTab({ clientId }: { clientId: string }) {
  const query = useTasksByClient(clientId);
  const tasks = query.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-600">
        Todas las tareas vinculadas a este cliente, incluidas las creadas en
        el tablero. El estado completo y el flujo de trabajo viven en el
        tablero.
      </p>
      {query.isLoading &&
        Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-14" />
        ))}
      {query.isError && <ErrorState message="No pudimos cargar las tareas." />}
      {!query.isLoading && !query.isError && tasks.length === 0 && (
        <EmptyState copy="Este cliente no tiene tareas vinculadas todavía." />
      )}
      <ul className="flex flex-col gap-2.5">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-14 border border-ink-200 bg-panel px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-ink-950">{t.titulo}</p>
              <p className="text-[12px] text-ink-600">
                {t.responsable_nombre}
                {t.origen !== "CRM" && ` · ${t.origen === "AMBOS" ? "CRM y tablero" : "Tablero"}`}
              </p>
            </div>
            <ToneBadge
              tone={ESTADO_TAREA_LABELS[t.estado].tone}
              label={ESTADO_TAREA_LABELS[t.estado].label}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Guard de borrado (soft delete con confirmación) ───────────────────── */

function DeleteGuard({
  clientId,
  target,
  onClose,
}: {
  clientId: string | null;
  target: DeleteTarget;
  onClose: () => void;
}) {
  const isOpen = target !== null;
  const ref = target?.ref ?? "contacto";
  const id = target?.id ?? "";

  const deleteContacto = useDeleteContacto(clientId ?? "", id);
  const deleteOportunidad = useDeleteOportunidad(clientId ?? "", id);
  const deleteTarea = useDeleteTarea(clientId ?? "", id);

  const label =
    ref === "tarea"
      ? "Eliminar compromiso"
      : ref === "oportunidad"
        ? "Eliminar oportunidad"
        : "Eliminar contacto";

  const description =
    ref === "tarea"
      ? "El compromiso se eliminará de la ficha y del tablero. Esta acción no se puede deshacer."
      : "Este registro se eliminará. La acción no se puede deshacer.";

  const pending =
    (ref === "contacto" && deleteContacto.isPending) ||
    (ref === "oportunidad" && deleteOportunidad.isPending) ||
    (ref === "tarea" && deleteTarea.isPending);

  return (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={label}
      description={description}
      pending={pending}
      onConfirm={() => {
        onClose();
        if (ref === "contacto") void deleteContacto.mutate(undefined);
        if (ref === "oportunidad") void deleteOportunidad.mutate(undefined);
        if (ref === "tarea") void deleteTarea.mutate(undefined);
      }}
    />
  );
}

/* ── Desactivar cliente (soft delete: la historia se conserva) ──────────── */

function DeactivateClientDialog({
  clientId,
  open,
  onClose,
  onDeactivated,
}: {
  clientId: string | null;
  open: boolean;
  onClose: () => void;
  onDeactivated: () => void;
}) {
  const deleteClient = useDeleteClient(clientId ?? "");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Desactivar cliente"
      description="El cliente dejará de aparecer en las listas activas, pero su historial se conserva."
      confirmLabel="Desactivar"
      pending={deleteClient.isPending}
      onConfirm={() => {
        onClose();
        void deleteClient
          .mutateAsync()
          .then(onDeactivated)
          .catch(() => undefined);
      }}
    />
  );
}

/* ── Estados auxiliares ────────────────────────────────────────────────── */

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="grid min-h-[140px] place-items-center rounded-14 border border-dashed border-ink-300 bg-ink-100/40 px-6 py-8 text-center">
      <p className="max-w-[36ch] text-[13px] leading-relaxed text-ink-600">{copy}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-14 border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
    >
      {message}
    </div>
  );
}