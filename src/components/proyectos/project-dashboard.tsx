// Tablero del portafolio de proyectos (S9 U6, RF-30; `/proyectos?vista=tablero`). De solo lectura: cada
// semáforo, porcentaje y alerta llega calculado por el servidor (`GET /dashboard/portfolio`) y aquí solo se
// pinta; el cliente NUNCA recalcula un color. El alcance (todos, o solo los proyectos del COORDINADOR) lo
// aplica la API. Solo agregados: sin gastos individuales ni soportes. Desde S14 P9 el tablero es gerencial:
// tacómetro, curva S, radar por línea estratégica (`agregado.por_linea`), barras por proyecto de cronograma
// y entregables. El municipio es solo un filtro: no hay desglose territorial (REQ-DSH-04). Mientras los
// parámetros del semáforo no estén confirmados se muestra la insignia "No confirmado".

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye, FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { ToneBadge } from "@/components/crm/shared";
import { BarRow, StatTile } from "@/components/dashboard/shared";
import { CurveSChart } from "@/components/proyectos/curve-s-chart";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError, SELECT_CLASS } from "@/components/proyectos/ui";
import { Radar } from "@/components/proyectos/radar";
import { Tacometro } from "@/components/proyectos/tacometro";
import { ESTADO_PROYECTO_META, formatFechaCalendario } from "@/components/proyectos/project-display";
import { formatPct } from "@/components/proyectos/project-kpis-panel";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { useIsMobile } from "@/components/proyectos/capture-surface";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClientOptions } from "@/hooks/kanban";
import { useUsers } from "@/hooks/crm";
import {
  downloadPortfolioExport,
  useMunicipalities,
  useProjectCurve,
  useProjectsPortfolio,
  useStrategicLines,
  type ColorSemaforo,
  type PortfolioFilters,
  type PortfolioProject,
} from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";
import type { EstadoProyecto } from "@prisma/client";

const ESTADOS: EstadoProyecto[] = ["PLANIFICACION", "BORRADOR", "EN_EJECUCION", "SUSPENDIDO", "CERRADO", "CANCELADO"];
const CURVA_ERROR = "No pudimos cargar la curva S. Inténtalo de nuevo.";
const TABLERO_ERROR = "No pudimos cargar el tablero de proyectos. Inténtalo de nuevo.";

type FiltroKey = keyof PortfolioFilters;

