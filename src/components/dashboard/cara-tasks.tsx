// Cara "Gestión de Tareas" (PRD §7.1): estado del tablero por columna
// (chips con los tonos de ESTADO_TAREA_LABELS), cumplimiento por persona con
// barras y % (cumplidas a tiempo / total) y las tareas vencidas activas con
// acceso directo al tablero (máx 8 filas en pantalla).

import Link from "next/link";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import type { DashboardFilters } from "@/hooks/dashboard";
import { useDashboardTasks } from "@/hooks/dashboard";
import { formatFecha } from "@/hooks/crm";
import { ESTADO_TAREA_LABELS } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CardSection,
  DashboardSkeleton,
  SinConexionCard,
  esEnvelopeNoConfigurado,
} from "@/components/dashboard/shared";
import { DemoFallback } from "@/components/dashboard/demo-fallback";

const MAX_VENCIDAS_VISAS = 8;

export function CaraTareas({ filters }: { filters: DashboardFilters }) {
  const query = useDashboardTasks(filters);

  if (query.isLoading) return <DashboardSkeleton />;

  if (query.isError) {
    const sinConfiguracion = esEnvelopeNoConfigurado(query.error);
    return (
      <div className="flex flex-col gap-4">
        <SinConexionCard onRetry={() => void query.refetch()} />
        {sinConfiguracion && <DemoFallback />}
      </div>
    );
  }

  const data = query.data!;
  const { por_columna, cumplimiento_por_persona, vencidas } = data;
  const totalPersonas = cumplimiento_por_persona.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Tareas por columna */}
      <CardSection title="Tablero por columna" subtitle="Tareas abiertas en el tablero (sin canceladas)">
        <div className="flex flex-wrap gap-2">
          {por_columna.map((c) => {
            const entry = ESTADO_TAREA_LABELS[c.estado];
            return (
              <span
                key={c.estado}
                className="inline-flex h-[30px] items-center gap-2 rounded-full border border-ink-200 bg-panel px-3.5 text-[12.5px] font-semibold text-ink-800"
              >
                <span
                  className={cn(
                    "size-[7px] rounded-full",
                    entry?.tone === "activo" && "bg-rose-400",
                    entry?.tone === "neutro" && "bg-ink-300",
                    entry?.tone === "exito" && "bg-exito",
                    entry?.tone === "alerta" && "bg-alerta",
                    entry?.tone === "info" && "bg-info",
                    entry?.tone === "destructivo" && "bg-destructivo",
                  )}
                />
                {entry?.label ?? c.estado}
                <span className="font-mono text-[12px] font-bold tabular-nums text-ink-950">
                  {c.count}
                </span>
              </span>
            );
          })}
        </div>
      </CardSection>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Cumplimiento por persona */}
        <CardSection
          title="Cumplimiento por persona"
          subtitle={`${totalPersonas} personas con tareas en el rango · % = completadas a tiempo`}
        >
          {cumplimiento_por_persona.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-500">
              No hay tareas en el rango para mostrar cumplimiento.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {cumplimiento_por_persona.map((p) => (
                <li key={p.responsable_id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink-900">
                        <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-ink-100 font-mono text-[11px] font-bold text-ink-700">
                          {p.nombre
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join("")
                            .toUpperCase()}
                        </span>
                        <span className="truncate">{p.nombre}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink-700">
                        {p.cumplidas}/{p.total} · {p.porc}%
                      </span>
                    </div>
                    <div className="mt-2 h-[8px] overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500",
                          p.porc >= 70 ? "bg-exito" : p.porc >= 40 ? "bg-alerta" : "bg-destructivo",
                        )}
                        style={{ width: `${Math.max(p.porc, p.total > 0 && p.cumplidas > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </li>
              ))}
            </ol>
          )}
        </CardSection>

        {/* Vencidas activas */}
        <CardSection
          title="Tareas vencidas activas"
          subtitle="Con acceso directo al tablero"
          action={
            <Link href="/tablero">
              <Button
                variant="ghost"
                className="h-[29px] rounded-[9px] px-2.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-100"
              >
                Ver tablero
                <ArrowUpRight className="size-3.5" strokeWidth={1.9} />
              </Button>
            </Link>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3 rounded-[16px] bg-destructivo-bg p-4">
              <CalendarClock className="size-6 text-destructivo" strokeWidth={1.8} />
              <div>
                <p className="font-display text-[30px] leading-none font-extrabold tabular-nums text-destructivo">
                  {vencidas.count}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-destructivo/80">
                  {vencidas.count === 1 ? "tarea vencida sin cerrar" : "tareas vencidas sin cerrar"}
                </p>
              </div>
            </div>

            {vencidas.lista.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-ink-500">
                Sin vencidas activas. ¡Vamos bien!
              </p>
            ) : (
              <ul className="flex flex-col">
                {vencidas.lista.slice(0, MAX_VENCIDAS_VISAS).map((v, i) => (
                  <li
                    key={v.id}
                    className={cn(
                      "flex items-start gap-2.5 py-2.5",
                      i !== 0 && "border-t border-ink-100",
                    )}
                  >
                    <span className="mt-1 size-[7px] shrink-0 rounded-full bg-destructivo" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/tablero"
                        className="block truncate text-[13px] font-semibold text-ink-900 hover:text-rose-700 dark:hover:text-rose-400"
                      >
                        {v.titulo}
                      </Link>
                      <p className="mt-0.5 truncate text-[11.5px] text-ink-600">
                        {v.responsable_nombre}
                        {v.cliente_nombre ? ` · ${v.cliente_nombre}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-destructivo">
                      {formatFecha(v.fecha_entrega)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {vencidas.count > MAX_VENCIDAS_VISAS && (
              <p className="text-[12px] text-ink-600">
                +{vencidas.count - MAX_VENCIDAS_VISAS} más · verlas todas en el{" "}
                <Link href="/tablero" className="font-semibold text-ink-800 underline decoration-ink-300 underline-offset-2 hover:text-rose-700 dark:hover:text-rose-400">
                  tablero
                </Link>
              </p>
            )}
          </div>
        </CardSection>
      </div>
    </div>
  );
}