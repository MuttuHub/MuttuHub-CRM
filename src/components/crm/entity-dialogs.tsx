// Dialogs para la pestaña de contactos y oportunidades de la ficha (PRD §4.2):
// creación/edición con confirmación previa a cualquier borrado (soft delete).

"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LoaderCircle, Rocket, Target } from "lucide-react";
import type { EstadoOportunidad, RolContacto } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  ROL_CONTACTO_LABELS,
} from "@/lib/catalogs";
import {
  formatFecha,
  useAddLogEntry,
  useBitacora,
  useConvertOportunidad,
  useCreateContacto,
  useCreateOportunidad,
  useTasksByClient,
  useTasksByOportunidad,
  useUpdateContacto,
  useUpdateOportunidad,
  useUpdateTarea,
  useUsers,
  type Contacto,
  type Oportunidad,
  type OportunidadInput,
  type TaskItem,
} from "@/hooks/crm";
import { ToneBadge } from "@/components/crm/shared";
import { useCurrentUser } from "@/hooks/kanban";
import { useEligibleOpportunities } from "@/hooks/projects";
import { canCreateProject } from "@/lib/permissions";

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
      <DialogContent className="sm:max-w-[min(400px,calc(100%-2rem))]">
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

/**
 * The base-ui Select cannot carry an empty-string value, so "none" is the
 * sentinel for "sin definir"; it maps back to `null` in the payload.
 */
const SIN_VALOR = "none";

/** 1..5 options for the poder/interés axes (v7 C4b). */
const NIVELES_PODER_INTERES = [1, 2, 3, 4, 5] as const;

/** 1..3 options for fuerza_relacion, labelled so the value is not a bare number. */
const NIVELES_FUERZA: readonly { value: string; label: string }[] = [
  { value: "1", label: "Baja" },
  { value: "2", label: "Media" },
  { value: "3", label: "Alta" },
];

