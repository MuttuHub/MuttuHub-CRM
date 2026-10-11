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
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SELECT_CLASS, SectionHeader } from "@/components/proyectos/ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FICHA_ERROR = "No pudimos cargar la ficha financiera. Inténtalo de nuevo.";
export const SIN_GASTOS_NOTE = "Ejecución disponible cuando se registren gastos";
export const ALERTA_RETRASO_TEXT =
  "Posible retraso: el gasto va por debajo de lo programado y el avance técnico está atrasado.";


export function ProjectFinanciero({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <section data-testid="financiero">
      <SectionHeader icon={<PiggyBank className="size-3.5" strokeWidth={2} />}>Ficha financiera</SectionHeader>
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
          className="flex items-start gap-1.5 rounded-inner border border-border bg-panel p-2.5 text-[12.5px] font-semibold text-ink-900"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          {ALERTA_RETRASO_TEXT}
        </p>
      )}

      {ficha.rubros.length === 0 ? (
        <EmptyBlock>Aún no hay presupuesto asignado a este proyecto.</EmptyBlock>
      ) : (
        <div className="overflow-x-auto rounded-inner border border-border bg-panel">
          <Table data-testid="financiero-tabla" className="w-full text-[12.5px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Rubro</TableHead>
                <TableHead scope="col" numeric>Asignado</TableHead>
                <TableHead scope="col" numeric>Programado</TableHead>
                <TableHead scope="col" numeric>Ejecutado</TableHead>
                <TableHead scope="col" numeric>Diferencia</TableHead>
                <TableHead scope="col" numeric>E/P</TableHead>
                <TableHead scope="col" numeric>E/A</TableHead>
                <TableHead scope="col" numeric>Umbral rojo</TableHead>
                <TableHead scope="col">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ficha.rubros.map((row) => (
                <FichaFila key={row.rubro_id ?? row.nombre} row={row} disponible={disponible} testId="financiero-fila" />
              ))}
              <FichaFila row={ficha.total} disponible={disponible} testId="financiero-total" total />
            </TableBody>
          </Table>
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
  return (
    <TableRow
      data-testid={testId}
      className={total ? "border-t border-ink-200 font-semibold" : undefined}
    >
      <TableCell className="text-ink-800 whitespace-normal">
        {row.codigo && <span className="font-mono text-[11.5px] text-ink-500">{row.codigo} </span>}
        {row.nombre}
      </TableCell>
      <TableCell numeric>{monto(row.asignado)}</TableCell>
      <TableCell numeric>{monto(row.programado)}</TableCell>
      <TableCell numeric>{disponible ? monto(row.ejecutado) : "—"}</TableCell>
      <TableCell numeric>{disponible ? monto(row.diferencia) : "—"}</TableCell>
      <TableCell numeric>{disponible ? porcentaje(row.ep_decimas) : "—"}</TableCell>
      <TableCell numeric>{disponible ? porcentaje(row.ea_decimas) : "—"}</TableCell>
      <TableCell numeric>{monto(row.umbral_rojo)}</TableCell>
      <TableCell>
        {disponible && row.color ? (
          <SemaforoChip color={row.color} />
        ) : (
          "—"
        )}
      </TableCell>
    </TableRow>
  );
}
