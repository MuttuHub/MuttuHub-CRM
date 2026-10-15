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
import { AlertTriangle, ChevronDown, PiggyBank } from "lucide-react";
import { ToneBadge } from "@/components/crm/shared";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SELECT_CLASS, SectionHeader } from "@/components/proyectos/ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProjectFinancialSheet,
  type ColorSemaforo,
  type ProjectBase,
  type ProjectFinancialRow,
  type ProjectFinancialSheet,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatCOP, formatPercent, toCents } from "@/lib/proyectos/money";
import { projectPeriods } from "@/lib/proyectos/weeks";
import { cn } from "@/lib/utils";
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
  const [opciones, setOpciones] = useState(false);
  // The original (v0) exists from the baseline approval on; in BORRADOR there is nothing to compare with.
  const baseDisponible = proyecto.estado !== "BORRADOR";
  const query = useProjectFinancialSheet(proyecto.id, corte, base);
  const ficha = query.data;
  // The server picks the default corte; the selector then shows the one it used.
  const corteActual = corte ?? ficha?.corte ?? "";

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={opciones}
          aria-controls="financiero-opciones-avanzadas"
          onClick={() => setOpciones((abiertas) => !abiertas)}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", opciones && "rotate-180")} aria-hidden />
          Opciones avanzadas
        </Button>
        {ficha && !ficha.parametros.confirmado && <ToneBadge tone="neutro" label="No confirmado" />}
      </div>

      {opciones && (
        <div id="financiero-opciones-avanzadas" className="flex flex-wrap items-center gap-3">
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
        </div>
      )}

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
        <>
          <div className="flex flex-col gap-3">
            <BarraEjecucion ficha={ficha} />
            <RubroBars rubros={ficha.rubros} disponible={disponible} />
          </div>
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
        </>
      )}
    </>
  );
}

/* ── Ejecución y barras por rubro (X3) ──────────────────────────────────── */

const ZERO = BigInt(0);
const MIL = BigInt(1000);

/** `valor / base` as a percentage rounded to a tenth, in bigint so no amount hits a float. */
function pct1(valor: bigint, base: bigint): number {
  if (base <= ZERO) return 0;
  return Number((valor * MIL + base / BigInt(2)) / base) / 10;
}

const COLOR_BARRA: Record<ColorSemaforo, string> = {
  verde: "bg-exito",
  amarillo: "bg-alerta",
  rojo: "bg-destructivo",
};

/**
 * Barra horizontal de ejecución (X3): el avance (E/A) con una marca en lo programado (P/A) sobre el
 * total asignado, y la frase «Ejecutado … de … programados (… %) · Asignado …» debajo. El color sale
 * del servidor (`color` de la ficha); el cliente nunca lo recalcula (D11). La frase es también el
 * nombre accesible de la barra.
 */
function BarraEjecucion({ ficha }: { ficha: ProjectFinancialSheet }) {
  const disponible = ficha.ejecucion_disponible;
  const ejecutado = toCents(ficha.total.ejecutado);
  const programado = toCents(ficha.total.programado);
  const asignado = toCents(ficha.total.asignado);
  const anchoEjecutado = pct1(ejecutado, asignado);
  const anchoProgramado = pct1(programado, asignado);
  const ep = ficha.total.ep_decimas === null ? null : Math.round(ficha.total.ep_decimas / 10);
  const frase = [
    `Ejecutado ${formatCOP(ejecutado)} de ${formatCOP(programado)} programados${ep === null ? "" : ` (${ep} %)`}`,
    `Asignado ${formatCOP(asignado)}`,
  ].join(" · ");
  const color = disponible ? ficha.total.color : null;

  return (
    <div data-testid="financiero-ejecucion-bloque" className="surface-inner p-3">
      <div
        data-testid="financiero-ejecucion"
        data-color={color ?? undefined}
        role="img"
        aria-label={frase}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink-100"
      >
        <span
          data-testid="financiero-ejecucion-ejecutado"
          data-width={anchoEjecutado}
          className={cn("absolute inset-y-0 left-0 rounded-full", color ? COLOR_BARRA[color] : "bg-ink-300")}
          style={{ width: `${anchoEjecutado}%` }}
        />
        <span
          data-testid="financiero-ejecucion-programado"
          data-width={anchoProgramado}
          aria-hidden
          className="absolute inset-y-0 -ml-px w-0.5 bg-ink-950"
          style={{ left: `${anchoProgramado}%` }}
        />
      </div>
      <p data-testid="financiero-ejecucion-caption" className="mt-2 text-[12.5px] text-ink-600">
        {frase}
      </p>
    </div>
  );
}

function RubroBars({ rubros, disponible }: { rubros: readonly ProjectFinancialRow[]; disponible: boolean }) {
  // Shared scale: the widest planned or executed amount across the rubros.
  const maximo = rubros.reduce((max, r) => {
    const programado = toCents(r.programado);
    const ejecutado = disponible ? toCents(r.ejecutado) : ZERO;
    return programado > max ? programado : ejecutado > max ? ejecutado : max;
  }, ZERO);

  return (
    <ul data-testid="financiero-barras" className="flex flex-col gap-2.5">
      {rubros.map((row) => (
        <li key={row.rubro_id ?? row.nombre} data-testid="financiero-barra-fila" className="surface-inner p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-ink-800">
              {row.codigo && <span className="font-mono text-[11.5px] text-ink-500">{row.codigo} </span>}
              {row.nombre}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[12px] text-ink-600 tabular-nums">
                {`E/P ${disponible ? formatPercent(row.ep_decimas === null ? null : BigInt(row.ep_decimas)) : "—"}`}
              </span>
              {disponible && row.color ? <SemaforoChip color={row.color} /> : null}
            </span>
          </div>
          <BarraRubro
            etiqueta="Programado"
            valor={row.programado}
            ancho={pct1(toCents(row.programado), maximo)}
            testId="financiero-barra-programado"
          />
          <BarraRubro
            etiqueta="Ejecutado"
            valor={disponible ? row.ejecutado : null}
            ancho={disponible ? pct1(toCents(row.ejecutado), maximo) : 0}
            testId="financiero-barra-ejecutado"
            marca
          />
        </li>
      ))}
    </ul>
  );
}

function BarraRubro({
  etiqueta,
  valor,
  ancho,
  testId,
  marca = false,
}: {
  etiqueta: string;
  /** Null when there is nothing executed yet: the amount shows an em dash. */
  valor: string | null;
  ancho: number;
  testId: string;
  marca?: boolean;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11.5px] text-ink-500">{etiqueta}</span>
      <span
        data-testid={testId}
        data-width={ancho}
        aria-hidden
        className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"
      >
        <span
          className={cn("block h-full rounded-full", marca ? "bg-rose-500 dark:bg-rose-400" : "bg-ink-300")}
          style={{ width: `${ancho}%` }}
        />
      </span>
      <span className="w-28 shrink-0 text-right text-[11.5px] text-ink-600 tabular-nums">
        {valor === null ? "—" : formatCOP(toCents(valor))}
      </span>
    </div>
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
