// Proyecto create/edit dialog (gestion-proyectos-workspace, Phase 3 — design.md
// file changes: `project-form.tsx`, spec.md "Creación y edición de Proyecto").
// Mirrors the state/validation/submit conventions of
// `src/components/crm/entity-dialogs.tsx` (OportunidadFormDialog): local
// `form` state keyed by `open`+entity id so it resets on reopen, a single
// inline `error` banner, `mutateAsync` inside try/catch (toast is handled by
// the hook), submit button disabled while pending.
//
// Fields cover exactly the 8 create/edit fields the spec lists — codigo,
// nombre, cliente_id, territorio, linea_estrategica, fecha_inicio/fecha_fin,
// beneficiarios_meta, responsable_id. `estado` is deliberately NOT a field
// here: neither `PROJECT_SCHEMA` (POST) nor `PROJECT_PATCH_SCHEMA` (PATCH) in
// `src/app/api/v1/projects/**/route.ts` accept it — it stays server-managed.
// `cliente_id` is a picker only in create mode: `PROJECT_PATCH_SCHEMA`
// excludes it entirely (fixed at creation), so edit mode shows it read-only.
// `oportunidad_id` is never part of the payload in either mode — read-only
// note only, shown when editing a project created via conversion.
// `umbrales_override` is intentionally out of scope (design.md Open
// Questions — deferred, advanced/optional field).
//
// Deviation from entity-dialogs.tsx's `required` HTML attribute convention:
// this form intentionally omits `required` on its text/date inputs. With it
// present, jsdom (and every real browser) blocks the `submit` event via
// native constraint validation before our `onSubmit` ever runs, so an empty
// mandatory field never reaches our own Spanish error banner — it would only
// ever show the browser's default validation bubble, which is inconsistent
// with the rest of this dialog's error UI and untestable through RTL. The
// JS validation below is the single source of truth for every required
// field, exactly like `CrearProyectoDialog`'s own checks already are.

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import type { LineaEstrategica } from "@prisma/client";
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
import { ENUM_VALUES, LINEA_ESTRATEGICA_LABELS } from "@/lib/catalogs";
import { useClients, useUsers } from "@/hooks/crm";
import {
  useCreateProject,
  useUpdateProject,
  type ProjectDetail,
  type ProjectInput,
} from "@/hooks/projects";

export type ProjectFormState = {
  codigo: string;
  nombre: string;
  cliente_id: string;
  territorio: string;
  linea_estrategica: LineaEstrategica | "";
  fecha_inicio: string;
  fecha_fin: string;
  beneficiarios_meta: string;
  responsable_id: string;
};

function emptyForm(): ProjectFormState {
  return {
    codigo: "",
    nombre: "",
    cliente_id: "",
    territorio: "",
    linea_estrategica: "",
    fecha_inicio: "",
    fecha_fin: "",
    beneficiarios_meta: "",
    responsable_id: "",
  };
}

function toDateValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formFromProject(project: ProjectDetail): ProjectFormState {
  return {
    codigo: project.codigo,
    nombre: project.nombre,
    cliente_id: project.cliente_id,
    territorio: project.territorio,
    linea_estrategica: project.linea_estrategica,
    fecha_inicio: toDateValue(project.fecha_inicio),
    fecha_fin: toDateValue(project.fecha_fin),
    beneficiarios_meta: String(project.beneficiarios_meta),
    responsable_id: project.responsable_id,
  };
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present ⇒ edit mode. Absent/null ⇒ create mode. */
  project?: ProjectDetail | null;
  /** Fired only after a successful create, with the new project's id. */
  onCreated?: (projectId: string) => void;
}) {
  const isEdit = Boolean(project);
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(project?.id ?? "");
  const pending = isEdit ? updateMutation.isPending : createMutation.isPending;

  const clientsQuery = useClients({ limit: 200 });
  const usersQuery = useUsers();

  const [form, setForm] = useState<ProjectFormState>(() =>
    project ? formFromProject(project) : emptyForm(),
  );
  const [error, setError] = useState<string | null>(null);

  const formKey = `${open ? "open" : "closed"}:${project?.id ?? "nuevo"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      setForm(project ? formFromProject(project) : emptyForm());
    }
  }

  function set<K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.codigo.trim()) return setError("El código de proyecto es obligatorio.");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio.");
    if (!isEdit && !form.cliente_id) return setError("El cliente es obligatorio.");
    if (!form.territorio.trim()) return setError("El territorio es obligatorio.");
    if (!form.linea_estrategica) return setError("La línea estratégica es obligatoria.");
    if (!form.fecha_inicio) return setError("La fecha de inicio es obligatoria.");
    if (!form.fecha_fin) return setError("La fecha de fin es obligatoria.");
    if (form.fecha_fin < form.fecha_inicio) {
      return setError("La fecha de fin debe ser igual o posterior a la fecha de inicio.");
    }
    if (form.beneficiarios_meta && Number(form.beneficiarios_meta) < 0) {
      return setError("Los beneficiarios meta no pueden ser negativos.");
    }

    const beneficiarios_meta = form.beneficiarios_meta ? Number(form.beneficiarios_meta) : undefined;
    const linea_estrategica = form.linea_estrategica as LineaEstrategica;

    try {
      if (isEdit && project) {
        const payload: Partial<ProjectInput> = {
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim(),
          territorio: form.territorio.trim(),
          linea_estrategica,
          fecha_inicio: form.fecha_inicio,
          fecha_fin: form.fecha_fin,
          beneficiarios_meta,
          responsable_id: form.responsable_id || undefined,
        };
        await updateMutation.mutateAsync(payload);
      } else {
        const payload: ProjectInput = {
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim(),
          cliente_id: form.cliente_id,
          territorio: form.territorio.trim(),
          linea_estrategica,
          fecha_inicio: form.fecha_inicio,
          fecha_fin: form.fecha_fin,
          beneficiarios_meta,
          responsable_id: form.responsable_id || undefined,
        };
        const result = await createMutation.mutateAsync(payload);
        onCreated?.(result.proyecto.id);
      }
      onOpenChange(false);
    } catch {
      /* toast handled by the hook */
    }
  }

  const clientes = clientsQuery.data?.items ?? [];
  const usuarios = usersQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(640px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            {isEdit ? "Editar proyecto" : "Nuevo proyecto"}
          </DialogTitle>
          <DialogDescription>
            Proyecto de impacto social: datos de identificación, línea estratégica y responsable.
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
              <Label htmlFor="proyecto-form-codigo">
                Código <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-form-codigo"
                value={form.codigo}
                onChange={(e) => set("codigo", e.target.value)}
                placeholder="Ej. PRY-2026-014"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-form-nombre">
                Nombre <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-form-nombre"
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            {isEdit ? (
              <div className="flex flex-col gap-2">
                <Label>Cliente</Label>
                <p className="rounded-12 bg-ink-100 px-3 py-2 text-[13px] text-ink-700">
                  {project?.cliente_nombre}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="proyecto-form-cliente">
                  Cliente <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={form.cliente_id}
                  onValueChange={(v) => set("cliente_id", v ?? "")}
                >
                  <SelectTrigger
                    id="proyecto-form-cliente"
                    aria-label="Cliente"
                    className="h-10 w-full rounded-12 bg-panel px-3"
                  >
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-form-territorio">
                Territorio <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-form-territorio"
                value={form.territorio}
                onChange={(e) => set("territorio", e.target.value)}
                placeholder="Ej. Barranquilla"
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-form-linea">
                Línea estratégica <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={form.linea_estrategica}
                onValueChange={(v) => set("linea_estrategica", (v ?? "") as LineaEstrategica | "")}
              >
                <SelectTrigger
                  id="proyecto-form-linea"
                  aria-label="Línea estratégica"
                  className="h-10 w-full rounded-12 bg-panel px-3"
                >
                  <SelectValue placeholder="Selecciona una línea" />
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
              <Label htmlFor="proyecto-form-responsable">Responsable</Label>
              <Select
                value={form.responsable_id}
                onValueChange={(v) => set("responsable_id", v ?? "")}
              >
                <SelectTrigger
                  id="proyecto-form-responsable"
                  aria-label="Responsable"
                  className="h-10 w-full rounded-12 bg-panel px-3"
                >
                  <SelectValue placeholder="Yo (por defecto)" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-form-fecha-inicio">
                Fecha de inicio <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-form-fecha-inicio"
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => set("fecha_inicio", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-form-fecha-fin">
                Fecha de fin <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="proyecto-form-fecha-fin"
                type="date"
                value={form.fecha_fin}
                onChange={(e) => set("fecha_fin", e.target.value)}
                className="h-10 rounded-12 bg-panel px-3"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="proyecto-form-beneficiarios">Beneficiarios meta</Label>
              <Input
                id="proyecto-form-beneficiarios"
                type="number"
                min="0"
                inputMode="numeric"
                value={form.beneficiarios_meta}
                onChange={(e) => set("beneficiarios_meta", e.target.value)}
                placeholder="0"
                className="h-10 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>

            {isEdit && project?.oportunidad_id && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label>Oportunidad de origen</Label>
                <p className="rounded-12 bg-ink-100 px-3 py-2 text-[13px] text-ink-700">
                  Este proyecto viene de la conversión de una oportunidad; ese vínculo no se
                  edita desde aquí.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="rounded-lg px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear proyecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
