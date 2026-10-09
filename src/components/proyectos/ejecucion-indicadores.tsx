// Indicadores en "Ejecución técnica" (S4 U7): por indicador, su meta, la última
// lectura con su tendencia, el historial de mediciones y el formulario para
// registrar una nueva. Anular es solo para gestores; la API es la autoridad.

"use client";

import { useState } from "react";
import { LoaderCircle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToneBadge } from "@/components/crm/shared";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { VoidControl, errorMessage, formError, parseNumber } from "@/components/proyectos/estructura-ui";
import { InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  useCreateMedicion,
  useIndicatorMeasurements,
  useProjectIndicators,
  useVoidMedicion,
  type ProjectIndicator,
  type ProjectMedicion,
  type Tendencia,
} from "@/hooks/projects";
import { todayInBogota } from "@/lib/proyectos/weeks";

const MEDICIONES_ERROR = "No pudimos cargar las mediciones. Inténtalo de nuevo.";

const TENDENCIA_META: Record<Tendencia, { label: string; Icon: typeof TrendingUp; className: string }> = {
  sube: { label: "Sube", Icon: TrendingUp, className: "text-exito" },
  baja: { label: "Baja", Icon: TrendingDown, className: "text-destructivo" },
  igual: { label: "Igual", Icon: Minus, className: "text-ink-500" },
};

function formatNumero(value: string): string {
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n)
    : value;
}

