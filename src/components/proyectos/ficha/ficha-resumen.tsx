// Resumen de la ficha (U3; rediseño S2/S6). Arriba el aviso de Novedades; luego las tres cifras (Avance técnico,
// Gasto y Tiempo) con su color y su porqué; debajo «Qué falta», con la acción exacta de cada fila, y al lado los
// datos del proyecto y el equipo. En BORRADOR no hay nada que medir: en lugar de cifras y «Qué falta» guía la
// puesta a punto con «Próximos pasos». El color de cada semáforo lo calcula el servidor; aquí solo se pinta.
// En el teléfono todo va en una columna.

"use client";

import { useState } from "react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPct } from "@/components/proyectos/project-kpis-panel";
import { ORIGEN_PROYECTO_META, formatFechaCalendario } from "@/components/proyectos/project-display";
import { EditarDatosGenerales, modoDeEdicion } from "@/components/proyectos/ficha/editar-datos-generales";
import { AvisoNovedades } from "@/components/proyectos/ficha/novedades/aviso-novedades";
import { CifrasResumen } from "@/components/proyectos/ficha/resumen/cifras-resumen";
import { ProjectTeam } from "@/components/proyectos/project-team";
import { RequiereAtencion, type AccionAtencion } from "@/components/proyectos/requiere-atencion";
import { SectionHeader } from "@/components/proyectos/ui";
import {
  useProjectActivities,
  useProjectBudget,
  useProjectObjectives,
  type AtencionItem,
  type ColorSemaforo,
  type ProjectKpis,
  type ProjectListRow,
} from "@/hooks/projects";
import { useCurrentUser } from "@/hooks/kanban";
import { canManageProjects } from "@/lib/permissions";
import { estaCongelado } from "@/lib/proyectos/transiciones-estado";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

/** Pestañas a las que el Resumen puede llevar. */
export type ResumenDestino = "actividades" | "finanzas" | "historial";

export type { AccionAtencion };

const SIN_DATO = "—";

/** El tablero (Resumen-propuesta) dice el retraso una sola vez, bajo la cifra de Gasto: la lista no lo repite. */
const ATENCION_FUERA_DEL_RESUMEN = ["alerta_retraso"] as const;

/** Los decimales llegan como string: `toCents` los pasa a centavos exactos. */
function formatMonto(value: string | null): string {
  return value === null ? SIN_DATO : formatCOP(toCents(value));
}

function formatEntero(value: number | null): string {
  return value === null ? SIN_DATO : new Intl.NumberFormat("es-CO").format(value);
}

/* ── Frases de salud (las usa la ficha imprimible) ─────────────────────── */

