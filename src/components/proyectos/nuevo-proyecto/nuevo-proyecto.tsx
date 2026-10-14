// "Nuevo proyecto" as a v7 stepper page (`/proyectos/nuevo`): General, Metas, Cronograma, Presupuesto and
// Revisión. Step 1 creates the project through the shared create form (both origins); the project id then
// lives in the URL (`?proyecto=<id>&paso=<n>`) so refresh and back keep it. Steps 2-5 reuse the editors the
// ficha already has for a BORRADOR project and stay disabled until the project exists.
//
// Permissions: only who can create projects (`canCreateProject`) sees the flow; it is UI convenience, the
// authority is the API (403). Everything persists through the existing endpoints: no new route.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/status-chip";
import { PasoGeneralCreado, PasoGeneralForm } from "@/components/proyectos/nuevo-proyecto/paso-general";
import { NuevoProyectoStepper } from "@/components/proyectos/nuevo-proyecto/nuevo-proyecto-stepper";
import {
  datosDePaso,
  esProyectoAprobado,
  hrefNuevoProyecto,
  pasoAnterior,
  pasoSiguiente,
  resolverPaso,
} from "@/components/proyectos/nuevo-proyecto/stepper-logic";
import { useProyectoNuevo } from "@/components/proyectos/nuevo-proyecto/use-proyecto-nuevo";
import { PasoSiguientes } from "@/components/proyectos/nuevo-proyecto/paso-siguientes";
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display";
import type { CreatedProject } from "@/components/proyectos/project-create-form";
import { useCurrentUser } from "@/hooks/kanban";
import { canCreateProject } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function NuevoProyecto() {
  const router = useRouter();
  const search = useSearchParams();
  const usuarioQuery = useCurrentUser();
  const usuario = usuarioQuery.data;

  const proyectoId = search.get("proyecto") ?? "";
  const oportunidadId = search.get("oportunidad") ?? undefined;
  const hayProyecto = proyectoId !== "";
  const paso = resolverPaso(search.get("paso"), hayProyecto);
  const proyectoQuery = useProyectoNuevo(proyectoId);
  const proyecto = proyectoQuery.data;

  function irAPaso(numero: number) {
    router.push(hrefNuevoProyecto({ proyecto: proyectoId, paso: numero }));
  }

  function alCrear(creado: CreatedProject) {
    // `replace`: the blank creation form must not be one back-press away from a project that already exists.
    router.replace(hrefNuevoProyecto({ proyecto: creado.id, paso: 2 }));
  }

  const puedeCrear = usuario ? canCreateProject({ id: usuario.id, rol: usuario.rol }) : false;
  const anterior = pasoAnterior(paso);
  const siguiente = pasoSiguiente(paso);
  const aprobado = proyecto ? esProyectoAprobado(proyecto.estado) : false;
  const datosPaso = datosDePaso(paso, aprobado);
  const estado = proyecto ? ESTADO_PROYECTO_META[proyecto.estado] : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4">
      <Link
        href="/proyectos"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "w-fit px-3 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-100",
        )}
      >
        <ArrowLeft className="size-3.5" strokeWidth={1.8} />
        Volver a proyectos
      </Link>

      <div className="min-w-0 surface">
        {!usuario ? (
          <CargandoPagina />
        ) : !puedeCrear ? (
          <SinAcceso />
        ) : hayProyecto && proyectoQuery.isError ? (
          <ProyectoNoDisponible error={proyectoQuery.error} />
        ) : hayProyecto && !proyecto ? (
          // Until the project resolves nothing is known about it: no stepper with "completado" steps.
          <CargandoPagina />
        ) : (
          <>
            <header
              data-testid="nuevo-proyecto-header"
              className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 p-5 sm:p-6"
            >
              <div className="min-w-0">
                {proyecto && (
                  <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">
                    {proyecto.codigo}
                  </span>
                )}
                <h1 className="mt-0.5 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
                  {proyecto ? proyecto.nombre : "Nuevo proyecto"}
                </h1>
                {!proyecto && (
                  <p className="mt-1 text-[13px] text-ink-600">
                    Desde una oportunidad ganada o como proyecto independiente. Queda en borrador.
                  </p>
                )}
              </div>
              {estado && <StatusChip tone={estado.tone}>{estado.label}</StatusChip>}
            </header>

            <div className="no-scrollbar overflow-x-auto border-b border-ink-200 px-5 py-4 sm:px-6">
              <NuevoProyectoStepper actual={paso} hayProyecto={hayProyecto} aprobado={aprobado} onSeleccionar={irAPaso} />
            </div>

            <div data-testid="nuevo-proyecto-paso" className="flex flex-col gap-5 p-5 sm:p-6">
              <div>
                <h2 className="font-display text-[16px] font-bold tracking-[-0.01em] text-ink-950">
                  {datosPaso.titulo}
                </h2>
                <p className="mt-1 text-[13px] text-ink-600">{datosPaso.descripcion}</p>
              </div>

              {paso === 1 && !hayProyecto ? (
                <PasoGeneralForm oportunidadId={oportunidadId} onCreated={alCrear} />
              ) : !proyecto ? null : paso === 1 ? (
                <PasoGeneralCreado proyecto={proyecto} />
              ) : (
                <PasoSiguientes paso={paso} proyecto={proyecto} />
              )}
            </div>

            {hayProyecto && (
              <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-5 py-4 sm:px-6">
                {anterior ? (
                  <Button type="button" variant="outline" onClick={() => irAPaso(anterior)}>
                    <ArrowLeft />
                    Atrás
                  </Button>
                ) : (
                  <span />
                )}
                {siguiente && (
                  <Button type="button" onClick={() => irAPaso(siguiente)}>
                    Siguiente
                    <ArrowRight />
                  </Button>
                )}
              </footer>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CargandoPagina() {
  return (
    <div className="space-y-3 p-5" data-testid="nuevo-proyecto-cargando">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[10px]" />
      ))}
    </div>
  );
}

function BloqueMensaje({ titulo, mensaje, children }: { titulo: string; mensaje: string; children?: React.ReactNode }) {
  return (
    <div role="alert" className="grid min-h-[240px] place-items-center px-6 py-10 text-center">
      <div className="max-w-[42ch]">
        <span className="mx-auto grid size-12 place-items-center rounded-[16px_16px_16px_6px] bg-destructivo-bg text-destructivo">
          <AlertTriangle className="size-6" strokeWidth={1.7} />
        </span>
        <h2 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">{titulo}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{mensaje}</p>
        {children}
      </div>
    </div>
  );
}

function SinAcceso() {
  return (
    <BloqueMensaje
      titulo="No tienes acceso para crear proyectos"
      mensaje="Solo Administración y Gerencia pueden crear proyectos. Pídeselo a alguien con ese rol."
    />
  );
}

function ProyectoNoDisponible({ error }: { error: unknown }) {
  return (
    <BloqueMensaje
      titulo="No pudimos abrir el proyecto"
      mensaje={error instanceof Error ? error.message : "No pudimos cargar el proyecto. Inténtalo de nuevo."}
    >
      <Link href="/proyectos/nuevo" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
        Empezar de nuevo
      </Link>
    </BloqueMensaje>
  );
}
