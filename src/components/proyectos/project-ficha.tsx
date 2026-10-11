// Ficha de proyecto (E-06), de solo lectura salvo las secciones Equipo (E-07) y
// Estructura técnica (S3). Desde S10 se organiza en pestañas (Resumen, Metas e
// indicadores, Cronograma, Gantt, Avance, Presupuesto, Gastos, Cambios) bajo un encabezado fijo con código,
// nombre, estado y semáforos; cada panel se monta
// (y consulta) solo cuando su pestaña está activa. Desde S12 es una página propia (`/proyectos/[id]`),
// que el listado y el tablero abren en una pestaña nueva. Monta su propia consulta (`useProject`): el estado del request (loading, error, data) sale
// entero de la query, sin `useEffect` de carga ni controles de escritura propios.
//
// Reutiliza las piezas que ya existen en el módulo en vez de reinventarlas:
// `ESTADO_PROYECTO_META`, `ORIGEN_PROYECTO_META` y `formatFechaCalendario` del
// módulo compartido `project-display` (el que también usa el listado), más
// `FieldValue` de la ficha de cliente y `formatCOP`/`toCents` para los
// decimales, que llegan por HTTP como string.

"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, History } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldValue } from "@/components/crm/shared";
import {
  ACCION_AUDITORIA_META,
  ENTIDAD_AUDITORIA_META,
  ESTADO_PROYECTO_META,
  ORIGEN_PROYECTO_META,
  agruparHistorial,
  describeAuditValue,
  etiquetaCampoAuditoria,
  formatFechaCalendario,
  formatFechaHora,
} from "@/components/proyectos/project-display";
import { BaselineApproval } from "@/components/proyectos/baseline-approval";
import { EstructuraGantt } from "@/components/proyectos/estructura-gantt";
import { ProjectCronograma } from "@/components/proyectos/project-cronograma";
import { ProjectEstructura } from "@/components/proyectos/project-estructura";
import { ProjectEjecucion } from "@/components/proyectos/project-ejecucion";
import { ProjectFinanciero } from "@/components/proyectos/project-financiero";
import { ProjectKpisPanel } from "@/components/proyectos/project-kpis-panel";
import { ResumenKpis } from "@/components/proyectos/resumen-kpis";
import { ProjectGastos } from "@/components/proyectos/project-gastos";
import { ProjectModificaciones } from "@/components/proyectos/project-modificaciones";
import { ProjectPresupuesto } from "@/components/proyectos/project-presupuesto";
import { ProjectTeam } from "@/components/proyectos/project-team";
import { ProjectVersiones } from "@/components/proyectos/project-versiones";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { EmptyBlock, SectionHeader } from "@/components/proyectos/ui";
import {
  useProject,
  useProjectAudit,
  useProjectKpis,
  type ProjectAuditEntry,
  type ProjectListRow,
} from "@/hooks/projects";
import { ApiError } from "@/lib/api/http";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";

const SIN_DATO = "—";

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

/**
 * Contenido de la ficha como página: ocupa el flujo normal del documento (encabezado pegajoso, el contenido
 * se desplaza con la página) y muestra el enlace "Volver a proyectos" si recibe `backHref`. El tope de
 * ancho (6xl) deja respirar las tablas de Presupuesto y Gastos, que en el diálogo de 760 px quedaban apretadas.
 */
export function ProjectFicha({ projectId, backHref }: { projectId: string; backHref?: string }) {
  const query = useProject(projectId);
  const proyecto = query.data;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4">
      {backHref && (
        <Link
          href={backHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-fit px-3 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-100",
          )}
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} />
          Volver a proyectos
        </Link>
      )}
      <div className="min-w-0 surface">
        {query.isError ? (
          <FichaError error={query.error} />
        ) : proyecto ? (
          <FichaContent proyecto={proyecto} />
        ) : (
          <FichaSkeleton />
        )}
      </div>
    </div>
  );
}

/* ── Estado cargado ────────────────────────────────────────────────────── */

const FICHA_TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "metas", label: "Metas e indicadores" },
  { value: "cronograma", label: "Cronograma" },
  { value: "gantt", label: "Gantt" },
  { value: "avance", label: "Avance" },
  { value: "presupuesto", label: "Presupuesto" },
  { value: "gastos", label: "Gastos" },
  { value: "cambios", label: "Cambios" },
] as const;

const PANEL_CLASS = "mt-0 flex flex-col gap-6";

