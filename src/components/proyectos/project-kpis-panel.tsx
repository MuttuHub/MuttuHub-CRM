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
import { InlineError, errorMessage } from "@/components/proyectos/estructura-ui";
import { COLOR_META } from "@/components/proyectos/semaforo-tecnico";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  downloadProjectExport,
  useProjectKpis,
  type ColorSemaforo,
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

const SELECT_CLASS =
  "h-8 rounded-12 border border-ink-200 bg-panel px-2.5 text-[12.5px] text-ink-900 disabled:opacity-60";
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
    <section data-testid="kpis">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
        <BarChart3 className="size-3.5" strokeWidth={2} />
        Indicadores
      </h3>

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
          <Button variant="outline" size="sm" className="h-8 rounded-11" onClick={() => void exportar("proyecto")}>
            <Download className="size-3.5" strokeWidth={1.8} />
            Exportar ficha (Excel)
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-11" onClick={() => void exportar("financiera")}>
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
        <p className="mt-2 text-[12.5px] text-ink-500">{KPIS_NO_MEDIBLE_NOTE}</p>
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
          <Tile testId="kpi-tecnico" color={tecnico.color} chip={`Semáforo técnico: ${COLOR_META[tecnico.color].label}`}>
            <Row label="Avance real" value={formatPct(tecnico.avance_real)} />
            <Row label="Avance programado" value={formatPct(tecnico.avance_programado)} />
            <Row label="Desviación" value={formatPp(tecnico.desviacion_pp)} />
          </Tile>
        )}
        {financiero && (
          <Tile testId="kpi-financiero" color={financiero.color} chip={`Semáforo financiero: ${COLOR_META[financiero.color].label}`}>
            <Row label="Asignado" value={formatMonto(financiero.asignado)} />
            <Row label="Programado" value={formatMonto(financiero.programado)} />
            <Row label="Ejecutado" value={formatMonto(financiero.ejecutado)} />
            <Row label="Ejecutado / asignado" value={formatPct(financiero.ea)} />
            <Row label="Ejecutado / programado" value={formatPct(financiero.ep)} />
            {financiero.alerta_retraso && <p className="text-[12px] text-ink-700">{ALERTA_RETRASO_TEXT}</p>}
          </Tile>
        )}
        {cronograma && (
          <Tile testId="kpi-cronograma" title="Cumplimiento del cronograma">
            <Valor value={formatPct(cronograma.valor)} detalle={`${cronograma.a_tiempo} a tiempo de ${cronograma.vencidas} vencidas`} />
          </Tile>
        )}
        {entregables && (
          <Tile testId="kpi-entregables" title="Entregables logrados">
            <Valor value={formatPct(entregables.valor)} detalle={`${entregables.logrados} de ${entregables.programados} programados`} />
          </Tile>
        )}
        {indicadores && (
          <Tile testId="kpi-indicadores" title="Cumplimiento de indicadores">
            <Valor
              value={formatPct(indicadores.valor)}
              detalle={`${indicadores.medidos} medidos${indicadores.sin_medir > 0 ? `, ${indicadores.sin_medir} sin medir` : ""}`}
            />
          </Tile>
        )}
        {beneficiarios && (
          <Tile testId="kpi-beneficiarios" title="Beneficiarios vs meta">
            <Valor
              value={formatPct(beneficiarios.valor)}
              detalle={
                beneficiarios.meta === null
                  ? `${beneficiarios.total} registrados, sin meta`
                  : `${beneficiarios.total} de ${beneficiarios.meta}`
              }
            />
          </Tile>
        )}
      </div>
    </div>
  );
}

function Tile({
  testId,
  title,
  color,
  chip,
  children,
}: {
  testId: string;
  title?: string;
  color?: ColorSemaforo;
  chip?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} data-color={color} className="rounded-[14px] border border-ink-200 bg-panel p-3">
      {color && chip ? (
        <ToneBadge tone={COLOR_META[color].tone} label={chip} />
      ) : (
        <span className="text-[12px] font-semibold text-ink-600">{title}</span>
      )}
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] text-ink-500">{label}</span>
      <span className="font-semibold text-ink-900 tabular-nums">{value}</span>
    </div>
  );
}

function Valor({ value, detalle }: { value: string; detalle: string }) {
  return (
    <div>
      <span className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink-950 tabular-nums">{value}</span>
      <p className="text-[11.5px] text-ink-600">{detalle}</p>
    </div>
  );
}
