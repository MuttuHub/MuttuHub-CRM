// Resumen de la ficha (U3). Destila lo que importa para el ejecutor y para gerencia: el estado técnico y
// financiero con UNA frase de causa cada uno, lo que requiere atención con enlaces a la pestaña donde se
// resuelve, y debajo los datos generales y el equipo. En BORRADOR no hay nada que medir: en su lugar guía la
// puesta a punto con «Próximos pasos». El color de cada semáforo lo calcula el servidor; aquí solo se pinta y
// se explica con los datos que ya llegan por `useProjectKpis` y `useProjectAttention` (mismas claves que el
// encabezado, así que no se pide nada extra).

"use client";

import type { ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { FieldValue } from "@/components/crm/shared";
import { KPIS_NO_MEDIBLE_NOTE, formatPct } from "@/components/proyectos/project-kpis-panel";
import { ORIGEN_PROYECTO_META, formatFechaCalendario } from "@/components/proyectos/project-display";
import { ProjectTeam } from "@/components/proyectos/project-team";
import { RequiereAtencion } from "@/components/proyectos/requiere-atencion";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  useProjectActivities,
  useProjectAttention,
  useProjectBudget,
  useProjectKpis,
  useProjectObjectives,
  type AtencionItem,
  type ColorSemaforo,
  type ProjectKpis,
  type ProjectListRow,
} from "@/hooks/projects";
import { toneFromSemaforo } from "@/lib/estado-tone";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

/** Pestañas a las que el Resumen puede llevar. */
export type ResumenDestino = "actividades" | "finanzas";

const SIN_DATO = "—";
const KPIS_ERROR = "No pudimos cargar el estado del proyecto. Inténtalo de nuevo.";

/** Los decimales llegan como string: `toCents` los pasa a centavos exactos. */
function formatMonto(value: string | null): string {
  return value === null ? SIN_DATO : formatCOP(toCents(value));
}

function formatEntero(value: number | null): string {
  return value === null ? SIN_DATO : new Intl.NumberFormat("es-CO").format(value);
}

function formatDuracion(semanas: number | null): string {
  if (semanas === null) return SIN_DATO;
  return semanas === 1 ? "1 semana" : `${semanas} semanas`;
}

/** Palabra de salud por color. El color es del servidor; esta etiqueta solo lo nombra en lenguaje llano. */
const SALUD_LABEL: Record<ColorSemaforo, string> = {
  verde: "Al día",
  amarillo: "Atención",
  rojo: "En riesgo",
};

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function contar(items: AtencionItem[], tipo: AtencionItem["tipo"]): number {
  return items.filter((item) => item.tipo === tipo).length;
}

/** Causa técnica: avance real frente al programado, más lo que el servidor marcó en actividades e indicadores. */
function fraseTecnica(tecnico: NonNullable<ProjectKpis["tecnico"]>, items: AtencionItem[]): string {
  const partes = [
    `Avance real ${formatPct(tecnico.avance_real)} frente a ${formatPct(tecnico.avance_programado)} programado`,
  ];
  const atrasadas = contar(items, "actividad_atrasada");
  const sinSoporte = contar(items, "avance_sin_soporte");
  const bajoMeta = contar(items, "indicador_bajo_meta");
  if (atrasadas > 0) partes.push(plural(atrasadas, "actividad atrasada", "actividades atrasadas"));
  if (sinSoporte > 0) partes.push(plural(sinSoporte, "avance sin soporte", "avances sin soporte"));
  if (bajoMeta > 0) partes.push(plural(bajoMeta, "indicador bajo la meta", "indicadores bajo la meta"));
  return partes.join(" · ");
}

/** Causa financiera: ejecutado frente a lo programado (o al presupuesto si no hay programación), más alertas. */
function fraseFinanciera(financiero: NonNullable<ProjectKpis["financiero"]>, items: AtencionItem[]): string {
  const partes = [
    financiero.ep !== null
      ? `Ejecutado ${formatPct(financiero.ep)} de lo programado`
      : `Ejecutado ${formatPct(financiero.ea)} del presupuesto`,
  ];
  const sobre = contar(items, "rubro_sobreejecucion");
  const observados = contar(items, "gasto_observado");
  if (sobre > 0) partes.push(plural(sobre, "rubro sobreejecutado", "rubros sobreejecutados"));
  if (observados > 0) partes.push(plural(observados, "gasto pendiente por revisión", "gastos pendientes por revisión"));
  if (financiero.alerta_retraso || contar(items, "alerta_retraso") > 0) partes.push("posible retraso en la ejecución");
  return partes.join(" · ");
}