function FichaContent({ proyecto }: { proyecto: ProjectListRow }) {
  const estado = ESTADO_PROYECTO_META[proyecto.estado];

  return (
    <div className="flex flex-col">
      <Tabs defaultValue="resumen" className="flex flex-col gap-0">
        {/* Encabezado fijo: pegajoso y fuera del panel de contenido, así estado y semáforos siempre se ven. */}
        <div className="sticky top-0 z-10 rounded-t-card bg-panel">
          <header
            data-testid="ficha-header"
            className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 p-5 sm:p-6"
          >
            <div className="min-w-0">
              <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">
                {proyecto.codigo}
              </span>
              <h1 className="mt-0.5 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
                {proyecto.nombre}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BaselineApproval proyecto={proyecto} />
              <StatusChip tone={estado.tone}>{estado.label}</StatusChip>
              {proyecto.estado !== "BORRADOR" && <FichaSemaforos proyectoId={proyecto.id} />}
            </div>
          </header>
          <div
            className="no-scrollbar overflow-x-auto border-b border-ink-200 px-5 sm:px-6"
          >
            <TabsList variant="line" className="w-full justify-start gap-1">
              {FICHA_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex-none px-3">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <div data-testid="ficha-scroll" className="p-5 sm:p-6">
          <TabsContent value="resumen" className={PANEL_CLASS}>
            <ResumenPanel proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="metas" className={PANEL_CLASS}>
            <ProjectEstructura proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="cronograma" className={PANEL_CLASS}>
            <ProjectCronograma proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="gantt" className={PANEL_CLASS}>
            <EstructuraGantt proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="avance" className={PANEL_CLASS}>
            <ProjectEjecucion proyecto={proyecto} />
            <ProjectKpisPanel proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="presupuesto" className={PANEL_CLASS}>
            <ProjectPresupuesto proyecto={proyecto} />
            <ProjectFinanciero proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="gastos" className={PANEL_CLASS}>
            <ProjectGastos proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="cambios" className={PANEL_CLASS}>
            <ProjectModificaciones proyecto={proyecto} />
            <ProjectVersiones proyecto={proyecto} />
            <ProjectHistorial proyectoId={proyecto.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * Semáforos del encabezado. Reutilizan la consulta de la sección Indicadores (misma clave: sin corte, base
 * vigente), así que no se pide dos veces ni se recalcula nada: el color llega del servidor. Un proyecto fuera de
 * ejecución (`medible: false`) no tiene semáforo.
 */
function FichaSemaforos({ proyectoId }: { proyectoId: string }) {
  const kpis = useProjectKpis(proyectoId, null, "vigente").data;
  if (!kpis || !kpis.medible) return null;
  return (
    <>
      {kpis.tecnico && <SemaforoChip color={kpis.tecnico.color} prefix="Semáforo técnico" />}
      {kpis.financiero && <SemaforoChip color={kpis.financiero.color} prefix="Semáforo financiero" />}
    </>
  );
}

function ResumenPanel({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <>
      <ResumenKpis proyecto={proyecto} />
      <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <FieldValue
          label="Origen"
          value={proyecto.origen ? ORIGEN_PROYECTO_META[proyecto.origen] : SIN_DATO}
        />
        <FieldValue label="Cliente" value={proyecto.cliente.nombre} />
        <FieldValue
          label="Responsable"
          value={proyecto.responsable?.nombre ?? "Sin asignar"}
        />
        <FieldValue
          label="Fecha de inicio"
          value={formatFechaCalendario(proyecto.fecha_inicio)}
          mono
        />
        <FieldValue label="Fecha de fin" value={formatFechaCalendario(proyecto.fecha_fin)} mono />
        <FieldValue label="Duración" value={formatDuracion(proyecto.duracion_semanas)} mono />
        <FieldValue label="Valor total" value={formatMonto(proyecto.valor_total)} mono />
        {proyecto.beneficiarios_meta !== null && (
          <FieldValue
            label="Beneficiarios meta"
            value={formatEntero(proyecto.beneficiarios_meta)}
            mono
          />
        )}
        {proyecto.diferencia_valor_oportunidad !== null && (
          <FieldValue
            label="Diferencia valor oportunidad"
            value={formatMonto(proyecto.diferencia_valor_oportunidad)}
            mono
          />
        )}
      </dl>

      <section>
        <SectionHeader>Líneas estratégicas</SectionHeader>
        {proyecto.lineas.length === 0 ? (
          <EmptyBlock>Sin líneas estratégicas.</EmptyBlock>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {proyecto.lineas.map((linea) => (
              <li
                key={linea.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px]",
                  linea.principal
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:text-rose-400"
                    : "border-ink-200 bg-panel text-ink-700",
                )}
              >
                <span className="font-mono text-[11px] text-ink-500 tabular-nums">
                  {linea.codigo}
                </span>
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
      </section>

      <section>
        <SectionHeader>Municipios</SectionHeader>
        {proyecto.municipios.length === 0 ? (
          <EmptyBlock>Sin municipios.</EmptyBlock>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {proyecto.municipios.map((municipio) => (
              <li
                key={municipio.id}
                className="rounded-full border border-ink-200 bg-panel px-3 py-1.5 text-[12.5px] text-ink-700"
              >
                {`${municipio.nombre} · ${municipio.departamento}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProjectTeam proyectoId={proyecto.id} />
    </>
  );
}

/* ── Historial (REQ-AUD-04) ────────────────────────────────────────────── */

/**
 * Historial de cambios del proyecto (solo lectura). La consulta se monta con
 * la ficha ya cargada y tiene sus propios estados de carga/error/vacío, para
 * que un fallo del libro no tape el resto de la ficha. No expone ninguna
 * acción de escritura: el libro es append-only.
 */
function ProjectHistorial({ proyectoId }: { proyectoId: string }) {
  const query = useProjectAudit(proyectoId);

  return (
    <section data-testid="historial">
      <SectionHeader icon={<History className="size-3.5" strokeWidth={2} />}>Historial</SectionHeader>

      {query.isError ? (
        <p role="alert" className="mt-1.5 text-[13px] text-destructivo">
          {query.error instanceof Error
            ? query.error.message
            : "No pudimos cargar el historial. Inténtalo de nuevo."}
        </p>
      ) : query.isLoading ? (
        <HistorialSkeleton />
      ) : query.data && query.data.length > 0 ? (
        <HistorialPasos entries={query.data} />
      ) : (
        <EmptyBlock>Sin movimientos registrados.</EmptyBlock>
      )}
    </section>
  );
}

/**
 * Una operación = un paso. Las filas comparten `lote_id` (y el instante de la
 * transacción): la conversión de la oportunidad y la creación del proyecto se
 * leen juntas, que es justamente lo que el módulo promete.
 */
function HistorialPasos({ entries }: { entries: ProjectAuditEntry[] }) {
  return (
    <ol className="mt-2 flex flex-col gap-3">
      {agruparHistorial(entries).map((paso) => (
        <li
          key={paso.key}
          data-testid="historial-paso"
          className="rounded-inner border border-border bg-panel p-3"
        >
          <time
            dateTime={paso.created_at}
            className="font-mono text-[11px] text-ink-500 tabular-nums"
          >
            {formatFechaHora(paso.created_at)}
          </time>
          <ul className="mt-2 flex flex-col gap-2.5">
            {paso.entries.map((entry) => (
              <HistorialEntrada key={entry.id} entry={entry} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function HistorialEntrada({ entry }: { entry: ProjectAuditEntry }) {
  const anterior = describeAuditValue(entry.valor_anterior);
  const nuevo = describeAuditValue(entry.valor_nuevo);
  const campo = entry.campo ? etiquetaCampoAuditoria(entry.campo) : null;

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-ink-100 px-2 py-[2px] text-[10.5px] font-bold text-ink-700">
          {ACCION_AUDITORIA_META[entry.accion]}
        </span>
        <span className="text-[11px] font-semibold text-ink-600">
          {ENTIDAD_AUDITORIA_META[entry.entidad] ?? entry.entidad}
        </span>
        <span className="text-[11px] text-ink-500">
          · {entry.usuario_nombre ?? "Usuario no disponible"}
        </span>
      </div>
      <p className="text-[12.5px] leading-snug text-ink-800">
        {campo && <span className="font-semibold">{campo}: </span>}
        {anterior && <span className="text-ink-500 line-through">{anterior}</span>}
        {anterior && nuevo && <span className="text-ink-500"> → </span>}
        {nuevo && <span>{nuevo}</span>}
      </p>
    </li>
  );
}

function HistorialSkeleton() {
  return (
    <div className="mt-2 space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-[14px]" />
      ))}
    </div>
  );
}

/* ── Estado de carga ───────────────────────────────────────────────────── */

function FichaSkeleton() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
      ))}
    </div>
  );
}

/* ── Estado de error ───────────────────────────────────────────────────── */

function FichaError({ error }: { error: unknown }) {
  const message =
    error instanceof Error
      ? error.message
      : "No pudimos cargar el proyecto. Inténtalo de nuevo.";

  // 404 (no existe) y 403 (no es miembro): la API decide; la página solo lo dice con claridad.
  const status = error instanceof ApiError ? error.status : null;
  const title =
    status === 404
      ? "Proyecto no encontrado"
      : status === 403
        ? "No tienes acceso a este proyecto"
        : "No pudimos abrir la ficha";

  return (
    <div role="alert" className="grid min-h-[240px] place-items-center px-6 py-10 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-destructivo-bg text-destructivo">
          <AlertTriangle className="size-6" strokeWidth={1.7} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
          {title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{message}</p>
      </div>
    </div>
  );
}
