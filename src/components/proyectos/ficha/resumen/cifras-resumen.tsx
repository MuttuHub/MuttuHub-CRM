// Las tres cifras del Resumen (rediseño S2/S6): Avance técnico, Gasto y Tiempo. Cada una en números, con el
// color del servidor nombrado con palabras, su porqué en una línea y una ayuda ⓘ donde la cifra necesita
// contexto. El cliente nunca recalcula un semáforo (D11): solo pinta el color que llega en `useProjectKpis`
// (misma clave que el encabezado, así que no se pide dos veces). En el teléfono las tarjetas se apilan y se
// ocultan las líneas largas, como en el tablero móvil.

"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { KPIS_NO_MEDIBLE_NOTE, formatPct } from "@/components/proyectos/project-kpis-panel";
import { SEMAFORO_LABEL } from "@/components/proyectos/semaforo-chip";
import { EmptyBlock, InlineError } from "@/components/proyectos/ui";
import { useProjectKpis, type ColorSemaforo, type ProjectKpis, type ProjectListRow } from "@/hooks/projects";
import { toneFromSemaforo } from "@/lib/estado-tone";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { toDayNumber, todayInBogota } from "@/lib/proyectos/weeks";
import { diaMes, fechaDia } from "@/components/proyectos/ficha/historial/fechas";

const KPIS_ERROR = "No pudimos cargar el estado del proyecto. Inténtalo de nuevo.";

/** Palabra que acompaña al color (el color es del servidor; esto solo lo nombra). */
const PALABRA: Record<ColorSemaforo, string> = {
  verde: "al día",
  amarillo: "atención",
  rojo: "en riesgo",
};

const AYUDA = {
  tecnico:
    "Compara el avance real de las actividades con el que deberían llevar a la fecha de corte. Gerencia aún no confirma los límites de cada color.",
  programado: "Lo que el cronograma esperaba a la fecha de corte, según la duración de cada actividad.",
  gasto: "Lo gastado frente a lo que el presupuesto planeaba gastar hasta hoy. No es el porcentaje del valor total.",
} as const;

// El ⓘ de 20 px con 12 px por lado: área táctil de 44 px.
const AYUDA_CLASS = "after:-inset-3";

const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** «05 nov»: la fecha de corte sin año, como en el prototipo. */
function fechaCorta(iso: string): string {
  return diaMes(iso);
}

/** Distancia en puntos entre lo programado y lo real, a la fecha de corte. */
function fraseDesviacion(real: number, programado: number, corte: string): string {
  const puntos = Math.round((programado - real) * 10) / 10;
  const al = `al ${fechaCorta(corte)}.`;
  if (puntos === 0) return `Va igual a lo programado ${al}`;
  const n = Math.abs(puntos);
  const unidad = n === 1 ? "punto" : "puntos";
  return `Va ${nf.format(n)} ${unidad} ${puntos > 0 ? "por debajo" : "por encima"} de lo programado ${al}`;
}

/** Semana del corte sobre la duración (1..duración), o null si faltan fechas. */
function semanaDelCorte(inicio: string | null, duracion: number | null, corte: string): number | null {
  if (!inicio || !duracion) return null;
  try {
    const semana = Math.floor((toDayNumber(corte) - toDayNumber(inicio)) / 7) + 1;
    return Math.min(duracion, Math.max(1, semana));
  } catch {
    return null;
  }
}

export function CifrasResumen({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: "actividades" | "finanzas") => void;
}) {
  const kpisQuery = useProjectKpis(proyecto.id, null, "vigente");
  const kpis = kpisQuery.data;

  let cifras: ReactNode;
  if (kpisQuery.isError) {
    cifras = <InlineError className="md:col-span-2" message={KPIS_ERROR} />;
  } else if (!kpis) {
    cifras = <Skeleton data-testid="resumen-estado-cargando" className="h-40 w-full rounded-inner md:col-span-2" />;
  } else if (!kpis.medible || (!kpis.tecnico && !kpis.financiero)) {
    cifras = <EmptyBlock className="mt-0 md:col-span-2">{KPIS_NO_MEDIBLE_NOTE}</EmptyBlock>;
  } else {
    cifras = (
      <>
        {kpis.tecnico && <CifraTecnica tecnico={kpis.tecnico} onIrA={() => onIrA("actividades")} />}
        {kpis.financiero && <CifraGasto financiero={kpis.financiero} onIrA={() => onIrA("finanzas")} />}
      </>
    );
  }

  return (
    <section
      data-testid="resumen-estado"
      aria-label="Estado del proyecto"
      className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3"
    >
      {cifras}
      <CifraTiempo proyecto={proyecto} corte={kpis?.corte ?? todayInBogota()} />
    </section>
  );
}

/* ── Tarjeta ───────────────────────────────────────────────────────────── */

function Tarjeta({
  testId,
  titulo,
  color,
  cabecera,
  children,
}: {
  testId: string;
  titulo: string;
  color?: ColorSemaforo;
  cabecera?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article data-testid={testId} data-color={color} className="surface-tile flex min-w-0 flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h3 className="text-[13px] font-semibold text-ink-700">{titulo}</h3>
        {cabecera && <div className="flex items-center gap-1.5">{cabecera}</div>}
      </div>
      {children}
    </article>
  );
}

/** «Rojo · en riesgo» (en el teléfono solo «Rojo»). */
function EtiquetaColor({ color }: { color: ColorSemaforo }) {
  return (
    <StatusChip tone={toneFromSemaforo(color)}>
      {/* One inline run: as two flex items, the chip's gap would replace the space before «·». */}
      <span>
        {SEMAFORO_LABEL[color]}
        <span className="hidden sm:inline">{` · ${PALABRA[color]}`}</span>
      </span>
    </StatusChip>
  );
}

