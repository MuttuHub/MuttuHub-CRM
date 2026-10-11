// Seis tarjetas KPI del Resumen de la ficha (v6). De solo lectura: valores, porcentajes y colores llegan
// calculados por el servidor (`kpisProyecto`) y aquí solo se pintan; el cliente NUNCA recalcula un semáforo.
// Técnico y financiero llevan el color del servidor; las otras cuatro no tienen semáforo todavía (D6) y llevan un
// punto neutro. Misma consulta que el encabezado (`useProjectKpis(id, null, "vigente")`): una sola petición.
// Un proyecto sin KPIs (BORRADOR, PLANIFICACION, CANCELADO) muestra las seis tarjetas en "Sin medir".

"use client";

import type { ReactNode } from "react";
import { ToneBadge } from "@/components/crm/shared";
import { KPIS_NO_MEDIBLE_NOTE, formatPct } from "@/components/proyectos/project-kpis-panel";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { EmptyBlock, InlineError } from "@/components/proyectos/ui";
import { SEMAFORO_LABEL } from "@/components/proyectos/semaforo-chip";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectKpis, type ColorSemaforo, type ProjectKpis, type ProjectListRow } from "@/hooks/projects";
import { toneFromSemaforo } from "@/lib/estado-tone";
import { formatMillones } from "@/lib/format/millones";
import { cn } from "@/lib/utils";
import { toCents } from "@/lib/proyectos/money";

const KPIS_ERROR = "No pudimos cargar los indicadores del proyecto. Inténtalo de nuevo.";
const GRID = "grid grid-cols-2 gap-3 lg:grid-cols-3";
const SIN_MEDIR = "Sin medir";

const numero = new Intl.NumberFormat("es-CO");

const DOT_CLASS = {
  neutro: "bg-ink-300",
  exito: "bg-exito",
  alerta: "bg-alerta",
  destructivo: "bg-destructivo",
} as const;

const CARDS = [
  { id: "tecnico", label: "Avance técnico" },
  { id: "financiero", label: "Avance financiero" },
  { id: "cronograma", label: "Cumplimiento del cronograma" },
  { id: "indicadores", label: "Cumplimiento de indicadores" },
  { id: "entregables", label: "Entregables con soporte" },
  { id: "beneficiarios", label: "Beneficiarios" },
] as const;

type CardId = (typeof CARDS)[number]["id"];

function Dot({ color, prefix }: { color?: ColorSemaforo; prefix?: string }) {
  const tone = color ? toneFromSemaforo(color) : "neutro";
  const klass = DOT_CLASS[tone as keyof typeof DOT_CLASS] ?? DOT_CLASS.neutro;
  return (
    <span
      data-testid="resumen-kpi-dot"
      data-tone={tone}
      data-color={color}
      role={color ? "img" : undefined}
      aria-label={color ? `${prefix}: ${SEMAFORO_LABEL[color]}` : undefined}
      aria-hidden={color ? undefined : true}
      className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", klass)}
    />
  );
}

function Card({
  id,
  label,
  value,
  hint,
  color,
  dotPrefix,
}: {
  id: CardId;
  label: string;
  value: ReactNode;
  hint: ReactNode;
  color?: ColorSemaforo;
  dotPrefix?: string;
}) {
  return (
    <div data-testid={`resumen-kpi-${id}`} className="surface-inner p-3 sm:p-4 lg:p-5">
      <KpiTile
        label={
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-[11px] tracking-wider sm:text-xs sm:tracking-widest">{label}</span>
            <Dot color={color} prefix={dotPrefix} />
          </span>
        }
        value={value}
        hint={hint}
      />
    </div>
  );
}

function SinMedir() {
  return (
    <>
      <div className={GRID} data-testid="resumen-kpis-sin-medir">
        {CARDS.map((card) => (
          <Card key={card.id} id={card.id} label={card.label} value="—" hint={SIN_MEDIR} />
        ))}
      </div>
      <EmptyBlock>{KPIS_NO_MEDIBLE_NOTE}</EmptyBlock>
    </>
  );
}

function Cards({ kpis }: { kpis: ProjectKpis }) {
  const { tecnico, financiero, cronograma, indicadores, entregables, beneficiarios } = kpis;
  if (!tecnico || !financiero || !cronograma || !indicadores || !entregables || !beneficiarios) return <SinMedir />;

  const totalIndicadores = indicadores.medidos + indicadores.sin_medir;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-ink-500">Corte al {formatFechaCalendario(kpis.corte)}</p>
        {!kpis.confirmado && <ToneBadge tone="neutro" label="No confirmado" />}
      </div>
      <div className={GRID}>
        <Card
          id="tecnico"
          label="Avance técnico"
          color={tecnico.color}
          dotPrefix="Semáforo técnico"
          value={formatPct(tecnico.avance_real)}
          hint={`Plan ${formatPct(tecnico.avance_programado)} · corte ${formatFechaCalendario(tecnico.corte)}`}
        />
        <Card
          id="financiero"
          label="Avance financiero"
          color={financiero.color}
          dotPrefix="Semáforo financiero"
          value={formatPct(financiero.ea)}
          hint={`${formatMillones(toCents(financiero.ejecutado))} de ${formatMillones(toCents(financiero.asignado))}`}
        />
        <Card
          id="cronograma"
          label="Cumplimiento del cronograma"
          value={formatPct(cronograma.valor)}
          hint={
            cronograma.vencidas === 0
              ? "Sin actividades vencidas al corte"
              : `${cronograma.a_tiempo} de ${cronograma.vencidas} actividades a tiempo`
          }
        />
        <Card
          id="indicadores"
          label="Cumplimiento de indicadores"
          value={formatPct(indicadores.valor)}
          hint={
            totalIndicadores === 0
              ? "Sin indicadores definidos"
              : `${indicadores.en_meta} de ${totalIndicadores} indicadores en meta`
          }
        />
        <Card
          id="entregables"
          label="Entregables con soporte"
          value={`${numero.format(entregables.logrados)}/${numero.format(entregables.programados)}`}
          hint="Productos entregados / programados"
        />
        <Card
          id="beneficiarios"
          label="Beneficiarios"
          value={
            beneficiarios.meta === null
              ? numero.format(beneficiarios.total)
              : `${numero.format(beneficiarios.total)}/${numero.format(beneficiarios.meta)}`
          }
          hint={beneficiarios.meta === null ? "Personas atendidas · Sin meta definida" : "Personas atendidas / meta"}
        />
      </div>
    </>
  );
}

function ResumenKpisVivo({ proyectoId }: { proyectoId: string }) {
  const query = useProjectKpis(proyectoId, null, "vigente");
  const kpis = query.data;

  if (query.isError) return <InlineError message={KPIS_ERROR} />;
  if (query.isLoading || !kpis) {
    return (
      <div className={GRID} data-testid="resumen-kpis-cargando">
        {CARDS.map((card) => (
          <Skeleton key={card.id} className="h-[104px] w-full rounded-inner" />
        ))}
      </div>
    );
  }
  return kpis.medible ? <Cards kpis={kpis} /> : <SinMedir />;
}

export function ResumenKpis({ proyecto }: { proyecto: Pick<ProjectListRow, "id" | "estado"> }) {
  return (
    <section data-testid="resumen-kpis" aria-label="Indicadores del proyecto" className="flex flex-col gap-2.5">
      {/* Un BORRADOR nunca es medible: no se pide al servidor (igual que el encabezado). */}
      {proyecto.estado === "BORRADOR" ? <SinMedir /> : <ResumenKpisVivo proyectoId={proyecto.id} />}
    </section>
  );
}
