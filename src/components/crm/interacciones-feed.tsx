"use client";

// v7 alignment, unit C3b: the read-only cross-client Interacciones feed. It is
// the UI half of C3a's `GET /api/v1/interactions` (items carry cliente_nombre,
// autor_nombre, oportunidad_nombre, tipo, proximo_paso, created_at). The entries
// are the immutable `BitacoraEntrada` rows, so this component never edits or
// deletes: creation stays on the per-client log via the dialog. Filter chips
// mirror the v7 prototype (Todas + the TipoInteraccion catalog) and the timeline
// reuses the v6 primitives (`surface`/`surface-inner`, StatusChip, EmptyState).

import { useState } from "react";
import type { TipoInteraccion } from "@prisma/client";
import type { UiTone } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { formatFechaHora, iniciales, useInteractions } from "@/hooks/crm";

/** Spanish label per TipoInteraccion, shared with the dialog and the bitácora. */
export const TIPO_INTERACCION_LABELS: Record<TipoInteraccion, string> = {
  REUNION: "Reunión",
  CORREO: "Correo",
  LLAMADA: "Llamada",
  VISITA: "Visita",
  OTRO: "Otro",
};

/** Chip tone per tipo: tokens only, so both themes flip (no raw palette). */
export const TIPO_INTERACCION_TONES: Record<TipoInteraccion, UiTone> = {
  REUNION: "activo",
  CORREO: "info",
  LLAMADA: "neutro",
  VISITA: "alerta",
  OTRO: "neutro",
};

/** Catalog order, mirrors the Prisma enum (route + schema). */
export const TIPO_INTERACCION_ORDER: readonly TipoInteraccion[] = [
  "REUNION",
  "CORREO",
  "LLAMADA",
  "VISITA",
  "OTRO",
];

type TipoFiltro = TipoInteraccion | "todas";

export function InteraccionesFeed() {
  const [tipo, setTipo] = useState<TipoFiltro>("todas");
  const query = useInteractions(tipo === "todas" ? {} : { tipo });
  const items = query.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div role="group" aria-label="Filtrar interacciones" className="flex flex-wrap gap-2">
        <FiltroChip activo={tipo === "todas"} onClick={() => setTipo("todas")}>
          Todas
        </FiltroChip>
        {TIPO_INTERACCION_ORDER.map((t) => (
          <FiltroChip key={t} activo={tipo === t} onClick={() => setTipo(t)}>
            {TIPO_INTERACCION_LABELS[t]}
          </FiltroChip>
        ))}
      </div>

      {query.isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-inner" />
          ))}
        </div>
      )}

      {query.isError && (
        <div
          role="alert"
          className="rounded-inner border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
        >
          No pudimos cargar las interacciones. Inténtalo de nuevo.
        </div>
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <div className="surface p-2">
          <EmptyState
            title="No hay interacciones registradas"
            description="Reuniones, llamadas y correos de todos los aliados aparecerán aquí, en orden, con su próximo paso."
          />
        </div>
      )}

      {items.length > 0 && (
        <ol className="flex flex-col gap-3">
          {items.map((e) => (
            <li key={e.id} className="surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={TIPO_INTERACCION_TONES[e.tipo]}>
                  {TIPO_INTERACCION_LABELS[e.tipo]}
                </StatusChip>
                <span className="text-[13.5px] font-semibold text-ink-950">
                  {e.cliente_nombre}
                </span>
                {e.oportunidad_nombre && (
                  <>
                    <span aria-hidden="true" className="text-ink-400">
                      ·
                    </span>
                    <span className="text-[12.5px] text-ink-600">{e.oportunidad_nombre}</span>
                  </>
                )}
                <span className="ml-auto font-mono text-[11.5px] text-ink-500">
                  {formatFechaHora(e.created_at)}
                </span>
              </div>

              <p className="mt-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-800">
                {e.texto}
              </p>

              {e.proximo_paso && (
                <div className="surface-inner mt-3 px-3 py-2">
                  <p className="text-[11px] font-bold tracking-[0.06em] text-ink-500 uppercase">
                    Próximo paso
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-800">{e.proximo_paso}</p>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-500">
                <span className="grid size-6 place-items-center rounded-full bg-ink-100 text-[9.5px] font-bold text-ink-700">
                  {iniciales(e.autor_nombre) || "?"}
                </span>
                <span className="font-semibold text-ink-800">{e.autor_nombre}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FiltroChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full border px-4 text-[14px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        activo
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-border-strong bg-transparent text-ink-800 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
