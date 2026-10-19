// Sección "Ejecución técnica" de la ficha (S4 U6). Solo lectura: resumen con el
// semáforo que calcula el servidor y, por actividad, su avance con los
// entregables (meta, contado y avances pendientes de soporte). En BORRADOR el
// proyecto aún no tiene línea base, así que solo se explica, sin leer nada.

"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight, ClipboardList, Gauge } from "lucide-react";
import { useCurrentUser } from "@/hooks/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError, MetricRow, SELECT_CLASS, SectionHeader } from "@/components/proyectos/ui";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { EjecucionAvance } from "@/components/proyectos/ejecucion-avance";
import { EjecucionIndicadores } from "@/components/proyectos/ejecucion-indicadores";
import { SemaforoTecnico } from "@/components/proyectos/semaforo-tecnico";
import { CurveSChart } from "@/components/proyectos/curve-s-chart";
import {
  useDeliverableProgress,
  useProjectActivities,
  useProjectCurve,
  useProjectKpis,
  useProjectObjectives,
  useProjectDeliverables,
  useProjectMembers,
  useProjectTechnicalStatus,
  type ProjectActivity,
  type ProjectBase,
  type ProjectCurve,
  type ProjectDeliverableProgress,
  type ProjectObjective,
  type ProjectTechnicalStatusV6,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatMillones } from "@/lib/format/millones";
import { toCents } from "@/lib/proyectos/money";
import { canManageProjects } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TECNICO_ERROR = "No pudimos cargar el semáforo técnico. Inténtalo de nuevo.";
const ACTIVIDADES_ERROR = "No pudimos cargar las actividades. Inténtalo de nuevo.";
const CURVA_ERROR = "No pudimos cargar la curva S. Inténtalo de nuevo.";

export const EJECUCION_BORRADOR_HINT =
  "La ejecución técnica estará disponible cuando el proyecto tenga su línea base aprobada.";

/**
 * `lista` is the execution Lista of the Actividades tab (U4): only the activities, grouped by goal, without the
 * semáforo panel (the header owns it), with the S-curve and the Base selector inside a collapsed "Opciones
 * avanzadas" disclosure. `enfocarId` scrolls to and focuses one activity row (the Tablero card click).
 *
 * `seguimiento` is the v7 "Ficha de seguimiento" tab: the chart, the period/time/budget cards, progress per goal
 * and the activities, without the indicators (they have their own tab: see
 * `ProjectIndicadores`). Beneficiaries are a single project number (M5), not a section. Without it the section keeps all of them.
 */
export function ProjectEjecucion({
  proyecto,
  seguimiento = false,
  lista = false,
  enfocarId = null,
}: {
  proyecto: ProjectListRow;
  seguimiento?: boolean;
  lista?: boolean;
  enfocarId?: string | null;
}) {
  if (proyecto.estado === "BORRADOR") {
    return (
      <section data-testid="ejecucion">
        {!lista && <EjecucionHeader seguimiento={seguimiento} />}
        <p className="mt-1.5 text-[12.5px] text-ink-500">{EJECUCION_BORRADOR_HINT}</p>
      </section>
    );
  }

  return (
    <section data-testid="ejecucion">
      {!lista && <EjecucionHeader seguimiento={seguimiento} />}
      <EjecucionContent proyecto={proyecto} seguimiento={seguimiento} lista={lista} enfocarId={enfocarId} />
    </section>
  );
}

