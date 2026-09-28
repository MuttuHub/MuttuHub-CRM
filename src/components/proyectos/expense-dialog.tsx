// proyecto-legalizacion-tab, Phase 4 (design.md "Registrar gasto" modal,
// spec.md "Registrar gasto crea el soporte en el mismo flujo cuando
// corresponde" — RF-06). Mirrors `entity-dialogs.tsx`'s conventions: a
// `formKey`-driven reset-on-open effect, inline `role="alert"` validation.
//
// Copy taken verbatim from the v6 design handoff ("Web app views
// creation/design_handoff_muttu_hub_v6/Muttu Hub v6.dc.html", `formCatalog`
// entry `gasto`): field labels, "Guardar gasto" CTA, "Lo adjunto ahora" /
// "Lo adjunto después" options, and the enlace field's exact label/
// placeholder.
//
// design D2: "Soporte: ahora" chains TWO client-side calls — create gasto,
// then create the soporte via the existing attachments hook
// (`useUploadAttachment`, `tipo: LEGALIZACION`) — never a combined backend
// endpoint. If the second call fails, the gasto already exists correctly in
// "Falta soporte" state; the error shown here must never claim the gasto
// itself failed.
//
// Deviation from the other proyectos dialogs (`entity-dialogs.tsx`,
// `indicadores-tab.tsx`): Rubro and Soporte use a native `<select>` instead
// of the Base UI `Select` — this form's selects are simple, and a native
// element keeps them directly testable via `userEvent.selectOptions` /
// `getByLabelText`, with no behavioral difference for the user.
//
// Touch targets: inputs/selects/buttons here use `min-h-11` (>=44px) per
// this change's explicit requirement (task 4.7) — a deviation from this
// repo's prevailing `h-10` dialog convention, applied only in this file.

"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
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
  useCreateExpense,
  useUploadAttachment,
  type ExpenseInput,
  type LineaOption,
} from "@/hooks/projects";

type SoporteOpcion = "ahora" | "despues";

type ExpenseFormState = {
  linea_id: string;
  concepto: string;
  tercero: string;
  monto_cop: string;
  numero_comprobante: string;
  fecha_gasto: string;
  soporte: SoporteOpcion;
  enlace: string;
};

function emptyForm(): ExpenseFormState {
  return {
    linea_id: "",
    concepto: "",
    tercero: "",
    monto_cop: "",
    numero_comprobante: "",
    fecha_gasto: "",
    soporte: "ahora",
    enlace: "",
  };
}

const SELECT_CLASS =
  "h-11 min-h-11 w-full rounded-12 border border-input bg-panel px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

