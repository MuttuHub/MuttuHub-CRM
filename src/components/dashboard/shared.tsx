// Pieces compartidos de las caras del dashboard (Hito 6, PRD §7): mapa de
// tonos (los mismos UiTone de src/lib/catalogs.ts), tarjeta de sección,
// mini-barras horizontales, tarjeta "Plataforma no conectada", skeleton y
// helpers de fechas. Sin dependencias de librerías de charts.

import { TriangleAlert } from "lucide-react";
import type { UiTone } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Punto de color por tono (catálogos) — usado en chips y barras. */
export const TONE_DOT: Record<UiTone, string> = {
  neutro: "bg-ink-300",
  activo: "bg-rose-400",
  alerta: "bg-alerta",
  riesgo: "bg-destructivo",
  exito: "bg-exito",
  info: "bg-info",
  destructivo: "bg-destructivo",
};

/** Fondo de barra de progreso por tono. */
export const TONE_BAR: Record<UiTone, string> = {
  neutro: "bg-ink-300",
  activo: "bg-rose-400",
  alerta: "bg-alerta",
  riesgo: "bg-destructivo",
  exito: "bg-exito",
  info: "bg-info",
  destructivo: "bg-destructivo",
};

/* ── Tarjeta de sección ─────────────────────────────────────────────────── */

export function CardSection({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-600">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Stat tile (KPI / comparativo) ──────────────────────────────────────── */

export function StatTile({
  label,
  value,
  foot,
  acento,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  acento?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border p-[18px]",
        acento ? "border-rose-500 bg-rose-500" : "border-ink-200 bg-panel",
      )}
    >
      <span
        className={cn(
          "block text-[12px] font-semibold",
          acento ? "text-rose-100" : "text-ink-600",
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          "mt-2.5 font-display text-[26px] leading-[1.12] font-extrabold tracking-[-0.03em] tabular-nums break-words lg:text-[28px]",
          acento ? "text-white" : "text-ink-950",
          mono && "font-mono tracking-[-0.04em]",
        )}
      >
        {value}
      </div>
      {foot && (
        <div className={cn("mt-2 text-[11.5px]", acento ? "text-rose-100" : "text-ink-600")}>
          {foot}
        </div>
      )}
    </div>
  );
}

/* ── Fila de barra proporcional ─────────────────────────────────────────── */

export function BarRow({
  label,
  count,
  total,
  tone,
  right,
}: {
  label: React.ReactNode;
  count: number;
  total: number;
  tone?: UiTone;
  right?: React.ReactNode;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="group">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink-800">
          {tone && <span className={cn("size-[7px] shrink-0 rounded-full", TONE_DOT[tone])} />}
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink-700">
          {count}
          <span className="ml-1.5 text-[11px] font-medium text-ink-500">{pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-[7px] overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", tone ? TONE_BAR[tone] : "bg-ink-500")}
          style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
        />
      </div>
      {right}
    </div>
  );
}

/* ── Barra apilada (segmentos con tono semántico) ───────────────────────── */

export function StackedBarRow({
  label,
  segments,
  total,
  right,
}: {
  label: React.ReactNode;
  /** Segmentos con valor > 0; el orden define el apilado de izquierda a derecha. */
  segments: { name: string; value: number; tone: UiTone }[];
  total: number;
  right?: React.ReactNode;
}) {
  const visible = segments.filter((s) => s.value > 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return (
    <div className="group">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink-800">
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink-700">
          {total}
        </span>
      </div>
      {/* La barra es aria-hidden: el dato vive en la frase sr-only de abajo. */}
      <div
        aria-hidden
        className="mt-1.5 flex h-[7px] overflow-hidden rounded-full bg-ink-100"
      >
        {visible.map((s) => (
          <div
            key={s.name}
            className={cn("h-full", TONE_BAR[s.tone])}
            style={{ width: `${Math.max(pct(s.value), s.value > 0 ? 1.5 : 0)}%` }}
          />
        ))}
      </div>
      <p className="sr-only">
        {label}: {visible.map((s) => `${s.value} ${s.name}`).join(", ")} de {total}.
      </p>
      {right}
    </div>
  );
}

/* ── Chip selector (presets / días) ─────────────────────────────────────── */

export function ChipSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-12 bg-ink-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-bold whitespace-nowrap transition-colors",
            value === o.value
              ? "bg-card text-ink-950 shadow-sm"
              : "text-ink-600 hover:text-ink-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Estados: sin conexión / skeleton ───────────────────────────────────── */

export function SinConexionCard({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="grid min-h-[320px] place-items-center rounded-[24px] border border-ink-200 bg-panel p-8">
      <div className="max-w-[46ch] text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-alerta-bg text-alerta">
          <TriangleAlert className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          Plataforma no conectada
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
          Comprueba tu conexión e inténtalo de nuevo.
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-5 rounded-lg px-4 font-semibold">
          Reintentar
        </Button>
      </div>
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[20px] border border-ink-200 bg-panel p-[18px]">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-3 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-[22px] border border-ink-200 bg-panel p-6">
            <Skeleton className="h-5 w-40" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }).map((__, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Días transcurridos desde una fecha ISO (misma regla MS/día del API). */
const MS_DIA = 24 * 60 * 60 * 1000;

export function diasDesde(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / MS_DIA));
}

/** Detección del envelope "Plataforma no configurada" (modo dev sin Supabase). */
export function esEnvelopeNoConfigurado(err: unknown): boolean {
  return err instanceof Error && err.message.includes("no configurada");
}