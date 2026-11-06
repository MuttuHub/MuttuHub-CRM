// «Registrar avance» dialog of the ficha header (T9 / S9): opens on top of any tab without switching it.
// An «Actividad» picker lists the activities that still take reports (preselecting the one asked for, else the
// first unfinished one), a summary with «N % registrado · tope T %» and the responsable, and the same
// `ReporteActividadForm` the activity card opens inline. Its inputs (tope, last live report) are computed with
// the card's own helpers, so both entry points apply the same rules; the API stays the authority.

"use client";

import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TOPE_POR_DEFECTO, topeDeActividad } from "@/components/proyectos/ejecucion-avance";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { esFinalizada, formatNumero, ultimoVigente } from "@/components/proyectos/ficha/actividades/formato";
import { useEjecucionPermisos, useProgresoEntregables } from "@/components/proyectos/project-ejecucion";
import { ReporteActividadForm, SOPORTE_FALLIDO_TEXT } from "@/components/proyectos/reporte-actividad-form";
import { InlineError, SELECT_CLASS_LG } from "@/components/proyectos/ui";
import {
  useActivityReports,
  useProjectActivities,
  useProjectDeliverables,
  useProjectMembers,
  useProjectTechnicalStatus,
  type ProjectActivity,
  type ProjectListRow,
} from "@/hooks/projects";
import { cn } from "@/lib/utils";

const CARGA_ERROR = "No pudimos cargar las actividades. Inténtalo de nuevo.";
export const SIN_ACTIVIDADES_TEXT = "No hay actividades que reciban avances.";

export function RegistrarAvanceDialog({
  proyecto,
  open,
  onOpenChange,
  actividadId = null,
}: {
  proyecto: ProjectListRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Activity to preselect (a «Qué falta» row); null preselects the first unfinished one. */
  actividadId?: string | null;
}) {
  // The notice outlives the dialog: it is announced after the dialog closes.
  const [aviso, setAviso] = useState("");

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(abierto) => {
          if (abierto) setAviso("");
          onOpenChange(abierto);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(560px,calc(100%-2rem))]">
          {/* Mounted (and fetching) only while open, so every opening starts from its own preselection. */}
          {open && (
            <Contenido
              proyecto={proyecto}
              actividadId={actividadId}
              onCerrar={() => onOpenChange(false)}
              onRegistrado={setAviso}
            />
          )}
        </DialogContent>
      </Dialog>
      <p role="status" className={aviso ? "mb-4 text-[13px] font-medium text-exito" : "sr-only"}>
        {aviso}
      </p>
    </>
  );
}

function Contenido({
  proyecto,
  actividadId,
  onCerrar,
  onRegistrado,
}: {
  proyecto: ProjectListRow;
  actividadId: string | null;
  onCerrar: () => void;
  onRegistrado: (aviso: string) => void;
}) {
  // Same queries (and keys) as the execution Lista: an open Actividades tab shares them.
  const tecnicoQuery = useProjectTechnicalStatus(proyecto.id, "vigente");
  const activitiesQuery = useProjectActivities(proyecto.id);
  const deliverablesQuery = useProjectDeliverables(proyecto.id);
  const membersQuery = useProjectMembers(proyecto.id);
  const deliverables = deliverablesQuery.data ?? [];
  const progreso = useProgresoEntregables(proyecto.id, deliverables);
  const { canWrite } = useEjecucionPermisos(proyecto.id);
  const [elegida, setElegida] = useState<string | null>(actividadId);
  const selectId = useId();

  const tecnicas = new Map((tecnicoQuery.data?.actividades ?? []).map((fila) => [fila.id, fila]));
  const opciones = (activitiesQuery.data ?? []).filter((actividad) => {
    const tecnica = tecnicas.get(actividad.id);
    return tecnica !== undefined && !esFinalizada(tecnica.estado);
  });
  const actividad = opciones.find((opcion) => opcion.id === elegida) ?? opciones[0] ?? null;
  const tecnica = actividad ? tecnicas.get(actividad.id) : undefined;

  const error = tecnicoQuery.error ?? activitiesQuery.error;
  const cargando = !tecnicoQuery.data || !activitiesQuery.data;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
          Registrar avance
        </DialogTitle>
        {actividad && <DialogDescription>{`${actividad.codigo} · ${actividad.nombre}`}</DialogDescription>}
      </DialogHeader>

      {error ? (
        <InlineError message={errorMessage(error, CARGA_ERROR)} />
      ) : cargando ? (
        <Skeleton className="h-24 w-full rounded-[12px]" />
      ) : !actividad || !tecnica ? (
        <p className="text-[13px] text-ink-600">{SIN_ACTIVIDADES_TEXT}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={selectId}>Actividad</Label>
            <select
              id={selectId}
              value={actividad.id}
              onChange={(event) => setElegida(event.target.value)}
              className={cn(SELECT_CLASS_LG, "w-full")}
            >
              {opciones.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {`${opcion.codigo} · ${opcion.nombre}`}
                </option>
              ))}
            </select>
          </div>
          <FormularioActividad
            key={actividad.id}
            proyectoId={proyecto.id}
            actividad={actividad}
            actual={tecnica.progreso}
            tope={topeDeActividad(
              deliverables.filter((deliverable) => deliverable.actividad_id === actividad.id),
              progreso,
              tecnicoQuery.data?.tope_en_curso ?? TOPE_POR_DEFECTO,
            )}
            responsable={
              actividad.responsable_id
                ? ((membersQuery.data ?? []).find((miembro) => miembro.usuario.id === actividad.responsable_id)
                    ?.usuario.nombre ?? null)
                : null
            }
            canWrite={canWrite}
            onCerrar={onCerrar}
            onRegistrado={onRegistrado}
          />
        </div>
      )}
    </>
  );
}

/** Summary and form of the chosen activity; remounted (by key) when the choice changes. */
function FormularioActividad({
  proyectoId,
  actividad,
  actual,
  tope,
  responsable,
  canWrite,
  onCerrar,
  onRegistrado,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  actual: number;
  tope: number;
  responsable: string | null;
  canWrite: boolean;
  onCerrar: () => void;
  onRegistrado: (aviso: string) => void;
}) {
  const reportes = useActivityReports(proyectoId, actividad.id).data?.reportes ?? [];
  const ultimo = ultimoVigente(reportes);

  return (
    <>
      <div
        data-testid="registrar-avance-resumen"
        className="flex flex-col gap-0.5 rounded-inner border border-border bg-muted/60 px-3 py-2 text-[13px] text-ink-700"
      >
        <span>
          <span className="font-semibold text-ink-900 tabular-nums">{formatNumero(actual)} %</span>
          {` registrado · tope ${formatNumero(tope)} %`}
        </span>
        {responsable && <span className="text-[12.5px] text-ink-600">{`Responsable: ${responsable}`}</span>}
      </div>
      {canWrite && (
        <ReporteActividadForm
          projectId={proyectoId}
          actividad={actividad}
          actual={actual}
          tope={tope}
          ultimo={ultimo ? Number(ultimo.porcentaje) : null}
          enfocarAlAbrir={false}
          onDone={onCerrar}
          onSaved={({ porcentaje, soporteFallido }) =>
            onRegistrado(
              `Avance registrado: la ${actividad.codigo} queda en ${formatNumero(porcentaje)} %.` +
                (soporteFallido ? ` ${SOPORTE_FALLIDO_TEXT}` : ""),
            )
          }
        />
      )}
    </>
  );
}
