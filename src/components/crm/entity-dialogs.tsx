// Dialogs para la pestaña de contactos y oportunidades de la ficha (PRD §4.2):
// creación/edición con confirmación previa a cualquier borrado (soft delete).

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import type { EstadoOportunidad, RolContacto } from "@prisma/client";
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
  ROL_CONTACTO_LABELS,
} from "@/lib/catalogs";
import {
  useCreateContacto,
  useCreateOportunidad,
  useUpdateContacto,
  useUpdateOportunidad,
  type Contacto,
  type Oportunidad,
  type OportunidadInput,
} from "@/hooks/crm";

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
      <DialogContent className="rounded-[20px] sm:max-w-[400px]">
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
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[22px] sm:max-w-[520px]">
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
            className="rounded-[12px] border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
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
                className="h-10 rounded-[12px] bg-white px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-cargo">Cargo</Label>
              <Input
                id="contacto-cargo"
                value={form.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                placeholder="Ej. Secretaria de Gobierno"
                className="h-10 rounded-[12px] bg-white px-3"
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
                className="h-10 rounded-[12px] bg-white px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contacto-telefono">Teléfono / WhatsApp</Label>
              <Input
                id="contacto-telefono"
                value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="+57 300 000 0000"
                className="h-10 rounded-[12px] bg-white px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Rol en la decisión</Label>
              <Select
                value={form.rol_decision}
                onValueChange={(v) => set("rol_decision", v as RolContacto | "")}
              >
                <SelectTrigger className="h-10 w-full rounded-[12px] bg-white px-3">
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
              className="w-full resize-none rounded-[12px] border border-input bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-[13px] px-4 font-bold">
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
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[22px] sm:max-w-[560px]">
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
            className="rounded-[12px] border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
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
                className="h-10 rounded-[12px] bg-white px-3"
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
                className="w-full resize-none rounded-[12px] border border-input bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                className="w-full resize-none rounded-[12px] border border-input bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="oportunidad-servicios">Servicios de interés</Label>
              <Input
                id="oportunidad-servicios"
                value={form.servicios_interes}
                onChange={(e) => set("servicios_interes", e.target.value)}
                placeholder="Ej. Medición, formaciones"
                className="h-10 rounded-[12px] bg-white px-3"
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
                className="h-10 rounded-[12px] bg-white px-3 font-mono text-[13px]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(v) => set("estado", v as EstadoOportunidad)}
              >
                <SelectTrigger className="h-10 w-full rounded-[12px] bg-white px-3">
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
                className="h-10 rounded-[12px] bg-white px-3"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="oportunidad-proyectos">Proyectos anteriores relacionados</Label>
            <Input
              id="oportunidad-proyectos"
              value={form.proyectos_relacionados}
              onChange={(e) => set("proyectos_relacionados", e.target.value)}
              placeholder="Historial de proyectos afines"
              className="h-10 rounded-[12px] bg-white px-3"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-[13px] px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear oportunidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
