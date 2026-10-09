// Formulario de avance (S4 U7): fecha (tope hoy en Bogotá), cantidad,
// observación, justificación del exceso (solo cuando la suma superaría la meta)
// y UN medio: archivo (firma -> subida -> confirmación) o enlace https. La API
// es la autoridad del permiso y del tope; aquí solo se evita el viaje obvio.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INVALID_NUMBER, formError, parseNumber } from "@/components/proyectos/estructura-ui";
import { CAPTURE_BUTTON, CAPTURE_CHOICE, CAPTURE_FIELD, CAPTURE_TEXTAREA, InlineError } from "@/components/proyectos/ui";
import {
  useCreateAvance,
  type AvanceMedioInput,
  type ProjectAvance,
  type ProjectDeliverable,
} from "@/hooks/projects";
import { todayInBogota } from "@/lib/proyectos/weeks";

type TipoMedio = "ninguno" | "archivo" | "enlace";

export function EjecucionAvanceForm({
  projectId,
  entregable,
  meta,
  avances,
  onDone,
}: {
  projectId: string;
  entregable: ProjectDeliverable;
  meta: string;
  avances: ProjectAvance[];
  onDone: () => void;
}) {
  const create = useCreateAvance(projectId, entregable.id);
  const [fecha, setFecha] = useState(todayInBogota());
  const [cantidad, setCantidad] = useState("");
  const [observacion, setObservacion] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [tipoMedio, setTipoMedio] = useState<TipoMedio>("ninguno");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [nombreEnlace, setNombreEnlace] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  // La API suma TODOS los avances no anulados (con o sin medio) contra la meta.
  const acumulado = avances
    .filter((avance) => avance.anulado_at === null)
    .reduce((sum, avance) => sum + Number(avance.cantidad), 0);
  const cantidadNum = parseNumber(cantidad);
  const wouldExceed = cantidadNum !== null && acumulado + cantidadNum > Number(meta);

  function submit() {
    if (fecha === "") {
      setLocal("La fecha es obligatoria.");
      return;
    }
    if (fecha > todayInBogota()) {
      setLocal("La fecha del avance no puede ser posterior a hoy.");
      return;
    }
    if (cantidadNum === null || cantidadNum <= 0) {
      setLocal(INVALID_NUMBER);
      return;
    }
    if (wouldExceed && justificacion.trim() === "") {
      setLocal("Indica una justificación del exceso.");
      return;
    }

    let medio: AvanceMedioInput | undefined;
    if (tipoMedio === "archivo") {
      if (!archivo) {
        setLocal("Adjunta el archivo del medio.");
        return;
      }
      medio = { tipo: "archivo", file: archivo };
    } else if (tipoMedio === "enlace") {
      if (url.trim() === "" || nombreEnlace.trim() === "") {
        setLocal("Completa el enlace y su nombre.");
        return;
      }
      medio = { tipo: "enlace", url_externa: url.trim(), nombre: nombreEnlace.trim() };
    }

    setLocal(null);
    create.mutate(
      {
        fecha,
        cantidad: cantidadNum,
        ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
        ...(wouldExceed && justificacion.trim() ? { justificacion_exceso: justificacion.trim() } : {}),
        ...(medio ? { medio } : {}),
      },
      { onSuccess: onDone },
    );
  }

  const nombreMedio = `medio-${entregable.id}`;

  return (
    <form
      aria-label={`Registrar avance ${entregable.codigo}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-2 grid gap-2.5 rounded-[14px] border border-ink-200 bg-panel p-3 sm:grid-cols-2"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${nombreMedio}-fecha`} className="text-[12px] text-ink-600">
          Fecha
        </Label>
        <Input
          id={`${nombreMedio}-fecha`}
          type="date"
          max={todayInBogota()}
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          className={CAPTURE_FIELD}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${nombreMedio}-cantidad`} className="text-[12px] text-ink-600">
          Cantidad
        </Label>
        <Input
          id={`${nombreMedio}-cantidad`}
          inputMode="decimal"
          value={cantidad}
          onChange={(event) => setCantidad(event.target.value)}
          className={CAPTURE_FIELD}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <Label htmlFor={`${nombreMedio}-obs`} className="text-[12px] text-ink-600">
          Observación (opcional)
        </Label>
        <textarea
          id={`${nombreMedio}-obs`}
          value={observacion}
          onChange={(event) => setObservacion(event.target.value)}
          className={CAPTURE_TEXTAREA}
        />
      </div>

      {wouldExceed && (
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <Label htmlFor={`${nombreMedio}-just`} className="text-[12px] text-alerta">
            Justificación del exceso
          </Label>
          <textarea
            id={`${nombreMedio}-just`}
            value={justificacion}
            onChange={(event) => setJustificacion(event.target.value)}
            className={CAPTURE_TEXTAREA}
          />
        </div>
      )}

      <fieldset className="sm:col-span-2">
        <legend className="text-[12px] text-ink-600">Medio de verificación</legend>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          {(
            [
              ["ninguno", "Sin medio"],
              ["archivo", "Archivo"],
              ["enlace", "Enlace"],
            ] as const
          ).map(([valor, label]) => (
            <label key={valor} className={CAPTURE_CHOICE}>
              <input
                type="radio"
                name={nombreMedio}
                value={valor}
                checked={tipoMedio === valor}
                onChange={() => setTipoMedio(valor)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {tipoMedio === "archivo" && (
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <Label htmlFor={`${nombreMedio}-archivo`} className="text-[12px] text-ink-600">
            Archivo del medio
          </Label>
          <input
            id={`${nombreMedio}-archivo`}
            type="file"
            onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
            className="min-h-11 text-[12.5px] text-ink-800 md:min-h-0"
          />
        </div>
      )}

      {tipoMedio === "enlace" && (
        <>
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor={`${nombreMedio}-url`} className="text-[12px] text-ink-600">
              URL
            </Label>
            <Input
              id={`${nombreMedio}-url`}
              type="url"
              placeholder="https://"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className={CAPTURE_FIELD}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor={`${nombreMedio}-nombre`} className="text-[12px] text-ink-600">
              Nombre del enlace
            </Label>
            <Input
              id={`${nombreMedio}-nombre`}
              value={nombreEnlace}
              onChange={(event) => setNombreEnlace(event.target.value)}
              className={CAPTURE_FIELD}
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" className={CAPTURE_BUTTON} disabled={create.isPending}>
          Registrar avance
        </Button>
        <Button type="button" size="sm" variant="ghost" className={CAPTURE_BUTTON} disabled={create.isPending} onClick={onDone}>
          Cancelar
        </Button>
      </div>
      <InlineError
        message={formError(local, create.error, create.isError, "No pudimos registrar el avance. Inténtalo de nuevo.")}
        className="sm:col-span-2"
      />
    </form>
  );
}
