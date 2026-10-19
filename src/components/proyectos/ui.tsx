// Piezas compartidas de las secciones de la ficha y del tablero de Proyectos (S10 WU1): encabezado de
// sección, bloque vacío, error en línea, métricas y la clase única del `<select>` nativo (D3).

"use client";

import type { ReactNode } from "react";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { ColorSemaforo } from "@/hooks/projects";
import { cn } from "@/lib/utils";

/** `<select>` nativo (se conserva en móvil, D3). `SELECT_CLASS_LG` es la variante de formularios. */
export const SELECT_CLASS =
  "h-10 rounded-12 border border-border-strong bg-input-bg px-2.5 text-base text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 md:text-[12.5px]";
export const SELECT_CLASS_LG =
  "h-11 rounded-12 border border-border-strong bg-input-bg px-3 text-base text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 md:text-[13px]";

/** Controles de los formularios de captura: 44 px (`h-11`, modo campo) en todos los anchos; el resto lo aporta el primitivo. */
export const CAPTURE_FIELD = "h-11 px-3";
export const CAPTURE_TEXTAREA =
  "min-h-20 rounded-12 border border-border-strong bg-input-bg px-3 py-2 text-base text-ink-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-[13px]";
export const CAPTURE_BUTTON = "h-11";
export const CAPTURE_CHOICE = "flex min-h-11 items-center gap-1.5 text-[12.5px] text-ink-800 md:min-h-0";

export function SectionHeader({
  as: Tag = "h3",
  id,
  icon,
  className,
  children,
}: {
  as?: "h2" | "h3" | "h4";
  id?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase",
        className,
      )}
    >
      {icon}
      {children}
    </Tag>
  );
}

/** Bloque vacío de una sección: el `EmptyState` compartido, en versión compacta. */
export function EmptyBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <EmptyState bordered description={children} className={cn("mt-1.5 min-h-0 py-4", className)} />;
}

export function InlineError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("text-[13px] text-destructivo", className)}>
      {message}
    </p>
  );
}

export function MetricTile({
  testId,
  title,
  color,
  chipPrefix,
  children,
}: {
  testId: string;
  title?: string;
  color?: ColorSemaforo;
  chipPrefix?: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} data-color={color} className="rounded-inner border border-border bg-panel p-3">
      {color ? (
        <SemaforoChip color={color} prefix={chipPrefix} />
      ) : (
        <span className="text-[12px] font-semibold text-ink-600">{title}</span>
      )}
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] text-ink-500">{label}</span>
      <span className="font-semibold text-ink-900 tabular-nums">{value}</span>
    </div>
  );
}

/** Fila de métrica con barra accesible; `band` solo lo trae el servidor (el cliente nunca calcula el semáforo). */
export function MetricBar({
  label,
  value,
  percent,
  band,
}: {
  label: string;
  value: string;
  percent: number | null;
  band?: ColorSemaforo;
}) {
  return (
    <div className="flex flex-col gap-1">
      <MetricRow label={label} value={value} />
      {percent !== null && <ProgressBar aria-label={label} value={percent} band={band} />}
    </div>
  );
}

/** Tarjeta KPI: cifra grande (`KpiTile`) con su barra de progreso nombrada cuando hay valor. */
export function KpiCard({
  testId,
  label,
  value,
  percent,
  hint,
}: {
  testId: string;
  label: string;
  value: string;
  percent: number | null;
  hint: string;
}) {
  return (
    <div data-testid={testId} className="rounded-inner border border-border bg-panel p-3">
      <KpiTile label={label} value={value} hint={hint} />
      {percent !== null && <ProgressBar className="mt-2" aria-label={label} value={percent} />}
    </div>
  );
}

export function BigValue({ value, detalle }: { value: string; detalle: string }) {
  return (
    <div>
      <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink-950 tabular-nums">{value}</span>
      <p className="text-[11.5px] text-ink-600">{detalle}</p>
    </div>
  );
}
