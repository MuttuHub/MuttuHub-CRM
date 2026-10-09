// Beneficiarios en "Ejecución técnica" (S4 U7): total vivo contra la meta (dos
// números planos), el historial de registros y el formulario para registrar un
// conteo. Anular es solo para gestores; la API es la autoridad del permiso.

"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToneBadge } from "@/components/crm/shared";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { VoidControl, errorMessage, formError, parseNumber } from "@/components/proyectos/estructura-ui";
import { EmptyBlock, InlineError, SectionHeader } from "@/components/proyectos/ui";
import {
  useCreateBeneficiario,
  useProjectActivities,
  useProjectBeneficiaries,
  useVoidBeneficiario,
  type ProjectBeneficiario,
  type ProjectListRow,
} from "@/hooks/projects";
import { todayInBogota } from "@/lib/proyectos/weeks";

const BENEFICIARIOS_ERROR = "No pudimos cargar los beneficiarios. Inténtalo de nuevo.";
const SIN_ACTIVIDAD = "";

function formatEntero(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
}

export function EjecucionBeneficiarios({
  proyecto,
  canWrite,
  canVoid,
}: {
  proyecto: ProjectListRow;
  canWrite: boolean;
  canVoid: boolean;
}) {
  const query = useProjectBeneficiaries(proyecto.id);
  const remove = useVoidBeneficiario(proyecto.id);
  const [abierto, setAbierto] = useState(false);

  const total = query.data?.total ?? 0;
  const registros = query.data?.registros ?? [];

  return (
    <div className="mt-3">
      <SectionHeader as="h4">Beneficiarios</SectionHeader>

      {query.isError ? (
        <InlineError
          message={errorMessage(query.error, BENEFICIARIOS_ERROR)}
          className="mt-1.5"
        />
      ) : !query.data ? (
        <Skeleton className="mt-2 h-12 w-full rounded-[12px]" />
      ) : (
        <>
          <p data-testid="ejecucion-beneficiarios-total" className="mt-1.5 text-[13px] text-ink-800">
            {proyecto.beneficiarios_meta !== null
              ? `${formatEntero(total)} de ${formatEntero(proyecto.beneficiarios_meta)}`
              : formatEntero(total)}
            <span className="text-ink-500"> beneficiarios</span>
          </p>

          {registros.length === 0 ? (
            <EmptyBlock>Sin registros de beneficiarios.</EmptyBlock>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {registros.map((registro) => (
                <RegistroRow
                  key={registro.id}
                  registro={registro}
                  canVoid={canVoid}
                  deleting={remove.isPending && remove.variables?.id === registro.id}
                  error={
                    remove.isError && remove.variables?.id === registro.id
                      ? errorMessage(remove.error, "No pudimos anular el registro.")
                      : null
                  }
                  onVoid={(motivo) => remove.mutate({ id: registro.id, motivo })}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {canWrite &&
        (abierto ? (
          <BeneficiarioForm proyectoId={proyecto.id} onDone={() => setAbierto(false)} />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setAbierto(true)}
          >
            Registrar beneficiarios
          </Button>
        ))}
    </div>
  );
}

function RegistroRow({
  registro,
  canVoid,
  deleting,
  error,
  onVoid,
}: {
  registro: ProjectBeneficiario;
  canVoid: boolean;
  deleting: boolean;
  error: string | null;
  onVoid: (motivo: string) => void;
}) {
  const anulado = registro.anulado_at !== null;
  return (
    <li
      data-testid="ejecucion-beneficiario"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] bg-ink-100 px-2.5 py-1.5 text-[12.5px]"
    >
      <span className="text-ink-700">
        <span className="font-mono text-[11px] text-ink-500 tabular-nums">
          {formatFechaCalendario(registro.fecha)}
        </span>{" "}
        <span className={anulado ? "text-ink-500 line-through" : "font-semibold text-ink-900"}>
          {formatEntero(registro.cantidad)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {anulado && <ToneBadge tone="neutro" label="Anulado" />}
        {error && <InlineError message={error} />}
        {canVoid && !anulado && (
          <VoidControl
            nombre={`registro ${formatFechaCalendario(registro.fecha)}`}
            pending={deleting}
            error={null}
            onConfirm={onVoid}
          />
        )}
      </span>
    </li>
  );
}

function BeneficiarioForm({ proyectoId, onDone }: { proyectoId: string; onDone: () => void }) {
  const create = useCreateBeneficiario(proyectoId);
  const activities = useProjectActivities(proyectoId);
  const [fecha, setFecha] = useState(todayInBogota());
  const [cantidad, setCantidad] = useState("");
  const [actividad, setActividad] = useState(SIN_ACTIVIDAD);
  const [observacion, setObservacion] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const base = "beneficiario";

  const actividades = activities.data ?? [];

  function submit() {
    if (fecha === "") {
      setLocal("La fecha es obligatoria.");
      return;
    }
    if (fecha > todayInBogota()) {
      setLocal("La fecha del registro no puede ser posterior a hoy.");
      return;
    }
    const cantidadNum = parseNumber(cantidad);
    if (cantidadNum === null || !Number.isInteger(cantidadNum) || cantidadNum <= 0) {
      setLocal("La cantidad debe ser un número entero mayor que 0.");
      return;
    }
    setLocal(null);
    create.mutate(
      {
        fecha,
        cantidad: cantidadNum,
        ...(actividad !== SIN_ACTIVIDAD ? { actividad_id: actividad } : {}),
        ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      aria-label="Registrar beneficiarios"
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
        <Label htmlFor={`${base}-cantidad`} className="text-[12px] text-ink-600">
          Cantidad
        </Label>
        <Input
          id={`${base}-cantidad`}
          inputMode="numeric"
          value={cantidad}
          onChange={(event) => setCantidad(event.target.value)}
          className="h-9 rounded-12 bg-panel px-3"
        />
      </div>
      {actividades.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${base}-actividad`} className="text-[12px] text-ink-600">
            Actividad (opcional)
          </Label>
          <select
            id={`${base}-actividad`}
            value={actividad}
            onChange={(event) => setActividad(event.target.value)}
            className="h-9 rounded-12 border border-ink-200 bg-panel px-3 text-[13px] text-ink-900"
          >
            <option value={SIN_ACTIVIDAD}>Sin actividad</option>
            {actividades.map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} · {item.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
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
        message={formError(local, create.error, create.isError, "No pudimos registrar los beneficiarios. Inténtalo de nuevo.")}
        className="sm:col-span-2"
      />
    </form>
  );
}