/** Palabra de salud por color. El color es del servidor; esta etiqueta solo lo nombra en lenguaje llano. */
export const SALUD_LABEL: Record<ColorSemaforo, string> = {
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
export function fraseTecnica(tecnico: NonNullable<ProjectKpis["tecnico"]>, items: AtencionItem[]): string {
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
export function fraseFinanciera(financiero: NonNullable<ProjectKpis["financiero"]>, items: AtencionItem[]): string {
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
      <SectionHeader as="h2">Próximos pasos</SectionHeader>
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

/* ── Datos del proyecto ────────────────────────────────────────────────── */

function Dato({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[12px] font-semibold text-ink-500">{label}</dt>
      <dd className={cn("min-w-0 text-[13.5px] break-words text-ink-900", mono && "font-mono tabular-nums")}>
        {children}
      </dd>
    </div>
  );
}

function DatosGenerales({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: ResumenDestino) => void;
}) {
  const [editando, setEditando] = useState(false);
  const usuario = useCurrentUser().data;
  // Misma autoridad que el PATCH (ADM/GER); la API sigue siendo la que decide.
  const puedeEditar =
    modoDeEdicion(proyecto.estado) !== null &&
    Boolean(usuario && canManageProjects({ id: usuario.id, rol: usuario.rol }));
  // En BORRADOR no hay cifra «Tiempo»: las fechas se leen aquí.
  const conFechas = proyecto.estado === "BORRADOR";

  return (
    <section
      data-testid="datos-generales"
      aria-labelledby="resumen-datos-titulo"
      className="surface-inner flex min-w-0 flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <SectionHeader as="h2" id="resumen-datos-titulo">
          Datos del proyecto
        </SectionHeader>
        {puedeEditar && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0"
            aria-label="Editar datos generales"
            onClick={() => setEditando(true)}
          >
            Editar
          </Button>
        )}
      </div>
      {puedeEditar && (
        <EditarDatosGenerales
          proyecto={proyecto}
          open={editando}
          onOpenChange={setEditando}
          onSolicitarModificacion={() => {
            setEditando(false);
            onIrA("historial");
          }}
        />
      )}
      {proyecto.descripcion ? (
        <p data-testid="resumen-descripcion" className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink-900">
          {proyecto.descripcion}
        </p>
      ) : null}
      <dl className="flex flex-col gap-3">
        <Dato label="Cliente">{proyecto.cliente.nombre}</Dato>
        <Dato label="Origen">{proyecto.origen ? ORIGEN_PROYECTO_META[proyecto.origen] : SIN_DATO}</Dato>
        {conFechas && (
          <Dato label="Fechas" mono>
            {`${formatFechaCalendario(proyecto.fecha_inicio)} → ${formatFechaCalendario(proyecto.fecha_fin)}`}
            {proyecto.duracion_semanas !== null &&
              ` · ${proyecto.duracion_semanas === 1 ? "1 semana" : `${proyecto.duracion_semanas} semanas`}`}
          </Dato>
        )}
        <Dato label="Valor total" mono>
          {formatMonto(proyecto.valor_total)}
        </Dato>
        {proyecto.diferencia_valor_oportunidad !== null && (
          <Dato label="Frente a la oportunidad" mono>
            {formatMonto(proyecto.diferencia_valor_oportunidad)}
          </Dato>
        )}
        <Dato label="Líneas">
          {proyecto.lineas.length === 0 ? (
            "Sin líneas estratégicas."
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {proyecto.lineas.map((linea) => (
                <li
                  key={linea.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px]",
                    linea.principal
                      ? "border-rose-200 bg-rose-50 text-rose-700 dark:text-rose-400"
                      : "border-ink-200 bg-panel text-ink-700",
                  )}
                >
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
        </Dato>
        <Dato label="Municipios">
          {proyecto.municipios.length === 0
            ? "Sin municipios."
            : proyecto.municipios.map((municipio) => `${municipio.nombre} · ${municipio.departamento}`).join(", ")}
        </Dato>
        {proyecto.beneficiarios_meta !== null && (
          <Dato label="Beneficiarios" mono>
            {formatEntero(proyecto.beneficiarios_meta)}
          </Dato>
        )}
      </dl>
    </section>
  );
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export function FichaResumen({
  proyecto,
  onIrA,
  onAccion,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: ResumenDestino) => void;
  /** Opens the exact place each «Qué falta» row is solved; without it the row only switches tab. */
  onAccion?: (accion: AccionAtencion) => void;
}) {
  const enBorrador = proyecto.estado === "BORRADOR";
  return (
    <div data-testid="ficha-resumen" className="flex min-w-0 flex-col gap-6">
      <AvisoNovedades proyectoId={proyecto.id} />
      {!enBorrador && <CifrasResumen proyecto={proyecto} onIrA={onIrA} />}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div data-testid="resumen-columna" className="flex min-w-0 flex-col gap-6">
          {enBorrador ? (
            <ProximosPasos proyecto={proyecto} onIrA={onIrA} />
          ) : (
            <RequiereAtencion
              proyecto={proyecto}
              onIrA={onIrA}
              onAccion={onAccion}
              ocultar={ATENCION_FUERA_DEL_RESUMEN}
            />
          )}
        </div>
        <div data-testid="resumen-columna" className="flex min-w-0 flex-col gap-6">
          <DatosGenerales proyecto={proyecto} onIrA={onIrA} />
          <div className="surface-inner p-4">
            <ProjectTeam
              proyectoId={proyecto.id}
              congelado={estaCongelado(proyecto.estado)}
              responsableId={proyecto.responsable?.id ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