/* ── Estado del proyecto ───────────────────────────────────────────────── */

function FilaSalud({
  testId,
  titulo,
  color,
  frase,
  enlace,
  onClick,
}: {
  testId: string;
  titulo: string;
  color: ColorSemaforo;
  frase: string;
  enlace: string;
  onClick: () => void;
}) {
  return (
    <li
      data-testid={testId}
      data-color={color}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-3 first:pt-0 last:pb-0"
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold text-ink-900">{titulo}</span>
          <StatusChip tone={toneFromSemaforo(color)}>{SALUD_LABEL[color]}</StatusChip>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-700">{frase}</p>
      </div>
      <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onClick}>
        {enlace}
      </Button>
    </li>
  );
}

function EstadoDelProyecto({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: ResumenDestino) => void;
}) {
  const kpisQuery = useProjectKpis(proyecto.id, null, "vigente");
  const atencion = useProjectAttention(proyecto.id).data;
  const kpis = kpisQuery.data;
  const items = atencion?.medible ? atencion.items : [];

  let contenido: ReactNode;
  if (kpisQuery.isError) {
    contenido = <InlineError message={KPIS_ERROR} />;
  } else if (!kpis) {
    contenido = <Skeleton data-testid="resumen-estado-cargando" className="h-24 w-full rounded-inner" />;
  } else if (!kpis.medible || (!kpis.tecnico && !kpis.financiero)) {
    contenido = <EmptyBlock>{KPIS_NO_MEDIBLE_NOTE}</EmptyBlock>;
  } else {
    contenido = (
      <ul className="divide-y divide-ink-200">
        {kpis.tecnico && (
          <FilaSalud
            testId="salud-tecnico"
            titulo="Técnico"
            color={kpis.tecnico.color}
            frase={fraseTecnica(kpis.tecnico, items)}
            enlace="Ver actividades"
            onClick={() => onIrA("actividades")}
          />
        )}
        {kpis.financiero && (
          <FilaSalud
            testId="salud-financiero"
            titulo="Financiero"
            color={kpis.financiero.color}
            frase={fraseFinanciera(kpis.financiero, items)}
            enlace="Ver finanzas"
            onClick={() => onIrA("finanzas")}
          />
        )}
      </ul>
    );
  }

  return (
    <section data-testid="resumen-estado" aria-label="Estado del proyecto" className="flex flex-col gap-2.5">
      <SectionHeader>Estado del proyecto</SectionHeader>
      {contenido}
      {proyecto.beneficiarios_meta !== null && (
        <p data-testid="resumen-beneficiarios" className="text-[13px] text-ink-700">
          <span className="font-semibold text-ink-900">Beneficiarios</span>{" "}
          <span className="font-mono tabular-nums">{formatEntero(proyecto.beneficiarios_meta)}</span>
        </p>
      )}
    </section>
  );
}

/* ── Próximos pasos (BORRADOR) ─────────────────────────────────────────── */

type Paso = {
  id: string;
  titulo: string;
  hecho: boolean | null;
  pista?: string;
  destino?: ResumenDestino;
  enlace?: string;
};

