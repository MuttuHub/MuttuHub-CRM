// Ficha de proyecto (E-06), de solo lectura salvo las secciones Equipo (E-07) y
// Estructura técnica (S3). Desde U2 se organiza en 5 pestañas (Resumen, Actividades, Finanzas, Documentos e
// Historial) bajo un encabezado fijo con código, nombre, estado, semáforos y acciones; cada panel se monta
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

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldValue } from "@/components/crm/shared";
import {
  ORIGEN_PROYECTO_META,
  formatFechaCalendario,
} from "@/components/proyectos/project-display";
import { EstructuraGantt } from "@/components/proyectos/estructura-gantt";
import { ProjectCronograma } from "@/components/proyectos/project-cronograma";
import { ProjectEstructura } from "@/components/proyectos/project-estructura";
import {
  ProjectBeneficiarios,
  ProjectEjecucion,
  ProjectIndicadores,
} from "@/components/proyectos/project-ejecucion";
import { ProjectSoportes } from "@/components/proyectos/project-soportes";
import { ProjectFinanciero } from "@/components/proyectos/project-financiero";
import { ResumenKpis } from "@/components/proyectos/resumen-kpis";
import { RequiereAtencion } from "@/components/proyectos/requiere-atencion";
import { ProjectGastos } from "@/components/proyectos/project-gastos";
import { ProjectHistorial } from "@/components/proyectos/project-historial";
import { ProjectModificaciones } from "@/components/proyectos/project-modificaciones";
import { ProjectPresupuesto } from "@/components/proyectos/project-presupuesto";
import { ProjectTeam } from "@/components/proyectos/project-team";
import { ProjectVersiones } from "@/components/proyectos/project-versiones";
import { EmptyBlock, SectionHeader } from "@/components/proyectos/ui";
import { FichaHeader } from "@/components/proyectos/ficha/ficha-header";
import { useProject, type ProjectListRow } from "@/hooks/projects";
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
  { value: "actividades", label: "Actividades" },
  { value: "finanzas", label: "Finanzas" },
  { value: "documentos", label: "Documentos" },
  { value: "historial", label: "Historial" },
] as const;

type FichaTab = (typeof FICHA_TABS)[number]["value"];

const PANEL_CLASS = "mt-0 flex flex-col gap-6";

function FichaContent({ proyecto }: { proyecto: ProjectListRow }) {
  // Controlada: los semáforos y las acciones del encabezado también cambian de pestaña.
  const [tab, setTab] = useState<FichaTab>("resumen");

  return (
    <div className="flex flex-col">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as FichaTab)}
        className="flex flex-col gap-0"
      >
        {/* Encabezado fijo: pegajoso y fuera del panel de contenido, así estado y semáforos siempre se ven. */}
        <div className="sticky top-0 z-10 rounded-t-card bg-panel">
          <FichaHeader proyecto={proyecto} onIrA={setTab} />
          <div className="no-scrollbar overflow-x-auto border-b border-ink-200 px-5 sm:px-6">
            <TabsList variant="line" className="w-full justify-start gap-1">
              {FICHA_TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="flex-none px-3">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        <div data-testid="ficha-scroll" className="p-5 sm:p-6">
          <TabsContent value="resumen" className={PANEL_CLASS}>
            <ResumenPanel proyecto={proyecto} />
            <ProjectTeam proyectoId={proyecto.id} />
            {/* Temporal: F14 retira Beneficiarios; mientras tanto no se pierde la función. */}
            <ProjectBeneficiarios proyecto={proyecto} />
          </TabsContent>

          {/* Temporal: U4 reemplaza estas secciones por las vistas Lista, Gantt y Tablero. */}
          <TabsContent value="actividades" className={PANEL_CLASS}>
            <ProjectEstructura proyecto={proyecto} />
            <ProjectIndicadores proyecto={proyecto} />
            <ProjectCronograma proyecto={proyecto} />
            <EstructuraGantt proyecto={proyecto} />
            <ProjectEjecucion proyecto={proyecto} seguimiento />
          </TabsContent>

          {/* Temporal: X2 lo reemplaza por `FichaFinanzas`. */}
          <TabsContent value="finanzas" className={PANEL_CLASS}>
            <ProjectFinanciero proyecto={proyecto} />
            <ProjectPresupuesto proyecto={proyecto} />
            <ProjectGastos proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="documentos" className={PANEL_CLASS}>
            <ProjectSoportes proyectoId={proyecto.id} />
          </TabsContent>

          <TabsContent value="historial" className={PANEL_CLASS}>
            <ProjectModificaciones proyecto={proyecto} />
            <ProjectVersiones proyecto={proyecto} />
            <ProjectHistorial proyecto={proyecto} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function ResumenPanel({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <>
      <ResumenKpis proyecto={proyecto} />
      <RequiereAtencion proyecto={proyecto} />
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
    </>
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
