// Finanzas › Resumen (redesign T3, `Finanzas-propuesta` / `Finanzas-movil-propuesta`): three key figures (Ejecutado,
// Programado a hoy, Valor total), the possible-delay notice, the gastos waiting for validation, and one row per rubro
// with what is still available. The full table (differences and colour limits) and the corte / base options live
// behind «Ver detalle con diferencias y límites de cada color». Every amount and colour of the financial sheet comes
// from the server and is only painted: the client NEVER recomputes a colour. While the project is BORRADOR the API
// sends `ejecucion_disponible: false` and no colours or execution percentages are shown.

"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AyudaBase, BASE_NO_DISPONIBLE, ETIQUETA_BASE, ETIQUETA_CORTE, NOMBRE_BASE, OpcionesBase, SemaforoProvisional } from "@/components/proyectos/vocabulario-seguimiento";
import { errorMessage, plural } from "@/components/proyectos/estructura-ui";
import { useIsMobile } from "@/components/proyectos/capture-surface";
import { mesLegible } from "@/components/proyectos/project-display";
import { EmptyBlock, InlineError, SELECT_CLASS } from "@/components/proyectos/ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { GastosPorValidar } from "@/components/proyectos/ficha/finanzas/gastos-por-validar";
import { AYUDA_DISPONIBLE } from "@/components/proyectos/ficha/finanzas/gastos-comun";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useProjectExpenses,
  useProjectFinancialSheet,
  type ProjectBase,
  type ProjectExpense,
  type ProjectFinancialRow,
  type ProjectFinancialSheet,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatCOP, formatPercent, percentTenths, toCents } from "@/lib/proyectos/money";
import { projectPeriods } from "@/lib/proyectos/weeks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FICHA_ERROR = "No pudimos cargar la ficha financiera. Inténtalo de nuevo.";
export const SIN_GASTOS_NOTE = "Ejecución disponible cuando se registren gastos";
export const ALERTA_RETRASO_TEXT =
  "Posible retraso: se ha gastado poco frente a lo programado y el avance técnico también va atrasado.";
export const VER_DETALLE = "Ver detalle con diferencias y límites de cada color";

type Navegacion = {
  /** «Ver actividades» in the possible-delay notice: switches the ficha to Actividades. */
  onVerActividades?: () => void;
  /** «Ver todos los gastos»: switches Finanzas to its Gastos segment. */
  onVerGastos?: () => void;
};

