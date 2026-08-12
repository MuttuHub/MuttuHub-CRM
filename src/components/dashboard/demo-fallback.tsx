// Respaldo de demostración exclusivo para el modo dev sin configurar (sin
// NEXT_PUBLIC_SUPABASE_URL/ANON_KEY): cuando las cuatro caras responden el
// envelope "Plataforma no configurada", esta vista mantiene visible la UI con
// los datos demo del Hito 1 (src/lib/mock/demo.ts). Nunca se muestra cuando
// el API responde datos reales.

import { cn } from "@/lib/utils";
import { AGENDA, KPIS_INICIO, MESES, type Tone } from "@/lib/mock/demo";

const TONE_BADGE: Record<Tone, string> = {
  neutro: "bg-ink-100 text-ink-700",
  activo: "bg-rose-50 text-rose-700 dark:text-rose-400",
  alerta: "bg-alerta-bg text-alerta",
  riesgo: "bg-destructivo-bg text-destructivo",
  exito: "bg-exito-bg text-exito",
  info: "bg-info-bg text-info",
};

export function DemoFallback() {
  const agenda = AGENDA[6] ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold tracking-[0.1em] text-ink-500 uppercase">
          Vista de demostración
        </p>
        <span className="inline-flex h-[22px] items-center rounded-full bg-ink-100 px-2.5 text-[11px] font-bold text-ink-700">
          datos de ejemplo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {KPIS_INICIO.map((k) => (
          <div
            key={k.label}
            className={cn(
              "rounded-[20px] border p-[18px]",
              k.acento ? "border-rose-500 bg-rose-500" : "border-ink-200 bg-panel",
            )}
          >
            <span
              className={cn(
                "block text-[12px] font-semibold",
                k.acento ? "text-rose-100" : "text-ink-600",
              )}
            >
              {k.label}
            </span>
            <div
              className={cn(
                "mt-2.5 font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] tabular-nums",
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
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
                Pipeline del año
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-600">
                Valor gestionado por mes · barras claras = proyección
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-700">
              <span className="size-[9px] rounded-[3px] bg-rose-500" />
              Ejecutado
            </span>
          </div>
          <div className="flex h-[150px] items-end gap-1.5 pb-1">
            {MESES.map((m) => (
              <div key={m.label} className="flex h-full flex-1 flex-col items-center gap-2">
                <div className="relative flex w-full flex-1 items-end rounded-[9px] bg-ink-100">
                  <span
                    className={cn(
                      "w-full rounded-[9px]",
                      m.proy ? "bg-rose-200" : m.hoy ? "bg-rose-500" : "bg-rose-400",
                    )}
                    style={{ height: `${m.v}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px]",
                    m.hoy ? "font-bold text-ink-950" : "font-medium text-ink-600",
                  )}
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            Agenda del día
          </h2>
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