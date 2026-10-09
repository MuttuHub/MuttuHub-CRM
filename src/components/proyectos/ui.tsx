// Piezas compartidas de las secciones de la ficha y del tablero de Proyectos (S10 WU1): encabezado de
// sección, bloque vacío, error en línea, métricas y la clase única del `<select>` nativo (D3).

"use client";

import type { ReactNode } from "react";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import type { ColorSemaforo } from "@/hooks/projects";
import { cn } from "@/lib/utils";

/** `<select>` nativo (se conserva en móvil, D3). `SELECT_CLASS_LG` es la variante de formularios. */
export const SELECT_CLASS =
  "h-8 rounded-12 border border-ink-200 bg-panel px-2.5 text-[12.5px] text-ink-900 disabled:opacity-60";
export const SELECT_CLASS_LG =
  "h-9 rounded-12 border border-ink-200 bg-panel px-3 text-[13px] text-ink-900 disabled:opacity-60";

export function SectionHeader({
  as: Tag = "h3",
  icon,
  className,
  children,
}: {
  as?: "h2" | "h3" | "h4";
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
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

export function EmptyBlock({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-1.5 text-[13px] text-ink-500", className)}>{children}</p>;
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
    <div data-testid={testId} data-color={color} className="rounded-[14px] border border-ink-200 bg-panel p-3">
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

export function BigValue({ value, detalle }: { value: string; detalle: string }) {
  return (
    <div>
      <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink-950 tabular-nums">{value}</span>
      <p className="text-[11.5px] text-ink-600">{detalle}</p>
    </div>
  );
}