function ProximosPasos({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: ResumenDestino) => void;
}) {
  const objetivos = useProjectObjectives(proyecto.id);
  const actividades = useProjectActivities(proyecto.id);
  const presupuesto = useProjectBudget(proyecto.id);

  const datosListos =
    Boolean(proyecto.fecha_inicio) &&
    Boolean(proyecto.fecha_fin) &&
    proyecto.valor_total !== null &&
    toCents(proyecto.valor_total) > 0;
  const estructuraLista =
    objetivos.data && actividades.data ? objetivos.data.length > 0 && actividades.data.length > 0 : null;
  const presupuestoListo = presupuesto.data ? toCents(presupuesto.data.suma) > 0 : null;

  const pasos: Paso[] = [
    { id: "datos", titulo: "Fechas y valor definidos", hecho: datosListos },
    {
      id: "estructura",
      titulo: "Objetivos y actividades cargados",
      hecho: estructuraLista,
      pista: "Puedes cargarlos desde Excel en Actividades.",
      destino: "actividades",
      enlace: "Ir a Actividades",
    },
    {
      id: "presupuesto",
      titulo: "Presupuesto asignado",
      hecho: presupuestoListo,
      destino: "finanzas",
      enlace: "Ir a Finanzas",
    },
    {
      id: "linea-base",
      titulo: "Aprobar la línea base",
      hecho: false,
      pista: "Cuando lo anterior esté listo, usa «Aprobar línea base» en el encabezado.",
    },
  ];

  return (
    <section data-testid="proximos-pasos" aria-label="Próximos pasos" className="flex flex-col gap-2.5">
      <SectionHeader>Próximos pasos</SectionHeader>
      <ol className="divide-y divide-ink-200">
        {pasos.map((paso) => (
          <li
            key={paso.id}
            data-testid={`paso-${paso.id}`}
            data-hecho={paso.hecho === true ? "true" : "false"}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 basis-64 items-start gap-2.5">
              {paso.hecho ? (
                <Check className="mt-0.5 size-4 shrink-0 text-exito" strokeWidth={2.2} aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-ink-400" strokeWidth={1.8} aria-hidden />
              )}
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink-900">
                  {paso.titulo}
                  <span className="sr-only">{paso.hecho ? ": listo" : ": pendiente"}</span>
                </p>
                {paso.pista && !paso.hecho && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-600">{paso.pista}</p>
                )}
              </div>
            </div>
            {paso.destino && !paso.hecho && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => onIrA(paso.destino!)}
              >
                {paso.enlace}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── Datos generales ───────────────────────────────────────────────────── */

const CHIP_BASE = "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px]";

function DatosGenerales({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <section data-testid="datos-generales" aria-label="Datos generales" className="flex flex-col gap-4">
      <SectionHeader>Datos generales</SectionHeader>
      {proyecto.descripcion ? (
        <div data-testid="resumen-descripcion">
          <h4 className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">Descripción</h4>
          <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-900">
            {proyecto.descripcion}
          </p>
        </div>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <FieldValue
          label="Origen"
          value={proyecto.origen ? ORIGEN_PROYECTO_META[proyecto.origen] : SIN_DATO}
        />
        <FieldValue label="Cliente" value={proyecto.cliente.nombre} />
        <FieldValue label="Responsable" value={proyecto.responsable?.nombre ?? "Sin asignar"} />
        <FieldValue label="Fecha de inicio" value={formatFechaCalendario(proyecto.fecha_inicio)} mono />
        <FieldValue label="Fecha de fin" value={formatFechaCalendario(proyecto.fecha_fin)} mono />
        <FieldValue label="Duración" value={formatDuracion(proyecto.duracion_semanas)} mono />
        <FieldValue label="Valor total" value={formatMonto(proyecto.valor_total)} mono />
        {proyecto.beneficiarios_meta !== null && (
          <FieldValue label="Beneficiarios" value={formatEntero(proyecto.beneficiarios_meta)} mono />
        )}
        {proyecto.diferencia_valor_oportunidad !== null && (
          <FieldValue
            label="Diferencia valor oportunidad"
            value={formatMonto(proyecto.diferencia_valor_oportunidad)}
            mono
          />
        )}
      </dl>

      <div>
        <h4 className="text-[12px] font-semibold text-ink-600">Líneas estratégicas</h4>
        {proyecto.lineas.length === 0 ? (
          <EmptyBlock>Sin líneas estratégicas.</EmptyBlock>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {proyecto.lineas.map((linea) => (
              <li
                key={linea.id}
                className={cn(
                  CHIP_BASE,
                  linea.principal
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:text-rose-400"
                    : "border-ink-200 bg-panel text-ink-700",
                )}
              >
                <span className="font-mono text-[11px] text-ink-500 tabular-nums">{linea.codigo}</span>
                <span className="font-semibold">{linea.nombre}</span>
                {linea.principal && (
                  <span className="rounded-full bg-rose-500 px-2 py-[1px] text-[10px] font-bold text-white">
                    Principal
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-[12px] font-semibold text-ink-600">Municipios</h4>
        {proyecto.municipios.length === 0 ? (
          <EmptyBlock>Sin municipios.</EmptyBlock>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {proyecto.municipios.map((municipio) => (
              <li key={municipio.id} className={cn(CHIP_BASE, "border-ink-200 bg-panel text-ink-700")}>
                {`${municipio.nombre} · ${municipio.departamento}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export function FichaResumen({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: ResumenDestino) => void;
}) {
  const enBorrador = proyecto.estado === "BORRADOR";
  return (
    <div data-testid="ficha-resumen" className="flex flex-col gap-8">
      {enBorrador ? (
        <ProximosPasos proyecto={proyecto} onIrA={onIrA} />
      ) : (
        <>
          <EstadoDelProyecto proyecto={proyecto} onIrA={onIrA} />
          <RequiereAtencion proyecto={proyecto} onIrA={onIrA} />
        </>
      )}
      <DatosGenerales proyecto={proyecto} />
      <ProjectTeam proyectoId={proyecto.id} />
    </div>
  );
}
