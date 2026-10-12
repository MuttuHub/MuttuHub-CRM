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
import { Tacometro, type TacometroBanda } from "@/components/proyectos/tacometro";
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
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
            <PresupuestoGauge ficha={ficha} />
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

/* ── Presupuesto gauge and per-rubro bars (S14 P8) ───────────────────────── */

const ZERO = BigInt(0);
const MIL = BigInt(1000);
const PCT1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const pct1Texto = (n: number) => `${PCT1.format(n)} %`;

/** `valor / base` as a percentage rounded to a tenth, in bigint so no amount hits a float. */
function pct1(valor: bigint, base: bigint): number {
  if (base <= ZERO) return 0;
  return Number((valor * MIL + base / BigInt(2)) / base) / 10;
}

/**
 * The two boundaries of the server's own financial rule, projected on the E/A
 * scale: E ≤ P is verde, up to `umbral_rojo = P * (1 + tolerancia)` is amarillo,
 * above it rojo. They are read from the amounts the server already sent; the
 * client never recomputes the colour (D11).
 */
function limitesFinancieros(total: ProjectFinancialRow): { verde: number; amarillo: number } | null {
  const asignado = toCents(total.asignado);
  if (asignado <= ZERO) return null;
  const verde = pct1(toCents(total.programado), asignado);
  const amarillo = pct1(toCents(total.umbral_rojo), asignado);
  if (amarillo <= verde) return null;
  return { verde, amarillo };
}

function PresupuestoGauge({ ficha }: { ficha: ProjectFinancialSheet }) {
  const ea = ficha.total.ea_decimas === null ? null : ficha.total.ea_decimas / 10;
  const limites = limitesFinancieros(ficha.total);
  const bandas: TacometroBanda[] | undefined = limites
    ? [
        { hasta: limites.verde, color: "verde" },
        { hasta: limites.amarillo, color: "amarillo" },
        { hasta: 100, color: "rojo" },
      ]
    : undefined;

  return (
    <div data-testid="financiero-gauge" className="surface-inner p-3">
      <Tacometro value={ea} color={ficha.total.color ?? "amarillo"} bandas={bandas} label="Ejecución financiera" />
      <p data-testid="financiero-gauge-caption" className="mt-2 text-center text-[12.5px] text-ink-600">
        {formatCOP(toCents(ficha.total.ejecutado))} ejecutado de {formatCOP(toCents(ficha.total.asignado))} asignado
      </p>
      {limites && (
        <ul
          data-testid="financiero-gauge-leyenda"
          className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-[12px] text-ink-600"
        >
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-exito" />
            Verde: hasta {pct1Texto(limites.verde)}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-alerta" />
            Amarillo: {pct1Texto(limites.verde)} – {pct1Texto(limites.amarillo)}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-destructivo" />
            Rojo: por encima de {pct1Texto(limites.amarillo)}
          </li>
        </ul>
      )}
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
