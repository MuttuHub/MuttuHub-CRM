// Sección "Indicadores" de la ficha (S9 U6, RF-30): KPIs del proyecto a un corte. De solo lectura: el color de
// cada semáforo, los porcentajes y la alerta de retraso llegan calculados por el servidor (`kpisProyecto`) y
// aquí solo se pintan; el cliente NUNCA los recalcula. Mientras los parámetros del semáforo no estén
// confirmados por el PO se muestra la insignia "No confirmado". Un proyecto fuera de ejecución (BORRADOR, ...)
// no tiene KPIs: se explica en vez de mostrar ceros. Solo agregados: sin gastos individuales ni soportes.

"use client";

import { useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { toast } from "sonner";
import { ToneBadge } from "@/components/crm/shared";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, KpiCard, MetricBar, MetricRow, MetricTile, SELECT_CLASS, SectionHeader } from "@/components/proyectos/ui";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  downloadProjectExport,
  useProjectKpis,
  type ProjectBase,
  type ProjectKpis,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";

const KPIS_ERROR = "No pudimos cargar los indicadores. Inténtalo de nuevo.";
export const KPIS_NO_MEDIBLE_NOTE =
  "Los indicadores se calculan cuando el proyecto está en ejecución, suspendido o cerrado.";
export const ALERTA_RETRASO_TEXT =
  "Posible retraso: el gasto va por debajo de lo programado y el avance técnico está atrasado.";

const SIN_DATO = "—";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
export const formatPct = (value: number | null): string => (value === null ? SIN_DATO : `${nf.format(value)} %`);
const formatPp = (value: number): string => `${nf.format(value)} pp`;
const formatMonto = (value: string): string => formatCOP(toCents(value));

export function ProjectKpisPanel({ proyecto }: { proyecto: ProjectListRow }) {
  // Sin corte el servidor usa hoy (Bogotá); el campo solo lo fija cuando el usuario lo elige.
  const [corte, setCorte] = useState("");
  const [base, setBase] = useState<ProjectBase>("vigente");
  const baseDisponible = proyecto.estado !== "BORRADOR";
  const query = useProjectKpis(proyecto.id, corte || null, base);
  const kpis = query.data;

  const exportar = async (ficha: "proyecto" | "financiera") => {
    try {
      await downloadProjectExport(proyecto.id, {
        ficha,
        // La ficha financiera corta por mes (AAAA-MM); la del proyecto, por día.
        corte: corte ? (ficha === "financiera" ? corte.slice(0, 7) : corte) : null,
        base,
      });
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos generar el archivo. Inténtalo de nuevo."));
    }
  };

  return (
    <section data-testid="kpis" aria-labelledby="kpis-titulo">
      <SectionHeader id="kpis-titulo" icon={<BarChart3 className="size-3.5" strokeWidth={2} />}>
        Indicadores
      </SectionHeader>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
          Corte
          <input
            type="date"
            aria-label="Corte"
            value={corte}
            onChange={(event) => setCorte(event.target.value)}
            className={SELECT_CLASS}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
          Base
          <select
            aria-label="Base"
            disabled={!baseDisponible}
            value={base}
            onChange={(event) => setBase(event.target.value as ProjectBase)}
            title={baseDisponible ? undefined : "La versión original estará disponible con la línea base aprobada."}
            className={SELECT_CLASS}
          >
            <option value="vigente">Vigente</option>
            {baseDisponible && <option value="original">Original (v0)</option>}
          </select>
        </label>
        {kpis && kpis.medible && !kpis.confirmado && <ToneBadge tone="neutro" label="No confirmado" />}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportar("proyecto")}>
            <Download className="size-3.5" strokeWidth={1.8} />
            Exportar ficha (Excel)
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportar("financiera")}>
            <Download className="size-3.5" strokeWidth={1.8} />
            Exportar ficha financiera (Excel)
          </Button>
        </div>
      </div>

      {query.isError ? (
        <InlineError className="mt-2" message={errorMessage(query.error, KPIS_ERROR)} />
      ) : query.isLoading || !kpis ? (
        <Skeleton className="mt-2 h-24 w-full rounded-[14px]" />
      ) : !kpis.medible ? (
        <EmptyBlock className="mt-2">{KPIS_NO_MEDIBLE_NOTE}</EmptyBlock>
      ) : (
        <KpiTiles kpis={kpis} />
      )}
    </section>
  );
}

function KpiTiles({ kpis }: { kpis: ProjectKpis }) {
  const { tecnico, financiero, cronograma, entregables, indicadores, beneficiarios } = kpis;
  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <p className="text-[12px] text-ink-500">Corte al {formatFechaCalendario(kpis.corte)}</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {tecnico && (
          <MetricTile testId="kpi-tecnico" color={tecnico.color} chipPrefix="Semáforo técnico">
            <MetricBar label="Avance real" value={formatPct(tecnico.avance_real)} percent={tecnico.avance_real} band={tecnico.color} />
            <MetricBar label="Avance programado" value={formatPct(tecnico.avance_programado)} percent={tecnico.avance_programado} />
            <MetricRow label="Desviación" value={formatPp(tecnico.desviacion_pp)} />
          </MetricTile>
        )}
        {financiero && (
          <MetricTile testId="kpi-financiero" color={financiero.color} chipPrefix="Semáforo financiero">
            <MetricRow label="Asignado" value={formatMonto(financiero.asignado)} />
            <MetricRow label="Programado" value={formatMonto(financiero.programado)} />
            <MetricRow label="Ejecutado" value={formatMonto(financiero.ejecutado)} />
            <MetricBar label="Ejecutado / asignado" value={formatPct(financiero.ea)} percent={financiero.ea} band={financiero.color} />
            <MetricBar label="Ejecutado / programado" value={formatPct(financiero.ep)} percent={financiero.ep} band={financiero.color} />
            {financiero.alerta_retraso && <p className="text-[12px] text-ink-700">{ALERTA_RETRASO_TEXT}</p>}
          </MetricTile>
        )}
        {cronograma && (
          <KpiCard
            testId="kpi-cronograma"
            label="Cumplimiento del cronograma"
            value={formatPct(cronograma.valor)}
            percent={cronograma.valor}
            hint={`${cronograma.a_tiempo} a tiempo de ${cronograma.vencidas} vencidas`}
          />
        )}
        {entregables && (
          <KpiCard
            testId="kpi-entregables"
            label="Entregables logrados"
            value={formatPct(entregables.valor)}
            percent={entregables.valor}
            hint={`${entregables.logrados} de ${entregables.programados} programados`}
          />
        )}
        {indicadores && (
          <KpiCard
            testId="kpi-indicadores"
            label="Cumplimiento de indicadores"
            value={formatPct(indicadores.valor)}
            percent={indicadores.valor}
            hint={`${indicadores.medidos} medidos${indicadores.sin_medir > 0 ? `, ${indicadores.sin_medir} sin medir` : ""}`}
          />
        )}
        {beneficiarios && (
          <KpiCard
            testId="kpi-beneficiarios"
            label="Beneficiarios vs meta"
            value={formatPct(beneficiarios.valor)}
            percent={beneficiarios.valor}
            hint={
              beneficiarios.meta === null
                ? `${beneficiarios.total} registrados, sin meta`
                : `${beneficiarios.total} de ${beneficiarios.meta}`
            }
          />
        )}
      </div>
    </div>
  );
}
