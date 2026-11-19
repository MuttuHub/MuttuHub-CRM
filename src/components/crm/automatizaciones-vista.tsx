"use client";

// v7 alignment, unit C7b: the "Seguimiento automático" section — the UI half of
// C7a's `GET/PUT /api/v1/settings/automatizaciones`. GET is open to any
// authenticated user (the section reads globally, like the client list), PUT is
// ADMINISTRADOR-only, so the form is editable for an admin and read-only for
// every other role. The setting is not a catalog but a singleton the daily cron
// consumes: `resumen_diario` turns the send on/off, `dias_por_vencer` is the
// window of the "próximos" bucket and `categorias` picks which buckets the
// summary includes. Only the fields that changed are PUT (the route merges a
// partial body), and the min/max of the numeric input mirror the schema.
//
// V8 adds the "remind commitments N days before" and "alert after N days
// without contact" rules: each one an on/off switch plus its day threshold,
// stored in the same setting. The email templates are still unmodeled.

import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import {
  useAutomatizaciones,
  useUpdateAutomatizaciones,
  type Automatizaciones,
  type AutomatizacionesInput,
  type ReglaAutomatizacion,
} from "@/hooks/crm";
import { useCurrentUser } from "@/hooks/kanban";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirror of DIAS_POR_VENCER_MIN/MAX in src/lib/settings.ts (the schema). */
const DIAS_MIN = 1;
const DIAS_MAX = 30;

type CategoriaKey = "vencidos" | "hoy" | "proximos";

type ReglaKey = "recordar_compromisos" | "alertar_sin_contacto";

/** V8 rules. min/max/default mirror src/lib/settings.ts (the schema). */
const REGLAS: readonly {
  key: ReglaKey;
  label: string;
  hint: string;
  diasLabel: string;
  min: number;
  max: number;
  default: ReglaAutomatizacion;
}[] = [
  {
    key: "recordar_compromisos",
    label: "Recordar compromisos",
    hint: "Avisa al responsable cuando a un compromiso abierto le faltan estos días para vencer.",
    diasLabel: "Días antes del compromiso",
    min: 1,
    max: 30,
    default: { activo: true, dias: 2 },
  },
  {
    key: "alertar_sin_contacto",
    label: "Alertar sin contacto",
    hint: "Avisa al responsable de un aliado que lleva estos días o más sin contacto registrado.",
    diasLabel: "Días sin contacto",
    min: 1,
    max: 365,
    default: { activo: true, dias: 30 },
  },
];

/** A server deployed before V8 omits the rules: fall back to their defaults. */
function reglaGuardada(data: Automatizaciones, key: ReglaKey): ReglaAutomatizacion {
  return (data[key] as ReglaAutomatizacion | undefined) ?? REGLAS.find((r) => r.key === key)!.default;
}

const CATEGORIAS: readonly { key: CategoriaKey; label: string; hint: string }[] = [
  { key: "vencidos", label: "Vencidos", hint: "Compromisos cuya fecha ya pasó." },
  { key: "hoy", label: "Hoy", hint: "Compromisos que vencen el día de hoy." },
  {
    key: "proximos",
    label: "Próximos",
    hint: "Compromisos dentro de la ventana de días configurada.",
  },
];

/** Local, uncontrolled draft: the numeric field stays text so it can be cleared. */
type Draft = {
  resumen_diario: boolean;
  dias_por_vencer: string;
  categorias: Record<CategoriaKey, boolean>;
  reglas: Record<ReglaKey, { activo: boolean; dias: string }>;
};

function toDraft(data: Automatizaciones): Draft {
  const regla = (key: ReglaKey) => {
    const saved = reglaGuardada(data, key);
    return { activo: saved.activo, dias: String(saved.dias) };
  };
  return {
    reglas: { recordar_compromisos: regla("recordar_compromisos"), alertar_sin_contacto: regla("alertar_sin_contacto") },
    resumen_diario: data.resumen_diario,
    dias_por_vencer: String(data.dias_por_vencer),
    categorias: {
      vencidos: data.categorias.vencidos,
      hoy: data.categorias.hoy,
      proximos: data.categorias.proximos,
    },
  };
}

