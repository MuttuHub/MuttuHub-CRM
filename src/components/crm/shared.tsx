// Small shared UI pieces for the CRM module: tone badges, priority chips,
// initials avatars and the read-only field grid used in the client ficha.
// Tone mapping follows the semantic palette in globals.css (products §4.7).

"use client";

import { cn } from "@/lib/utils";
import type { UiTone } from "@/lib/catalogs";
import { iniciales } from "@/hooks/crm";

const TONE_BADGE: Record<UiTone, string> = {
  neutro: "bg-ink-100 text-ink-700",
  activo: "bg-rose-50 text-rose-700",
  alerta: "bg-alerta-bg text-alerta",
  riesgo: "bg-destructivo-bg text-destructivo",
  exito: "bg-exito-bg text-exito",
  info: "bg-info-bg text-info",
  destructivo: "bg-destructivo-bg text-destructivo",
};

export function ToneBadge({
  tone,
  label,
  className,
}: {
  tone: UiTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[24px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap",
        TONE_BADGE[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/* Client priority chip palette: Alta → destructivo, Media → alerta, Baja → info. */
export const PRIORIDAD_CHIP: Record<string, UiTone> = {
  ALTA: "destructivo",
  MEDIA: "alerta",
  BAJA: "info",
};

export function PrioridadChip({ prioridad }: { prioridad: string | null }) {
  if (!prioridad) return <span className="text-[12.5px] text-ink-500">—</span>;
  return (
    <span
      className={cn(
        "inline-flex h-[24px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap",
        TONE_BADGE[PRIORIDAD_CHIP[prioridad] ?? "neutro"],
      )}
    >
      <span
        className={cn(
          "size-[6px] rounded-full",
          prioridad === "ALTA"
            ? "bg-destructivo"
            : prioridad === "MEDIA"
              ? "bg-alerta"
              : "bg-info",
        )}
      />
      {prioridad === "ALTA" ? "Alta" : prioridad === "MEDIA" ? "Media" : "Baja"}
    </span>
  );
}

export function InitialsAvatar({
  nombre,
  className,
}: {
  nombre: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-11 bg-ink-100 text-[10.5px] font-bold text-ink-700",
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

export function ResponsableCell({
  nombre,
  className,
}: {
  nombre: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <InitialsAvatar nombre={nombre} />
      <span className="max-w-[160px] truncate text-[13px] font-medium text-ink-800">
        {nombre}
      </span>
    </div>
  );
}

/* Read-only key/value for the "General" tab of the ficha. */
export function FieldValue({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-[13.5px] leading-snug text-ink-900",
          mono && "font-mono text-[12.5px] tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}