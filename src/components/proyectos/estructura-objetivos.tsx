// Objetivos del proyecto (S3 U4): cada uno con sus actividades (y entregables)
// e indicadores. Los conteos salen de las mismas queries que las listas.

"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EstructuraActividades } from "@/components/proyectos/estructura-actividades";
import { EstructuraIndicadores } from "@/components/proyectos/estructura-indicadores";
import { AddButton, RowActions, StructureForm, TextField, errorMessage, formError, plural } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import {
  useCreateObjective,
  useDeleteObjective,
  useProjectActivities,
  useProjectIndicators,
  useProjectObjectives,
  useUpdateObjective,
  type ProjectListRow,
  type ProjectObjective,
} from "@/hooks/projects";

const LOAD_ERROR = "No pudimos cargar la estructura del proyecto. Inténtalo de nuevo.";

export function EstructuraObjetivos({
  proyecto,
  canEdit,
}: {
  proyecto: ProjectListRow;
  canEdit: boolean;
}) {
  const query = useProjectObjectives(proyecto.id);
  const [abierto, setAbierto] = useState<string | null>(null);

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
  canEdit,
  editing,
  onEdit,
  onDone,
}: {
  proyecto: ProjectListRow;
  objetivo: ProjectObjective;
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
