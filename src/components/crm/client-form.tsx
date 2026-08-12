// "Nuevo cliente" / "Editar cliente" dialog. The form mirrors PRD §4.3:
// nombre + tipo_cliente + responsable are required, everything else is
// completed progressively. POS/create and PATCH/edit share the same fields
// and validation shape as the server zod schemas.

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import type {
  EstadoCliente,
  PrioridadCliente,
  TipoCliente,
} from "@prisma/client";
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
  ESTADO_CLIENTE_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import {
  useCreateClient,
  useUpdateClient,
  type ClientDetail,
} from "@/hooks/crm";

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export type ClientFormState = {
  nombre: string;
  empresa: string;
  tamano_org: string;
  ubicacion: string;
  canal_contacto_inicial: string;
  fecha_primer_contacto: string;
  tipo_cliente: TipoCliente;
  estado: EstadoCliente;
  prioridad: PrioridadCliente | "";
  responsable_id: string;
  prioridades_identificadas: string;
  riesgos_barreras: string;
  resumen_relacion: string;
};

export const EMPTY_CLIENT_STATE: ClientFormState = {
  nombre: "",
  empresa: "",
  tamano_org: "",
  ubicacion: "",
  canal_contacto_inicial: "",
  fecha_primer_contacto: "",
  tipo_cliente: "GOBIERNO_LOCAL",
  estado: "PROSPECTO",
  prioridad: "",
  responsable_id: "",
  prioridades_identificadas: "",
  riesgos_barreras: "",
  resumen_relacion: "",
};

