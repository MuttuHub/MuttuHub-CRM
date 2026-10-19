// Ficha de proyecto (E-06), de solo lectura salvo las secciones Equipo (E-07) y
// Estructura técnica (S3). Desde U2 se organiza en 5 pestañas (Resumen, Actividades, Finanzas, Documentos e
// Historial) bajo un encabezado fijo con código, nombre, estado, semáforos y acciones; cada panel se monta
// (y consulta) solo cuando su pestaña está activa. Desde S12 es una página propia (`/proyectos/[id]`),
// que el listado y el tablero abren en una pestaña nueva. Monta su propia consulta (`useProject`): el estado del request (loading, error, data) sale
// entero de la query, sin `useEffect` de carga ni controles de escritura propios.
//
// El panel Resumen vive en `ficha/ficha-resumen.tsx` (U3) y Actividades en `ficha/ficha-actividades.tsx` (U4).

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FichaDocumentos } from "@/components/proyectos/ficha/ficha-documentos";
import { FichaFinanzas } from "@/components/proyectos/ficha/ficha-finanzas";
import { FichaHistorial } from "@/components/proyectos/ficha/ficha-historial";
import { FichaActividades } from "@/components/proyectos/ficha/ficha-actividades";
import { FichaHeader } from "@/components/proyectos/ficha/ficha-header";
import { FichaResumen } from "@/components/proyectos/ficha/ficha-resumen";
import { useProject, type ProjectListRow } from "@/hooks/projects";
import { ApiError } from "@/lib/api/http";
import { cn } from "@/lib/utils";

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
          <div className="relative border-b border-ink-200">
            <div className="no-scrollbar overflow-x-auto px-5 sm:px-6">
              <TabsList variant="line" className="w-full justify-start gap-1">
                {FICHA_TABS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="flex-none px-3">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {/* Degradado que insinúa las pestañas fuera de pantalla en móvil (la barra nativa está oculta). */}
            <span
              aria-hidden="true"
              data-testid="ficha-tabs-fade"
              className="pointer-events-none absolute top-0 right-0 h-full w-6 bg-gradient-to-l from-panel to-transparent sm:hidden"
            />
          </div>
        </div>
        <div data-testid="ficha-scroll" className="p-5 sm:p-6">
          <TabsContent value="resumen" className={PANEL_CLASS}>
            <FichaResumen proyecto={proyecto} onIrA={setTab} />
          </TabsContent>

          <TabsContent value="actividades" className={PANEL_CLASS}>
            <FichaActividades proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="finanzas" className={PANEL_CLASS}>
            <FichaFinanzas proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="documentos" className={PANEL_CLASS}>
            <FichaDocumentos proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="historial" className={PANEL_CLASS}>
            <FichaHistorial proyecto={proyecto} />
          </TabsContent>
        </div>
      </Tabs>
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
    error instanceof ApiError
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
