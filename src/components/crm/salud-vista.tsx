"use client";

// v7 alignment, unit C5b: the read-only "Salud de la cartera" section. It is the
// UI half of C5a's `GET /api/v1/clients/health` (SaludCarteraData: the ranked
// `clientes` list, worst first, plus the `cartera` summary). Mirrors the v7
// prototype: a portfolio summary (total aliados, per-bucket counts — Sana /
// Atención / En riesgo / Sin datos, the last one only when > 0 — and the average
// score) and the ranked aliado list (name, bucket, score, bar, motivo). Each row
// links to the aliado ficha at `/clientes?cliente=<id>` — the app's canonical
// opener (see `client-list.tsx`).
//
// The bucket is ALWAYS carried by a text label, never by colour alone; the bar
// band is a secondary cue. Reads are global, matching the client list (PR 3);
// nothing writes. The score math lives in C5a and is never recomputed here.

import Link from "next/link";
import type { UiTone } from "@/lib/catalogs";
import type { ColorSemaforo } from "@/lib/proyectos/semaforo-v2";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import {
  useSaludCartera,
  type SaludBucket,
  type SaludCartera,
  type SaludClienteRow,
} from "@/hooks/crm";

export type BucketInfo = {
  /** Visible label; the ONLY carrier of the bucket, colour is secondary. */
  label: string;
  tone: UiTone;
  /** Server semáforo band for the bar; null renders a neutral (unfilled) track. */
  band: ColorSemaforo | null;
};

/** Bucket → label + tone + progress band, in v7 order. */
export const BUCKETS: Record<SaludBucket, BucketInfo> = {
  SANA: { label: "Sana", tone: "exito", band: "verde" },
  ATENCION: { label: "Atención", tone: "alerta", band: "amarillo" },
  RIESGO: { label: "En riesgo", tone: "destructivo", band: "rojo" },
  SIN_DATOS: { label: "Sin datos", tone: "neutro", band: null },
};

const ERROR_MESSAGE = "No pudimos cargar la salud de la cartera. Inténtalo de nuevo.";

const PUNTAJE = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** A score with at most one decimal, or "Sin datos" when the score is null. */
export function formatearPuntaje(value: number | null): string {
  return value === null ? BUCKETS.SIN_DATOS.label : PUNTAJE.format(value);
}

export type ResumenItem = {
  key: keyof SaludCartera;
  label: string;
  tone: UiTone;
  valor: number;
};

/**
 * The bucket tiles of the summary, in v7 order (Sana, Atención, En riesgo). The
 * "Sin datos" tile is omitted at zero so the gauge shows only real buckets while
 * every aliado is measured.
 */
export function resumenCartera(cartera: SaludCartera): ResumenItem[] {
  const items: ResumenItem[] = [
    { key: "sana", label: BUCKETS.SANA.label, tone: BUCKETS.SANA.tone, valor: cartera.sana },
    {
      key: "atencion",
      label: BUCKETS.ATENCION.label,
      tone: BUCKETS.ATENCION.tone,
      valor: cartera.atencion,
    },
    { key: "riesgo", label: BUCKETS.RIESGO.label, tone: BUCKETS.RIESGO.tone, valor: cartera.riesgo },
  ];
  if (cartera.sin_datos > 0) {
    items.push({
      key: "sin_datos",
      label: BUCKETS.SIN_DATOS.label,
      tone: BUCKETS.SIN_DATOS.tone,
      valor: cartera.sin_datos,
    });
  }
  return items;
}

/** Decorative dot for a summary tile; the label next to it carries the meaning. */
const TILE_DOT: Record<UiTone, string> = {
  neutro: "bg-ink-400",
  activo: "bg-rose-500",
  info: "bg-info",
  riesgo: "bg-destructivo",
  exito: "bg-exito",
  alerta: "bg-alerta",
  destructivo: "bg-destructivo",
};

export function SaludVista() {
  const query = useSaludCartera();
  const data = query.data;

  if (query.isLoading) {
    return (
      <div role="status" aria-label="Cargando salud de la cartera" className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full rounded-inner" />
        <Skeleton className="h-64 w-full rounded-inner" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="rounded-inner border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
      >
        {ERROR_MESSAGE}
      </div>
    );
  }

  if (!data || data.clientes.length === 0) {
    return (
      <div className="surface p-2">
        <EmptyState
          title="Aún no hay aliados para medir"
          description="Cuando existan aliados, aquí aparecerá su puntaje de salud, ordenado de peor a mejor, con la razón de cada alerta."
        />
      </div>
    );
  }

  const { cartera, clientes } = data;
  const resumen = resumenCartera(cartera);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section
        aria-labelledby="salud-cartera"
        className="surface flex min-w-0 flex-col gap-3 p-4 lg:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="salud-cartera" className="font-display text-[15px] font-bold text-ink-950">
            Salud de la cartera
          </h2>
          <p className="text-[12.5px] text-ink-600">
            Promedio{" "}
            <span className="font-semibold text-ink-950 tabular-nums">
              {formatearPuntaje(cartera.promedio)}
            </span>
          </p>
        </div>

        <ul
          aria-label="Resumen por estado"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          <li className="surface-inner flex flex-col gap-1 p-3">
            <span className="text-[12px] font-medium text-ink-600">Aliados</span>
            <span className="font-display text-[22px] font-bold text-ink-950 tabular-nums">
              {cartera.total}
            </span>
          </li>
          {resumen.map((item) => (
            <li key={item.key} className="surface-inner flex flex-col gap-1 p-3">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-600">
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", TILE_DOT[item.tone])} />
                {item.label}
              </span>
              <span className="font-display text-[22px] font-bold text-ink-950 tabular-nums">
                {item.valor}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="salud-lista"
        className="surface flex min-w-0 flex-col gap-3 p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="salud-lista" className="font-display text-[15px] font-bold text-ink-950">
            Aliados por salud
          </h2>
          <span className="text-[11.5px] text-ink-500">De peor a mejor</span>
        </div>

        <ul aria-label="Aliados por salud" className="flex min-w-0 flex-col gap-2">
          {clientes.map((cliente) => (
            <SaludRow key={cliente.cliente_id} cliente={cliente} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function SaludRow({ cliente }: { cliente: SaludClienteRow }) {
  const info = BUCKETS[cliente.bucket];
  const puntaje = formatearPuntaje(cliente.score);

  return (
    <li className="min-w-0">
      <Link
        href={`/clientes?cliente=${cliente.cliente_id}`}
        className="surface-inner flex min-w-0 flex-col gap-2 p-3 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="truncate text-[13.5px] font-semibold text-ink-950">
            {cliente.cliente_nombre}
          </span>
          <StatusChip tone={info.tone}>{info.label}</StatusChip>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            {cliente.score === null ? (
              <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-ink-100" />
            ) : (
              <ProgressBar
                value={cliente.score}
                band={info.band ?? undefined}
                aria-label={`Salud de ${cliente.cliente_nombre}: ${info.label}, ${puntaje}`}
              />
            )}
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-ink-900 tabular-nums">
            {puntaje}
          </span>
        </div>

        <p className="text-[12.5px] text-ink-600">{cliente.motivo}</p>
      </Link>
    </li>
  );
}
