// Objetivos del proyecto (S3 U4): cada uno con sus actividades (y entregables)
// e indicadores. Los conteos salen de las mismas queries que las listas.
//
// Desde S14 (P6) cada tarjeta muestra su acumulado (planeado vs ejecutado y
// semáforo) tomado del estado técnico: la vista lo lee UNA vez y lo reparte por
// código. El color llega calculado por el servidor y aquí solo se pinta (D11).

"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EstructuraActividades } from "@/components/proyectos/estructura-actividades";
import { EstructuraIndicadores } from "@/components/proyectos/estructura-indicadores";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { AddButton, RowActions, StructureForm, TextField, errorMessage, formError, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  useCreateObjective,
  useDeleteObjective,
  useProjectActivities,
  useProjectIndicators,
  useProjectObjectives,
  useProjectTechnicalStatus,
  useUpdateObjective,
  type ProjectListRow,
  type ProjectObjective,
  type ProjectTechnicalObjective,
} from "@/hooks/projects";

const LOAD_ERROR = "No pudimos cargar la estructura del proyecto. Inténtalo de nuevo.";

/** 0..100 con un decimal, con el mismo separador decimal que el resto de la app. */
function formatPct(value: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value)} %`;
}

export function EstructuraObjetivos({
  proyecto,
  canEdit,
}: {
  proyecto: ProjectListRow;
  canEdit: boolean;
}) {
  const query = useProjectObjectives(proyecto.id);
  // Una sola lectura del estado técnico para toda la lista; su error se ignora:
  // sin acumulado la tarjeta simplemente no lo muestra (D11, degradación muda).
  const status = useProjectTechnicalStatus(proyecto.id);
  const [abierto, setAbierto] = useState<string | null>(null);

  const rollups = useMemo(() => {
    const porCodigo = new Map<string, ProjectTechnicalObjective>();
    for (const objetivo of status.data?.objetivos ?? []) porCodigo.set(objetivo.codigo, objetivo);
    return porCodigo;
  }, [status.data]);

  if (query.isError) return <InlineError message={errorMessage(query.error, LOAD_ERROR)} className="mt-1.5" />;
  if (!query.data) {
    return (
      <div className="mt-2 space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[14px]" />
        ))}
      </div>
    );
  }

  return (
    <>
      {query.data.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-ink-500">Este proyecto todavía no tiene objetivos.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {query.data.map((objetivo) => (
            <ObjectiveCard
              key={objetivo.id}
              proyecto={proyecto}
              objetivo={objetivo}
              rollup={rollups.get(objetivo.codigo)}
              canEdit={canEdit}
              editing={abierto === objetivo.id}
              onEdit={() => setAbierto(objetivo.id)}
              onDone={() => setAbierto(null)}
            />
          ))}
        </ul>
      )}

      {canEdit &&
        (abierto === "new" ? (
          <ObjectiveForm proyectoId={proyecto.id} onDone={() => setAbierto(null)} />
        ) : (
          abierto === null && <AddButton label="Agregar objetivo" onClick={() => setAbierto("new")} />
        ))}
    </>
  );
}

function ObjectiveCard({
  proyecto,
  objetivo,
  rollup,
  canEdit,
  editing,
  onEdit,
  onDone,
}: {
  proyecto: ProjectListRow;
  objetivo: ProjectObjective;
  /** Acumulado del estado técnico, si el servidor lo devolvió para este código. */
  rollup?: ProjectTechnicalObjective;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const actividades = useProjectActivities(proyecto.id);
  const indicadores = useProjectIndicators(proyecto.id);
  const remove = useDeleteObjective(proyecto.id);

  const nActividades = actividades.data?.filter((a) => a.objetivo_id === objetivo.id).length;
  const nIndicadores = indicadores.data?.filter((i) => i.objetivo_id === objetivo.id).length;

  return (
    <li data-testid="estructura-objetivo" className="rounded-inner border border-border bg-panel p-3">
      {editing ? (
        <ObjectiveForm proyectoId={proyecto.id} objetivo={objetivo} onDone={onDone} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink-900">
                <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">
                  {objetivo.codigo}
                </span>{" "}
                <span className="font-semibold">{objetivo.descripcion}</span>
              </p>
              {nActividades !== undefined && nIndicadores !== undefined && (
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {plural(nActividades, "actividad", "actividades")} · {plural(nIndicadores, "indicador", "indicadores")}
                </p>
              )}
            </div>
            {canEdit && (
              <RowActions
                nombre={`objetivo ${objetivo.codigo}`}
                deleting={remove.isPending}
                onEdit={onEdit}
                onDelete={() => remove.mutate(objetivo.id)}
              />
            )}
          </div>
          {rollup && <ObjectiveRollup objetivo={objetivo} rollup={rollup} />}
        </>
      )}

      {remove.isError && (
        <InlineError
          message={errorMessage(remove.error, "No pudimos eliminar el objetivo. Inténtalo de nuevo.")}
          className="mt-1.5"
        />
      )}

      <EstructuraActividades proyecto={proyecto} objetivoId={objetivo.id} canEdit={canEdit} />
      <EstructuraIndicadores proyectoId={proyecto.id} objetivoId={objetivo.id} canEdit={canEdit} />
    </li>
  );
}

/**
 * Acumulado de un objetivo: el % planeado vs el % real y su semáforo. Ambos
 * valores y el color llegan del servidor; la barra solo se pinta con esa banda
 * (D11). Sin acumulado el bloque no se renderiza (degradación muda).
 */
function ObjectiveRollup({
  objetivo,
  rollup,
}: {
  objetivo: ProjectObjective;
  rollup: ProjectTechnicalObjective;
}) {
  return (
    <div data-testid="estructura-objetivo-rollup" className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SemaforoChip color={rollup.color} prefix="Semáforo" />
        <span className="text-[12px] text-ink-500">
          Programado <span className="font-semibold text-ink-900 tabular-nums">{formatPct(rollup.programado)}</span>
        </span>
        <span className="text-[12px] text-ink-500">
          Ejecutado <span className="font-semibold text-ink-900 tabular-nums">{formatPct(rollup.ejecutado)}</span>
        </span>
      </div>
      <ProgressBar
        aria-label={`Avance ejecutado del objetivo ${objetivo.codigo}`}
        value={rollup.ejecutado}
        band={rollup.color}
      />
    </div>
  );
}

function ObjectiveForm({
  proyectoId,
  objetivo,
  onDone,
}: {
  proyectoId: string;
  objetivo?: ProjectObjective;
  onDone: () => void;
}) {
  const create = useCreateObjective(proyectoId);
  const update = useUpdateObjective(proyectoId);
  const mutation = objetivo ? update : create;
  const [codigo, setCodigo] = useState(objetivo?.codigo ?? "");
  const [descripcion, setDescripcion] = useState(objetivo?.descripcion ?? "");

  function submit() {
    const data = { codigo, descripcion };
    if (objetivo) update.mutate({ id: objetivo.id, data }, { onSuccess: onDone });
    else create.mutate(data, { onSuccess: onDone });
  }

  return (
    <StructureForm
      label={objetivo ? `Editar objetivo ${objetivo.codigo}` : "Nuevo objetivo"}
      pending={mutation.isPending}
      error={formError(null, mutation.error, mutation.isError, "No pudimos guardar el objetivo. Inténtalo de nuevo.")}
      onSubmit={submit}
      onCancel={onDone}
    >
      <TextField label="Código" value={codigo} onChange={setCodigo} />
      <TextField label="Descripción" value={descripcion} onChange={setDescripcion} />
    </StructureForm>
  );
}