export function ClientFormDialog({
  open,
  onOpenChange,
  cliente,
  users,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente?: ClientDetail | null;
  users: { id: string; nombre: string }[];
  onSaved: () => void;
}) {
  const isEdit = Boolean(cliente);
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient(cliente?.id ?? "");
  const pending = isEdit ? updateMutation.isPending : createMutation.isPending;

  const [form, setForm] = useState<ClientFormState>(EMPTY_CLIENT_STATE);
  const [error, setError] = useState<string | null>(null);

  // Prefill cuando cambia el objetivo (abrir o cambiar de cliente) y limpiar
  // en modo creación. Ajuste en render (patrón de React: ajustar estado ante
  // cambio de props) para evitar resincronizaciones en cada refetch.
  const formKey = `${open ? "open" : "closed"}:${cliente?.id ?? "nuevo"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      if (cliente) {
        setForm({
          nombre: cliente.nombre,
          empresa: cliente.empresa ?? "",
          tamano_org: cliente.tamano_org ?? "",
          ubicacion: cliente.ubicacion ?? "",
          canal_contacto_inicial: cliente.canal_contacto_inicial ?? "",
          fecha_primer_contacto: toDateInput(cliente.fecha_primer_contacto),
          tipo_cliente: cliente.tipo_cliente,
          estado: cliente.estado,
          prioridad: cliente.prioridad ?? "",
          responsable_id: cliente.responsable_id,
          prioridades_identificadas: cliente.prioridades_identificadas ?? "",
          riesgos_barreras: cliente.riesgos_barreras ?? "",
          resumen_relacion: cliente.resumen_relacion ?? "",
        });
      } else {
        setForm({ ...EMPTY_CLIENT_STATE });
      }
    }
  }

  function set<K extends keyof ClientFormState>(key: K, value: ClientFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.nombre.trim()) return setError("El nombre es obligatorio.");
    if (!form.responsable_id) return setError("El responsable es obligatorio.");

    const payload = {
      nombre: form.nombre.trim(),
      tipo_cliente: form.tipo_cliente,
      responsable_id: form.responsable_id,
      empresa: form.empresa.trim() || undefined,
      tamano_org: form.tamano_org.trim() || undefined,
      ubicacion: form.ubicacion.trim() || undefined,
      canal_contacto_inicial: form.canal_contacto_inicial.trim() || undefined,
      fecha_primer_contacto: form.fecha_primer_contacto || undefined,
      prioridad: form.prioridad ? (form.prioridad as PrioridadCliente) : null,
      estado: form.estado,
      prioridades_identificadas: form.prioridades_identificadas.trim() || undefined,
      riesgos_barreras: form.riesgos_barreras.trim() || undefined,
      resumen_relacion: form.resumen_relacion.trim() || undefined,
    };

    if (isEdit && cliente) {
      try {
        await updateMutation.mutateAsync(payload);
        onOpenChange(false);
        onSaved();
      } catch {
        /* toast handled by the hook */
      }
      return;
    }

    try {
      await createMutation.mutateAsync(payload);
      onOpenChange(false);
      onSaved();
    } catch {
      /* toast handled by the hook */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[22px] sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            {isEdit ? "Editar cliente" : "Nuevo cliente"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualiza la información de la ficha."
              : "Nombre, tipo de cliente y responsable son obligatorios; el resto se completa progresivamente."}
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
              <Label htmlFor="cliente-nombre">
                Nombre <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="cliente-nombre"
                required
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Ej. Alcaldía de Barranquilla"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cliente-empresa">Empresa u organización</Label>
              <Input
                id="cliente-empresa"
                value={form.empresa}
                onChange={(e) => set("empresa", e.target.value)}
                placeholder="Razón social"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cliente-tamano">Tamaño de la organización</Label>
              <Input
                id="cliente-tamano"
                value={form.tamano_org}
                onChange={(e) => set("tamano_org", e.target.value)}
                placeholder="Ej. 50–200 personas"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Tipo de cliente <span className="text-rose-500">*</span></Label>
              <Select
                value={form.tipo_cliente}
                onValueChange={(v) => set("tipo_cliente", v as TipoCliente)}
              >
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(ENUM_VALUES.TipoCliente as readonly TipoCliente[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_CLIENTE_LABELS[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Responsable <span className="text-rose-500">*</span></Label>
              <Select
                value={form.responsable_id}
                onValueChange={(v) => set("responsable_id", v ?? "")}
              >
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue placeholder="Selecciona el responsable" />
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
              <Label htmlFor="cliente-ubicacion">Ubicación</Label>
              <Input
                id="cliente-ubicacion"
                value={form.ubicacion}
                onChange={(e) => set("ubicacion", e.target.value)}
                placeholder="Ciudad, departamento"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cliente-canal">Canal de contacto inicial</Label>
              <Input
                id="cliente-canal"
                value={form.canal_contacto_inicial}
                onChange={(e) => set("canal_contacto_inicial", e.target.value)}
                placeholder="Ej. Feria, referido, red"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cliente-fecha">Fecha de primer contacto</Label>
              <Input
                id="cliente-fecha"
                type="date"
                value={form.fecha_primer_contacto}
                onChange={(e) => set("fecha_primer_contacto", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Prioridad</Label>
              <Select
                value={form.prioridad}
                onValueChange={(v) => set("prioridad", v as PrioridadCliente | "")}
              >
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue placeholder="Sin prioridad" />
                </SelectTrigger>
                <SelectContent>
                  {(ENUM_VALUES.PrioridadCliente as readonly PrioridadCliente[]).map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORIDAD_CLIENTE_LABELS[p].label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(v) => set("estado", v as EstadoCliente)}
              >
                <SelectTrigger className="h-10 w-full rounded-12 bg-panel px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENUM_VALUES.EstadoCliente.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ESTADO_CLIENTE_LABELS[s as EstadoCliente].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-14 border border-ink-200 bg-ink-100/50 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cliente-prioridades">Prioridades identificadas del cliente</Label>
              <textarea
                id="cliente-prioridades"
                rows={2}
                value={form.prioridades_identificadas}
                onChange={(e) => set("prioridades_identificadas", e.target.value)}
                placeholder="Qué le importa hoy al cliente"
                className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cliente-riesgos">Riesgos o barreras</Label>
              <textarea
                id="cliente-riesgos"
                rows={2}
                value={form.riesgos_barreras}
                onChange={(e) => set("riesgos_barreras", e.target.value)}
                placeholder="Obstáculos para cerrar o avanzar"
                className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cliente-resumen">Resumen de la relación</Label>
              <textarea
                id="cliente-resumen"
                rows={3}
                value={form.resumen_relacion}
                onChange={(e) => set("resumen_relacion", e.target.value)}
                placeholder="Historia y contexto de la relación (no acumulativo)"
                className="w-full resize-none rounded-12 border border-input bg-panel px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>

          <DialogFooter className="rounded-b-[22px]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-lg px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewClientButton({
  users,
  onSaved,
}: {
  users: { id: string; nombre: string }[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-rose-500 px-4 font-bold text-white hover:bg-rose-700"
      >
        <Plus />
        Nuevo cliente
      </Button>
      <ClientFormDialog
        open={open}
        onOpenChange={setOpen}
        users={users}
        onSaved={onSaved}
      />
    </>
  );
}