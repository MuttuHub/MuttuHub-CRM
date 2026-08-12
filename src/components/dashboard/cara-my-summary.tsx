// Cara "Mi resumen" (PRD §7.1): SIEMPRE scope "own". Mis tareas pendientes,
// las que vencen hoy (ámbar, mismo bucket del motor de alertas), las venidas
// (rojo), mis compromisos de clientes (CRM/AMBOS) y mis clientes asignados
// con su distribución por estado. Enlaces directos a /tablero y /clientes.

import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, FileClock, ListChecks, UsersRound } from "lucide-react";
import type { DashboardFilters } from "@/hooks/dashboard";
import { useDashboardMySummary } from "@/hooks/dashboard";
import { formatFecha } from "@/hooks/crm";
import { ESTADO_CLIENTE_LABELS, ESTADO_TAREA_LABELS } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import {
  CardSection,
  DashboardSkeleton,
  SinConexionCard,
  esEnvelopeNoConfigurado,
} from "@/components/dashboard/shared";
import { DemoFallback } from "@/components/dashboard/demo-fallback";

const MAX_LISTA = 8;

/** True cuando `fecha_entrega` cae en el día local actual (bucket "hoy"). */
function esDeHoy(fecha: string | null): boolean {
  if (!fecha) return false;
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return false;
  const ahora = new Date();
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const manana = inicio + 24 * 60 * 60 * 1000;
  return t >= inicio && t < manana;
}

