// Actividades de un objetivo (S3 U4). Se ubican por SEMANAS del proyecto; las
// fechas que se muestran las deriva el servidor (nunca se envían). El peso por
// defecto es la duración en semanas: un peso escrito a mano queda marcado.

"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToneBadge } from "@/components/crm/shared";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { EstructuraEntregables } from "@/components/proyectos/estructura-entregables";
import { AddButton, INVALID_NUMBER, RowActions, StructureForm, TextField, errorMessage, formError, parseNumber } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import { useUsers } from "@/hooks/crm";
import {
  useCreateActivity,
  useDeleteActivity,
  useProjectActivities,
  useUpdateActivity,
  type ProjectActivity,
  type ProjectListRow,
} from "@/hooks/projects";

export const SIN_FECHAS_HINT = "Define las fechas del proyecto antes de crear actividades.";
const SIN_RESPONSABLE = "none";

function formatPeso(peso: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(peso);
}

function formatSemanas(a: ProjectActivity): string {
  return a.semana_inicio === a.semana_fin
    ? `Semana ${a.semana_inicio}`
    : `Semanas ${a.semana_inicio}–${a.semana_fin}`;
}

export function EstructuraActividades({
  proyecto,
  objetivoId,
  canEdit,
}: {
  proyecto: ProjectListRow;
  objetivoId: string;
  canEdit: boolean;
}) {
  const query = useProjectActivities(proyecto.id);
  const users = useUsers();
  const remove = useDeleteActivity(proyecto.id);
  const [abierto, setAbierto] = useState<string | null>(null);

  if (query.isError) {
    return (
      <InlineError
        message={errorMessage(query.error, "No pudimos cargar las actividades. Inténtalo de nuevo.")}
        className="mt-2"
      />
    );
  }
  if (!query.data) return <Skeleton className="mt-2 h-10 w-full rounded-[10px]" />;

  const propias = query.data.filter((a) => a.objetivo_id === objetivoId);
  const sinFechas = proyecto.fecha_inicio === null || proyecto.fecha_fin === null;
  const nombreDe = (id: string | null) => users.data?.find((u) => u.id === id)?.nombre ?? null;

  return (
    <div className="mt-3">
      <SectionHeader as="h4">Actividades</SectionHeader>
      {propias.length === 0 ? (
        <EmptyBlock>Sin actividades.</EmptyBlock>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-2">
          {propias.map((actividad) => (
            <li
              key={actividad.id}
              data-testid="estructura-actividad"
              className="rounded-[12px] border border-ink-200 bg-panel p-2.5"
            >
              {abierto === actividad.id ? (
                <ActivityForm
                  proyecto={proyecto}
                  objetivoId={objetivoId}
                  actividad={actividad}
                  onDone={() => setAbierto(null)}
                />
              ) : (
                <>
                  <ActivitySummary
                    actividad={actividad}
                    responsable={nombreDe(actividad.responsable_id)}
                    actions={
                      canEdit && (
                        <RowActions
                          nombre={`actividad ${actividad.codigo}`}
                          deleting={remove.isPending && remove.variables === actividad.id}
                          onEdit={() => setAbierto(actividad.id)}
                          onDelete={() => remove.mutate(actividad.id)}
                        />
                      )
                    }
                  />
                  {remove.isError && remove.variables === actividad.id && (
                    <InlineError
                      message={errorMessage(remove.error, "No pudimos eliminar la actividad. Inténtalo de nuevo.")}
                      className="mt-1.5"
                    />
                  )}
                  <EstructuraEntregables proyectoId={proyecto.id} actividad={actividad} canEdit={canEdit} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit &&
        (sinFechas ? (
          <p className="mt-2 text-[12.5px] text-ink-500">{SIN_FECHAS_HINT}</p>
        ) : abierto === "new" ? (
          <ActivityForm proyecto={proyecto} objetivoId={objetivoId} onDone={() => setAbierto(null)} />
        ) : (
          abierto === null && <AddButton label="Agregar actividad" onClick={() => setAbierto("new")} />
        ))}
    </div>
  );
}

function ActivitySummary({
  actividad,
  responsable,
  actions,
}: {
  actividad: ProjectActivity;
  responsable: string | null;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[13px] text-ink-900">
          <span className="font-mono text-[11px] text-ink-500 tabular-nums">{actividad.codigo}</span>{" "}
          <span className="font-semibold">{actividad.nombre}</span>
        </p>
        <p className="mt-0.5 text-[12px] text-ink-600">
          {formatSemanas(actividad)} · {formatFechaCalendario(actividad.fecha_inicio)} –{" "}
          {formatFechaCalendario(actividad.fecha_fin)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-600">
          <span>Peso {formatPeso(actividad.peso)}</span>
          {actividad.peso_manual && <ToneBadge tone="info" label="Peso manual" />}
          {responsable && <span>· {responsable}</span>}
          {actividad.fuera_de_duracion && (
            <span className="inline-flex items-center gap-1 text-alerta">
              <AlertTriangle className="size-3.5" strokeWidth={2} />
              Fuera de la duración del proyecto
            </span>
          )}
        </div>
      </div>
      {actions}
    </div>
  );
}

function ActivityForm({
  proyecto,
  objetivoId,
  actividad,
  onDone,
}: {
  proyecto: ProjectListRow;
  objetivoId: string;
  actividad?: ProjectActivity;
  onDone: () => void;
}) {
  const users = useUsers();
  const create = useCreateActivity(proyecto.id);
  const update = useUpdateActivity(proyecto.id);
  const mutation = actividad ? update : create;
  const [codigo, setCodigo] = useState(actividad?.codigo ?? "");
  const [nombre, setNombre] = useState(actividad?.nombre ?? "");
  const [inicio, setInicio] = useState(actividad ? String(actividad.semana_inicio) : "");
  const [fin, setFin] = useState(actividad ? String(actividad.semana_fin) : "");
  const [peso, setPeso] = useState(actividad?.peso_manual ? String(actividad.peso) : "");
  const [responsable, setResponsable] = useState(actividad?.responsable_id ?? SIN_RESPONSABLE);
  const [local, setLocal] = useState<string | null>(null);

  function submit() {
    const semana_inicio = parseNumber(inicio);
    const semana_fin = parseNumber(fin);
    const pesoNum = parseNumber(peso);
    if (semana_inicio === null || semana_fin === null || (peso.trim() !== "" && pesoNum === null)) {
      setLocal(INVALID_NUMBER);
      return;
    }
    setLocal(null);
    const responsable_id = responsable === SIN_RESPONSABLE ? null : responsable;
    const base = { codigo, nombre, semana_inicio, semana_fin };
    if (actividad) {
      // Editar: un peso vacío vuelve al peso por defecto (`null`).
      update.mutate(
        { id: actividad.id, data: { ...base, peso: pesoNum, responsable_id } },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        {
          objetivo_id: objetivoId,
          ...base,
          ...(pesoNum === null ? {} : { peso: pesoNum }),
          ...(responsable_id === null ? {} : { responsable_id }),
        },
        { onSuccess: onDone },
      );
    }
  }

  const duracion = proyecto.duracion_semanas;

  return (
    <StructureForm
      label={actividad ? `Editar actividad ${actividad.codigo}` : "Nueva actividad"}
      pending={mutation.isPending}
      error={formError(local, mutation.error, mutation.isError, "No pudimos guardar la actividad. Inténtalo de nuevo.")}
      onSubmit={submit}
      onCancel={onDone}
    >
      <TextField label="Código" value={codigo} onChange={setCodigo} />
      <TextField label="Nombre" value={nombre} onChange={setNombre} />
      <TextField label="Semana inicial" value={inicio} onChange={setInicio} type="number" />
      <TextField label="Semana final" value={fin} onChange={setFin} type="number" />
      <TextField label="Peso (opcional)" value={peso} onChange={setPeso} inputMode="decimal" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[12px] font-medium text-ink-600">Responsable</span>
        <Select value={responsable} onValueChange={(value) => setResponsable(value ?? SIN_RESPONSABLE)}>
          <SelectTrigger aria-label="Responsable" className="h-9 min-w-0 rounded-12 bg-panel px-3">
            <SelectValue placeholder="Sin responsable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_RESPONSABLE}>Sin responsable</SelectItem>
            {(users.data ?? []).map((usuario) => (
              <SelectItem key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-[12px] text-ink-500 sm:col-span-2">
        {duracion !== null ? `El proyecto dura ${duracion} semanas. ` : ""}
        Las fechas se calculan a partir de las semanas; sin peso, vale su duración en semanas.
      </p>
    </StructureForm>
  );
}