export type ContactoFormState = {
  nombre: string;
  cargo: string;
  correo: string;
  telefono: string;
  rol_decision: RolContacto | "";
  notas: string;
  /** v7 C4b: quadrant axes, strength and owner, kept as Select strings. */
  poder: string;
  interes: string;
  fuerza_relacion: string;
  owner_id: string;
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

  const usersQuery = useUsers();
  const users = usersQuery.data ?? [];

  const [form, setForm] = useState<ContactoFormState>({
    nombre: "",
    cargo: "",
    correo: "",
    telefono: "",
    rol_decision: "",
    notas: "",
    poder: SIN_VALOR,
    interes: SIN_VALOR,
    fuerza_relacion: SIN_VALOR,
    owner_id: SIN_VALOR,
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
          poder: contacto.poder === null ? SIN_VALOR : String(contacto.poder),
          interes: contacto.interes === null ? SIN_VALOR : String(contacto.interes),
          fuerza_relacion:
            contacto.fuerza_relacion === null ? SIN_VALOR : String(contacto.fuerza_relacion),
          owner_id: contacto.owner_id ?? SIN_VALOR,
        });
      } else {
        setForm({
          nombre: "",
          cargo: "",
          correo: "",
          telefono: "",
          rol_decision: "",
          notas: "",
          poder: SIN_VALOR,
          interes: SIN_VALOR,
          fuerza_relacion: SIN_VALOR,
          owner_id: SIN_VALOR,
        });
      }
    }
  }

  // `users` only lists active users; if the assigned owner was deactivated the
  // Select would fall back to the raw UUID, so the current owner is kept as an
  // extra option (mirrors the client-sheet responsable fix).
  const ownerOptions =
    form.owner_id === SIN_VALOR || users.some((u) => u.id === form.owner_id)
      ? users
      : [...users, { id: form.owner_id, nombre: "Usuario no disponible" }];

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
      poder: form.poder === SIN_VALOR ? null : Number(form.poder),
      interes: form.interes === SIN_VALOR ? null : Number(form.interes),
      fuerza_relacion: form.fuerza_relacion === SIN_VALOR ? null : Number(form.fuerza_relacion),
      owner_id: form.owner_id === SIN_VALOR ? null : form.owner_id,
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
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-[min(520px,calc(100%-2rem))]">
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
                className="px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-cargo">Cargo</Label>
              <Input
                id="contacto-cargo"
                value={form.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                placeholder="Ej. Secretaria de Gobierno"
                className="px-3"
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
                className="px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-telefono">Teléfono / WhatsApp</Label>
              <Input
                id="contacto-telefono"
                value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="+57 300 000 0000"
                className="px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Rol en la decisión</Label>
              <Select
                value={form.rol_decision}
                onValueChange={(v) => set("rol_decision", v as RolContacto | "")}
              >
                <SelectTrigger aria-label="Rol en la decisión" className="w-full px-3">
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

            {/* v7 C4b: the Relaciones axes, the strength and the internal owner. */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-poder">Poder</Label>
              <Select value={form.poder} onValueChange={(v) => set("poder", v ?? SIN_VALOR)}>
                <SelectTrigger id="contacto-poder" className="w-full px-3">
                  <SelectValue placeholder="Sin definir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin definir</SelectItem>
                  {NIVELES_PODER_INTERES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-interes">Interés</Label>
              <Select value={form.interes} onValueChange={(v) => set("interes", v ?? SIN_VALOR)}>
                <SelectTrigger id="contacto-interes" className="w-full px-3">
                  <SelectValue placeholder="Sin definir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin definir</SelectItem>
                  {NIVELES_PODER_INTERES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-fuerza">Fuerza de la relación</Label>
              <Select
                value={form.fuerza_relacion}
                onValueChange={(v) => set("fuerza_relacion", v ?? SIN_VALOR)}
              >
                <SelectTrigger id="contacto-fuerza" className="w-full px-3">
                  <SelectValue placeholder="Sin definir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin definir</SelectItem>
                  {NIVELES_FUERZA.map((n) => (
                    <SelectItem key={n.value} value={n.value}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-owner">Relación</Label>
              <Select value={form.owner_id} onValueChange={(v) => set("owner_id", v ?? SIN_VALOR)}>
                <SelectTrigger id="contacto-owner" className="w-full px-3">
                  <SelectValue placeholder="Sin responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Sin responsable</SelectItem>
                  {ownerOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-[12px] text-ink-500">
            Poder e interés se miden de 1 (bajo) a 5 (alto): desde 4 el contacto entra
            en un cuadrante del mapa. La fuerza de la relación va de baja a alta.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contacto-notas">Notas</Label>
            <textarea
              id="contacto-notas"
              rows={3}
              value={form.notas}
              onChange={(e) => set("notas", e.target.value)}
              placeholder="Detalles de la relación con este contacto"
              className="w-full resize-none rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="px-4 font-bold">
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
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-[min(560px,calc(100%-2rem))]">
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
                className="px-3"
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
                className="w-full resize-none rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                className="w-full resize-none rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="oportunidad-servicios">Servicios de interés</Label>
              <Input
                id="oportunidad-servicios"
                value={form.servicios_interes}
                onChange={(e) => set("servicios_interes", e.target.value)}
                placeholder="Ej. Medición, formaciones"
                className="px-3"
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
                className="px-3 font-mono text-base md:text-[13px]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(v) => set("estado", v as EstadoOportunidad)}
              >
                <SelectTrigger aria-label="Estado" className="w-full px-3">
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
                className="px-3"
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
            <Button type="submit" disabled={pending} className="px-4 font-bold">
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
 * "Convertir en proyecto": links to the new-project stepper page with this won
 * opportunity preselected. Shown only for a GANADA opportunity that has no
 * project yet (it is in the eligible list, which excludes any `proyectos` row,
 * soft-deleted included) and a user who can create projects. Hidden otherwise;
 * the API stays the authority (403/409).
 */
function ConvertirEnProyectoAction({ oportunidad }: { oportunidad: Oportunidad }) {
  const userQuery = useCurrentUser();
  const usuario = userQuery.data;
  const puedeCrear = usuario ? canCreateProject({ id: usuario.id, rol: usuario.rol }) : false;
  const eligiblesQuery = useEligibleOpportunities({ enabled: puedeCrear });

  const sinProyecto = (eligiblesQuery.data ?? []).some((op) => op.id === oportunidad.id);
  if (!puedeCrear || !sinProyecto) return null;

  return (
    <Link
      href={`/proyectos/nuevo?oportunidad=${encodeURIComponent(oportunidad.id)}`}
      className={cn(buttonVariants({ variant: "outline" }), "w-fit px-4 font-bold")}
    >
      Convertir en proyecto
    </Link>
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

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [nota, setNota] = useState("");

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-[min(620px,calc(100%-2rem))]">
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
              className="w-fit px-4 font-bold"
            >
              {convertMutation.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Convertir a ejecución
            </Button>
          )}

          {oportunidad.estado === "GANADA" && <ConvertirEnProyectoAction oportunidad={oportunidad} />}

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
                    className="surface-inner px-3 py-2 text-[12.5px] text-ink-800"
                  >
                    {t.titulo}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Select value={selectedTaskId} onValueChange={(v) => setSelectedTaskId(v ?? "")}>
                  <SelectTrigger size="sm" aria-label="Vincular tarea" className="w-full px-3 text-base md:text-[12.5px]">
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
                  className="shrink-0 px-3 text-[12.5px] font-semibold"
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
                    className="surface-inner px-3 py-2 text-[12.5px] text-ink-700"
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
                  aria-label="Nota de comunicación"
                  className="h-10 px-3 text-base md:text-[12.5px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!nota.trim() || addLogMutation.isPending}
                  onClick={() => void handleAgregarNota()}
                  className="shrink-0 px-3 text-[12.5px] font-semibold"
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
  );
}
