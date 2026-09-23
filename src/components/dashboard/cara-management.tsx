// Quinta cara "Tablero de Control Gerencial" (tablero-seguimiento-social,
// Fase 4c, spec.md management-dashboard): seis KPIs sobre el único endpoint
// agregado (D9) y primitivas SVG propias (D7). No introduce librerías de
// charts ni un modo de UI por rol (RNF-01): el endpoint ya resuelve el
// alcance/permiso y esta vista solo pinta lo que recibe.
//
// Desviación declarada frente a design.md: el shell NO oculta la pestaña a
// quien no puede verla (el DTO de sesión no está cableado en
// `DashboardTabs`); el endpoint responde 403 y acá se muestra el mensaje de
// permiso en vez de una pantalla de error genérica.

"use client";

import { ApiError } from "@/lib/api/http";
import { useDashboardManagement, type DashboardFilters } from "@/hooks/dashboard";
import type { ColorSemaforo } from "@/lib/semaforo";
import type { UiTone } from "@/lib/catalogs";
import {
  BarRow,
  CardSection,
  DashboardSkeleton,
  SinConexionCard,
  StatTile,
  esEnvelopeNoConfigurado,
} from "@/components/dashboard/shared";
import { DemoFallback } from "@/components/dashboard/demo-fallback";
import { Tacometro } from "@/components/dashboard/tacometro";
import { Radar } from "@/components/dashboard/radar";
import { CurveSChart } from "@/components/dashboard/curve-s-chart";

/** Color de semáforo (verde/amarillo/rojo) → tono de la barra compartida. */
const TONE_POR_COLOR: Record<ColorSemaforo, UiTone> = {
  verde: "exito",
  amarillo: "alerta",
  rojo: "destructivo",
};

export function CaraGerencial({ filters }: { filters: DashboardFilters }) {
  const query = useDashboardManagement(filters);

  if (query.isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-[13px] text-ink-500">Cargando tablero gerencial…</p>
        <DashboardSkeleton />
      </div>
    );
  }

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 403) {
      return (
        <CardSection title="Tablero gerencial">
          <p className="py-6 text-center text-[13px] font-medium text-alerta">
            {query.error.message}
          </p>
        </CardSection>
      );
    }
    const sinConfiguracion = esEnvelopeNoConfigurado(query.error);
    return (
      <div className="flex flex-col gap-4">
        <SinConexionCard onRetry={() => void query.refetch()} />
        {sinConfiguracion && <DemoFallback />}
      </div>
    );
  }

  const data = query.data!;
  const toneTecnico = TONE_POR_COLOR[(data.color_tecnico as ColorSemaforo) ?? "amarillo"] ?? "neutro";
  const toneFinanciero =
    TONE_POR_COLOR[(data.color_financiero as ColorSemaforo) ?? "amarillo"] ?? "neutro";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Fila 1: tacómetro + curva S + radar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardSection
          title="Avance técnico"
          subtitle="Promedio ponderado del avance de actividades"
        >
          <Tacometro value={data.avance_tecnico} color={data.color_tecnico as ColorSemaforo} />
        </CardSection>

        <CardSection title="Avance financiero" subtitle="Ejecutado vs. proyectado (curva S)">
          <CurveSChart data={data.curva_s} />
        </CardSection>

        <CardSection
          title="Cumplimiento de indicadores"
          subtitle="Indicadores alcanzados vs. meta"
        >
          <Radar
            axes={[
              {
                label: "Cumplimiento de indicadores",
                value: data.cumplimiento_indicadores,
              },
            ]}
          />
          <p className="mt-3 text-center font-display text-[22px] font-extrabold tabular-nums text-ink-950">
            {Math.round(data.cumplimiento_indicadores)}%
          </p>
        </CardSection>
      </div>

      {/* Fila 2: cronograma + entregables + beneficiarios */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardSection
          title="Cumplimiento de cronograma"
          subtitle="Actividades a tiempo vs. resueltas"
        >
          <BarRow
            label="Actividades a tiempo"
            count={Math.round(data.cumplimiento_cronograma)}
            total={100}
            tone={toneTecnico}
          />
        </CardSection>

        <CardSection
          title="Productos entregados"
          subtitle={`${data.productos_entregados} de ${data.productos_programados} programados`}
        >
          <BarRow
            label="Entregados con soporte"
            count={data.productos_entregados}
            total={data.productos_programados}
            tone={toneFinanciero}
          />
        </CardSection>

        <CardSection title="Beneficiarios atendidos" subtitle="Personas impactadas vs. meta">
          <StatTile
            label="Atendidos / meta"
            value={`${data.beneficiarios_atendidos}/${data.beneficiarios_meta}`}
            foot={`${data.indicadores_beneficiarios_count} indicador(es) de beneficiarios`}
            mono
          />
        </CardSection>
      </div>
    </div>
  );
}