export function AutomatizacionesVista() {
  const query = useAutomatizaciones();
  const save = useUpdateAutomatizaciones();
  const userQuery = useCurrentUser();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const puedeEditar = userQuery.data?.rol === "ADMINISTRADOR";

  // Hidrata una sola vez (y de nuevo tras guardar, cuando el borrador se
  // descarta y la caché ya trae el valor fresco), sin pisar ediciones pendientes.
  if (query.data && draft === null) setDraft(toDraft(query.data));

  if (query.isLoading || (query.data && draft === null)) {
    return (
      <section className="surface p-5 lg:p-6">
        <div role="status" aria-label="Cargando automatizaciones" className="flex flex-col gap-4">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-14 w-full rounded-inner" />
          <Skeleton className="h-32 w-full rounded-inner" />
        </div>
      </section>
    );
  }

  if (query.isError || !query.data || !draft) {
    return (
      <section className="surface p-5 lg:p-6">
        <p role="alert" className="text-[13px] text-alerta">
          No pudimos cargar las automatizaciones. Inténtalo de nuevo.
        </p>
        <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </section>
    );
  }

  const saved = query.data;

  function buildPatch(): AutomatizacionesInput {
    const patch: AutomatizacionesInput = {};
    if (draft!.resumen_diario !== saved.resumen_diario) {
      patch.resumen_diario = draft!.resumen_diario;
    }
    const dias = Number(draft!.dias_por_vencer);
    if (Number.isInteger(dias) && dias !== saved.dias_por_vencer) {
      patch.dias_por_vencer = dias;
    }
    const categorias: Partial<Record<CategoriaKey, boolean>> = {};
    for (const { key } of CATEGORIAS) {
      if (draft!.categorias[key] !== saved.categorias[key]) categorias[key] = draft!.categorias[key];
    }
    if (Object.keys(categorias).length > 0) patch.categorias = categorias;
    for (const { key } of REGLAS) {
      const actual = reglaGuardada(saved, key);
      const borrador = draft!.reglas[key];
      const cambios: Partial<ReglaAutomatizacion> = {};
      if (borrador.activo !== actual.activo) cambios.activo = borrador.activo;
      const reglaDias = Number(borrador.dias);
      if (Number.isInteger(reglaDias) && reglaDias !== actual.dias) cambios.dias = reglaDias;
      if (Object.keys(cambios).length > 0) patch[key] = cambios;
    }
    return patch;
  }

  const patch = buildPatch();
  const dirty = Object.keys(patch).length > 0;

  function validate(): string | null {
    const raw = draft!.dias_por_vencer.trim();
    const dias = Number(raw);
    if (raw === "" || !Number.isInteger(dias) || dias < DIAS_MIN || dias > DIAS_MAX) {
      return `Días por vencer debe estar entre ${DIAS_MIN} y ${DIAS_MAX}.`;
    }
    for (const regla of REGLAS) {
      const reglaRaw = draft!.reglas[regla.key].dias.trim();
      const reglaDias = Number(reglaRaw);
      if (reglaRaw === "" || !Number.isInteger(reglaDias) || reglaDias < regla.min || reglaDias > regla.max) {
        return `${regla.diasLabel} debe estar entre ${regla.min} y ${regla.max}.`;
      }
    }
    return null;
  }

  async function submit() {
    setFeedback(null);
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    try {
      await save.mutateAsync(patch);
      setFeedback("Cambios guardados.");
      setDraft(null);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "No pudimos guardar las automatizaciones. Inténtalo de nuevo.",
      );
    }
  }

  function update(next: Partial<Draft>) {
    setError(null);
    setFeedback(null);
    setDraft({ ...draft!, ...next });
  }

  function toggleCategoria(key: CategoriaKey, checked: boolean) {
    setError(null);
    setFeedback(null);
    setDraft({ ...draft!, categorias: { ...draft!.categorias, [key]: checked } });
  }

  function updateRegla(key: ReglaKey, next: Partial<{ activo: boolean; dias: string }>) {
    setError(null);
    setFeedback(null);
    setDraft({ ...draft!, reglas: { ...draft!.reglas, [key]: { ...draft!.reglas[key], ...next } } });
  }

  return (
    <section aria-labelledby="automatizaciones-titulo" className="surface flex flex-col gap-4 p-5 lg:p-6">
      <div>
        <h2
          id="automatizaciones-titulo"
          className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950"
        >
          Seguimiento automático
        </h2>
        <p className="mt-0.5 max-w-[62ch] text-[13px] text-ink-600">
          El resumen diario que el CRM envía con los compromisos vencidos, los de
          hoy y los próximos a vencer. Se ejecuta una vez al día, sin intervención
          manual.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-ink-100">
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-[220px] flex-1">
            <span className="text-[13px] font-semibold text-ink-950">Resumen diario</span>
            <p className="mt-0.5 text-[12px] text-ink-600">
              Cuando está apagado, el resumen no se envía (el cron omite la corrida).
            </p>
          </div>
          <Switch
            label="Resumen diario"
            checked={draft.resumen_diario}
            disabled={!puedeEditar}
            onCheckedChange={(checked) => update({ resumen_diario: checked })}
          />
        </li>

        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-[220px] flex-1">
            <span className="text-[13px] font-semibold text-ink-950">Días por vencer</span>
            <p className="mt-0.5 text-[12px] text-ink-600">
              Cuántos días hacia adelante cubre el bucket «Próximos» ({DIAS_MIN}–{DIAS_MAX}).
            </p>
          </div>
          <Input
            type="number"
            min={DIAS_MIN}
            max={DIAS_MAX}
            inputMode="numeric"
            aria-label="Días por vencer"
            disabled={!puedeEditar}
            value={draft.dias_por_vencer}
            onChange={(e) => update({ dias_por_vencer: e.target.value })}
            className="h-10 w-24"
          />
        </li>
      </ul>

      <fieldset className="flex flex-col gap-2" disabled={!puedeEditar}>
        <legend className="text-[13px] font-semibold text-ink-950">Categorías incluidas</legend>
        {CATEGORIAS.map(({ key, label, hint }) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[200px] flex-1">
              <span className="text-[13px] font-medium text-ink-900">{label}</span>
              <p className="mt-0.5 text-[12px] text-ink-600">{hint}</p>
            </div>
            <Switch
              label={label}
              checked={draft.categorias[key]}
              disabled={!puedeEditar}
              onCheckedChange={(checked) => toggleCategoria(key, checked)}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={!puedeEditar}>
        <legend className="text-[13px] font-semibold text-ink-950">Reglas de aviso</legend>
        <p className="text-[12px] text-ink-600">
          Cada aviso llega en el resumen diario, en un correo propio y como notificación en el CRM.
        </p>
        <ul className="flex flex-col divide-y divide-ink-100">
          {REGLAS.map((regla) => (
            <li key={regla.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-[220px] flex-1">
                <span className="text-[13px] font-medium text-ink-900">{regla.label}</span>
                <p className="mt-0.5 text-[12px] text-ink-600">
                  {regla.hint} ({regla.min}–{regla.max} días)
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={regla.min}
                  max={regla.max}
                  inputMode="numeric"
                  aria-label={regla.diasLabel}
                  disabled={!puedeEditar}
                  value={draft.reglas[regla.key].dias}
                  onChange={(e) => updateRegla(regla.key, { dias: e.target.value })}
                  className="h-10 w-24"
                />
                <Switch
                  label={regla.label}
                  checked={draft.reglas[regla.key].activo}
                  disabled={!puedeEditar}
                  onCheckedChange={(checked) => updateRegla(regla.key, { activo: checked })}
                />
              </div>
            </li>
          ))}
        </ul>
      </fieldset>

      {!puedeEditar && (
        <p className="text-[12.5px] text-ink-600">
          Solo un administrador puede cambiar esta configuración. El resto de roles
          la ven en solo lectura.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-[13px] text-alerta">
          {error}
        </p>
      ) : null}

      {feedback ? (
        <p role="status" className="text-[13px] font-medium text-exito">
          {feedback}
        </p>
      ) : null}

      {puedeEditar && (
        <div className="flex gap-2">
          <Button disabled={!dirty || save.isPending} onClick={() => void submit()}>
            {save.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * Toggle switch. The repo has no shared `ui/switch` primitive (and this unit's
 * edit surface excludes the primitives dir), so it lives here with the same
 * vocabulary as the Checkbox primitive: `role="switch"`, a token track, a
 * `primary-foreground` (white in both themes) thumb and the shared focus ring.
 */
function Switch({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-rose-500" : "bg-ink-200",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-primary-foreground transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
