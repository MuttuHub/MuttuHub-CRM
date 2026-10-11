"use client";

// Parámetros del semáforo v2 (valores placeholder hasta que el PO los
// confirme). Edita los seis parámetros en un borrador local; cada uno muestra
// un badge "No confirmado" mientras no se marque su confirmación. Guarda por
// PATCH enviando solo lo que cambió; los errores (cliente y servidor) se
// muestran en línea.

import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import {
  useSaveSemaforoParametros,
  useSemaforoParametros,
  type SemaforoParametrosPatch,
} from "@/hooks/admin";
import {
  PARAMETRO_KEYS,
  parametrosV2Issue,
  type ParametroKey,
  type ParametrosV2,
} from "@/lib/proyectos/semaforo-v2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Meta = { label: string; hint: string; kind: "number" | "boolean" };

const META: Record<ParametroKey, Meta> = {
  umbral1: { label: "Umbral 1 (pp)", hint: "Desviación en puntos porcentuales del primer umbral.", kind: "number" },
  umbral2: { label: "Umbral 2 (pp)", hint: "Desviación en puntos porcentuales del segundo umbral.", kind: "number" },
  tolerancia: { label: "Tolerancia (%)", hint: "Margen tolerado antes de alertar.", kind: "number" },
  retraso: { label: "Retraso (%)", hint: "Porcentaje de retraso que activa la alerta.", kind: "number" },
  avance_requiere_medio: {
    label: "Avance requiere medio",
    hint: "Exige un medio de verificación al registrar un avance.",
    kind: "boolean",
  },
  modificacion_bloquea_periodos_pasados: {
    label: "Modificación bloquea periodos pasados",
    hint: "Impide editar periodos que ya cerraron.",
    kind: "boolean",
  },
};

/** Borrador: los numéricos se guardan como texto para poder borrar y reescribir. */
type DraftItem = { valor: string | boolean; confirmado: boolean };
type Draft = Record<ParametroKey, DraftItem>;

function toDraft(params: ParametrosV2): Draft {
  const draft = {} as Draft;
  for (const key of PARAMETRO_KEYS) {
    const item = params[key];
    draft[key] = {
      valor: typeof item.valor === "number" ? String(item.valor) : item.valor,
      confirmado: item.confirmado,
    };
  }
  return draft;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "No pudimos guardar los parámetros. Inténtalo de nuevo.";
}

export function UmbralesSection() {
  const query = useSemaforoParametros();
  const save = useSaveSemaforoParametros();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ajuste durante el render: hidrata una sola vez (y tras guardar, cuando el
  // borrador se descarta) sin pisar ediciones pendientes.
  if (query.data && draft === null) setDraft(toDraft(query.data));

  if (query.isLoading || (query.data && draft === null)) {
    return (
      <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="mt-4 h-40" />
      </section>
    );
  }

  if (query.isError || !query.data || !draft) {
    return (
      <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
        <p role="alert" className="text-[13px] text-alerta">
          No pudimos cargar los parámetros del semáforo.
        </p>
        <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </section>
    );
  }

  const saved = query.data;

  function parsedValor(key: ParametroKey): number | boolean {
    const v = draft![key].valor;
    return typeof v === "boolean" ? v : Number(v);
  }

  function buildPatch(): SemaforoParametrosPatch {
    const patch: Record<string, { valor?: number | boolean; confirmado?: boolean }> = {};
    for (const key of PARAMETRO_KEYS) {
      const entry: { valor?: number | boolean; confirmado?: boolean } = {};
      const valor = parsedValor(key);
      if (valor !== saved[key].valor) entry.valor = valor;
      if (draft![key].confirmado !== saved[key].confirmado) entry.confirmado = draft![key].confirmado;
      if (Object.keys(entry).length > 0) patch[key] = entry;
    }
    return patch as SemaforoParametrosPatch;
  }

  const patch = buildPatch();
  const dirty = Object.keys(patch).length > 0;

  function validate(): string | null {
    for (const key of PARAMETRO_KEYS) {
      if (META[key].kind !== "number") continue;
      const raw = draft![key].valor as string;
      const n = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) {
        return `${META[key].label} debe estar entre 0 y 100.`;
      }
    }
    const candidate = Object.fromEntries(
      PARAMETRO_KEYS.map((key) => [key, { valor: parsedValor(key), confirmado: draft![key].confirmado }]),
    ) as ParametrosV2;
    return parametrosV2Issue(candidate);
  }

  async function submit() {
    setError(null);
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    try {
      await save.mutateAsync(patch);
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function update(key: ParametroKey, next: Partial<DraftItem>) {
    setError(null);
    setDraft({ ...draft!, [key]: { ...draft![key], ...next } });
  }

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <h3 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
        Umbrales del semáforo
      </h3>
      <p className="mt-0.5 text-[13px] text-ink-600">
        Valores provisionales hasta que el equipo de producto los confirme. Marca cada parámetro como
        confirmado solo cuando esté validado.
      </p>

      <ul className="mt-4 flex flex-col divide-y divide-ink-100">
        {PARAMETRO_KEYS.map((key) => {
          const meta = META[key];
          const item = draft[key];
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-[220px] flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink-950">{meta.label}</span>
                  {item.confirmado ? (
                    <Badge variant="secondary">Confirmado</Badge>
                  ) : (
                    <Badge variant="outline">No confirmado</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-600">{meta.hint}</p>
              </div>
              <div className="flex items-center gap-4">
                {meta.kind === "number" ? (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={meta.label}
                    value={item.valor as string}
                    onChange={(e) => update(key, { valor: e.target.value })}
                    className="h-10 w-24"
                  />
                ) : (
                  <Checkbox
                    aria-label={meta.label}
                    checked={item.valor === true}
                    onCheckedChange={(v) => update(key, { valor: v === true })}
                  />
                )}
                <div className="flex items-center gap-2 text-[12px] text-ink-700">
                  <Checkbox
                    aria-label={`Confirmar ${meta.label}`}
                    checked={item.confirmado}
                    onCheckedChange={(v) => update(key, { confirmado: v === true })}
                  />
                  <span aria-hidden="true">Confirmado</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-alerta">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button disabled={!dirty || save.isPending} onClick={() => void submit()}>
          {save.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar parámetros
        </Button>
      </div>
    </section>
  );
}
