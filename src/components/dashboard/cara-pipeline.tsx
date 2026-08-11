// Cara "Pipeline Comercial" (PRD §7.1): KPI row (oportunidades activas +
// valor potencial COP), embudo por estado con barras horizontales + mini
// sparkline de la tendencia del embudo, top 5 clientes por valor y el
// comparativo potencial activo vs. ganado histórico con el ratio.

import { DollarSign, Link2, TrendingUp, Wallet } from "lucide-react";
import type { DashboardFilters } from "@/hooks/dashboard";
import { useDashboardPipeline } from "@/hooks/dashboard";
import { formatCOP } from "@/hooks/crm";
import { ESTADO_OPORTUNIDAD_LABELS } from "@/lib/catalogs";
import { cn } from "@/lib/utils";
import {
  BarRow,
  CardSection,
  DashboardSkeleton,
  SinConexionCard,
  esEnvelopeNoConfigurado,
} from "@/components/dashboard/shared";
import { StatTile } from "@/components/dashboard/shared";
import { Sparkline } from "@/components/dashboard/sparkline";
import { DemoFallback } from "@/components/dashboard/demo-fallback";

export function CaraPipeline({ filters }: { filters: DashboardFilters }) {
  const query = useDashboardPipeline(filters);

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
  const { total_activas, valor_activo, embudo, top_clientes, comparativo } = data;
  const embudoTotal = embudo.reduce((acc, e) => acc + e.count, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        <StatTile
          label="Oportunidades activas"
          value={total_activas}
          foot={embudoTotal > 0 ? `${embudo.length} etapas en el embudo` : "Sin oportunidades activas"}
        />
        <StatTile
          label="Valor potencial"
          value={formatCOP(valor_activo)}
          mono
          acento
          foot="Suma de oportunidades activas"
        />
        <StatTile
          label="Ganado histórico"
          value={formatCOP(comparativo.ganado_historico)}
          mono
          foot="Oportunidades ganadas (todo el histórico)"
        />
        <StatTile
          label="Ratio cierre"
          value={
            <span className="inline-flex items-baseline gap-1.5">
              {comparativo.ratio.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
              <span className="text-[13px] font-semibold text-ink-600">×</span>
            </span>
          }
          foot="Ganado vs. potencial activo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Embudo */}
        <CardSection
          title="Embudo por etapa"
          subtitle={`${embudoTotal} oportunidades activas · no incluye ganadas o perdidas`}
        >
          {embudoTotal === 0 ? (
            <EmbudoVacio />
          ) : (
            <div className="space-y-4">
              {embudo.map((e) => {
                const entry = ESTADO_OPORTUNIDAD_LABELS[e.estado];
                return (
                  <BarRow
                    key={e.estado}
                    label={entry?.label ?? e.estado}
                    count={e.count}
                    total={embudoTotal}
                    tone={entry?.tone}
                  />
                );
              })}
            </div>
          )}
          <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
            <span className="flex items-center gap-2 text-[12px] font-semibold text-ink-600">
              <TrendingUp className="size-3.5 text-rose-500" strokeWidth={1.9} />
              Tendencia del embudo
            </span>
            <Sparkline data={embudo.map((e) => e.count)} />
          </div>
        </CardSection>

        {/* Top clientes */}
        <CardSection
          title="Top clientes por valor"
          subtitle="Los 5 con mayor potencial activo"
        >
          {top_clientes.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-500">
              Aún no hay oportunidades activas para rankear.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {top_clientes.map((c, i) => (
                <li
                  key={c.cliente_id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink-100/60"
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-[9px] font-mono text-[11px] font-bold",
                      i === 0 ? "bg-rose-500 text-white" : "bg-ink-100 text-ink-700",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">
                    {c.nombre}
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums text-ink-700">
                    {formatCOP(c.valor_potencial)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardSection>
      </div>

      {/* Comparativo */}
      <CardSection
        title="Comparativo comercial"
        subtitle="Potencial activo vs. ganado histórico"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="rounded-[16px] border border-ink-100 bg-ink-100/50 p-4">
            <span className="flex items-center gap-2 text-[12px] font-semibold text-ink-600">
              <Wallet className="size-3.5" strokeWidth={1.9} />
              Potencial activo
            </span>
            <p className="mt-2 font-display text-[22px] font-extrabold tracking-[-0.02em] tabular-nums text-ink-950">
              {formatCOP(comparativo.potencial_activo)}
            </p>
          </div>
          <div className="rounded-[16px] border border-ink-100 bg-ink-100/50 p-4">
            <span className="flex items-center gap-2 text-[12px] font-semibold text-ink-600">
              <DollarSign className="size-3.5 text-exito" strokeWidth={1.9} />
              Ganado histórico
            </span>
            <p className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] tabular-nums text-ink-950">
              {formatCOP(comparativo.ganado_historico)}
            </p>
          </div>
          <div className="flex items-center">
            <span
              className={cn(
                "inline-flex h-[34px] items-center gap-1.5 rounded-full px-4 text-[13px] font-bold",
                comparativo.ratio >= 1
                  ? "bg-exito-bg text-exito"
                  : comparativo.ratio > 0
                    ? "bg-alerta-bg text-alerta"
                    : "bg-ink-100 text-ink-700",
              )}
            >
              <Link2 className="size-3.5" strokeWidth={1.9} />
              Ratio {comparativo.ratio.toLocaleString("es-CO", { maximumFractionDigits: 2 })}×
            </span>
          </div>
        </div>
      </CardSection>
    </div>
  );
}

function EmbudoVacio() {
  return (
    <p className="py-8 text-center text-[13px] text-ink-500">
      El embudo está vacío para la combinación de filtros actual.
    </p>
  );
}