export function CaraMiResumen({ filters }: { filters: DashboardFilters }) {
  const query = useDashboardMySummary(filters);

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
  const { activas, vencidas, hoy, compromisos_pendientes, clientes_asignados } =
    data;

  const porEstado = clientes_asignados.items.reduce<Record<string, number>>(
    (acc, c) => {
      acc[c.estado] = (acc[c.estado] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        <ResumenTile
          icon={<ListChecks className="size-4" strokeWidth={1.9} />}
          label="Tareas pendientes"
          value={activas.count}
          foot={hoy.count > 0 ? `${hoy.count} vencen hoy` : "sin vencimientos hoy"}
        />
        <ResumenTile
          icon={<CalendarClock className="size-4" strokeWidth={1.9} />}
          label="Vencen hoy"
          value={hoy.count}
          foot="sin cerrar"
          tone="alerta"
        />
        <ResumenTile
          icon={<FileClock className="size-4" strokeWidth={1.9} />}
          label="Vencidas"
          value={vencidas.count}
          foot="sin cerrar, a tiempo se acabó"
          tone="rojo"
        />
        <ResumenTile
          icon={<CheckCircle2 className="size-4" strokeWidth={1.9} />}
          label="Compromisos pendientes"
          value={compromisos_pendientes.count}
          foot={
            compromisos_pendientes.vencidos > 0
              ? `${compromisos_pendientes.vencidos} vencidos`
              : "ninguno vencido"
          }
          tone={compromisos_pendientes.vencidos > 0 ? "rojo" : "ok"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Mis tareas */}
        <CardSection
          title="Mis tareas pendientes"
          subtitle="Todo el tablero, no solo compromisos"
          action={
            <Link href="/tablero">
              <span className="inline-flex h-[29px] items-center rounded-[9px] px-2.5 text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-100">
                Ver tablero
                <ArrowUpRight className="size-3.5" strokeWidth={1.9} />
              </span>
            </Link>
          }
        >
          <TareaLista items={activas.items} max={MAX_LISTA} empty="No tienes tareas abiertas." />

          {hoy.count > 0 && (
            <div className="mt-4 rounded-14 border border-alerta/25 bg-alerta-bg p-3.5">
              <p className="text-[12px] font-bold text-alerta">Vencen hoy</p>
              <TareaLista items={activas.items.filter((t) => esDeHoy(t.fecha_entrega))} max={4} />
            </div>
          )}
        </CardSection>

        {/* Vencidas + compromisos */}
        <div className="flex flex-col gap-4">
          <CardSection
            title="Vencidas"
            subtitle="Cierralas cuanto antes"
          >
            <div className="flex items-end gap-3 rounded-[16px] bg-destructivo-bg p-4">
              <FileClock className="size-6 shrink-0 text-destructivo" strokeWidth={1.8} />
              <div>
                <p className="font-display text-[30px] leading-none font-extrabold tabular-nums text-destructivo">
                  {vencidas.count}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-destructivo/80">
                  vencidas sin cerrar
                </p>
              </div>
            </div>
            <div className="mt-3">
              <TareaLista items={vencidas.items} max={MAX_LISTA} />
            </div>
            <p className="mt-3 text-[12px] text-ink-600">
              Compromisos pendientes:{" "}
              <span className="font-semibold text-ink-900">{compromisos_pendientes.count}</span>{" "}
              ({compromisos_pendientes.vencidos} vencidos) — se gestionan en la{" "}
              <Link href="/clientes" className="font-semibold text-ink-800 underline decoration-ink-300 underline-offset-2 hover:text-rose-700">
                ficha del cliente
              </Link>.
            </p>
          </CardSection>
        </div>
      </div>

      {/* Clientes asignados */}
      <CardSection
        title="Mis clientes asignados"
        subtitle={`${clientes_asignados.count} clientes a tu cargo`}
        action={
          <Link href="/clientes">
            <span className="inline-flex h-[29px] items-center rounded-[9px] px-2.5 text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-100">
              Ver clientes
              <ArrowUpRight className="size-3.5" strokeWidth={1.9} />
            </span>
          </Link>
        }
      >
        {clientes_asignados.items.length === 0 ? (
          <div className="grid place-items-center py-10 text-center">
            <span className="grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-ink-100 text-ink-700">
              <UsersRound className="size-6" strokeWidth={1.7} />
            </span>
            <h3 className="mt-3 font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
              Sin clientes asignados
            </h3>
            <p className="mt-1 max-w-[38ch] text-[13px] leading-relaxed text-ink-600">
              Cuando te asignen clientes aparecerán aquí con su estado.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(porEstado).map(([estado, count]) => {
              const entry = ESTADO_CLIENTE_LABELS[estado as keyof typeof ESTADO_CLIENTE_LABELS];
              return (
                <span
                  key={estado}
                  className={cn(
                    "inline-flex h-[30px] items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold",
                    entry?.tone === "info" && "bg-info-bg text-info",
                    entry?.tone === "activo" && "bg-rose-50 text-rose-700",
                    entry?.tone === "exito" && "bg-exito-bg text-exito",
                    entry?.tone === "alerta" && "bg-alerta-bg text-alerta",
                    entry?.tone === "neutro" && "bg-ink-100 text-ink-700",
                    (entry?.tone === "riesgo" || entry?.tone === "destructivo") && "bg-destructivo-bg text-destructivo",
                  )}
                >
                  {entry?.label ?? estado}
                  <span className="font-mono text-[12px] font-bold tabular-nums">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </CardSection>
    </div>
  );
}

/* ── Piezas internas ────────────────────────────────────────────────────── */

function ResumenTile({
  icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  foot: string;
  tone?: "alerta" | "rojo" | "ok";
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border p-[18px]",
        tone === "rojo"
          ? "border-destructivo/40 bg-destructivo-bg"
          : tone === "alerta"
            ? "border-alerta/40 bg-alerta-bg"
            : "border-ink-200 bg-white",
      )}
    >
      <span className="flex items-center gap-2 text-[12px] font-semibold text-ink-600">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-10",
            tone === "rojo"
              ? "bg-destructivo text-white"
              : tone === "alerta"
                ? "bg-alerta text-white"
                : "bg-ink-100 text-ink-700",
          )}
        >
          {icon}
        </span>
        {label}
      </span>
      <div className="mt-3 font-display text-[28px] leading-none font-extrabold tracking-[-0.03em] tabular-nums text-ink-950">
        {value}
      </div>
      <div className="mt-2 text-[11.5px] text-ink-600">{foot}</div>
    </div>
  );
}

/** Lista compacta de tareas (subtitulo = estado + fecha de entrega). */
function TareaLista({
  items,
  max,
  empty,
}: {
  items: { id: string; titulo: string; estado: string; fecha_entrega: string | null }[];
  max: number;
  empty?: string;
}) {
  const visibles = items.slice(0, max);
  const restantes = items.length - visibles.length;

  if (visibles.length === 0) {
    return (
      <p className="py-4 text-center text-[12.5px] text-ink-500">
        {empty ?? "Sin tareas en esta categoría."}
      </p>
    );
  }

  return (
    <div>
      <ul className="flex flex-col">
        {visibles.map((t, i) => {
          const estado = ESTADO_TAREA_LABELS[t.estado as keyof typeof ESTADO_TAREA_LABELS];
          const estadoClase = cn(
            "inline-flex h-[20px] items-center rounded-full px-2 text-[10.5px] font-bold whitespace-nowrap",
            estado?.tone === "activo" && "bg-rose-50 text-rose-700",
            estado?.tone === "neutro" && "bg-ink-100 text-ink-700",
            estado?.tone === "exito" && "bg-exito-bg text-exito",
            estado?.tone === "alerta" && "bg-alerta-bg text-alerta",
            estado?.tone === "info" && "bg-info-bg text-info",
            estado?.tone === "destructivo" && "bg-destructivo-bg text-destructivo",
          );
          return (
            <li
              key={t.id}
              className={cn(
                "flex items-center gap-3 py-2.5",
                i !== 0 && "border-t border-ink-100",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">
                {t.titulo}
              </span>
              <span className={estadoClase}>{estado?.label ?? t.estado}</span>
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-600">
                {formatFecha(t.fecha_entrega)}
              </span>
            </li>
          );
        })}
      </ul>
      {restantes > 0 && (
        <p className="pt-2 text-[12px] text-ink-600">
          +{restantes} más · verlas todas en el tablero.
        </p>
      )}
    </div>
  );
}