function Grande({ children }: { children: ReactNode }) {
  return (
    <span className="font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] text-ink-950 tabular-nums">
      {children}
    </span>
  );
}

function EnlacePestana({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="link" size="sm" className="w-fit px-0 underline" onClick={onClick}>
      {children}
    </Button>
  );
}

/* ── Cifras ────────────────────────────────────────────────────────────── */

function CifraTecnica({
  tecnico,
  onIrA,
}: {
  tecnico: NonNullable<ProjectKpis["tecnico"]>;
  onIrA: () => void;
}) {
  const real = formatPct(tecnico.avance_real);
  const programado = formatPct(tecnico.avance_programado);
  const marca = Math.min(100, Math.max(0, tecnico.avance_programado));
  return (
    <Tarjeta
      testId="salud-tecnico"
      titulo="Avance técnico"
      color={tecnico.color}
      cabecera={
        <>
          <EtiquetaColor color={tecnico.color} />
          <HelpHint label="Avance técnico" className={AYUDA_CLASS}>
            {AYUDA.tecnico}
          </HelpHint>
        </>
      }
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Grande>{real}</Grande>
        <span className="text-[13px] text-ink-700">
          <span className="hidden sm:inline">real </span>
          de <b className="font-semibold text-ink-900">{programado}</b> programado
        </span>
        <HelpHint label="Avance programado" className={AYUDA_CLASS}>
          {AYUDA.programado}
        </HelpHint>
      </p>
      <div className="relative">
        <ProgressBar
          aria-label={`Avance real ${real} de ${programado} programado`}
          value={tecnico.avance_real}
          band={tecnico.color}
        />
        {/* Marca de lo programado al corte. */}
        <span
          aria-hidden="true"
          className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-ink-900"
          style={{ left: `${marca}%` }}
        />
      </div>
      <p className="hidden text-[12.5px] leading-relaxed text-ink-600 sm:block">
        {fraseDesviacion(tecnico.avance_real, tecnico.avance_programado, tecnico.corte)}
      </p>
      <EnlacePestana onClick={onIrA}>Ver actividades</EnlacePestana>
    </Tarjeta>
  );
}

function CifraGasto({
  financiero,
  onIrA,
}: {
  financiero: NonNullable<ProjectKpis["financiero"]>;
  onIrA: () => void;
}) {
  // Sin programación de gasto no hay «% de lo programado»: se mantiene la lectura de hoy, sobre el presupuesto.
  const conProgramacion = financiero.ep !== null;
  const valor = conProgramacion ? financiero.ep : financiero.ea;
  const pct = formatPct(valor);
  return (
    <Tarjeta
      testId="salud-financiero"
      titulo="Gasto"
      color={financiero.color}
      cabecera={<EtiquetaColor color={financiero.color} />}
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Grande>{pct}</Grande>
        {conProgramacion ? (
          <>
            <span className="text-[13px] text-ink-700">
              de lo programado<span className="hidden sm:inline"> a hoy</span>
            </span>
            <HelpHint label="% de lo programado" className={AYUDA_CLASS}>
              {AYUDA.gasto}
            </HelpHint>
          </>
        ) : (
          <span className="text-[13px] text-ink-700">ejecutado del presupuesto</span>
        )}
      </p>
      {valor !== null && (
        <ProgressBar
          aria-label={conProgramacion ? `${pct} de lo programado a hoy` : `${pct} ejecutado del presupuesto`}
          value={valor}
          band={financiero.color}
        />
      )}
      {financiero.alerta_retraso && (
        <p className="text-[12.5px] leading-relaxed text-alerta">
          <span className="hidden sm:inline">Gasta poco mientras el avance técnico está atrasado: posible retraso.</span>
          <span className="sm:hidden">Gasta poco y el avance está atrasado: posible retraso.</span>
        </p>
      )}
      <EnlacePestana onClick={onIrA}>Ver finanzas</EnlacePestana>
    </Tarjeta>
  );
}

function CifraTiempo({ proyecto, corte }: { proyecto: ProjectListRow; corte: string }) {
  const total = proyecto.duracion_semanas;
  const semana = semanaDelCorte(proyecto.fecha_inicio, total, corte);
  const valor = proyecto.valor_total === null ? "—" : formatCOP(toCents(proyecto.valor_total));
  const beneficiarios =
    proyecto.beneficiarios_meta === null
      ? ""
      : ` · ${new Intl.NumberFormat("es-CO").format(proyecto.beneficiarios_meta)} beneficiarios`;
  return (
    <Tarjeta
      testId="cifra-tiempo"
      titulo="Tiempo"
      cabecera={
        <span className="hidden text-[12.5px] text-ink-600 tabular-nums sm:inline">
          {`${fechaDia(proyecto.fecha_inicio)} → ${fechaDia(proyecto.fecha_fin)}`}
        </span>
      }
    >
      {semana !== null && total ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <Grande>{`Semana ${semana}`}</Grande>
            <span className="text-[13px] text-ink-700">{`de ${total}`}</span>
          </p>
          <ProgressBar aria-label={`Semana ${semana} de ${total}`} value={(semana / total) * 100} />
        </>
      ) : (
        <Grande>—</Grande>
      )}
      <p className="hidden text-[12.5px] leading-relaxed text-ink-600 sm:block">{`Valor total ${valor}${beneficiarios}`}</p>
    </Tarjeta>
  );
}
