// Cara "Actividad de Clientes" (PRD §7.1): clientes sin gestión reciente con
// selector de días (7/14/30/60) que refetchea, tabla con estado/prioridad
// pills y badge rojo cuando los días sin gestión superan 1.5× el corte,
// distribución por tipo/estado/prioridad (mini barras) y actividad por
// responsable (gestiones + tareas con barra relativa).

import { CalendarX2, UsersRound } from "lucide-react";
import type { DashboardFilters } from "@/hooks/dashboard";
import { useDashboardClientsActivity } from "@/hooks/dashboard";
import { formatFecha } from "@/hooks/crm";
import {
  ESTADO_CLIENTE_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import {
  BarRow,
  CardSection,
  ChipSelector,
  DashboardSkeleton,
  SinConexionCard,
  diasDesde,
  esEnvelopeNoConfigurado,
} from "@/components/dashboard/shared";
import { DemoFallback } from "@/components/dashboard/demo-fallback";

const DIAS_OPTIONS = [7, 14, 30, 60] as const;

export function CaraClientesActividad({
  filters,
  dias,
  onDias,
}: {
  filters: DashboardFilters;
  dias: number;
  onDias: (d: number) => void;
}) {
  const query = useDashboardClientsActivity(filters, dias);

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
  const { sin_gestion, distribucion, actividad_por_responsable } = data;
  const umbral = dias * 1.5;
  const maxActividad = Math.max(
    ...actividad_por_responsable.map((a) => a.gestiones + a.tareas_count),
    1,
  );
  const totalClientes =
    distribucion.por_estado.reduce((acc, e) => acc + e.count, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Sin gestión reciente */}
      <CardSection
        title="Clientes sin gestión reciente"
        subtitle={`Sin entrada de bitácora en los últimos ${dias} días (o sin ninguna)`}
        action={
          <ChipSelector
            options={DIAS_OPTIONS.map((d) => ({ value: String(d), label: `${d} días` }))}
            value={String(dias)}
            onChange={(v) => onDias(Number(v))}
          />
        }
      >
        {sin_gestion.clientes.length === 0 ? (
          <div className="grid place-items-center py-10 text-center">
            <span className="grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-exito-bg text-exito">
              <UsersRound className="size-6" strokeWidth={1.7} />
            </span>
            <h3 className="mt-3 font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
              Todo al día
            </h3>
            <p className="mt-1 max-w-[38ch] text-[13px] leading-relaxed text-ink-600">
              Ningún cliente lleva más de {dias} días sin gestión de bitácora.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  {["Cliente", "Estado", "Prioridad", "Responsable", "Sin gestión"].map((h) => (
                    <th
                      key={h}
                      className="py-2 pr-4 text-[10.5px] font-bold tracking-[0.09em] text-ink-500 uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sin_gestion.clientes.map((c, i) => {
                  const estado = ESTADO_CLIENTE_LABELS[c.estado];
                  const prioridad = c.prioridad ? PRIORIDAD_CLIENTE_LABELS[c.prioridad] : null;
                  const sinDias = diasDesde(c.ultima_gestion);
                  const critico = sinDias !== null && sinDias > umbral;
                  return (
                    <tr key={c.cliente_id} className={cn(i !== 0 && "border-t border-ink-100")}>
                      <td className="py-2.5 pr-4">
                        <span className="font-bold text-ink-950">{c.nombre}</span>
                        {c.ultima_gestion && (
                          <span className="block text-[11px] text-ink-600">
                            última gestión: {formatFecha(c.ultima_gestion)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={cn(
                            "inline-flex h-[23px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap",
                            estado?.tone === "info" && "bg-info-bg text-info",
                            estado?.tone === "activo" && "bg-rose-50 text-rose-700 dark:text-rose-400",
                            estado?.tone === "exito" && "bg-exito-bg text-exito",
                            estado?.tone === "alerta" && "bg-alerta-bg text-alerta",
                            estado?.tone === "neutro" && "bg-ink-100 text-ink-700",
                            (estado?.tone === "riesgo" || estado?.tone === "destructivo") && "bg-destructivo-bg text-destructivo",
                          )}
                        >
                          {estado?.label ?? c.estado}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {prioridad ? (
                          <span
                            className={cn(
                              "inline-flex h-[23px] items-center rounded-full px-2.5 text-[11px] font-bold whitespace-nowrap",
                              prioridad.tone === "riesgo"
                                ? "bg-destructivo-bg text-destructivo"
                                : prioridad.tone === "alerta"
                                  ? "bg-alerta-bg text-alerta"
                                  : "bg-info-bg text-info",
                            )}
                          >
                            {prioridad.label}
                          </span>
                        ) : (
                          <span className="text-ink-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-ink-800">
                        {c.responsable_nombre}
                      </td>
                      <td className="py-2.5">
                        {sinDias === null ? (
                          <span className="text-[12px] font-semibold text-destructivo">
                            Nunca gestionado
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex h-[23px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold tabular-nums",
                              critico
                                ? "bg-destructivo-bg text-destructivo"
                                : "bg-ink-100 text-ink-700",
                            )}
                          >
                            <CalendarX2 className="size-3" strokeWidth={2} />
                            {sinDias} días
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sin_gestion.clientes.length >= 25 && (
              <p className="mt-3 text-[12px] text-ink-600">
                Mostrando los primeros 25 · ajusta el filtro de días para acotar.
              </p>
            )}
          </div>
        )}
      </CardSection>

      {/* Distribución */}
      <CardSection
        title="Distribución de la cartera"
        subtitle={`${totalClientes} clientes en alcance · tipo, estado y prioridad`}
      >
        <div className="grid gap-6 md:grid-cols-3">
          <DistribucionGrupo
            title="Por tipo"
            rows={distribucion.por_tipo.map((r) => ({
              key: r.tipo,
              label: TIPO_CLIENTE_LABELS[r.tipo]?.label ?? r.tipo,
              tone: TIPO_CLIENTE_LABELS[r.tipo]?.tone,
              count: r.count,
            }))}
          />
          <DistribucionGrupo
            title="Por estado"
            rows={distribucion.por_estado.map((r) => ({
              key: r.estado,
              label: ESTADO_CLIENTE_LABELS[r.estado]?.label ?? r.estado,
              tone: ESTADO_CLIENTE_LABELS[r.estado]?.tone,
              count: r.count,
            }))}
          />
          <DistribucionGrupo
            title="Por prioridad"
            rows={distribucion.por_prioridad.map((r) => ({
              key: r.prioridad,
              label: PRIORIDAD_CLIENTE_LABELS[r.prioridad]?.label ?? r.prioridad,
              tone: PRIORIDAD_CLIENTE_LABELS[r.prioridad]?.tone,
              count: r.count,
            }))}
          />
        </div>
      </CardSection>

      {/* Actividad por responsable */}
      <CardSection
        title="Actividad por responsable"
        subtitle="Gestiones y tareas de los clientes del alcance (en el rango)"
      >
        {actividad_por_responsable.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-500">
            Sin responsables en el alcance para mostrar.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {actividad_por_responsable.map((a) => (
              <div key={a.responsable_id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink-900">{a.nombre}</span>
                  <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink-700">
                    {a.gestiones} gestiones · {a.tareas_count} tareas
                  </span>
                </div>
                <div className="mt-2 h-[8px] overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-rose-400 transition-[width] duration-500"
                    style={{
                      width: `${Math.max(((a.gestiones + a.tareas_count) / maxActividad) * 100, a.gestiones + a.tareas_count > 0 ? 6 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardSection>
    </div>
  );
}

function DistribucionGrupo({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; tone?: string; count: number }[];
}) {
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-bold tracking-[0.1em] text-ink-500 uppercase">
        {title}
      </h3>
      <div className="space-y-3.5">
        {rows
          .filter((r) => r.count > 0)
          .map((r) => (
            <BarRow
              key={r.key}
              label={r.label}
              count={r.count}
              total={total}
              tone={r.tone as Parameters<typeof BarRow>[0]["tone"]}
            />
          ))}
        {total === 0 && (
          <p className="text-[12.5px] text-ink-500">Sin clientes en este criterio.</p>
        )}
      </div>
    </div>
  );
}