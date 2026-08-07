import type { Metadata } from "next";
import {
  Clock,
  DollarSign,
  Flag,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { AGENDA, KPIS_INICIO, MESES, type Tone } from "@/lib/mock/demo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Inicio",
};

const KPI_ICONS: Record<string, LucideIcon> = {
  pipeline: DollarSign,
  bandera: Flag,
  reloj: Clock,
  tendencia: TrendingUp,
};

const TONE_BADGE: Record<Tone, string> = {
  neutro: "bg-ink-100 text-ink-700",
  activo: "bg-rose-50 text-rose-700",
  alerta: "bg-alerta-bg text-alerta",
  riesgo: "bg-destructivo-bg text-destructivo",
  exito: "bg-exito-bg text-exito",
  info: "bg-info-bg text-info",
};

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const agenda = AGENDA[6] ?? [];

  return (
    <div className="flex flex-col gap-4">
      {notice === "admin_only" && (
        <div className="flex items-center gap-2.5 rounded-[14px] border border-alerta/30 bg-alerta-bg px-4 py-3 text-[13px] font-medium text-alerta">
          <Flag className="size-4 shrink-0" strokeWidth={1.9} />
          Solo los administradores pueden acceder a Usuarios y permisos.
        </div>
      )}
      <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {KPIS_INICIO.map((k) => {
          const Icon = KPI_ICONS[k.icon];
          return (
            <div
              key={k.label}
              className={cn(
                "rounded-[20px] border p-[18px]",
                k.acento
                  ? "border-rose-500 bg-rose-500"
                  : "border-ink-200 bg-white",
              )}
            >
              <div className="mb-3.5 flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    k.acento ? "text-rose-100" : "text-ink-600",
                  )}
                >
                  {k.label}
                </span>
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-[10px]",
                    k.acento
                      ? "bg-white/20 text-white"
                      : "bg-ink-100 text-ink-700",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                </span>
              </div>
              <div
                className={cn(
                  "font-display text-[29px] leading-none font-extrabold tracking-[-0.03em] tabular-nums lg:text-[31px]",
                  k.acento ? "text-white" : "text-ink-950",
                )}
              >
                {k.val}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-[21px] items-center rounded-full px-2 text-[11px] font-bold",
                    k.acento
                      ? "bg-white/20 text-white"
                      : k.malo
                        ? "bg-destructivo-bg text-destructivo"
                        : "bg-exito-bg text-exito",
                  )}
                >
                  {k.delta}
                </span>
                <span
                  className={cn(
                    "text-[11.5px]",
                    k.acento ? "text-rose-100" : "text-ink-600",
                  )}
                >
                  {k.foot}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="rounded-[22px] border border-ink-200 bg-white p-5 lg:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
                Pipeline del año
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-600">
                Valor gestionado por mes · barras claras = proyección
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-700">
                <span className="size-[9px] rounded-[3px] bg-rose-500" />
                Ejecutado
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-700">
                <span className="size-[9px] rounded-[3px] bg-rose-200" />
                Proyectado
              </span>
            </div>
          </div>

          <div className="flex h-[186px] items-end gap-1.5 pb-1">
            {MESES.map((m) => (
              <div
                key={m.label}
                className="flex h-full flex-1 flex-col items-center gap-2"
              >
                <div className="relative flex w-full flex-1 items-end rounded-[9px] bg-ink-100">
                  {m.hoy && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-[9px] bg-ink-950 px-2 py-1 font-mono text-[11px] font-medium whitespace-nowrap text-white shadow-sm">
                      {m.tooltip}
                    </span>
                  )}
                  <span
                    className={cn(
                      "w-full rounded-[9px]",
                      m.proy
                        ? "bg-rose-200"
                        : m.hoy
                          ? "bg-rose-500"
                          : "bg-rose-400",
                    )}
                    style={{ height: `${m.v}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px]",
                    m.hoy
                      ? "font-bold text-ink-950"
                      : "font-medium text-ink-600",
                  )}
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[22px] border border-ink-200 bg-white p-5 lg:p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
              Agenda del día
            </h2>
            <button
              type="button"
              className="h-[29px] rounded-[9px] bg-ink-100 px-3 text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-200"
            >
              Ver todo
            </button>
          </div>

          <ul>
            {agenda.map((a, i) => (
              <li
                key={a.k}
                className={cn(
                  "flex items-start gap-3 py-3",
                  i !== 0 && "border-t border-ink-100",
                )}
              >
                <div className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] font-semibold text-ink-600">
                    {a.hora}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug font-semibold text-ink-950">
                    {a.titulo}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink-600">
                    {a.detalle}
                  </span>
                </div>
                <span
                  className={cn(
                    "inline-flex h-[23px] shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap",
                    TONE_BADGE[a.tono],
                  )}
                >
                  {a.badge}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}