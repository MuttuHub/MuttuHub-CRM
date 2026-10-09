// Sección "Ficha financiera" de la ficha (S5 U6). De solo lectura: A (asignado),
// P (programado), E (ejecutado), D = E − P, E/P, E/A y el color por rubro más
// la fila de total. Todo llega calculado por el servidor y solo se pinta: el
// cliente NUNCA recalcula el color. Solo agregados: sin gastos individuales ni
// soportes. E sale de los gastos VALIDADOS (S6); mientras el proyecto está en
// BORRADOR la API marca `ejecucion_disponible: false` y no se muestran colores
// ni porcentajes de ejecución. La base "Original (v0)" (S8) lee A y P congelados en
// la línea base, con la E vigente; el servidor hace el cálculo, aquí solo se pide.

"use client";

import { useState } from "react";
import { AlertTriangle, PiggyBank } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { InlineError, errorMessage } from "@/components/proyectos/estructura-ui";
import { COLOR_META } from "@/components/proyectos/semaforo-tecnico";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProjectFinancialSheet,
  type ProjectBase,
  type ProjectFinancialRow,
  type ProjectFinancialSheet,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatCOP, formatPercent, toCents } from "@/lib/proyectos/money";
import { projectPeriods } from "@/lib/proyectos/weeks";

const FICHA_ERROR = "No pudimos cargar la ficha financiera. Inténtalo de nuevo.";
export const SIN_GASTOS_NOTE = "Ejecución disponible cuando se registren gastos";
export const ALERTA_RETRASO_TEXT =
  "Posible retraso: el gasto va por debajo de lo programado y el avance técnico está atrasado.";

const SELECT_CLASS =
  "h-8 rounded-12 border border-ink-200 bg-panel px-2.5 text-[12.5px] text-ink-900 disabled:opacity-60";

export function ProjectFinanciero({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <section data-testid="financiero">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
        <PiggyBank className="size-3.5" strokeWidth={2} />
        Ficha financiera
      </h3>
      {proyecto.fecha_inicio && proyecto.fecha_fin ? (
        <FinancieroContent proyecto={proyecto} inicio={proyecto.fecha_inicio} fin={proyecto.fecha_fin} />
      ) : (
        <p className="mt-1.5 text-[12.5px] text-ink-500">
          La ficha financiera estará disponible cuando el proyecto tenga fechas de inicio y fin.
        </p>
      )}
    </section>
  );
}

function periodosDe(inicio: string, fin: string): string[] {
  try {
    return projectPeriods(inicio, fin);
  } catch {
    return [];
  }
}

function FinancieroContent({ proyecto, inicio, fin }: { proyecto: ProjectListRow; inicio: string; fin: string }) {
  const periodos = periodosDe(inicio, fin);
  const [corte, setCorte] = useState<string | null>(null);
  const [base, setBase] = useState<ProjectBase>("vigente");
  // The original (v0) exists from the baseline approval on; in BORRADOR there is nothing to compare with.
  const baseDisponible = proyecto.estado !== "BORRADOR";
  const query = useProjectFinancialSheet(proyecto.id, corte, base);
  const ficha = query.data;
  // The server picks the default corte; the selector then shows the one it used.
  const corteActual = corte ?? ficha?.corte ?? "";

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
          Corte
          <select
            aria-label="Corte"
            value={corteActual}
            onChange={(event) => setCorte(event.target.value)}
            className={SELECT_CLASS}
          >
            {periodos.map((periodo) => (
              <option key={periodo} value={periodo}>
                {periodo}
              </option>
            ))}
          </select>
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
        {ficha && !ficha.parametros.confirmado && <ToneBadge tone="neutro" label="No confirmado" />}
      </div>

      {query.isError ? (
        <InlineError message={errorMessage(query.error, FICHA_ERROR)} />
      ) : query.isLoading || !ficha?.rubros ? (
        <Skeleton className="h-24 w-full rounded-[14px]" />
      ) : (
        <FichaTabla ficha={ficha} />
      )}
    </div>
  );
}

function FichaTabla({ ficha }: { ficha: ProjectFinancialSheet }) {
  const disponible = ficha.ejecucion_disponible;

  return (
    <>
      {!disponible && <p className="text-[12.5px] text-ink-500">{SIN_GASTOS_NOTE}</p>}
      {ficha.alerta_retraso && (
        <p
          data-testid="financiero-alerta"
          className="flex items-start gap-1.5 rounded-[14px] border border-ink-200 bg-panel p-2.5 text-[12.5px] font-semibold text-ink-900"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          {ALERTA_RETRASO_TEXT}
        </p>
      )}

      {ficha.rubros.length === 0 ? (
        <p className="text-[13px] text-ink-500">Aún no hay presupuesto asignado a este proyecto.</p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-ink-200 bg-panel">
          <table data-testid="financiero-tabla" className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[11px] text-ink-500">
                <th scope="col" className="px-3 py-2 font-semibold">Rubro</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Asignado</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Programado</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Ejecutado</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Diferencia</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">E/P</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">E/A</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Umbral rojo</th>
                <th scope="col" className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ficha.rubros.map((row) => (
                <FichaFila key={row.rubro_id ?? row.nombre} row={row} disponible={disponible} testId="financiero-fila" />
              ))}
              <FichaFila row={ficha.total} disponible={disponible} testId="financiero-total" total />
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const porcentaje = (decimas: number | null) => formatPercent(decimas === null ? null : BigInt(decimas));
const monto = (valor: string) => formatCOP(toCents(valor));

function FichaFila({
  row,
  disponible,
  testId,
  total = false,
}: {
  row: ProjectFinancialRow;
  disponible: boolean;
  testId: string;
  total?: boolean;
}) {
  const meta = row.color ? COLOR_META[row.color] : null;
  return (
    <tr
      data-testid={testId}
      className={total ? "border-t border-ink-200 font-semibold" : "border-b border-ink-100"}
    >
      <td className="px-3 py-1.5 text-ink-800">
        {row.codigo && <span className="font-mono text-[11.5px] text-ink-500">{row.codigo} </span>}
        {row.nombre}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{monto(row.asignado)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{monto(row.programado)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{disponible ? monto(row.ejecutado) : "—"}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{disponible ? monto(row.diferencia) : "—"}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{disponible ? porcentaje(row.ep_decimas) : "—"}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{disponible ? porcentaje(row.ea_decimas) : "—"}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{monto(row.umbral_rojo)}</td>
      <td className="px-3 py-1.5">
        {disponible && row.color && meta ? (
          <span data-color={row.color}>
            <ToneBadge tone={meta.tone} label={meta.label} />
          </span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
