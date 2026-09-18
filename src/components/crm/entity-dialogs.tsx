// Dialogs para la pestaña de contactos y oportunidades de la ficha (PRD §4.2):
// creación/edición con confirmación previa a cualquier borrado (soft delete).

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Rocket, Target, FolderPlus } from "lucide-react";
import type { EstadoOportunidad, LineaEstrategica, RolContacto } from "@prisma/client";
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
import {
  ENUM_VALUES,
  ESTADO_OPORTUNIDAD_LABELS,
  LINEA_ESTRATEGICA_LABELS,
  ROL_CONTACTO_LABELS,
} from "@/lib/catalogs";
import {
  formatFecha,
  useAddLogEntry,
  useBitacora,
  useConvertOportunidad,
  useCreateContacto,
  useCreateOportunidad,
  useCreateProjectFromOportunidad,
  useProjectByOportunidad,
  useTasksByClient,
  useTasksByOportunidad,
  useUpdateContacto,
  useUpdateOportunidad,
  useUpdateTarea,
  type Contacto,
  type CreateProjectFromOportunidadInput,
  type Oportunidad,
  type OportunidadInput,
  type TaskItem,
} from "@/hooks/crm";
import { ToneBadge } from "@/components/crm/shared";

/* ── Confirm dialog (shared delete guard) ──────────────────────────────── */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Eliminar",
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[20px] sm:max-w-[min(400px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[17px] font-bold text-ink-950">
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Contacto ──────────────────────────────────────────────────────────── */

export type ContactoFormState = {
  nombre: string;
  cargo: string;
  correo: string;
  telefono: string;
  rol_decision: RolContacto | "";
  notas: string;
};

export function ContactoFormDialog({
  clientId,
  open,
  onOpenChange,
  contacto,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto?: Contacto | null;
}) {
  const isEdit = Boolean(contacto);
  const createMutation = useCreateContacto(clientId);
  const updateMutation = useUpdateContacto(clientId, contacto?.id ?? "");
  const pending = isEdit ? updateMutation.isPending : createMutation.isPending;

  const [form, setForm] = useState<ContactoFormState>({
    nombre: "",
    cargo: "",
    correo: "",
    telefono: "",
    rol_decision: "",
    notas: "",
  });
  const [error, setError] = useState<string | null>(null);

  const formKey = `${open ? "open" : "closed"}:${contacto?.id ?? "nuevo"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      if (contacto) {
        setForm({
          nombre: contacto.nombre,
          cargo: contacto.cargo ?? "",
          correo: contacto.correo ?? "",
          telefono: contacto.telefono ?? "",
          rol_decision: contacto.rol_decision ?? "",
          notas: contacto.notas ?? "",
        });
      } else {
        setForm({ nombre: "", cargo: "", correo: "", telefono: "", rol_decision: "", notas: "" });
      }
    }
  }

  function set<K extends keyof ContactoFormState>(key: K, value: ContactoFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!form.nombre.trim()) return setError("El nombre del contacto es obligatorio.");

    const payload = {
      nombre: form.nombre.trim(),
      cargo: form.cargo.trim() || null,
      correo: form.correo.trim() || null,
      telefono: form.telefono.trim() || null,
      rol_decision: form.rol_decision ? (form.rol_decision as RolContacto) : null,
      notas: form.notas.trim() || null,
    };

    try {
      if (isEdit && contacto) {
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
            {isEdit ? "Editar contacto" : "Agregar contacto"}
          </DialogTitle>
          <DialogDescription>
            Persona de contacto del cliente y su rol en la decisión.
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
              <Label htmlFor="contacto-nombre">
                Nombre <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="contacto-nombre"
                required
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Nombre y apellido"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-cargo">Cargo</Label>
              <Input
                id="contacto-cargo"
                value={form.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                placeholder="Ej. Secretaria de Gobierno"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-correo">Correo electrónico</Label>
              <Input
                id="contacto-correo"
                type="email"
                value={form.correo}
                onChange={(e) => set("correo", e.target.value)}
                placeholder="nombre@entidad.co"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-telefono">Teléfono / WhatsApp</Label>
              <Input
                id="contacto-telefono"
                value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="+57 300 000 0000"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Rol en la decisión</Label>
              <Select
                value={form.rol_decision}
                onValueChange={(v) => set("rol_decision", v as RolContacto | "")}
              >
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue placeholder="Sin rol definido" />
                </SelectTrigger>
                <SelectContent>
                  {ENUM_VALUES.RolContacto.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROL_CONTACTO_LABELS[r as RolContacto].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contacto-notas">Notas</Label>
            <textarea
              id="contacto-notas"
              rows={3}
              value={form.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Detalles de la relación con este contacto"
              className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-lg px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar contacto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Oportunidad ───────────────────────────────────────────────────────── */

export type OportunidadFormState = {
  nombre: string;
  problema_detectado: string;
  solucion_propuesta: string;
  servicios_interes: string;
  valor_estimado_cop: string;
  estado: EstadoOportunidad;
  fecha_ultima_gestion: string;
  proyectos_relacionados: string;
};

function toDateValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function OportunidadFormDialog({
  clientId,
  open,
  onOpenChange,
  oportunidad,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oportunidad?: Oportunidad | null;
}) {
  const isEdit = Boolean(oportunidad);
  const createMutation = useCreateOportunidad(clientId);
  const updateMutation = useUpdateOportunidad(clientId, oportunidad?.id ?? "");
  const pending = isEdit ? updateMutation.isPending : createMutation.isPending;

  const [form, setForm] = useState<OportunidadFormState>({
    nombre: "",
    problema_detectado: "",
    solucion_propuesta: "",
    servicios_interes: "",
    valor_estimado_cop: "",
    estado: "DISENANDO_PROPUESTA",
    fecha_ultima_gestion: "",
    proyectos_relacionados: "",
  });
  const [error, setError] = useState<string | null>(null);

  const formKey = `${open ? "open" : "closed"}:${oportunidad?.id ?? "nuevo"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      if (oportunidad) {
        setForm({
          nombre: oportunidad.nombre,
          problema_detectado: oportunidad.problema_detectado ?? "",
          solucion_propuesta: oportunidad.solucion_propuesta ?? "",
          servicios_interes: oportunidad.servicios_interes ?? "",
          valor_estimado_cop:
            oportunidad.valor_estimado_cop === null
              ? ""
              : String(oportunidad.valor_estimado_cop),
          estado: oportunidad.estado,
          fecha_ultima_gestion: toDateValue(oportunidad.fecha_ultima_gestion),
          proyectos_relacionados: oportunidad.proyectos_relacionados ?? "",
        });
      } else {
        setForm({
          nombre: "",
          problema_detectado: "",
          solucion_propuesta: "",
          servicios_interes: "",
          valor_estimado_cop: "",
          estado: "DISENANDO_PROPUESTA",
          fecha_ultima_gestion: "",
          proyectos_relacionados: "",
        });
      }
    }
  }

  function set<K extends keyof OportunidadFormState>(
    key: K,
    value: OportunidadFormState[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!form.nombre.trim()) return setError("El nombre de la oportunidad es obligatorio.");
    if (form.valor_estimado_cop && Number(form.valor_estimado_cop) < 0) {
      return setError("El valor estimado no puede ser negativo.");
    }

    const payload: OportunidadInput = {
      nombre: form.nombre.trim(),
      problema_detectado: form.problema_detectado.trim() || null,
      solucion_propuesta: form.solucion_propuesta.trim() || null,
      servicios_interes: form.servicios_interes.trim() || null,
      valor_estimado_cop: form.valor_estimado_cop
        ? Number(form.valor_estimado_cop)
        : null,
      estado: form.estado,
      fecha_ultima_gestion: form.fecha_ultima_gestion || null,
      proyectos_relacionados: form.proyectos_relacionados.trim() || null,
    };

    try {
      if (isEdit && oportunidad) {
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
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(560px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            {isEdit ? "Editar oportunidad" : "Nueva oportunidad"}
          </DialogTitle>
          <DialogDescription>
            Oportunidad comercial vinculada al cliente; el valor estimado
            alimenta el pipeline.
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
              <Label htmlFor="oportunidad-nombre">
                Nombre <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="oportunidad-nombre"
                required
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Ej. Consultoría línea base 2026"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="oportunidad-problema">Problema detectado</Label>
              <textarea
                id="oportunidad-problema"
                rows={2}
                value={form.problema_detectado}
                onChange={(e) => set("problema_detectado", e.target.value)}
                placeholder="Necesidad o dolor que detectamos en el cliente"
                className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="oportunidad-solucion">Solución propuesta</Label>
              <textarea
                id="oportunidad-solucion"
                rows={2}
                value={form.solucion_propuesta}
                onChange={(e) => set("solucion_propuesta", e.target.value)}
                placeholder="Cómo la resolveríamos"
                className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="oportunidad-servicios">Servicios de interés</Label>
              <Input
                id="oportunidad-servicios"
                value={form.servicios_interes}
                onChange={(e) => set("servicios_interes", e.target.value)}
                placeholder="Ej. Medición, formaciones"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="oportunidad-valor">Valor estimado (COP)</Label>
              <Input
                id="oportunidad-valor"
                type="number"
                min="0"
                inputMode="numeric"
                value={form.valor_estimado_cop}
                onChange={(e) => set("valor_estimado_cop", e.target.value)}
                placeholder="0"
                className="h-10 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(v) => set("estado", v as EstadoOportunidad)}
              >
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENUM_VALUES.EstadoOportunidad.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ESTADO_OPORTUNIDAD_LABELS[s as EstadoOportunidad].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="oportunidad-fecha">Fecha de última gestión</Label>
              <Input
                id="oportunidad-fecha"
                type="date"
                value={form.fecha_ultima_gestion}
                onChange={(e) => set("fecha_ultima_gestion", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>
          </div>

          {/* D8: deprecated — superseded by `fase` + Tarea.oportunidad_id.
              Dropped from the create/edit form; still shown read-only when
              non-empty (data isn't lost, just no longer editable here). */}
          {form.proyectos_relacionados && (
            <div className="flex flex-col gap-1">
              <Label>Proyectos anteriores relacionados (histórico)</Label>
              <p className="rounded-12 bg-ink-100 px-3 py-2 text-[13px] text-ink-700">
                {form.proyectos_relacionados}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-lg px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear oportunidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Ciclo de vida de la oportunidad (RF-C02/RF-C03/RF-C04) ──────────────── */

/** RNF-C01: same amber/emerald semantics as the Kanban chip (task-card.tsx). */
function FaseBadge({ fase }: { fase: Oportunidad["fase"] }) {
  if (fase === "EJECUCION") {
    return (
      <span className="inline-flex h-[24px] items-center gap-1 rounded-full bg-emerald-100 px-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
        <Rocket className="size-3" strokeWidth={1.9} />
        Ejecución
      </span>
    );
  }
  return (
    <span className="inline-flex h-[24px] items-center gap-1 rounded-full bg-amber-100 px-2.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
      <Target className="size-3" strokeWidth={1.9} />
      Prospección
    </span>
  );
}

/**
 * tablero-seguimiento-social (Fase 2b.6, design.md T2): "Crear proyecto
 * desde oportunidad ganada". Prefills `nombre` from the opportunity and
 * `fecha_inicio` from `fecha_adjudicacion` (both editable) — cliente_id and
 * oportunidad_id are NEVER part of this form; they come from the URL on the
 * server side (T2), same invariant as the Convert action.
 */
function CrearProyectoDialog({
  clientId,
  oportunidadId,
  oportunidadNombre,
  fechaSugerida,
  open,
  onOpenChange,
}: {
  clientId: string;
  oportunidadId: string;
  oportunidadNombre: string;
  fechaSugerida: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createMutation = useCreateProjectFromOportunidad(clientId, oportunidadId);

  const [form, setForm] = useState({
    codigo: "",
    nombre: oportunidadNombre,
    territorio: "",
    linea_estrategica: ENUM_VALUES.LineaEstrategica[0] as LineaEstrategica,
    fecha_inicio: toDateValue(fechaSugerida),
    fecha_fin: "",
    beneficiarios_meta: "",
  });
  const [error, setError] = useState<string | null>(null);

  const formKey = `${open ? "open" : "closed"}:${oportunidadId}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      setForm({
        codigo: "",
        nombre: oportunidadNombre,
        territorio: "",
        linea_estrategica: ENUM_VALUES.LineaEstrategica[0] as LineaEstrategica,
        fecha_inicio: toDateValue(fechaSugerida),
        fecha_fin: "",
        beneficiarios_meta: "",
      });
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!form.codigo.trim()) return setError("El código de proyecto es obligatorio.");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio.");
    if (!form.territorio.trim()) return setError("El territorio es obligatorio.");
    if (!form.fecha_inicio) return setError("La fecha de inicio es obligatoria.");
    if (!form.fecha_fin) return setError("La fecha de fin es obligatoria.");

    const payload: CreateProjectFromOportunidadInput = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      territorio: form.territorio.trim(),
      linea_estrategica: form.linea_estrategica,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      beneficiarios_meta: form.beneficiarios_meta ? Number(form.beneficiarios_meta) : undefined,
    };

    try {
      await createMutation.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      /* toast handled by the hook */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(560px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Crear proyecto
          </DialogTitle>
          <DialogDescription>
            Proyecto de impacto social originado desde esta oportunidad adjudicada.
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-codigo">
                Código <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-codigo"
                required
                value={form.codigo}
                onChange={(e) => set("codigo", e.target.value)}
                placeholder="Ej. PRY-2026-014"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-nombre">
                Nombre <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-nombre"
                required
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-territorio">
                Territorio <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-territorio"
                required
                value={form.territorio}
                onChange={(e) => set("territorio", e.target.value)}
                placeholder="Ej. Barranquilla"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Línea estratégica</Label>
              <Select
                value={form.linea_estrategica}
                onValueChange={(v) => set("linea_estrategica", v as LineaEstrategica)}
              >
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENUM_VALUES.LineaEstrategica.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LINEA_ESTRATEGICA_LABELS[l as LineaEstrategica].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-fecha-inicio">
                Fecha de inicio <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-fecha-inicio"
                type="date"
                required
                value={form.fecha_inicio}
                onChange={(e) => set("fecha_inicio", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-fecha-fin">
                Fecha de fin <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-fecha-fin"
                type="date"
                required
                value={form.fecha_fin}
                onChange={(e) => set("fecha_fin", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-beneficiarios">Beneficiarios meta</Label>
              <Input
                id="proyecto-beneficiarios"
                type="number"
                min="0"
                inputMode="numeric"
                value={form.beneficiarios_meta}
                onChange={(e) => set("beneficiarios_meta", e.target.value)}
                placeholder="0"
                className="h-10 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="rounded-lg px-4 font-bold">
              {createMutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
              {createMutation.isPending ? "Creando…" : "Crear proyecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OportunidadLifecycleDialog({
  clientId,
  open,
  onOpenChange,
  oportunidad,
  readOnly,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oportunidad: Oportunidad | null;
  /** D4: no `canManageOpportunity` → can read the cycle, cannot convert or link tasks. */
  readOnly?: boolean;
}) {
  const oportunidadId = oportunidad?.id ?? null;
  const tareasQuery = useTasksByOportunidad(clientId, oportunidadId);
  const clientTasksQuery = useTasksByClient(clientId);
  const bitacoraQuery = useBitacora(clientId);
  const convertMutation = useConvertOportunidad(clientId, oportunidadId ?? "");
  const linkTaskMutation = useUpdateTarea();
  const addLogMutation = useAddLogEntry(clientId);
  // tablero-seguimiento-social (Fase 2b.6): existencia previa gatea CTA vs. enlace.
  const projectQuery = useProjectByOportunidad(
    oportunidad?.fase === "EJECUCION" ? oportunidadId : null,
  );

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [nota, setNota] = useState("");
  const [crearProyectoOpen, setCrearProyectoOpen] = useState(false);

  if (!oportunidad) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[min(560px,calc(100%-2rem))]" />
      </Dialog>
    );
  }

  const tareas = tareasQuery.data ?? [];
  const tareasVinculadasIds = new Set(tareas.map((t) => t.id));
  const tareasVinculables = (clientTasksQuery.data ?? []).filter(
    (t: TaskItem) => t.oportunidad_id === null && !tareasVinculadasIds.has(t.id),
  );
  const bitacora = (bitacoraQuery.data ?? []).filter((e) => e.oportunidad_id === oportunidad.id);
  const puedeConvertir =
    !readOnly && oportunidad.estado === "GANADA" && oportunidad.fase === "PROSPECCION";

  async function handleVincular() {
    if (!selectedTaskId || !oportunidad) return;
    await linkTaskMutation.mutateAsync({
      taskId: selectedTaskId,
      clienteId: clientId,
      input: { oportunidad_id: oportunidad.id },
    });
    setSelectedTaskId("");
  }

  async function handleAgregarNota() {
    if (!nota.trim() || !oportunidad) return;
    await addLogMutation.mutateAsync({ texto: nota.trim(), oportunidad_id: oportunidad.id });
    setNota("");
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(620px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            {oportunidad.nombre}
          </DialogTitle>
          <DialogDescription>
            Ciclo comercial: estado, tareas vinculadas y bitácora de comunicación.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge
              tone={ESTADO_OPORTUNIDAD_LABELS[oportunidad.estado].tone}
              label={ESTADO_OPORTUNIDAD_LABELS[oportunidad.estado].label}
            />
            <FaseBadge fase={oportunidad.fase} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold tracking-[0.06em] text-ink-500 uppercase">
                Fecha de envío de propuesta
              </p>
              <p className="text-[13px] text-ink-800">{formatFecha(oportunidad.fecha_envio_propuesta)}</p>
            </div>
            {oportunidad.fase === "EJECUCION" && (
              <div>
                <p className="text-[11px] font-bold tracking-[0.06em] text-ink-500 uppercase">
                  Fecha de adjudicación
                </p>
                <p className="text-[13px] text-ink-800">{formatFecha(oportunidad.fecha_adjudicacion)}</p>
              </div>
            )}
          </div>

          {oportunidad.proyectos_relacionados && (
            <div>
              <p className="text-[11px] font-bold tracking-[0.06em] text-ink-500 uppercase">
                Proyectos anteriores relacionados (histórico)
              </p>
              <p className="text-[13px] text-ink-700">{oportunidad.proyectos_relacionados}</p>
            </div>
          )}

          {puedeConvertir && (
            <Button
              onClick={() => void convertMutation.mutateAsync()}
              disabled={convertMutation.isPending}
              className="w-fit rounded-lg px-4 font-bold"
            >
              {convertMutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Convertir a ejecución
            </Button>
          )}

          {/* tablero-seguimiento-social (Fase 2b.6, D1/T2): la acción "Crear
              proyecto" solo tiene sentido tras la conversión (fase EJECUCION).
              El servidor sigue siendo la autoridad (canCreateProject) —
              readOnly aquí solo evita mostrar un CTA que de todos modos
              respondería 403, igual que "Vincular"/"Agregar" abajo. */}
          {!readOnly &&
            oportunidad.fase === "EJECUCION" &&
            (projectQuery.data ? (
              <a
                href={`/proyectos/${projectQuery.data.id}`}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-ink-200 bg-panel px-4 py-2 text-[13px] font-bold text-ink-800 hover:bg-ink-100"
              >
                <FolderPlus className="size-4" strokeWidth={1.9} />
                Ver proyecto: {projectQuery.data.codigo}
              </a>
            ) : (
              <Button
                variant="outline"
                onClick={() => setCrearProyectoOpen(true)}
                className="w-fit rounded-lg px-4 font-bold"
              >
                <FolderPlus className="size-4" strokeWidth={1.9} />
                Crear proyecto
              </Button>
            ))}

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-bold text-ink-900">
              Tareas vinculadas ({tareas.length})
            </p>
            {tareas.length === 0 ? (
              <p className="text-[12.5px] text-ink-500">Sin tareas vinculadas todavía.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {tareas.map((t) => (
                  <li
                    key={t.id}
                    className="rounded-10 border border-ink-200 bg-panel px-3 py-2 text-[12.5px] text-ink-800"
                  >
                    {t.titulo}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Select value={selectedTaskId} onValueChange={(v) => setSelectedTaskId(v ?? "")}>
                  <SelectTrigger className="h-9 w-full rounded-10 bg-panel px-3 text-[12.5px]">
                    <SelectValue placeholder="Vincular una tarea existente del cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {tareasVinculables.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedTaskId || linkTaskMutation.isPending}
                  onClick={() => void handleVincular()}
                  className="shrink-0 rounded-10 px-3 text-[12.5px] font-semibold"
                >
                  Vincular
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-bold text-ink-900">Bitácora de comunicación</p>
            {bitacora.length === 0 ? (
              <p className="text-[12.5px] text-ink-500">Sin entradas de bitácora para esta oportunidad.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {bitacora.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-10 border border-ink-200 bg-panel px-3 py-2 text-[12.5px] text-ink-700"
                  >
                    <span className="font-semibold text-ink-900">{e.autor_nombre}:</span> {e.texto}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Agregar una nota de comunicación"
                  className="h-9 rounded-10 bg-panel px-3 text-[12.5px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!nota.trim() || addLogMutation.isPending}
                  onClick={() => void handleAgregarNota()}
                  className="shrink-0 rounded-10 px-3 text-[12.5px] font-semibold"
                >
                  Agregar
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <CrearProyectoDialog
      clientId={clientId}
      oportunidadId={oportunidad.id}
      oportunidadNombre={oportunidad.nombre}
      fechaSugerida={oportunidad.fecha_adjudicacion}
      open={crearProyectoOpen}
      onOpenChange={setCrearProyectoOpen}
    />
    </>
  );
}