export function ExpenseDialog({
  projectId,
  lineas,
  open,
  onOpenChange,
}: {
  projectId: string;
  lineas: LineaOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createMutation = useCreateExpense(projectId);
  const uploadMutation = useUploadAttachment(projectId);
  const pending = createMutation.isPending || uploadMutation.isPending;

  const [form, setForm] = useState<ExpenseFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const formKey = open ? "open" : "closed";
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    if (open) {
      setError(null);
      setForm(emptyForm());
    }
  }

  function set<K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.linea_id) return setError("El rubro es obligatorio.");
    if (!form.concepto.trim()) return setError("El concepto es obligatorio.");
    const monto = Number(form.monto_cop);
    if (!form.monto_cop || Number.isNaN(monto) || monto <= 0) {
      return setError("El valor debe ser mayor a cero.");
    }
    if (!form.fecha_gasto) return setError("La fecha es obligatoria.");
    if (form.soporte === "ahora" && !form.enlace.trim().startsWith("https://")) {
      return setError("El enlace debe usar el esquema https://.");
    }

    const payload: ExpenseInput = {
      linea_id: form.linea_id,
      concepto: form.concepto.trim(),
      monto_cop: monto,
      fecha_gasto: form.fecha_gasto,
      ...(form.tercero.trim() ? { tercero: form.tercero.trim() } : {}),
      ...(form.numero_comprobante.trim() ? { numero_comprobante: form.numero_comprobante.trim() } : {}),
    };

    let gastoId: string;
    try {
      const { gasto } = await createMutation.mutateAsync(payload);
      gastoId = gasto.id;
    } catch {
      /* toast handled by useCreateExpense; gasto was NOT created */
      return;
    }

    if (form.soporte === "ahora") {
      try {
        await uploadMutation.mutateAsync({
          nombre: form.concepto.trim(),
          tipo: "LEGALIZACION",
          gasto_id: gastoId,
          url: form.enlace.trim(),
        });
      } catch {
        // The gasto already exists (previous call succeeded) — this error
        // is scoped to the soporte attach step only, per design D2. Keep
        // the dialog open so the user sees it; do not re-throw a "gasto
        // failed" message.
        setError(
          "El gasto se guardó correctamente, pero no pudimos adjuntar el soporte. Puedes adjuntarlo más tarde desde la pestaña Soportes.",
        );
        return;
      }
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[22px] sm:max-w-[min(560px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            Registrar gasto
          </DialogTitle>
          <DialogDescription>
            El valor suma al ejecutado del rubro y recalcula el semáforo financiero.
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

        {/* `noValidate`: this form owns its own validation (see handleSubmit)
            so every failure path — including the ones asserted by tests —
            surfaces through the shared `role="alert"` box instead of being
            silently intercepted by native HTML5 constraint validation
            (`required`/`type="url"`), which would block `onSubmit` from
            ever running. `required`/`type` attributes stay for a11y and
            input-mode semantics only. */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="gasto-rubro">
                Rubro <span className="text-rose-500">*</span>
              </Label>
              <select
                id="gasto-rubro"
                required
                value={form.linea_id}
                onChange={(e) => set("linea_id", e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Selecciona un rubro</option>
                {lineas.map((linea) => (
                  <option key={linea.id} value={linea.id}>
                    {linea.rubro_nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="gasto-concepto">
                Concepto <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="gasto-concepto"
                required
                value={form.concepto}
                onChange={(e) => set("concepto", e.target.value)}
                placeholder="Ej. Nómina 1.ª quincena"
                className="h-11 min-h-11 rounded-12 bg-panel px-3 text-base"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="gasto-tercero">Tercero</Label>
              <Input
                id="gasto-tercero"
                value={form.tercero}
                onChange={(e) => set("tercero", e.target.value)}
                placeholder="Nombre del beneficiario o proveedor"
                className="h-11 min-h-11 rounded-12 bg-panel px-3 text-base"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="gasto-valor">
                Valor (COP) <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="gasto-valor"
                type="number"
                min="0"
                inputMode="numeric"
                required
                value={form.monto_cop}
                onChange={(e) => set("monto_cop", e.target.value)}
                placeholder="0"
                className="h-11 min-h-11 rounded-12 bg-panel px-3 text-base font-mono"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="gasto-comprobante">N.º de comprobante</Label>
              <Input
                id="gasto-comprobante"
                value={form.numero_comprobante}
                onChange={(e) => set("numero_comprobante", e.target.value)}
                placeholder="Ej. 301"
                className="h-11 min-h-11 rounded-12 bg-panel px-3 text-base"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="gasto-fecha">
                Fecha <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="gasto-fecha"
                type="date"
                required
                value={form.fecha_gasto}
                onChange={(e) => set("fecha_gasto", e.target.value)}
                className="h-11 min-h-11 rounded-12 bg-panel px-3 text-base"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="gasto-soporte">Soporte de legalización</Label>
              <select
                id="gasto-soporte"
                value={form.soporte}
                onChange={(e) => set("soporte", e.target.value as SoporteOpcion)}
                className={SELECT_CLASS}
              >
                <option value="ahora">Lo adjunto ahora</option>
                <option value="despues">Lo adjunto después</option>
              </select>
            </div>

            {form.soporte === "ahora" && (
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="gasto-enlace">
                  Factura, cuenta de cobro o planilla (enlace) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="gasto-enlace"
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
              {pending ? "Guardando…" : "Guardar gasto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