// Its only screen is Finanzas › Resumen, whose segment already names the section: no heading of its own.
export function ProjectFinanciero({ proyecto, ...navegacion }: { proyecto: ProjectListRow } & Navegacion) {
  return (
    <section data-testid="financiero">
      {proyecto.fecha_inicio && proyecto.fecha_fin ? (
        <FinancieroContent proyecto={proyecto} inicio={proyecto.fecha_inicio} fin={proyecto.fecha_fin} {...navegacion} />
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

function FinancieroContent({
  proyecto,
  inicio,
  fin,
  onVerActividades,
  onVerGastos,
}: { proyecto: ProjectListRow; inicio: string; fin: string } & Navegacion) {
  const periodos = periodosDe(inicio, fin);
  const [corte, setCorte] = useState<string | null>(null);
  const [base, setBase] = useState<ProjectBase>("vigente");
  const [detalle, setDetalle] = useState(false);
  // The original (v0) exists from the baseline approval on; in BORRADOR there is nothing to compare with.
  const baseDisponible = proyecto.estado !== "BORRADOR";
  const query = useProjectFinancialSheet(proyecto.id, corte, base);
  const gastosQuery = useProjectExpenses(proyecto.id);
  const ficha = query.data;
  // The server picks the default corte; the selector then shows the one it used.
  const corteActual = corte ?? ficha?.corte ?? "";
  // The detail can be folded: what is not the default is announced apart.
  const filtros = [
    ...(base === "original" ? [`Comparado con el ${NOMBRE_BASE.original.toLowerCase()}`] : []),
    ...(corte !== null ? [`Hasta ${mesLegible(corte)}`] : []),
  ];
  const restablecer = () => {
    setCorte(null);
    setBase("vigente");
  };

  return (
    <div className="mt-2 flex flex-col gap-4">
      {((ficha && !ficha.parametros.confirmado) || filtros.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {ficha && !ficha.parametros.confirmado && <SemaforoProvisional />}
          {filtros.length > 0 && (
            <span data-testid="financiero-filtros" className="flex items-center gap-1.5 text-[12px] text-ink-700">
              <span className="rounded-full border border-border bg-panel px-2.5 py-1">{filtros.join(" · ")}</span>
              <Button type="button" variant="ghost" size="sm" onClick={restablecer}>
                Restablecer
              </Button>
            </span>
          )}
        </div>
      )}

      {query.isError ? (
        <InlineError message={errorMessage(query.error, FICHA_ERROR)} />
      ) : query.isLoading || !ficha?.rubros ? (
        <Skeleton className="h-24 w-full rounded-[14px]" />
      ) : (
        <>
          <Cifras
            ficha={ficha}
            proyecto={proyecto}
            validados={gastosQuery.data?.totales?.VALIDADO?.cantidad}
            corteElegido={corte !== null}
          />
          {ficha.alerta_retraso && (
            <div
              data-testid="financiero-alerta"
              role="note"
              className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-inner border border-border bg-panel p-2.5 text-[12.5px] font-semibold text-ink-900"
            >
              <span className="flex flex-1 items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                {ALERTA_RETRASO_TEXT}
              </span>
              {onVerActividades && (
                <Button type="button" variant="link" className="h-auto min-h-11 px-0 underline md:min-h-0" onClick={onVerActividades}>
                  Ver actividades
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <GastosPorValidar proyecto={proyecto} onVerTodos={onVerGastos} />

      {ficha?.rubros && !query.isError && (
        <section aria-labelledby="financiero-por-rubro" className="flex flex-col gap-2">
          <h3 id="financiero-por-rubro" className="font-display text-[15px] font-bold text-ink-950">
            Por rubro<span className="md:hidden"> · % de lo programado</span>
          </h3>
          {ficha.rubros.length === 0 ? (
            <EmptyBlock>Aún no hay presupuesto asignado a este proyecto.</EmptyBlock>
          ) : (
            <PorRubro ficha={ficha} gastos={gastosQuery.data?.gastos ?? []} />
          )}
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-11 self-start px-0 text-left whitespace-normal md:min-h-0"
            aria-expanded={detalle}
            aria-controls="financiero-detalle"
            onClick={() => setDetalle((abierto) => !abierto)}
          >
            {detalle ? "Ocultar detalle" : VER_DETALLE}
          </Button>
          {detalle && (
            <div id="financiero-detalle" className="flex flex-col gap-3">
              {ficha.rubros.length > 0 && <FichaTabla ficha={ficha} />}
              <fieldset
                id="financiero-opciones-avanzadas"
                className="flex flex-wrap items-center gap-3 rounded-inner border border-border p-3"
              >
                <legend className="px-1 text-[12px] font-semibold text-ink-700">Opciones avanzadas</legend>
                <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
                  {ETIQUETA_CORTE}
                  <select
                    aria-label={ETIQUETA_CORTE}
                    value={corteActual}
                    onChange={(event) => setCorte(event.target.value)}
                    className={SELECT_CLASS}
                  >
                    {periodos.map((periodo) => (
                      <option key={periodo} value={periodo}>
                        {mesLegible(periodo)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="flex items-center gap-1">
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-600">
                    {ETIQUETA_BASE}
                    <select
                      aria-label={ETIQUETA_BASE}
                      disabled={!baseDisponible}
                      value={base}
                      onChange={(event) => setBase(event.target.value as ProjectBase)}
                      title={baseDisponible ? undefined : BASE_NO_DISPONIBLE}
                      className={SELECT_CLASS}
                    >
                      <OpcionesBase conOriginal={baseDisponible} />
                    </select>
                  </label>
                  <AyudaBase />
                </span>
                <Button type="button" variant="outline" size="sm" onClick={restablecer}>
                  Restablecer
                </Button>
              </fieldset>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ── Key figures ────────────────────────────────────────────────────────── */

const porcentaje = (decimas: number | null) => formatPercent(decimas === null ? null : BigInt(decimas));
const monto = (valor: string) => formatCOP(toCents(valor));

function Cifra({
  testId,
  etiqueta,
  ayuda,
  valor,
  children,
}: {
  testId: string;
  etiqueta: string;
  ayuda?: string;
  valor: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="surface-tile flex min-w-0 flex-col gap-1 p-3.5">
      <p className="flex items-center gap-1 text-[12px] font-semibold text-ink-600">
        {etiqueta}
        {ayuda && <HelpHint label={etiqueta}>{ayuda}</HelpHint>}
      </p>
      <p className="font-mono text-[22px] leading-tight font-bold text-ink-950 tabular-nums">{valor}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-600">{children}</div>
    </div>
  );
}

function Cifras({
  ficha,
  proyecto,
  validados,
  corteElegido,
}: {
  ficha: ProjectFinancialSheet;
  proyecto: ProjectListRow;
  /** Validated expenses of the project; undefined until the expenses load. */
  validados: number | undefined;
  corteElegido: boolean;
}) {
  const disponible = ficha.ejecucion_disponible;
  const ejecutado = disponible ? toCents(ficha.total.ejecutado) : BigInt(0);
  const valorTotal = proyecto.valor_total === null ? null : toCents(proyecto.valor_total);
  const etiquetaProgramado = corteElegido ? `Programado hasta ${mesLegible(ficha.corte)}` : "Programado a hoy";

  return (
    <div data-testid="financiero-cifras" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Cifra testId="cifra-ejecutado" etiqueta="Ejecutado (gastos validados)" valor={formatCOP(ejecutado)}>
        {!disponible ? (
          <span>{SIN_GASTOS_NOTE}</span>
        ) : validados !== undefined ? (
          <span>{plural(validados, "gasto validado", "gastos validados")}</span>
        ) : null}
      </Cifra>
      <Cifra
        testId="cifra-programado"
        etiqueta={etiquetaProgramado}
        ayuda={`Lo que el plan financiero dice que deberías llevar ejecutado hasta ${mesLegible(ficha.corte)}. El porcentaje compara lo validado con esa cifra.`}
        valor={monto(ficha.total.programado)}
      >
        {disponible ? (
          <>
            <span>{`${porcentaje(ficha.total.ep_decimas)} de lo programado ejecutado`}</span>
            {ficha.total.color && <SemaforoChip color={ficha.total.color} />}
          </>
        ) : (
          <span>—</span>
        )}
      </Cifra>
      <Cifra
        testId="cifra-valor-total"
        etiqueta="Valor total del proyecto"
        valor={valorTotal === null ? "Sin definir" : formatCOP(valorTotal)}
      >
        {valorTotal !== null && (
          <span>
            {`${formatPercent(percentTenths(ejecutado, valorTotal))} del total ejecutado · quedan ${formatCOP(valorTotal - ejecutado)}`}
          </span>
        )}
      </Cifra>
    </div>
  );
}

/* ── Por rubro ──────────────────────────────────────────────────────────── */

/** «1 gasto por validar lo supera»: pending expenses of the rubro that the server flagged over its assigned amount. */
function superanPorRubro(gastos: readonly ProjectExpense[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const g of gastos) {
    if (g.estado === "REGISTRADO" && g.alerta_sobregasto) cuenta.set(g.rubro.id, (cuenta.get(g.rubro.id) ?? 0) + 1);
  }
  return cuenta;
}

function nombreFila(row: ProjectFinancialRow): string {
  return row.codigo ? `${row.codigo} · ${row.nombre}` : row.nombre;
}

function AvisoSupera({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="block text-[12px] font-semibold text-destructivo">
      {n === 1 ? "1 gasto por validar lo supera" : `${n} gastos por validar lo superan`}
    </span>
  );
}

function PorRubro({ ficha, gastos }: { ficha: ProjectFinancialSheet; gastos: readonly ProjectExpense[] }) {
  const mobile = useIsMobile();
  const disponible = ficha.ejecucion_disponible;
  const superan = superanPorRubro(gastos);
  const filas = ficha.rubros.map((row) => {
    const ejecutado = disponible ? toCents(row.ejecutado) : BigInt(0);
    const pct = disponible ? row.ep_decimas : null;
    return {
      row,
      ejecutado,
      pct,
      libre: toCents(row.asignado) - ejecutado,
      superan: row.rubro_id ? superan.get(row.rubro_id) ?? 0 : 0,
    };
  });
  const barra = (row: ProjectFinancialRow, pct: number | null) => (
    <ProgressBar
      value={pct === null ? 0 : pct / 10}
      band={disponible && row.color ? row.color : undefined}
      aria-label={`${nombreFila(row)}: ${porcentaje(pct)} de lo programado`}
    />
  );

  if (mobile) {
    return (
      <ul data-testid="financiero-rubros" className="surface flex flex-col divide-y divide-border">
        {filas.map(({ row, ejecutado, pct, libre, superan: n }) => (
          <li key={row.rubro_id ?? row.nombre} data-testid="financiero-rubro" className="flex flex-col gap-2 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[14px] text-ink-900">
                {nombreFila(row)}
                <AvisoSupera n={n} />
              </span>
              <span className="shrink-0 font-mono text-[13px] text-ink-800">{porcentaje(pct)}</span>
            </div>
            {barra(row, pct)}
            <dl className="grid grid-cols-3 gap-2">
              {[
                ["Programado a hoy", monto(row.programado)],
                ["Ejecutado", formatCOP(ejecutado)],
                ["Disponible", formatCOP(libre)],
              ].map(([termino, valor]) => (
                <div key={termino} className="flex flex-col gap-0.5">
                  <dt className="text-[12px] text-ink-500">{termino}</dt>
                  <dd className="font-mono text-[12.5px] text-ink-900">{valor}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="surface overflow-x-auto">
      <Table data-testid="financiero-rubros">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Rubro</TableHead>
            <TableHead scope="col" numeric>Programado a hoy</TableHead>
            <TableHead scope="col" numeric>Ejecutado</TableHead>
            <TableHead scope="col">% de lo programado</TableHead>
            <TableHead scope="col" numeric>
              <span className="inline-flex items-center gap-1">
                Disponible del rubro
                <HelpHint label="Disponible del rubro">{AYUDA_DISPONIBLE}</HelpHint>
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map(({ row, ejecutado, pct, libre, superan: n }) => (
            <TableRow key={row.rubro_id ?? row.nombre} data-testid="financiero-rubro">
              <TableCell className="whitespace-normal text-ink-900">
                {nombreFila(row)}
                <AvisoSupera n={n} />
              </TableCell>
              <TableCell numeric>{monto(row.programado)}</TableCell>
              <TableCell numeric>{formatCOP(ejecutado)}</TableCell>
              <TableCell>
                <span className="flex min-w-[160px] items-center gap-2">
                  {barra(row, pct)}
                  <span className="w-14 shrink-0 text-right font-mono text-[12.5px] tabular-nums">{porcentaje(pct)}</span>
                </span>
              </TableCell>
              <TableCell numeric>{formatCOP(libre)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Detail: differences and colour limits ──────────────────────────────── */

function FichaTabla({ ficha }: { ficha: ProjectFinancialSheet }) {
  const disponible = ficha.ejecucion_disponible;
  const tolerancia = ficha.parametros.tolerancia;

  return (
    <>
      {!disponible && <p className="text-[12.5px] text-ink-500">{SIN_GASTOS_NOTE}</p>}
      <div className="overflow-x-auto rounded-inner border border-border bg-panel">
        <Table data-testid="financiero-tabla" className="w-full text-[12.5px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Rubro</TableHead>
              <TableHead scope="col" numeric>Asignado</TableHead>
              <TableHead scope="col" numeric>Programado a hoy</TableHead>
              <TableHead scope="col" numeric>Ejecutado</TableHead>
              <TableHead scope="col" numeric>Diferencia</TableHead>
              <TableHead scope="col" numeric>% de lo programado</TableHead>
              <TableHead scope="col" numeric>% de lo asignado</TableHead>
              <TableHead scope="col" numeric>Pasa a rojo desde</TableHead>
              <TableHead scope="col">Color</TableHead>
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
      <p data-testid="financiero-ejecucion-leyenda" className="text-[12px] text-ink-600">
        {`Diferencia = ejecutado − programado. Verde: lo ejecutado no supera lo programado. Amarillo: lo supera hasta un ${tolerancia} %. Rojo: lo supera en más o excede lo asignado.`}
      </p>
    </>
  );
}

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
