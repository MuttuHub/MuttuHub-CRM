// "Nuevo cliente" / "Editar cliente" dialog. The form mirrors PRD §4.3:
// nombre + tipo_cliente + responsable are required, everything else is
// completed progressively. POS/create and PATCH/edit share the same fields
// and validation shape as the server zod schemas.

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FileText, LoaderCircle, Plus, Search } from "lucide-react";
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
import { useDocuments, type DocumentItem } from "@/hooks/documents";

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/* ── "Cargar desde Brief existente" (QA audit #4.8 / hallazgo #5) ────────
 * Prellenado liviano y sin dependencias nuevas: el usuario elige un
 * documento ya subido al Repositorio y el único dato que se copia es el
 * título del documento como nombre sugerido del cliente. El resto de los
 * campos se completan a mano — no hay lectura del contenido del archivo. */

// Mismo límite que POST_CLIENT_SCHEMA.nombre en el servidor. Un título de
// documento normal nunca lo supera (los endpoints de /documents lo truncan
// a 200 al subir), pero el título de un documento espejado desde un adjunto
// de tarea usa el nombre de archivo tal cual (QA audit #12) y no tiene ese
// tope — sin este truncado acá, elegirlo como Brief fallaría en el submit
// con un error de validación genérico que no dice de dónde salió el valor.
const MAX_NOMBRE_LENGTH = 200;

function BriefPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (doc: DocumentItem) => void;
}) {
  const [q, setQ] = useState("");
  // Debounce (350 ms, mismo patrón que client-list.tsx/repository-list.tsx):
  // sin esto, cada tecla disparaba un GET /documents.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);
  const query = useDocuments({ q: debouncedQ || undefined, limit: 20 });
  const docs = query.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] gap-0 overflow-y-auto rounded-[22px] p-0 sm:max-w-[480px]">
        <div className="flex flex-col gap-4 p-6">
          <DialogHeader className="gap-1">
            <DialogTitle className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
              Cargar desde Brief existente
            </DialogTitle>
            <DialogDescription>
              Elige un documento del Repositorio; se usa su título como nombre del cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
              strokeWidth={1.8}
            />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, categoría, cliente…"
              aria-label="Buscar brief"
              className="h-10 rounded-12 bg-panel pl-9"
            />
          </div>

          <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
            {query.isLoading ? (
              <p className="px-1 py-3 text-[13px] text-ink-600">Buscando…</p>
            ) : docs.length === 0 ? (
              <p className="px-1 py-3 text-[13px] text-ink-600">
                No encontramos documentos que coincidan.
              </p>
            ) : (
              docs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onPick(doc)}
                  className="flex items-center gap-3 rounded-12 px-3 py-2.5 text-left hover:bg-ink-100"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-10 bg-ink-100 text-ink-600">
                    <FileText className="size-4" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-900">
                      {doc.titulo}
                    </span>
                    <span className="block truncate text-[12px] text-ink-500">
                      {doc.categoria}
                      {doc.clientes[0] ? ` · ${doc.clientes[0].nombre}` : ""}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const [briefOpen, setBriefOpen] = useState(false);

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

        {!isEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBriefOpen(true)}
            className="w-fit rounded-10 text-[12.5px] font-semibold"
          >
            <FileText className="size-3.5" strokeWidth={1.9} />
            Cargar desde Brief existente
          </Button>
        )}

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

      {!isEdit && briefOpen && (
        // Montado solo al abrir: evita un fetch de /documents (useDocuments)
        // en cada apertura de "Nuevo cliente" cuando nadie usa el picker.
        <BriefPickerDialog
          open={briefOpen}
          onOpenChange={setBriefOpen}
          onPick={(doc) => {
            set("nombre", doc.titulo.slice(0, MAX_NOMBRE_LENGTH));
            setBriefOpen(false);
          }}
        />
      )}
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