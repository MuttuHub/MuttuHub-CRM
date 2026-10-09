// Indicadores de resultado de un objetivo (S3 U4).

"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateIndicator,
  useDeleteIndicator,
  useProjectIndicators,
  useUpdateIndicator,
  type ProjectIndicator,
} from "@/hooks/projects";
import { AddButton, INVALID_NUMBER, RowActions, StructureForm, TextField, errorMessage, formError, formatCantidad, parseNumber } from "@/components/proyectos/estructura-ui";
import { InlineError, SectionHeader } from "@/components/proyectos/ui";

export function EstructuraIndicadores({
  proyectoId,
  objetivoId,
  canEdit,
}: {
  proyectoId: string;
  objetivoId: string;
  canEdit: boolean;
}) {
  const query = useProjectIndicators(proyectoId);
  const remove = useDeleteIndicator(proyectoId);
  const [abierto, setAbierto] = useState<string | null>(null);

  if (query.isError) {
    return (
      <InlineError
        message={errorMessage(query.error, "No pudimos cargar los indicadores. Inténtalo de nuevo.")}
        className="mt-2"
      />
    );
  }
  if (!query.data) return <Skeleton className="mt-2 h-8 w-full rounded-[10px]" />;

  const propios = query.data.filter((i) => i.objetivo_id === objetivoId);

  return (
    <div className="mt-3">
      <SectionHeader as="h4">Indicadores</SectionHeader>
      {propios.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-ink-500">Sin indicadores.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {propios.map((indicador) =>
            abierto === indicador.id ? (
              <li key={indicador.id}>
                <IndicatorForm
                  proyectoId={proyectoId}
                  objetivoId={objetivoId}
                  indicador={indicador}
                  onDone={() => setAbierto(null)}
                />
              </li>
            ) : (
              <li
                key={indicador.id}
                data-testid="estructura-indicador"
                className="flex items-start justify-between gap-2 text-[12.5px] text-ink-800"
              >
                <p className="min-w-0">
                  <span className="font-mono text-[11px] text-ink-500 tabular-nums">{indicador.codigo}</span>{" "}
                  <span className="font-semibold">{indicador.nombre}</span>
                  <span className="text-ink-600">
                    {" "}
                    · Meta {formatCantidad(indicador.meta)} {indicador.unidad}
                    {indicador.linea_base !== null && ` · Línea base ${formatCantidad(indicador.linea_base)}`}
                  </span>
                </p>
                {canEdit && (
                  <RowActions
                    nombre={`indicador ${indicador.codigo}`}
                    deleting={remove.isPending && remove.variables === indicador.id}
                    onEdit={() => setAbierto(indicador.id)}
                    onDelete={() => remove.mutate(indicador.id)}
                  />
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {remove.isError && (
        <InlineError
          message={errorMessage(remove.error, "No pudimos eliminar el indicador. Inténtalo de nuevo.")}
          className="mt-1.5"
        />
      )}

      {canEdit &&
        (abierto === "new" ? (
          <IndicatorForm proyectoId={proyectoId} objetivoId={objetivoId} onDone={() => setAbierto(null)} />
        ) : (
          abierto === null && <AddButton label="Agregar indicador" onClick={() => setAbierto("new")} />
        ))}
    </div>
  );
}

function IndicatorForm({
  proyectoId,
  objetivoId,
  indicador,
  onDone,
}: {
  proyectoId: string;
  objetivoId: string;
  indicador?: ProjectIndicator;
  onDone: () => void;
}) {
  const create = useCreateIndicator(proyectoId);
  const update = useUpdateIndicator(proyectoId);
  const mutation = indicador ? update : create;
  const [codigo, setCodigo] = useState(indicador?.codigo ?? "");
  const [nombre, setNombre] = useState(indicador?.nombre ?? "");
  const [meta, setMeta] = useState(indicador?.meta ?? "");
  const [unidad, setUnidad] = useState(indicador?.unidad ?? "");
  const [base, setBase] = useState(indicador?.linea_base ?? "");
  const [local, setLocal] = useState<string | null>(null);

  function submit() {
    const metaNum = parseNumber(meta);
    const baseNum = parseNumber(base);
    if (metaNum === null || (base.trim() !== "" && baseNum === null)) {
      setLocal(INVALID_NUMBER);
      return;
    }
    setLocal(null);
    const data = { codigo, nombre, meta: metaNum, unidad };
    if (indicador) {
      update.mutate({ id: indicador.id, data: { ...data, linea_base: baseNum } }, { onSuccess: onDone });
    } else {
      create.mutate(
        { objetivo_id: objetivoId, ...data, ...(baseNum === null ? {} : { linea_base: baseNum }) },
        { onSuccess: onDone },
      );
    }
  }

  return (
    <StructureForm
      label={indicador ? `Editar indicador ${indicador.codigo}` : "Nuevo indicador"}
      pending={mutation.isPending}
      error={formError(local, mutation.error, mutation.isError, "No pudimos guardar el indicador. Inténtalo de nuevo.")}
      onSubmit={submit}
      onCancel={onDone}
    >
      <TextField label="Código" value={codigo} onChange={setCodigo} />
      <TextField label="Nombre" value={nombre} onChange={setNombre} />
      <TextField label="Meta" value={meta} onChange={setMeta} inputMode="decimal" />
      <TextField label="Unidad" value={unidad} onChange={setUnidad} />
      <TextField label="Línea base (opcional)" value={base} onChange={setBase} inputMode="decimal" />
    </StructureForm>
  );
}
