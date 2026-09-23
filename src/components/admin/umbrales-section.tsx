"use client";

// Umbrales de semáforo (D10/T5, tablero-seguimiento-social): parametrización
// org-level de los cortes técnico/financiero que src/lib/semaforo.ts usa en
// colorTecnico/colorFinanciero. Mismo patrón de borrador/dirty-state y
// validación de cliente que catalogs-section.tsx (leído como referencia),
// separado en su propio componente porque ese archivo ya maneja 2 catálogos.
// Guardado por el mismo PUT /api/v1/settings (campo semaforo_umbrales,
// opcional — ver src/app/api/v1/settings/route.ts).

import { useState } from "react";
import { AlertTriangle, LoaderCircle, Save } from "lucide-react";
import {
  useSaveSettings,
  useSettings,
  type SettingsSnapshot,
} from "@/hooks/admin";
import type { UmbralesSemaforo } from "@/lib/semaforo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Draft = {
  confirmado: boolean;
  tecnico_verde: string;
  tecnico_rojo: string;
  financiero_verde_min: string;
  financiero_verde_max: string;
  financiero_amarillo_min: string;
  financiero_amarillo_max: string;
};

function toPercentString(ratio: number): string {
  return String(Math.round(ratio * 100));
}

function umbralesToDraft(u: UmbralesSemaforo): Draft {
  return {
    confirmado: u.confirmado,
    tecnico_verde: toPercentString(u.tecnico.verde),
    tecnico_rojo: toPercentString(u.tecnico.rojo),
    financiero_verde_min: toPercentString(u.financiero.verde_min),
    financiero_verde_max: toPercentString(u.financiero.verde_max),
    financiero_amarillo_min: toPercentString(u.financiero.amarillo_min),
    financiero_amarillo_max: toPercentString(u.financiero.amarillo_max),
  };
}

/** null cuando algún campo no es un número válido (input vacío/malformado);
 * la UI lo trata como "no se puede guardar todavía", no como un error de
 * coherencia específico. */
function draftToUmbrales(d: Draft): UmbralesSemaforo | null {
  const [verde, rojo, verde_min, verde_max, amarillo_min, amarillo_max] = [
    d.tecnico_verde,
    d.tecnico_rojo,
    d.financiero_verde_min,
    d.financiero_verde_max,
    d.financiero_amarillo_min,
    d.financiero_amarillo_max,
  ].map(Number);
  if (
    [verde, rojo, verde_min, verde_max, amarillo_min, amarillo_max].some(
      (n) => !Number.isFinite(n),
    )
  ) {
    return null;
  }
  return {
    confirmado: d.confirmado,
    tecnico: { verde: verde / 100, rojo: rojo / 100 },
    financiero: {
      verde_min: verde_min / 100,
      verde_max: verde_max / 100,
      amarillo_min: amarillo_min / 100,
      amarillo_max: amarillo_max / 100,
    },
  };
}

/** Mismas coherencias que valida el PUT /api/v1/settings (ver route.ts) y
 * que colorTecnico/colorFinanciero (src/lib/semaforo.ts) asumen. */
function validationErrors(parsed: UmbralesSemaforo | null): string[] {
  if (!parsed) return ["Todos los umbrales deben ser números."];
  const errors: string[] = [];
  if (parsed.tecnico.rojo > parsed.tecnico.verde) {
    errors.push("El umbral técnico 'rojo' no puede ser mayor que 'verde'.");
  }
  if (parsed.financiero.verde_min > parsed.financiero.verde_max) {
    errors.push("El umbral financiero 'verde_min' no puede ser mayor que 'verde_max'.");
  }
  if (parsed.financiero.amarillo_min > parsed.financiero.amarillo_max) {
    errors.push("El umbral financiero 'amarillo_min' no puede ser mayor que 'amarillo_max'.");
  }
  return errors;
}

