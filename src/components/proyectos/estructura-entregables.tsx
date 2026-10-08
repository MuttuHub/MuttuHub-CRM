// Entregables de una actividad (S3 U4). Cada actividad debe tener al menos uno:
// si no hay ninguno se muestra una advertencia (el servidor no lo exige).

"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateDeliverable,
  useDeleteDeliverable,
  useProjectDeliverables,
  useUpdateDeliverable,
  type ProjectActivity,
  type ProjectDeliverable,
} from "@/hooks/projects";
import {
  AddButton,
  INVALID_NUMBER,
  InlineError,
  RowActions,
  StructureForm,
  TextField,
  errorMessage,
  formatCantidad,
  formError,
  parseNumber,
} from "@/components/proyectos/estructura-ui";

export function EstructuraEntregables({
  proyectoId,
  actividad,
  canEdit,
}: {
  proyectoId: string;
  actividad: ProjectActivity;
  canEdit: boolean;
}) {
  const query = useProjectDeliverables(proyectoId);
  const remove = useDeleteDeliverable(proyectoId);
  // `null` = nada abierto, "new" = alta, otro valor = id del entregable en edición.
  const [abierto, setAbierto] = useState<string | null>(null);

  if (query.isError) {
    return (
      <InlineError
        message={errorMessage(query.error, "No pudimos cargar los entregables. Inténtalo de nuevo.")}
        className="mt-2"
      />
    );
  }
  if (!query.data) return <Skeleton className="mt-2 h-8 w-full rounded-[10px]" />;

  const propios = query.data.filter((e) => e.actividad_id === actividad.id);

  return (
    <div className="mt-2">
      {propios.length === 0 ? (
        <p
          data-testid="estructura-sin-entregables"
          className="flex items-center gap-1.5 text-[12.5px] text-alerta"
        >
          <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} />
          Esta actividad no tiene entregables.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {propios.map((entregable) =>
            abierto === entregable.id ? (
              <li key={entregable.id}>
                <DeliverableForm
                  proyectoId={proyectoId}
                  actividadId={actividad.id}
                  entregable={entregable}
                  onDone={() => setAbierto(null)}
                />
              </li>
            ) : (
              <li
                key={entregable.id}
                data-testid="estructura-entregable"
                className="flex items-start justify-between gap-2 text-[12.5px] text-ink-800"
              >
                <p className="min-w-0">
                  <span className="font-mono text-[11px] text-ink-500 tabular-nums">{entregable.codigo}</span>{" "}
                  <span className="font-semibold">{entregable.descripcion}</span>
                  <span className="text-ink-600">
                    {" "}
                    · {formatCantidad(entregable.cantidad_meta)} {entregable.unidad} · {entregable.tipo_medio_exigido}
                  </span>
                </p>
                {canEdit && (
                  <RowActions
                    nombre={`entregable ${entregable.codigo}`}
                    deleting={remove.isPending && remove.variables === entregable.id}
                    onEdit={() => setAbierto(entregable.id)}
                    onDelete={() => remove.mutate(entregable.id)}
                  />
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {remove.isError && (
        <InlineError
          message={errorMessage(remove.error, "No pudimos eliminar el entregable. Inténtalo de nuevo.")}
          className="mt-1.5"
        />
      )}

      {canEdit &&
        (abierto === "new" ? (
          <DeliverableForm proyectoId={proyectoId} actividadId={actividad.id} onDone={() => setAbierto(null)} />
        ) : (
          abierto === null && <AddButton label="Agregar entregable" onClick={() => setAbierto("new")} />
        ))}
    </div>
  );
}

function DeliverableForm({
  proyectoId,
  actividadId,
  entregable,
  onDone,
}: {
  proyectoId: string;
  actividadId: string;
  entregable?: ProjectDeliverable;
  onDone: () => void;
}) {
  const create = useCreateDeliverable(proyectoId);
  const update = useUpdateDeliverable(proyectoId);
  const mutation = entregable ? update : create;
  const [codigo, setCodigo] = useState(entregable?.codigo ?? "");
  const [descripcion, setDescripcion] = useState(entregable?.descripcion ?? "");
  const [cantidad, setCantidad] = useState(entregable?.cantidad_meta ?? "");
  const [unidad, setUnidad] = useState(entregable?.unidad ?? "");
  const [medio, setMedio] = useState(entregable?.tipo_medio_exigido ?? "");
  const [local, setLocal] = useState<string | null>(null);

  function submit() {
    const cantidad_meta = parseNumber(cantidad);
    if (cantidad_meta === null) {
      setLocal(INVALID_NUMBER);
      return;
    }
    setLocal(null);
    const data = { codigo, descripcion, cantidad_meta, unidad, tipo_medio_exigido: medio };
    if (entregable) update.mutate({ id: entregable.id, data }, { onSuccess: onDone });
    else create.mutate({ actividad_id: actividadId, ...data }, { onSuccess: onDone });
  }

  return (
    <StructureForm
      label={entregable ? `Editar entregable ${entregable.codigo}` : "Nuevo entregable"}
      pending={mutation.isPending}
      error={formError(local, mutation.error, mutation.isError, "No pudimos guardar el entregable. Inténtalo de nuevo.")}
      onSubmit={submit}
      onCancel={onDone}
    >
      <TextField label="Código" value={codigo} onChange={setCodigo} />
      <TextField label="Descripción" value={descripcion} onChange={setDescripcion} />
      <TextField label="Cantidad meta" value={cantidad} onChange={setCantidad} inputMode="decimal" />
      <TextField label="Unidad" value={unidad} onChange={setUnidad} />
      <TextField label="Tipo de medio exigido" value={medio} onChange={setMedio} className="sm:col-span-2" />
    </StructureForm>
  );
}
