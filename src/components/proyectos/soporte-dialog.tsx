// proyecto-soportes-tab, Phase 2 (design.md "Component Structure" —
// `soporte-dialog.tsx`, spec.md "Agregar soporte desde el workspace" —
// RF-04). Mirrors `expense-dialog.tsx`'s conventions: a `formKey`-driven
// reset-on-open effect, inline `role="alert"` validation, `noValidate` on
// the form (native HTML5 constraint validation would otherwise block
// `onSubmit` from ever running).
//
// D1 (design.md): the Archivo/Enlace radio reproduces the real XOR
// `POST .../attachments` enforces — never the v6 mock's decorative
// "Formato" select.
// D2 (design.md): "Vincular a" options come from the already-cached
// `useActivities`/`useExpenses` data passed in as props, never a new fetch.

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import type { TipoSoporte } from "@prisma/client";
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
  useUploadAttachment,
  type Actividad,
  type Gasto,
  type UploadAttachmentInput,
} from "@/hooks/projects";
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_BYTES, isAllowedFileType } from "@/lib/api/files";

type ArchivoOEnlace = "archivo" | "enlace";

type SoporteFormState = {
  tipo: TipoSoporte;
  nombre: string;
  vinculoId: string;
  modo: ArchivoOEnlace;
  enlace: string;
};

function emptyForm(): SoporteFormState {
  return { tipo: "VERIFICACION", nombre: "", vinculoId: "", modo: "archivo", enlace: "" };
}

const SELECT_CLASS =
  "h-11 min-h-11 w-full rounded-12 border border-input bg-panel px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

const ALLOWED_EXTENSIONS_LABEL = Array.from(ALLOWED_FILE_EXTENSIONS)
  .map((ext) => ext.toUpperCase())
  .join(", ");

export function SoporteDialog({
  projectId,
  actividades,
  gastos,
  open,
  onOpenChange,
}: {
  projectId: string;
  actividades: Actividad[];
  gastos: Gasto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const uploadMutation = useUploadAttachment(projectId);
  const pending = uploadMutation.isPending;

  const [form, setForm] = useState<SoporteFormState>(emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formKey = open ? "open" : "closed";
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      setForm(emptyForm());
      setFile(null);
    }
  }

  function set<K extends keyof SoporteFormState>(key: K, value: SoporteFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.nombre.trim()) return setError("El documento es obligatorio.");

    if (form.modo === "enlace") {
      if (!form.enlace.trim().startsWith("https://")) {
        return setError("El enlace debe usar el esquema https://.");
      }
    } else if (!file) {
      return setError("Selecciona un archivo.");
    }

    const payload: UploadAttachmentInput = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      ...(form.vinculoId && form.tipo === "VERIFICACION" ? { actividad_id: form.vinculoId } : {}),
      ...(form.vinculoId && form.tipo === "LEGALIZACION" ? { gasto_id: form.vinculoId } : {}),
      ...(form.modo === "enlace" ? { url: form.enlace.trim() } : { file: file as File }),
    } as UploadAttachmentInput;

    try {
      await uploadMutation.mutateAsync(payload);
    } catch {
      /* toast handled by useUploadAttachment */
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(560px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Agregar soporte
          </DialogTitle>
          <DialogDescription>
            El soporte queda disponible en la pestaña Soportes del proyecto.
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

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="soporte-tipo">Tipo</Label>
              <select
                id="soporte-tipo"
                value={form.tipo}
                onChange={(e) => {
                  set("tipo", e.target.value as TipoSoporte);
                  set("vinculoId", "");
                }}
                className={SELECT_CLASS}
              >
                <option value="VERIFICACION">Verificación</option>
                <option value="LEGALIZACION">Legalización</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="soporte-vinculo">Vincular a</Label>
              <select
                id="soporte-vinculo"
                value={form.vinculoId}
                onChange={(e) => set("vinculoId", e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Soporte general del proyecto</option>
                {form.tipo === "VERIFICACION"
                  ? actividades.map((actividad) => (
                      <option key={actividad.id} value={actividad.id}>
                        {actividad.nombre}
                      </option>
                    ))
                  : gastos.map((gasto) => (
                      <option key={gasto.id} value={gasto.id}>
                        {gasto.concepto} · {gasto.linea.rubro.nombre}
                      </option>
                    ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="soporte-documento">
                Documento <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="soporte-documento"
                required
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                placeholder="Ej. Listas de asistencia taller 3"
                className="h-11 min-h-11 rounded-12 bg-panel px-3 text-base"
              />
            </div>

            <div className="flex items-center gap-5 sm:col-span-2">
              <label className="flex min-h-11 items-center gap-2 text-[13px] font-medium text-ink-800">
                <input
                  type="radio"
                  name="soporte-modo"
                  value="archivo"
                  checked={form.modo === "archivo"}
                  onChange={() => set("modo", "archivo")}
                  className="size-4"
                />
                Archivo
              </label>
              <label className="flex min-h-11 items-center gap-2 text-[13px] font-medium text-ink-800">
                <input
                  type="radio"
                  name="soporte-modo"
                  value="enlace"
                  checked={form.modo === "enlace"}
                  onChange={() => set("modo", "enlace")}
                  className="size-4"
                />
                Enlace
              </label>
            </div>

            {form.modo === "archivo" ? (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="soporte-archivo">
                  Archivo ({ALLOWED_EXTENSIONS_LABEL} · máx {MAX_FILE_BYTES / (1024 * 1024)} MB)
                </Label>
                <input
                  id="soporte-archivo"
                  type="file"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null;
                    if (selected && !isAllowedFileType(selected)) {
                      setError(`Formato no permitido. Usa ${ALLOWED_EXTENSIONS_LABEL}.`);
                      setFile(null);
                      return;
                    }
                    if (selected && selected.size > MAX_FILE_BYTES) {
                      setError(`El archivo supera el máximo de ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
                      setFile(null);
                      return;
                    }
                    setError(null);
                    setFile(selected);
                  }}
                  className="h-11 min-h-11 w-full rounded-12 border border-input bg-panel px-3 py-2 text-base"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="soporte-enlace">
                  Enlace (https) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="soporte-enlace"
                  type="url"
                  required
                  value={form.enlace}
                  onChange={(e) => set("enlace", e.target.value)}
                  placeholder="https://drive.google.com/…"
                  className="h-11 min-h-11 rounded-12 bg-panel px-3 text-base"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-11">
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} className="min-h-11 rounded-lg px-4 font-bold">
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? "Guardando…" : "Guardar soporte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