export function EjecucionIndicadores({
  proyectoId,
  canWrite,
  canVoid,
}: {
  proyectoId: string;
  canWrite: boolean;
  canVoid: boolean;
}) {
  const query = useProjectIndicators(proyectoId);

  return (
    <div className="mt-3">
      <SectionHeader as="h4">Indicadores</SectionHeader>
      {query.isError ? (
        <InlineError
          message={errorMessage(query.error, "No pudimos cargar los indicadores. Inténtalo de nuevo.")}
          className="mt-1.5"
        />
      ) : !query.data ? (
        <Skeleton className="mt-2 h-16 w-full rounded-[12px]" />
      ) : query.data.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-ink-500">Este proyecto todavía no tiene indicadores.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {query.data.map((indicador) => (
            <IndicadorCard
              key={indicador.id}
              proyectoId={proyectoId}
              indicador={indicador}
              canWrite={canWrite}
              canVoid={canVoid}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function IndicadorCard({
  proyectoId,
  indicador,
  canWrite,
  canVoid,
}: {
  proyectoId: string;
  indicador: ProjectIndicator;
  canWrite: boolean;
  canVoid: boolean;
}) {
  const query = useIndicatorMeasurements(proyectoId, indicador.id);
  const remove = useVoidMedicion(proyectoId, indicador.id);
  const [abierto, setAbierto] = useState(false);

  const mediciones = query.data?.mediciones ?? [];
  const ultima = query.data?.ultima ?? null;
  const tendencia = query.data?.tendencia ?? null;

  return (
    <li
      data-testid="ejecucion-indicador"
      className="rounded-[12px] border border-ink-200 bg-panel p-2.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] text-ink-900">
          <span className="font-mono text-[11px] text-ink-500 tabular-nums">{indicador.codigo}</span>{" "}
          <span className="font-semibold">{indicador.nombre}</span>
        </p>
        <span className="text-[12px] text-ink-600">
          Meta {formatNumero(indicador.meta)} {indicador.unidad}
        </span>
      </div>

      {query.isError ? (
        <InlineError message={errorMessage(query.error, MEDICIONES_ERROR)} className="mt-1.5" />
      ) : !query.data ? (
        <Skeleton className="mt-2 h-8 w-full rounded-[10px]" />
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span data-testid="ejecucion-ultima" className="text-ink-700">
              Última: {ultima ? `${formatNumero(ultima.valor)} ${indicador.unidad}` : "sin mediciones"}
            </span>
            {ultima && tendencia && (
              <span
                data-testid="ejecucion-tendencia"
                className={`inline-flex items-center gap-1 font-semibold ${TENDENCIA_META[tendencia].className}`}
              >
                {(() => {
                  const { Icon } = TENDENCIA_META[tendencia];
                  return <Icon className="size-3.5" strokeWidth={2} />;
                })()}
                {TENDENCIA_META[tendencia].label}
              </span>
            )}
          </div>

          {mediciones.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-ink-500">Sin mediciones registradas.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {mediciones.map((medicion) => (
                <MedicionRow
                  key={medicion.id}
                  medicion={medicion}
                  unidad={indicador.unidad}
                  canVoid={canVoid}
                  deleting={remove.isPending && remove.variables?.id === medicion.id}
                  error={
                    remove.isError && remove.variables?.id === medicion.id
                      ? errorMessage(remove.error, "No pudimos anular la medición.")
                      : null
                  }
                  onVoid={(motivo) => remove.mutate({ id: medicion.id, motivo })}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {canWrite &&
        (abierto ? (
          <MedicionForm
            proyectoId={proyectoId}
            indicador={indicador}
            onDone={() => setAbierto(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setAbierto(true)}
          >
            Registrar medición
          </Button>
        ))}
    </li>
  );
}

function MedicionRow({
  medicion,
  unidad,
  canVoid,
  deleting,
  error,
  onVoid,
}: {
  medicion: ProjectMedicion;
  unidad: string;
  canVoid: boolean;
  deleting: boolean;
  error: string | null;
  onVoid: (motivo: string) => void;
}) {
  const anulada = medicion.anulado_at !== null;
  return (
    <li
      data-testid="ejecucion-medicion"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] bg-ink-100 px-2.5 py-1.5 text-[12.5px]"
    >
      <span className="text-ink-700">
        <span className="font-mono text-[11px] text-ink-500 tabular-nums">
          {formatFechaCalendario(medicion.fecha)}
        </span>{" "}
        <span className={anulada ? "text-ink-500 line-through" : "font-semibold text-ink-900"}>
          {formatNumero(medicion.valor)} {unidad}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {anulada && <ToneBadge tone="neutro" label="Anulada" />}
        {error && <InlineError message={error} />}
        {canVoid && !anulada && (
          <VoidControl nombre={`medición ${formatFechaCalendario(medicion.fecha)}`} pending={deleting} error={null} onConfirm={onVoid} />
        )}
      </span>
    </li>
  );
}

function MedicionForm({
  proyectoId,
  indicador,
  onDone,
}: {
  proyectoId: string;
  indicador: ProjectIndicator;
  onDone: () => void;
}) {
  const create = useCreateMedicion(proyectoId, indicador.id);
  const [fecha, setFecha] = useState(todayInBogota());
  const [valor, setValor] = useState("");
  const [observacion, setObservacion] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const base = `medicion-${indicador.id}`;

  function submit() {
    if (fecha === "") {
      setLocal("La fecha es obligatoria.");
      return;
    }
    if (fecha > todayInBogota()) {
      setLocal("La fecha de la medición no puede ser posterior a hoy.");
      return;
    }
    const valorNum = parseNumber(valor);
    if (valorNum === null || valorNum < 0) {
      setLocal("Ingresa un valor válido (mayor o igual a 0).");
      return;
    }
    setLocal(null);
    create.mutate(
      {
        fecha,
        valor: valorNum,
        ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      aria-label={`Registrar medición ${indicador.codigo}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-2 grid gap-2.5 rounded-[14px] border border-ink-200 bg-ink-100 p-3 sm:grid-cols-2"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${base}-fecha`} className="text-[12px] text-ink-600">
          Fecha
        </Label>
        <Input
          id={`${base}-fecha`}
          type="date"
          max={todayInBogota()}
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          className="h-9 rounded-12 bg-panel px-3"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${base}-valor`} className="text-[12px] text-ink-600">
          Valor
        </Label>
        <Input
          id={`${base}-valor`}
          inputMode="decimal"
          value={valor}
          onChange={(event) => setValor(event.target.value)}
          className="h-9 rounded-12 bg-panel px-3"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <Label htmlFor={`${base}-obs`} className="text-[12px] text-ink-600">
          Observación (opcional)
        </Label>
        <textarea
          id={`${base}-obs`}
          value={observacion}
          onChange={(event) => setObservacion(event.target.value)}
          className="min-h-14 rounded-12 border border-ink-200 bg-panel px-3 py-2 text-[13px] text-ink-900"
        />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={create.isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
      <InlineError
        message={formError(local, create.error, create.isError, "No pudimos registrar la medición. Inténtalo de nuevo.")}
        className="sm:col-span-2"
      />
    </form>
  );
}