/** Collapsed-by-default section: its children mount (and fetch) only once it is opened. */
export function Disclosure({
  titulo,
  testId,
  children,
}: {
  titulo: string;
  testId?: string;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const panelId = useId();
  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={panelId}
        onClick={() => setAbierto((value) => !value)}
        className="flex min-h-11 items-center gap-1.5 rounded-12 text-[13px] font-semibold text-ink-700 outline-none hover:text-ink-950 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight className={cn("size-4 transition-transform", abierto && "rotate-90")} strokeWidth={2} />
        {titulo}
      </button>
      {abierto && (
        <div id={panelId} className="mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

function EjecucionHeader({ seguimiento }: { seguimiento: boolean }) {
  return seguimiento ? (
    <SectionHeader icon={<ClipboardList className="size-3.5" strokeWidth={2} />}>Ficha de seguimiento</SectionHeader>
  ) : (
    <SectionHeader icon={<Gauge className="size-3.5" strokeWidth={2} />}>Ejecución técnica</SectionHeader>
  );
}

/**
 * La curva S y, en la ficha de seguimiento, las tarjetas laterales. Es su propio componente para que la
 * curva solo se lea cuando se monta (en la lista vive dentro de "Opciones avanzadas", plegada).
 */
function CurvaSeccion({
  proyecto,
  base,
  corte,
  seguimiento,
}: {
  proyecto: ProjectListRow;
  base: ProjectBase;
  corte: string;
  seguimiento: boolean;
}) {
  const curvaQuery = useProjectCurve(proyecto.id, base);
  if (!seguimiento) return <CurvaAvance query={curvaQuery} />;
  return (
    <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <CurvaAvance query={curvaQuery} />
      <SeguimientoLateral proyecto={proyecto} corte={corte} curva={curvaQuery.data ?? null} />
    </div>
  );
}

/** Opciones avanzadas de la lista: línea base y corte (por defecto vigente y hoy) y la curva S. */
function OpcionesAvanzadas({
  proyecto,
  base,
  corte,
  onBaseChange,
}: {
  proyecto: ProjectListRow;
  base: ProjectBase;
  corte: string;
  onBaseChange: (base: ProjectBase) => void;
}) {
  return (
    <Disclosure titulo="Opciones avanzadas" testId="ejecucion-avanzadas">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-600">
        <label className="flex items-center gap-1.5">
          Base
          <select
            aria-label="Base"
            value={base}
            onChange={(event) => onBaseChange(event.target.value as ProjectBase)}
            className={SELECT_CLASS}
          >
            <option value="vigente">Vigente</option>
            <option value="original">Original (v0)</option>
          </select>
        </label>
        <span>Corte al {formatFechaCalendario(corte)} (hoy)</span>
      </div>
      <CurvaSeccion proyecto={proyecto} base={base} corte={corte} seguimiento />
    </Disclosure>
  );
}

/** Curva S (S14 P7): el servidor ya calculó las dos curvas y el corte; aquí solo se montan (D11). */
function CurvaAvance({ query }: { query: ReturnType<typeof useProjectCurve> }) {
  if (query.isError) {
    return <InlineError message={errorMessage(query.error, CURVA_ERROR)} className="mt-2" />;
  }
  if (!query.data) return <Skeleton className="mt-2 h-40 w-full rounded-[14px]" />;
  return <CurveSChart curva={query.data} />;
}

/**
 * Decisión 3: control de escritura para gestores, o un COORDINADOR que sea integrante activo (su lectura de
 * `/members` está permitida). Anular es solo de gestores. La API sigue siendo la autoridad final.
 */
export function useEjecucionPermisos(proyectoId: string): { canWrite: boolean; canVoid: boolean } {
  const userQuery = useCurrentUser();
  const membersQuery = useProjectMembers(proyectoId);
  const usuario = userQuery.data;
  const esGestor = usuario ? canManageProjects({ id: usuario.id, rol: usuario.rol }) : false;
  const esMiembroCoordinador = Boolean(
    usuario &&
      usuario.rol === "COORDINADOR" &&
      (membersQuery.data ?? []).some((miembro) => miembro.usuario.id === usuario.id),
  );
  return { canWrite: esGestor || esMiembroCoordinador, canVoid: esGestor };
}

/** Pestaña "Metas e indicadores" (v7): el registro de avance de indicador vive junto a las metas. */
export function ProjectIndicadores({ proyecto }: { proyecto: ProjectListRow }) {
  const { canWrite, canVoid } = useEjecucionPermisos(proyecto.id);
  if (proyecto.estado === "BORRADOR") return null;
  return <EjecucionIndicadores proyectoId={proyecto.id} canWrite={canWrite} canVoid={canVoid} />;
}

function EjecucionContent({
  proyecto,
  seguimiento,
  lista,
  enfocarId,
}: {
  proyecto: ProjectListRow;
  seguimiento: boolean;
  lista: boolean;
  enfocarId: string | null;
}) {
  const [base, setBase] = useState<ProjectBase>("vigente");
  const tecnicoQuery = useProjectTechnicalStatus(proyecto.id, base);
  const activitiesQuery = useProjectActivities(proyecto.id);
  const objetivosQuery = useProjectObjectives(proyecto.id);
  const deliverablesQuery = useProjectDeliverables(proyecto.id);

  const { canWrite, canVoid } = useEjecucionPermisos(proyecto.id);

  // Decisión 2: los entregables se leen UNA vez y los avances se abren con
  // `useQueries`, solo mientras la sección está montada.
  const deliverables = deliverablesQuery.data ?? [];
  const progressQueries = useDeliverableProgress(
    proyecto.id,
    deliverables.map((deliverable) => deliverable.id),
  );
  const progreso = new Map<string, ProjectDeliverableProgress>();
  deliverables.forEach((deliverable, index) => {
    const query = progressQueries[index];
    if (query?.data) progreso.set(deliverable.id, query.data);
  });

  if (tecnicoQuery.isError) {
    return (
      <InlineError message={errorMessage(tecnicoQuery.error, TECNICO_ERROR)} className="mt-2" />
    );
  }
  if (!tecnicoQuery.data) {
    return <Skeleton className="mt-2 h-20 w-full rounded-[14px]" />;
  }

  const tecnico = tecnicoQuery.data;
  const actividades = activitiesQuery.data ?? [];
  const tecnicas = new Map(tecnico.actividades.map((actividad) => [actividad.id, actividad]));

  return (
    <div className={lista ? "mt-0" : "mt-2"}>
      {lista ? (
        <OpcionesAvanzadas proyecto={proyecto} base={base} corte={tecnico.corte} onBaseChange={setBase} />
      ) : (
        <>
          <SemaforoTecnico tecnico={tecnico} onBaseChange={setBase} />
          <CurvaSeccion proyecto={proyecto} base={base} corte={tecnico.corte} seguimiento={seguimiento} />
        </>
      )}

      {seguimiento && !lista && <AvancePorMeta proyectoId={proyecto.id} tecnico={tecnico} />}

      {activitiesQuery.isError ? (
        <InlineError
          message={errorMessage(activitiesQuery.error, ACTIVIDADES_ERROR)}
          className="mt-2"
        />
      ) : !activitiesQuery.data ? (
        <Skeleton className="mt-2 h-12 w-full rounded-[12px]" />
      ) : actividades.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-ink-500">Este proyecto todavía no tiene actividades.</p>
      ) : (
        <ListaActividades
          actividades={actividades}
          objetivos={objetivosQuery.data ?? []}
          agrupar={lista}
          fila={(actividad) => {
            const tecnica = tecnicas.get(actividad.id);
            if (!tecnica) return null;
            return (
              <EjecucionAvance
                key={actividad.id}
                proyectoId={proyecto.id}
                actividad={actividad}
                tecnico={tecnica}
                entregables={deliverables.filter(
                  (deliverable) => deliverable.actividad_id === actividad.id,
                )}
                progreso={progreso}
                canWrite={canWrite}
                canVoid={canVoid}
                enfocar={enfocarId === actividad.id}
              />
            );
          }}
        />
      )}

      {!seguimiento && !lista && (
        <>
          <EjecucionIndicadores proyectoId={proyecto.id} canWrite={canWrite} canVoid={canVoid} />
        </>
      )}
    </div>
  );
}

/** Las actividades en una lista plana o, en la pestaña Actividades, agrupadas bajo su meta. */
function ListaActividades({
  actividades,
  objetivos,
  agrupar,
  fila,
}: {
  actividades: ProjectActivity[];
  objetivos: ProjectObjective[];
  agrupar: boolean;
  fila: (actividad: ProjectActivity) => ReactNode;
}) {
  const grupos = [...objetivos]
    .sort((a, b) => a.orden - b.orden)
    .map((objetivo) => ({ objetivo, filas: actividades.filter((a) => a.objetivo_id === objetivo.id) }))
    .filter((grupo) => grupo.filas.length > 0);
  // Sin metas legibles (cargando o con error) la lista no se pierde: cae a la versión plana.
  if (!agrupar || grupos.reduce((n, grupo) => n + grupo.filas.length, 0) !== actividades.length) {
    return <ul className="mt-3 flex flex-col gap-2.5">{actividades.map(fila)}</ul>;
  }
  return (
    <div className="mt-3 flex flex-col gap-4">
      {grupos.map(({ objetivo, filas }) => (
        <section key={objetivo.id} data-testid={`ejecucion-objetivo-${objetivo.codigo}`}>
          <h4 className="text-[13px] font-semibold text-ink-800">
            <span className="font-mono text-[11.5px] text-ink-500">{objetivo.codigo}</span> {objetivo.descripcion}
          </h4>
          <ul className="mt-1.5 flex flex-col gap-2.5">{filas.map(fila)}</ul>
        </section>
      ))}
    </div>
  );
}

/* ── Ficha de seguimiento (v7): tarjetas laterales y avance por meta ─────── */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nf = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

const pct = (value: number): string => `${nf.format(value)} %`;
const pp = (value: number): string => `${value > 0 ? "+" : ""}${nf.format(value)} pp`;

/** Days from the corte (the server's "today") to the project end, never negative. */
export function diasRestantes(corte: string, fechaFin: string | null): number | null {
  if (!fechaFin) return null;
  const dia = 24 * 60 * 60 * 1000;
  const diff = (Date.parse(`${fechaFin.slice(0, 10)}T00:00:00Z`) - Date.parse(`${corte.slice(0, 10)}T00:00:00Z`)) / dia;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : null;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function SeguimientoLateral({
  proyecto,
  corte,
  curva,
}: {
  proyecto: ProjectListRow;
  corte: string;
  curva: ProjectCurve | null;
}) {
  const kpis = useProjectKpis(proyecto.id, null, "vigente").data;
  const punto = curva?.periodos.find((p) => p.periodo === curva.corte);
  const ejecutado = punto?.tecnico.ejecutado ?? null;
  const planeado = punto?.tecnico.planeado ?? null;
  const dias = diasRestantes(corte, proyecto.fecha_fin);
  const periodo = curva ? `${MESES[Number(curva.corte.slice(5, 7)) - 1] ?? ""} ${curva.corte.slice(0, 4)}` : null;
  const financiero = kpis?.medible ? kpis.financiero : null;

  return (
    <div data-testid="seguimiento-lateral" className="flex min-w-0 flex-col gap-3">
      <div className="surface-inner flex flex-col gap-1.5 p-3">
        <p className="text-[12px] font-semibold text-ink-700">
          Periodo del reporte{periodo ? ` · ${periodo}` : ""}
        </p>
        {ejecutado === null || planeado === null ? (
          <p className="text-[12.5px] text-ink-500">Sin avance registrado al corte.</p>
        ) : (
          <>
            <p className="font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] text-ink-950 tabular-nums">
              {pct(ejecutado)} <span className="text-[12px] font-medium tracking-normal text-ink-500">ejecutado</span>
            </p>
            <MetricRow label="Planeado" value={pct(planeado)} />
            <MetricRow label="Diferencia" value={pp(ejecutado - planeado)} />
          </>
        )}
      </div>
      <div className="surface-inner flex flex-col gap-1.5 p-3">
        <p className="text-[12px] font-semibold text-ink-700">Tiempo restante</p>
        <p className="font-display text-[20px] leading-none font-extrabold tracking-[-0.02em] text-ink-950 tabular-nums">
          {dias === null ? "—" : plural(dias, "día", "días")}
          {dias !== null && (
            <span className="ml-1.5 text-[12px] font-medium tracking-normal text-ink-500">
              · {plural(Math.ceil(dias / 7), "semana", "semanas")}
            </span>
          )}
        </p>
        <p className="mt-1 text-[12px] font-semibold text-ink-700">Presupuesto ejecutado</p>
        <p className="text-[13px] font-semibold text-ink-900 tabular-nums">
          {financiero && financiero.ea !== null
            ? `${pct(financiero.ea)} · ${formatMillones(toCents(financiero.ejecutado))}`
            : "—"}
        </p>
      </div>
    </div>
  );
}

/** Acumulado planeado vs ejecutado por meta (objetivo). Los porcentajes y el color llegan del servidor (D11). */
function AvancePorMeta({ proyectoId, tecnico }: { proyectoId: string; tecnico: ProjectTechnicalStatusV6 }) {
  const objetivos = useProjectObjectives(proyectoId).data ?? [];
  if (!tecnico.objetivos || tecnico.objetivos.length === 0) return null;
  const nombre = new Map(objetivos.map((o) => [o.codigo, o.descripcion]));

  return (
    <section data-testid="avance-por-meta" className="mt-4">
      <SectionHeader>Avance por meta</SectionHeader>
      <ul className="mt-2 flex flex-col gap-2">
        {tecnico.objetivos.map((objetivo) => (
          <li key={objetivo.codigo} className="surface-inner grid grid-cols-1 items-center gap-x-4 gap-y-1.5 p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
            <span className="min-w-0 text-[13px] font-semibold text-ink-900">
              <span className="font-mono text-[11.5px] text-ink-500">{objetivo.codigo}</span>{" "}
              {nombre.get(objetivo.codigo) ?? ""}
            </span>
            <span
              role="img"
              aria-label={`Meta ${objetivo.codigo}: ejecutado ${pct(objetivo.ejecutado)}, planeado ${pct(objetivo.programado)}`}
              className="relative block h-2 overflow-hidden rounded-full bg-ink-100"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-rose-500"
                style={{ width: `${Math.min(100, Math.max(0, objetivo.ejecutado))}%` }}
              />
              <span
                aria-hidden
                className="absolute inset-y-[-2px] w-0.5 bg-ink-700"
                style={{ left: `${Math.min(100, Math.max(0, objetivo.programado))}%` }}
              />
            </span>
            <span className="flex flex-wrap items-center gap-2 text-[12px] text-ink-600 tabular-nums">
              {pct(objetivo.ejecutado)} de {pct(objetivo.programado)}
              <SemaforoChip color={objetivo.color} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11.5px] text-ink-500">Relleno = avance real · marca = planeado al corte ({formatFechaCalendario(tecnico.corte)}).</p>
    </section>
  );
}