export function ProjectDashboard() {
  const [valores, setValores] = useState<Record<FiltroKey, string>>({
    corte: "",
    estado: "",
    cliente_id: "",
    linea_id: "",
    municipio_id: "",
    responsable_id: "",
  });
  // Solo viajan los filtros con valor: cada cambio es otra clave de consulta.
  const filters = useMemo<PortfolioFilters>(
    () => Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor !== "")) as PortfolioFilters,
    [valores],
  );
  const query = useProjectsPortfolio(filters);
  const data = query.data;

  const lineas = useStrategicLines().data ?? [];
  const municipios = useMunicipalities().data ?? [];
  const clientes = useClientOptions().data ?? [];
  const responsables = useUsers().data ?? [];
  const set = (key: FiltroKey) => (event: { target: { value: string } }) =>
    setValores((previo) => ({ ...previo, [key]: event.target.value }));

  const exportar = async () => {
    try {
      await downloadPortfolioExport(filters);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos generar el archivo. Inténtalo de nuevo."));
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="tablero">
      <section className="surface">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 p-4 lg:p-5">
          <div className="grid w-full grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
            <Filtro label="Estado">
              <select aria-label="Estado" value={valores.estado} onChange={set("estado")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {ESTADO_PROYECTO_META[estado].label}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Línea estratégica">
              <select aria-label="Línea estratégica" value={valores.linea_id} onChange={set("linea_id")} className={SELECT_CLASS}>
                <option value="">Todas</option>
                {lineas.map((linea) => (
                  <option key={linea.id} value={linea.id}>
                    {`${linea.codigo} ${linea.nombre}`}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Municipio">
              <select aria-label="Municipio" value={valores.municipio_id} onChange={set("municipio_id")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {municipios.map((municipio) => (
                  <option key={municipio.id} value={municipio.id}>
                    {municipio.nombre}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Cliente">
              <select aria-label="Cliente" value={valores.cliente_id} onChange={set("cliente_id")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Responsable">
              <select aria-label="Responsable" value={valores.responsable_id} onChange={set("responsable_id")} className={SELECT_CLASS}>
                <option value="">Todos</option>
                {responsables.map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nombre}
                  </option>
                ))}
              </select>
            </Filtro>
            <Filtro label="Corte">
              <input type="date" aria-label="Corte" value={valores.corte} onChange={set("corte")} className={SELECT_CLASS} />
            </Filtro>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data && !data.confirmado && <ToneBadge tone="neutro" label="No confirmado" />}
            <Button size="lg" variant="outline" onClick={() => void exportar()}>
              <Download className="size-4" />
              Exportar Excel
            </Button>
          </div>
        </header>

        {query.isError ? (
          <InlineError className="p-4 lg:p-5" message={errorMessage(query.error, TABLERO_ERROR)} />
        ) : query.isLoading || !data ? (
          <TableroSkeleton />
        ) : data.proyectos.length === 0 ? (
          <TableroVacio />
        ) : (
          <div className="flex flex-col gap-4 p-4 lg:p-5">
            <Resumen data={data} />
            <TableroGerencial data={data} />
            <TablaProyectos proyectos={data.proyectos} />
          </div>
        )}
      </section>
    </div>
  );
}

function Filtro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
      {label}
      {children}
    </label>
  );
}

/* ── Resumen ───────────────────────────────────────────────────────────── */

function Resumen({ data }: { data: NonNullable<ReturnType<typeof useProjectsPortfolio>["data"]> }) {
  const { agregado } = data;
  const estados = Object.entries(data.por_estado) as [EstadoProyecto, number][];
  const total = estados.reduce((suma, [, cantidad]) => suma + cantidad, 0);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Proyectos" value={total} foot={`Corte al ${formatFechaCalendario(data.corte)}`} />
      <StatTile
        label="Avance real promedio"
        value={formatPct(agregado.tecnico.avance_real)}
        foot={`Programado ${formatPct(agregado.tecnico.avance_programado)}`}
      />
      <div data-testid="tablero-ea">
        <StatTile
          label="Ejecutado / asignado"
          value={formatPct(agregado.financiero.ea)}
          foot={`Ejecutado / programado ${formatPct(agregado.financiero.ep)}`}
        />
      </div>
      <div data-testid="tablero-ejecutado">
        <StatTile
          label="Ejecutado"
          mono
          value={formatCOP(toCents(agregado.financiero.ejecutado))}
          foot={`Asignado ${formatCOP(toCents(agregado.financiero.asignado))}`}
        />
      </div>
      <div data-testid="tablero-estados" className="flex flex-col gap-2 surface p-[18px] md:col-span-2 xl:col-span-4">
        <span className="text-[12px] font-semibold text-ink-600">Proyectos por estado</span>
        {estados.map(([estado, cantidad]) => (
          <BarRow
            key={estado}
            label={ESTADO_PROYECTO_META[estado]?.label ?? estado}
            tone={ESTADO_PROYECTO_META[estado]?.tone}
            count={cantidad}
            total={total}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Tabla ─────────────────────────────────────────────────────────────── */

function TablaProyectos({ proyectos }: { proyectos: PortfolioProject[] }) {
  // Debajo de `md` la tabla de 900 px se vuelve una lista de tarjetas (S10 WU4).
  const mobile = useIsMobile();
  if (mobile) return <TarjetasProyectos proyectos={proyectos} />;
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Proyecto</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="whitespace-normal leading-tight">Semáforo técnico</TableHead>
            <TableHead className="whitespace-normal leading-tight">Semáforo financiero</TableHead>
            <TableHead numeric>Avance real</TableHead>
            <TableHead numeric className="whitespace-normal leading-tight">Ejecutado / asignado</TableHead>
            <TableHead numeric className="sticky right-0 bg-panel">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proyectos.map((proyecto) => (
            <TableRow key={proyecto.id} className="group/fila" data-testid={`tablero-fila-${proyecto.id}`}>
              <TableCell className="font-mono text-[12px] font-semibold text-ink-700 tabular-nums">{proyecto.codigo}</TableCell>
              <TableCell className="max-w-[200px]">
                <p className="truncate font-semibold text-ink-950" title={proyecto.nombre}>{proyecto.nombre}</p>
                <p className="truncate text-[11.5px] text-ink-600">{proyecto.cliente.nombre}</p>
              </TableCell>
              <TableCell>
                <ToneBadge tone={ESTADO_PROYECTO_META[proyecto.estado].tone} label={ESTADO_PROYECTO_META[proyecto.estado].label} />
              </TableCell>
              <TableCell>
                <Semaforo testId="chip-tecnico" color={proyecto.semaforo_tecnico} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Semaforo testId="chip-financiero" color={proyecto.semaforo_financiero} />
                  {proyecto.alerta_retraso && <ToneBadge tone="alerta" label="Posible retraso" />}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-[12.5px] tabular-nums">
                {formatPct(proyecto.kpis.tecnico?.avance_real ?? null)}
              </TableCell>
              <TableCell className="text-right font-mono text-[12.5px] tabular-nums">
                {formatPct(proyecto.kpis.financiero?.ea ?? null)}
              </TableCell>
              <TableCell className="sticky right-0 bg-panel text-right group-hover/fila:bg-muted">
                <Link
                  href={`/proyectos/${proyecto.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-8 px-3 text-[12px] font-semibold text-ink-700 hover:bg-ink-100",
                  )}
                >
                  <Eye className="size-3.5" strokeWidth={1.8} />
                  Ver detalle
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TarjetasProyectos({ proyectos }: { proyectos: PortfolioProject[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {proyectos.map((proyecto) => (
        <li
          key={proyecto.id}
          data-testid={`tablero-fila-${proyecto.id}`}
          className="flex min-w-0 flex-col gap-2 rounded-inner border border-border bg-panel p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-[12px] font-semibold text-ink-700 tabular-nums">{proyecto.codigo}</span>
            <ToneBadge tone={ESTADO_PROYECTO_META[proyecto.estado].tone} label={ESTADO_PROYECTO_META[proyecto.estado].label} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-950">{proyecto.nombre}</p>
            <p className="text-[12px] text-ink-600">{proyecto.cliente.nombre}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Semaforo testId="chip-tecnico" color={proyecto.semaforo_tecnico} />
            <Semaforo testId="chip-financiero" color={proyecto.semaforo_financiero} />
            {proyecto.alerta_retraso && <ToneBadge tone="alerta" label="Posible retraso" />}
          </div>
          <dl className="grid grid-cols-1 gap-1 text-[12.5px]">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-500">Avance real</dt>
              <dd className="font-mono tabular-nums">{formatPct(proyecto.kpis.tecnico?.avance_real ?? null)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-500">Ejecutado / asignado</dt>
              <dd className="font-mono tabular-nums">{formatPct(proyecto.kpis.financiero?.ea ?? null)}</dd>
            </div>
          </dl>
          <Link
            href={`/proyectos/${proyecto.id}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 w-full text-[13px] font-semibold text-ink-700 hover:bg-ink-100",
            )}
          >
            <Eye className="size-3.5" strokeWidth={1.8} />
            Ver detalle
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** El color del servidor, verbatim; sin color (proyecto no medible) no hay chip, solo "Sin medir". */
function Semaforo({ testId, color }: { testId: string; color: ColorSemaforo | null }) {
  if (color === null) return <span className="text-[12px] text-ink-500">Sin medir</span>;
  return (
    <SemaforoChip data-testid={testId} color={color} />
  );
}

function TableroSkeleton() {
  return (
    <div data-testid="tablero-skeleton" className="space-y-3 p-4 lg:p-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
      ))}
    </div>
  );
}

function TableroVacio() {
  return (
    <EmptyState
      className="min-h-[260px] py-12"
      icon={
        <span className="grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-rose-100 text-rose-700 dark:text-rose-400">
          <FolderKanban className="size-6" strokeWidth={1.7} />
        </span>
      }
      title="No hay proyectos para mostrar"
      description="Prueba con otros filtros. Si no ves ninguno, puede que no tengas proyectos a tu cargo todavía."
    />
  );
}

/* ── Tablero gerencial (S14 P9) ─────────────────────────────────────────── */

type PortafolioData = NonNullable<ReturnType<typeof useProjectsPortfolio>["data"]>;

/** Modal of the SERVER colour counts: the needle paints a band the server already returned (D11). */
function colorDominante(conteo: Record<ColorSemaforo, number>): ColorSemaforo | undefined {
  const entradas = Object.entries(conteo) as [ColorSemaforo, number][];
  const total = entradas.reduce((suma, [, n]) => suma + n, 0);
  if (total === 0) return undefined;
  return entradas.reduce((max, entrada) => (entrada[1] > max[1] ? entrada : max))[0];
}

/** Tacómetro, curva S, radar por línea y las barras por proyecto. Solo agregados: nada se recalcula. */
function TableroGerencial({ data }: { data: PortafolioData }) {
  const { agregado, proyectos } = data;
  const [seleccion, setSeleccion] = useState(proyectos[0]?.id ?? "");
  // Un cambio de filtros puede dejar fuera el proyecto elegido: se cae al primero visible.
  const curvaId = proyectos.some((proyecto) => proyecto.id === seleccion) ? seleccion : (proyectos[0]?.id ?? "");
  const curva = useProjectCurve(curvaId);
  const conCronograma = proyectos.filter((proyecto) => proyecto.kpis.cronograma !== null);
  const conEntregables = proyectos.filter((proyecto) => proyecto.kpis.entregables !== null);
  const axes = agregado.por_linea
    .filter((linea) => linea.indicadores.valor !== null)
    .map((linea) => ({ label: linea.linea?.nombre ?? "Sin línea", value: linea.indicadores.valor as number }));

  // Below 3 measured lines the radar draws bars that already carry name and value, so
  // the legend only adds the lines without a measure; with a real radar it lists them all.
  const radarConBarras = axes.length < 3;
  const leyenda = radarConBarras
    ? agregado.por_linea.filter((linea) => linea.indicadores.valor === null)
    : agregado.por_linea;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Tarjeta testId="tablero-tacometro" titulo="Avance técnico">
        <Tacometro
          value={agregado.tecnico.avance_real}
          color={colorDominante(agregado.por_color_tecnico)}
          label="Avance técnico del portafolio"
        />
        <p className="text-[12px] text-ink-500">Promedio del avance técnico de los proyectos medibles.</p>
      </Tarjeta>

      <Tarjeta testId="tablero-curva" titulo="Curva S por proyecto" className="md:col-span-2">
        <label className="flex max-w-[280px] flex-col gap-1 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
          Proyecto de la curva
          <select
            aria-label="Proyecto de la curva"
            value={curvaId}
            onChange={(event) => setSeleccion(event.target.value)}
            className={SELECT_CLASS}
          >
            {proyectos.map((proyecto) => (
              <option key={proyecto.id} value={proyecto.id}>{`${proyecto.codigo} ${proyecto.nombre}`}</option>
            ))}
          </select>
        </label>
        {curva.isError ? (
          <InlineError message={errorMessage(curva.error, CURVA_ERROR)} className="mt-2" />
        ) : !curva.data ? (
          <Skeleton className="mt-2 h-40 w-full rounded-[14px]" />
        ) : (
          <CurveSChart curva={curva.data} />
        )}
      </Tarjeta>

      <Tarjeta testId="tablero-radar" titulo="Indicadores por línea estratégica">
        <Radar axes={axes} label="Cumplimiento de indicadores por línea estratégica" />
        {leyenda.length > 0 && (
          <ul data-testid="tablero-radar-leyenda" className="flex flex-col gap-1">
            {leyenda.map((linea, index) => (
              <li key={linea.linea?.id ?? `sin-linea-${index}`} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate text-ink-600">{linea.linea?.nombre ?? "Sin línea"}</span>
                <span className="shrink-0 font-mono tabular-nums text-ink-800">
                  {linea.indicadores.valor === null ? "Sin medir" : formatPct(linea.indicadores.valor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta testId="tablero-cronograma" titulo="Cumplimiento del cronograma">
        {conCronograma.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">Sin datos de cronograma todavía.</p>
        ) : (
          conCronograma.map((proyecto) => (
            <FilaBarra
              key={proyecto.id}
              nombre={proyecto.nombre}
              valor={proyecto.kpis.cronograma?.valor ?? null}
              ariaLabel={`Cumplimiento del cronograma de ${proyecto.nombre}`}
            />
          ))
        )}
      </Tarjeta>

      <Tarjeta testId="tablero-entregables" titulo="Productos entregados / programados">
        {conEntregables.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">Sin entregables programados todavía.</p>
        ) : (
          conEntregables.map((proyecto) => {
            const programados = proyecto.kpis.entregables?.programados ?? 0;
            const logrados = proyecto.kpis.entregables?.logrados ?? 0;
            return (
              <FilaBarra
                key={proyecto.id}
                nombre={proyecto.nombre}
                // El porcentaje lo calcula el servidor (D11): el cliente no lo recalcula.
                valor={proyecto.kpis.entregables?.valor ?? null}
                texto={`${logrados}/${programados}`}
                ariaLabel={`Entregables de ${proyecto.nombre}: ${logrados} de ${programados}`}
              />
            );
          })
        )}
      </Tarjeta>
    </div>
  );
}

function Tarjeta({
  testId,
  titulo,
  className,
  children,
}: {
  testId: string;
  titulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className={cn("surface flex min-w-0 flex-col gap-3 p-4 lg:p-5", className)}>
      <h3 className="text-[13px] font-semibold text-ink-700">{titulo}</h3>
      {children}
    </section>
  );
}

/** Una barra neutra por proyecto: el valor sale del servidor, sin banda de semáforo que recalcular. */
function FilaBarra({
  nombre,
  valor,
  texto,
  ariaLabel,
}: {
  nombre: string;
  valor: number | null;
  texto?: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="truncate text-ink-700" title={nombre}>{nombre}</span>
        <span className="shrink-0 font-mono tabular-nums text-ink-800">{texto ?? formatPct(valor)}</span>
      </div>
      <ProgressBar aria-label={ariaLabel} value={valor ?? 0} />
    </div>
  );
}

