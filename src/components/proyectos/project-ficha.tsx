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
import { RegistrarAvanceDialog } from "@/components/proyectos/ficha/registrar-avance-dialog";
import { RegistrarGastoDialog } from "@/components/proyectos/ficha/registrar-gasto-dialog";
import { DESTINO_DE_ACCION, type AccionAtencion } from "@/components/proyectos/requiere-atencion";
import { useProject, useProjectSupports, type ProjectListRow } from "@/hooks/projects";
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
      {/* Once loaded, «← Proyectos» lives in the header (T10 C1); while loading or on error it stays here. */}
      {backHref && !proyecto && (
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
          <FichaContent proyecto={proyecto} backHref={backHref} />
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

function FichaContent({ proyecto, backHref }: { proyecto: ProjectListRow; backHref?: string }) {
  // Controlada: los semáforos y las acciones del encabezado también cambian de pestaña.
  const [tab, setTab] = useState<FichaTab>("resumen");
  // «Documentos · N» (T10 C6): same query (and cache) as the Documentos tab, so opening it costs nothing more.
  // The API already leaves out what the role may not see, so the count matches the list.
  const soportes = useProjectSupports(proyecto.id).data;
  const totalDocumentos = Array.isArray(soportes) ? soportes.length : null;
  // «Registrar avance» and «Registrar gasto» open their dialogs on top of the current tab (S9).
  const [avanceAbierto, setAvanceAbierto] = useState(false);
  const [actividadPedida, setActividadPedida] = useState<string | null>(null);
  const [gastoAbierto, setGastoAbierto] = useState(false);
  // «Solicitar modificación» opens Historial on its requests segment.
  const [pedidoSolicitud, setPedidoSolicitud] = useState(0);
  const [solicitudPendiente, setSolicitudPendiente] = useState(false);

  const irA = (destino: FichaTab) => {
    if (destino !== "historial") setSolicitudPendiente(false);
    setTab(destino);
  };
  const registrarAvance = (actividadId: string | null = null) => {
    setActividadPedida(actividadId);
    setAvanceAbierto(true);
  };
  const solicitarModificacion = () => {
    setSolicitudPendiente(true);
    setPedidoSolicitud((pedido) => pedido + 1);
    irA("historial");
  };
  const atenderAccion = (accion: AccionAtencion) => {
    if (accion.tipo === "registrar-avance") registrarAvance(accion.actividadId);
    else irA(DESTINO_DE_ACCION[accion.tipo]);
  };

  return (
    <div className="flex flex-col">
      <Tabs
        value={tab}
        onValueChange={(value) => irA(value as FichaTab)}
        className="flex flex-col gap-0"
      >
        {/* Encabezado fijo: pegajoso y fuera del panel de contenido, así estado y semáforos siempre se ven. */}
        <div className="sticky top-0 z-10 rounded-t-card bg-panel">
          <FichaHeader
            proyecto={proyecto}
            onIrA={irA}
            onRegistrarAvance={() => registrarAvance()}
            onRegistrarGasto={() => setGastoAbierto(true)}
            mostrarSemaforos={tab !== "resumen"}
            pestana={tab}
            backHref={backHref}
          />
          <div className="relative border-b border-ink-200">
            <div className="no-scrollbar overflow-x-auto px-5 sm:px-6">
              <TabsList variant="line" className="w-full justify-start gap-1">
                {FICHA_TABS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="flex-none px-3">
                    {item.value === "documentos" && totalDocumentos !== null
                      ? `${item.label} · ${totalDocumentos}`
                      : item.label}
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
        {/* On phones the header's action bar is fixed at the bottom: leave room so it never covers content. */}
        <div data-testid="ficha-scroll" className="p-5 max-md:pb-28 sm:p-6">
          {/* Its success notice shows here, above the tab content, once the dialog closes. */}
          <RegistrarAvanceDialog
            proyecto={proyecto}
            open={avanceAbierto}
            onOpenChange={setAvanceAbierto}
            actividadId={actividadPedida}
          />
          <RegistrarGastoDialog proyecto={proyecto} open={gastoAbierto} onOpenChange={setGastoAbierto} />
          <TabsContent value="resumen" className={PANEL_CLASS}>
            {/* The Resumen only goes to Historial for «Solicitar modificación»: land on the requests segment. */}
            <FichaResumen
              proyecto={proyecto}
              onIrA={(destino) => (destino === "historial" ? solicitarModificacion() : irA(destino))}
              onAccion={atenderAccion}
            />
          </TabsContent>

          <TabsContent value="actividades" className={PANEL_CLASS}>
            <FichaActividades proyecto={proyecto} onSolicitarModificacion={solicitarModificacion} />
          </TabsContent>

          <TabsContent value="finanzas" className={PANEL_CLASS}>
            <FichaFinanzas proyecto={proyecto} onVerActividades={() => irA("actividades")} />
          </TabsContent>

          <TabsContent value="documentos" className={PANEL_CLASS}>
            <FichaDocumentos proyecto={proyecto} />
          </TabsContent>

          <TabsContent value="historial" className={PANEL_CLASS}>
            <FichaHistorial
              key={pedidoSolicitud}
              proyecto={proyecto}
              onIrA={irA}
              segmentoInicial={solicitudPendiente ? "solicitudes" : undefined}
            />
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