function sameUmbrales(a: UmbralesSemaforo | undefined, b: UmbralesSemaforo | null): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function UmbralesSection() {
  const query = useSettings();
  const save = useSaveSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  // Ajuste durante el render (mismo patrón que catalogs-section.tsx): hidrata
  // el borrador una sola vez con el primer snapshot y nunca pisa ediciones
  // pendientes. Descartar y el guardado exitoso re-sincronizan explícito.
  const [prevSnapshot, setPrevSnapshot] = useState<SettingsSnapshot | undefined>(
    undefined,
  );
  if (query.data && query.data !== prevSnapshot) {
    setPrevSnapshot(query.data);
    if (draft === null && query.data.semaforo_umbrales) {
      setDraft(umbralesToDraft(query.data.semaforo_umbrales));
    }
  }

  const parsed = draft ? draftToUmbrales(draft) : null;
  const errors = draft ? validationErrors(parsed) : [];
  const dirty = !sameUmbrales(query.data?.semaforo_umbrales, parsed);

  if (query.isLoading || (query.data && draft === null)) {
    return (
      <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-3 h-3.5 w-72" />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </section>
    );
  }

  if (query.isError || !query.data) {
    const message =
      query.error instanceof Error
        ? query.error.message
        : "No pudimos cargar los umbrales. Inténtalo de nuevo.";
    return (
      <section className="grid min-h-[280px] place-items-center rounded-[22px] border border-ink-200 bg-panel p-8">
        <div className="max-w-[46ch] text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-alerta-bg text-alerta">
            <AlertTriangle className="size-5" strokeWidth={1.7} />
          </span>
          <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            No pudimos cargar los umbrales
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{message}</p>
          <Button
            onClick={() => void query.refetch()}
            variant="outline"
            className="mt-4 rounded-lg px-4 font-semibold"
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft!, [key]: value });
  }

  function handleDiscard() {
    if (query.data?.semaforo_umbrales) setDraft(umbralesToDraft(query.data.semaforo_umbrales));
  }

  function handleSave() {
    if (!parsed || errors.length > 0 || !query.data) return;
    save.mutate(
      {
        task_tags: query.data.task_tags,
        doc_categories: query.data.doc_categories,
        semaforo_umbrales: parsed,
      },
      {
        onSuccess: (snapshot) => {
          if (snapshot.semaforo_umbrales) setDraft(umbralesToDraft(snapshot.semaforo_umbrales));
        },
      },
    );
  }

  const saving = save.isPending;

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <div className="mb-4">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
          Umbrales de semáforo
        </h2>
        <p className="mt-0.5 text-[12.5px] text-ink-600">
          Define los cortes técnico y financiero que colorean el semáforo del tablero.
        </p>
      </div>

      <div className="mb-4 flex items-start gap-2.5 rounded-[18px] border border-ink-200 bg-ink-100/50 p-4">
        <Checkbox
          checked={draft!.confirmado}
          onCheckedChange={(v) => set("confirmado", v === true)}
          aria-label="Umbrales confirmados por el negocio"
          className="mt-0.5"
        />
        <div className="text-[12.5px] font-medium text-ink-700">
          <p>Umbrales confirmados por el negocio</p>
          <p className="mt-0.5 font-normal text-ink-600">
            Mientras no se confirme, el semáforo se calcula igual pero queda marcado
            como pendiente de validación de negocio.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[18px] border border-ink-200 bg-ink-100/50 p-4">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink-950">
            Técnico (avance real / planificado)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="umbrales-tecnico-verde">Verde igual o mayor a (%)</Label>
              <Input
                id="umbrales-tecnico-verde"
                type="number"
                inputMode="numeric"
                value={draft!.tecnico_verde}
                onChange={(e) => set("tecnico_verde", e.target.value)}
                className="h-9 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="umbrales-tecnico-rojo">Rojo menor a (%)</Label>
              <Input
                id="umbrales-tecnico-rojo"
                type="number"
                inputMode="numeric"
                value={draft!.tecnico_rojo}
                onChange={(e) => set("tecnico_rojo", e.target.value)}
                className="h-9 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>
          </div>
        </div>

        <div className="rounded-[18px] border border-ink-200 bg-ink-100/50 p-4">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink-950">
            Financiero (ejecutado / proyectado)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="umbrales-fin-verde-min">Verde mínimo (%)</Label>
              <Input
                id="umbrales-fin-verde-min"
                type="number"
                inputMode="numeric"
                value={draft!.financiero_verde_min}
                onChange={(e) => set("financiero_verde_min", e.target.value)}
                className="h-9 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="umbrales-fin-verde-max">Verde máximo (%)</Label>
              <Input
                id="umbrales-fin-verde-max"
                type="number"
                inputMode="numeric"
                value={draft!.financiero_verde_max}
                onChange={(e) => set("financiero_verde_max", e.target.value)}
                className="h-9 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="umbrales-fin-amarillo-min">Amarillo mínimo (%)</Label>
              <Input
                id="umbrales-fin-amarillo-min"
                type="number"
                inputMode="numeric"
                value={draft!.financiero_amarillo_min}
                onChange={(e) => set("financiero_amarillo_min", e.target.value)}
                className="h-9 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="umbrales-fin-amarillo-max">Amarillo máximo (%)</Label>
              <Input
                id="umbrales-fin-amarillo-max"
                type="number"
                inputMode="numeric"
                value={draft!.financiero_amarillo_max}
                onChange={(e) => set("financiero_amarillo_max", e.target.value)}
                className="h-9 rounded-12 bg-panel px-3 font-mono text-[13px]"
              />
            </div>
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 rounded-12 border border-alerta/40 bg-alerta-bg px-3 py-2 text-[12px] font-medium text-alerta">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-ink-100 pt-4">
        <Button
          variant="outline"
          disabled={!dirty || saving}
          onClick={handleDiscard}
          className="rounded-lg px-4 font-semibold"
        >
          Descartar
        </Button>
        <Button
          disabled={!dirty || saving || errors.length > 0}
          onClick={handleSave}
          className="rounded-lg px-4 font-bold"
        >
          {saving ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" strokeWidth={2} />
          )}
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </section>
  );
}
