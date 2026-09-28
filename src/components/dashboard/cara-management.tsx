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
//
// F1.6 (tablero-gerencial-unificado, "unificar /tablero-gerencial y /"):
// enriquece esta cara con lo que v6 pide y hasta ahora faltaba — radar
// multi-eje (D1), barras por-proyecto de cronograma/entregables (en vez de
// una sola barra agregada), semaforización territorial, filtros propios
// Línea/Territorio (design.md D2: aislados del `DashboardFilters`
// compartido de las otras 4 caras — viven en estado LOCAL de este
// componente, no en `dashboard-page.tsx`) y la advertencia de doble conteo
// de beneficiarios (Auditoría, KPI 6).

"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/http";
import { useDashboardManagement, type DashboardFilters } from "@/hooks/dashboard";
import type { ProjectDashboard } from "@/hooks/projects";
import type { ColorSemaforo } from "@/lib/semaforo";
import { ENUM_VALUES, LINEA_ESTRATEGICA_LABELS, type UiTone } from "@/lib/catalogs";
import {
  BarRow,
  CardSection,
  ChipSelector,
  DashboardSkeleton,
  SinConexionCard,
  StatTile,
  TONE_BAR,
  esEnvelopeNoConfigurado,
} from "@/components/dashboard/shared";
import { DemoFallback } from "@/components/dashboard/demo-fallback";
import { Tacometro } from "@/components/dashboard/tacometro";
import { Radar, type RadarAxis } from "@/components/dashboard/radar";
import { CurveSChart } from "@/components/dashboard/curve-s-chart";

/** Color de semáforo (verde/amarillo/rojo) → tono de la barra compartida. */
const TONE_POR_COLOR: Record<ColorSemaforo, UiTone> = {
  verde: "exito",
  amarillo: "alerta",
  rojo: "destructivo",
};

/** Opciones del chip "Línea estratégica": "" (Todas) + las 8 líneas del catálogo. */
const LINEA_OPCIONES = [
  { value: "", label: "Todas" },
  ...ENUM_VALUES.LineaEstrategica.map((l) => ({
    value: l,
    label: LINEA_ESTRATEGICA_LABELS[l as keyof typeof LINEA_ESTRATEGICA_LABELS].label,
  })),
];

/**
 * F1.6 (design.md D1): los 5 ejes del radar de "Cumplimiento de
 * indicadores" — avance técnico, avance financiero, cumplimiento de
 * indicadores y de cronograma se exponen ya como porcentaje; "Entregables"
 * se deriva client-side de entregados/programados (el endpoint no expone un
 * quinto porcentaje propio). Beneficiarios queda FUERA a propósito (D1): es
 * un conteo vs. meta, no una razón 0-100% que encaje en la forma del radar.
 * Función pura, testeada aparte del render.
 */
export function buildRadarAxes(data: ProjectDashboard): RadarAxis[] {
  const entregablesPct =
    data.productos_programados > 0
      ? Math.round((data.productos_entregados / data.productos_programados) * 100)
      : 0;
  return [
    { label: "Avance técnico", value: data.avance_tecnico },
    { label: "Avance financiero", value: data.avance_financiero },
    { label: "Cumplimiento de indicadores", value: data.cumplimiento_indicadores },
    { label: "Cumplimiento de cronograma", value: data.cumplimiento_cronograma },
    { label: "Entregables", value: entregablesPct },
  ];
}

/**
 * F1.6: barras "agrupadas" planificado vs. entregado de un proyecto —
 * misma familia de primitivas que `BarRow` (CSS puro, sin librería de
 * charts nueva): dos barras lado a lado que comparten la misma escala
 * (programados = referencia 100%).
 */
function EntregablesProyectoRow({
  nombre,
  entregados,
  programados,
  tone,
}: {
  nombre: string;
  entregados: number;
  programados: number;
  tone: UiTone;
}) {
  const pctEntregados = programados > 0 ? Math.round((entregados / programados) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[13px] font-medium text-ink-800">{nombre}</span>
        <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink-700">
          {entregados}/{programados}
        </span>
      </div>
      <div className="mt-1.5 flex h-[7px] gap-[3px]">
        <div className="h-full flex-1 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-ink-400" style={{ width: programados > 0 ? "100%" : "0%" }} />
        </div>
        <div className="h-full flex-1 overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full ${TONE_BAR[tone]}`}
            style={{ width: `${Math.max(pctEntregados, entregados > 0 ? 3 : 0)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function CaraGerencial({ filters }: { filters: DashboardFilters }) {
  // F1.6 (design.md D2): filtros propios de esta cara, en estado LOCAL —
  // nunca se agregan al `DashboardFilters` compartido que reciben las otras
  // 4 caras desde `dashboard-page.tsx`.
  const [linea, setLinea] = useState("");
  const [territorio, setTerritorio] = useState("");
  const query = useDashboardManagement({
    ...filters,
    linea_estrategica: linea || undefined,
    territorio: territorio || undefined,
  });

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
  const porProyecto = data.por_proyecto ?? [];
  const porTerritorio = data.por_territorio ?? [];
  const dobleConteo = data.indicadores_beneficiarios_count > 1;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Filtros propios de esta cara (F1.6): Línea estratégica + Territorio. */}
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-ink-200 bg-panel p-3">
        <div className="flex items-center gap-2">
          <span className="hidden text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase sm:inline">
            Línea
          </span>
          <ChipSelector options={LINEA_OPCIONES} value={linea} onChange={setLinea} />
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[11.5px] font-bold tracking-[0.08em] text-ink-500 uppercase">
            Territorio
          </span>
          <input
            type="text"
            value={territorio}
            onChange={(e) => setTerritorio(e.target.value)}
            placeholder="Todos los territorios"
            className="h-9 min-w-[160px] rounded-11 border border-ink-200 bg-panel px-3 text-[13px] text-ink-800 placeholder:text-ink-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus:outline-none"
          />
        </label>
      </div>

      {/* Fila 1: tacómetro + curva S + radar multi-eje (F1.6, design.md D1) */}
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
          subtitle="Avance técnico, financiero, indicadores, cronograma y entregables"
        >
          <Radar axes={buildRadarAxes(data)} />
        </CardSection>
      </div>

      {/* Fila 2: cronograma + entregables POR PROYECTO (F1.6, no un agregado único) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSection
          title="Cumplimiento de cronograma"
          subtitle="Actividades a tiempo vs. resueltas, por proyecto"
        >
          {porProyecto.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-ink-500">
              Sin proyectos en el alcance filtrado.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {porProyecto.map((p) => (
                <BarRow
                  key={p.proyecto_id}
                  label={p.nombre}
                  count={Math.round(p.cumplimiento_cronograma)}
                  total={100}
                  tone={toneTecnico}
                />
              ))}
            </div>
          )}
        </CardSection>

        <CardSection
          title="Productos entregados"
          subtitle="Entregados vs. programados, por proyecto"
        >
          {porProyecto.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-ink-500">
              Sin proyectos en el alcance filtrado.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {porProyecto.map((p) => (
                <EntregablesProyectoRow
                  key={p.proyecto_id}
                  nombre={p.nombre}
                  entregados={p.productos_entregados}
                  programados={p.productos_programados}
                  tone={toneFinanciero}
                />
              ))}
            </div>
          )}
        </CardSection>
      </div>

      {/* Fila 3: beneficiarios (+ advertencia de doble conteo) + semaforización territorial (F1.6) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardSection title="Beneficiarios atendidos" subtitle="Personas impactadas vs. meta">
          <StatTile
            label="Atendidos / meta"
            value={`${data.beneficiarios_atendidos}/${data.beneficiarios_meta}`}
            foot={`${data.indicadores_beneficiarios_count} indicador(es) de beneficiarios`}
            mono
          />
          {dobleConteo && (
            <p className="mt-3 rounded-11 border border-alerta/30 bg-alerta-bg px-3 py-2 text-[12px] font-medium text-alerta">
              Riesgo de doble conteo: más de un indicador de este proyecto cuenta
              beneficiarios.
            </p>
          )}
        </CardSection>

        <CardSection
          title="Semaforización territorial"
          subtitle="Proyectos y semáforo técnico/financiero por territorio"
          className="lg:col-span-2"
        >
          {porTerritorio.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-ink-500">
              Sin territorios en el alcance filtrado.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-ink-100">
              {porTerritorio.map((t) => (
                <div key={t.territorio} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="truncate text-[13px] font-medium text-ink-800">{t.territorio}</span>
                  <div className="flex shrink-0 items-center gap-3 text-[12px] text-ink-600">
                    <span>
                      {t.proyectos_count} {t.proyectos_count === 1 ? "proyecto" : "proyectos"}
                    </span>
                    <span
                      className="size-[9px] rounded-full"
                      style={{ backgroundColor: `var(--color-${t.color_tecnico === "verde" ? "exito" : t.color_tecnico === "amarillo" ? "alerta" : "destructivo"})` }}
                      title={`Técnico: ${t.color_tecnico}`}
                    />
                    <span
                      className="size-[9px] rounded-full"
                      style={{ backgroundColor: `var(--color-${t.color_financiero === "verde" ? "exito" : t.color_financiero === "amarillo" ? "alerta" : "destructivo"})` }}
                      title={`Financiero: ${t.color_financiero}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardSection>
      </div>
    </div>
  );
}
