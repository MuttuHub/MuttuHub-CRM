// Formulario «Registrar avance» de una ACTIVIDAD (AJ-01; redesign T2, Interacciones-Actividades tabla 4):
// fecha del avance (máximo hoy en Bogotá), avance TOTAL de la actividad en %, qué se hizo (obligatorio) y un
// soporte opcional (archivo o enlace). The API has no soporte on create, so the report is created first and
// the soporte is attached right after; if that upload fails the report stays saved without it.
//
// The API stays the authority for every rule (it answers 409 with the exact text). This form only checks
// what it can see, in the API's order, and shows each error under its field: the date, a percentage in
// (0, 100], above the last live report, and the tope while the deliverables are not complete (live, with
// «Guardar avance» disabled above it). `EjecucionAvanceForm` (per entregable) is a different form.

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HelpHint } from "@/components/ui/help-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, parseNumber } from "@/components/proyectos/estructura-ui";
import { SelectorArchivo } from "@/components/proyectos/selector-archivo";
import { CAPTURE_BUTTON, CAPTURE_FIELD, CAPTURE_TEXTAREA, InlineError } from "@/components/proyectos/ui";
import {
  useAttachActivityReportMedio,
  useCreateActivityReport,
  type AvanceMedioInput,
  type ProjectActivity,
} from "@/hooks/projects";
import { todayInBogota } from "@/lib/proyectos/weeks";
import { cn } from "@/lib/utils";
import { avisoTope, ayudaTope, formatNumero } from "@/components/proyectos/ficha/actividades/formato";

const FORMATOS = /\.(pdf|docx|xlsx|pptx|jpe?g|png)$/i;
const MSG_FORMATO = "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.";
const MSG_URL = "El enlace debe ser una URL https válida (máximo 2000 caracteres).";
const MSG_PORCENTAJE = "El porcentaje debe ser mayor que 0 y menor o igual a 100.";
export const SOPORTE_FALLIDO_TEXT =
  "El avance quedó guardado, pero no pudimos subir el soporte. Adjúntalo desde el historial con «Adjuntar soporte».";

type CampoId = "fecha" | "porcentaje" | "observacion" | "soporte";
type Errores = Partial<Record<CampoId, string>>;

export function ReporteActividadForm({
  projectId,
  actividad,
  actual,
  tope,
  ultimo = null,
  onDone,
  onSaved,
}: {
  projectId: string;
  actividad: ProjectActivity;
  /** Where the activity is today (%), for the hint. */
  actual: number;
  /** Highest % reachable with reports: `tope_en_curso` while the deliverables are incomplete, else 100. */
  tope: number;
  /** % of the latest live report: a new one must be above it. */
  ultimo?: number | null;
  /** Closes the form (Cancelar, or after saving). */
  onDone: () => void;
  /** After the report is saved (and its soporte attached or not). */
  onSaved?: (resultado: { reporteId: string; porcentaje: number; soporteFallido: boolean }) => void;
}) {
  const create = useCreateActivityReport(projectId, actividad.id);
  const attach = useAttachActivityReportMedio(projectId, actividad.id);
  const prefijo = useId();
  const ids = {
    fecha: `${prefijo}-fecha`,
    porcentaje: `${prefijo}-porcentaje`,
    observacion: `${prefijo}-obs`,
    soporte: `${prefijo}-archivo`,
    url: `${prefijo}-url`,
    nombre: `${prefijo}-nombre`,
  };

  const [fecha, setFecha] = useState(todayInBogota());
  const [porcentaje, setPorcentaje] = useState("");
  const [observacion, setObservacion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [conEnlace, setConEnlace] = useState(false);
  const [url, setUrl] = useState("");
  const [nombreEnlace, setNombreEnlace] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const enviando = create.isPending || attach.isPending;

  const fechaRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fechaRef.current?.focus();
  }, []);

  const tecleado = parseNumber(porcentaje);
  const topeVivo = tope < 100;
  const sobreTope = topeVivo && tecleado !== null && tecleado > tope && tecleado <= 100;

  function leerSoporte(): { soporte: AvanceMedioInput | null; error?: string } {
    if (archivo) {
      return FORMATOS.test(archivo.name) ? { soporte: { tipo: "archivo", file: archivo } } : { soporte: null, error: MSG_FORMATO };
    }
    if (conEnlace && (url.trim() !== "" || nombreEnlace.trim() !== "")) {
      const limpio = url.trim();
      if (!/^https:\/\/\S+\.\S+/.test(limpio) || limpio.length > 2000) return { soporte: null, error: MSG_URL };
      if (nombreEnlace.trim() === "") return { soporte: null, error: "Completa el enlace y su nombre." };
      return { soporte: { tipo: "enlace", url_externa: limpio, nombre: nombreEnlace.trim() } };
    }
    return { soporte: null };
  }

  function submit() {
    const nuevos: Errores = {};
    if (fecha === "") nuevos.fecha = "La fecha es obligatoria.";
    else if (fecha > todayInBogota()) nuevos.fecha = "La fecha del avance no puede ser posterior a hoy.";
    if (tecleado === null || tecleado <= 0 || tecleado > 100) nuevos.porcentaje = MSG_PORCENTAJE;
    else if (ultimo !== null && tecleado <= ultimo)
      nuevos.porcentaje = `El avance debe ser mayor que el último reportado (${formatNumero(ultimo)} %).`;
    else if (topeVivo && tecleado > tope)
      nuevos.porcentaje = `El avance máximo sin entregables completos es ${formatNumero(tope)} %.`;
    if (observacion.trim() === "") nuevos.observacion = "La observación es obligatoria.";
    const { soporte, error: errorSoporte } = leerSoporte();
    if (errorSoporte) nuevos.soporte = errorSoporte;

    setErrores(nuevos);
    const primero = (["fecha", "porcentaje", "observacion", "soporte"] as const).find((campo) => nuevos[campo]);
    if (primero) {
      document.getElementById(primero === "soporte" && conEnlace && !archivo ? ids.url : ids[primero])?.focus();
      return;
    }

    const valor = tecleado as number;
    create.mutate(
      { fecha, porcentaje: valor, observacion: observacion.trim() },
      {
        onSuccess: ({ reporte }) => {
          if (!soporte) {
            onSaved?.({ reporteId: reporte.id, porcentaje: valor, soporteFallido: false });
            onDone();
            return;
          }
          attach.mutate(
            { reportId: reporte.id, soporte },
            {
              onSettled: (_data, error) => {
                onSaved?.({ reporteId: reporte.id, porcentaje: valor, soporteFallido: Boolean(error) });
                onDone();
              },
            },
          );
        },
      },
    );
  }

  const describir = (campo: CampoId, extra?: string) =>
    [extra, errores[campo] ? `${prefijo}-${campo}-error` : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <form
      aria-label={`Registrar avance ${actividad.codigo}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="grid min-w-0 gap-3 rounded-inner border border-border bg-panel p-3 sm:grid-cols-2"
    >
      <Campo id={ids.fecha} label="Fecha del avance" error={errores.fecha} errorId={`${prefijo}-fecha-error`}>
        <Input
          ref={fechaRef}
          id={ids.fecha}
          type="date"
          max={todayInBogota()}
          value={fecha}
          aria-invalid={Boolean(errores.fecha) || undefined}
          aria-describedby={describir("fecha")}
          onChange={(event) => setFecha(event.target.value)}
          className={CAPTURE_FIELD}
        />
      </Campo>

      <Campo
        id={ids.porcentaje}
        label="Avance total de la actividad (%)"
        ayuda={
          <HelpHint label="Avance total de la actividad" className="after:-inset-3">
            Escribe el total al que llega la actividad, no lo que sumas con este avance. {topeVivo ? ayudaTope(tope) : ""}
          </HelpHint>
        }
        error={errores.porcentaje}
        errorId={`${prefijo}-porcentaje-error`}
      >
        <Input
          id={ids.porcentaje}
          inputMode="decimal"
          value={porcentaje}
          aria-invalid={sobreTope || Boolean(errores.porcentaje) || undefined}
          aria-describedby={describir("porcentaje", `${prefijo}-porcentaje-pista`)}
          onChange={(event) => {
            setPorcentaje(event.target.value);
            setErrores((actuales) => ({ ...actuales, porcentaje: undefined }));
          }}
          className={cn(CAPTURE_FIELD, sobreTope && "border-destructivo")}
        />
        <p id={`${prefijo}-porcentaje-pista`} className="text-[12px] text-ink-600">
          {topeVivo
            ? `Hoy va en ${formatNumero(actual)} %. Escribe hasta dónde llega con este avance; con avances se llega como máximo al ${formatNumero(tope)} %.`
            : `Hoy va en ${formatNumero(actual)} %. Sus entregables están completos: puede llegar hasta 100 %.`}
        </p>
        {sobreTope && (
          <p role="alert" className="rounded-12 bg-destructivo-bg px-2.5 py-1.5 text-[12.5px] text-destructivo">
            {avisoTope(tope)}
          </p>
        )}
      </Campo>

      <div className="sm:col-span-2">
        <Campo
          id={ids.observacion}
          label="Qué se hizo"
          error={errores.observacion}
          errorId={`${prefijo}-observacion-error`}
        >
          <textarea
            id={ids.observacion}
            value={observacion}
            placeholder="Ejemplo: segunda visita de acompañamiento a dos unidades."
            aria-invalid={Boolean(errores.observacion) || undefined}
            aria-describedby={describir("observacion")}
            onChange={(event) => setObservacion(event.target.value)}
            className={CAPTURE_TEXTAREA}
          />
        </Campo>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
        <legend className="mb-1 text-[12px] text-ink-600">
          Soporte <span className="text-ink-500">(opcional)</span>
        </legend>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Label htmlFor={ids.soporte} className="sr-only">
            Archivo del soporte
          </Label>
          <SelectorArchivo id={ids.soporte} accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png" onChange={setArchivo} />
          <span aria-hidden="true" className="text-ink-500">
            ·
          </span>
          <button
            type="button"
            aria-expanded={conEnlace}
            onClick={() => setConEnlace((value) => !value)}
            className="relative inline-flex min-h-11 items-center rounded-12 text-[12.5px] font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
          >
            o pega un enlace
          </button>
        </div>
        {conEnlace && (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor={ids.url} className="text-[12px] text-ink-600">
                URL del enlace
              </Label>
              <Input
                id={ids.url}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className={CAPTURE_FIELD}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor={ids.nombre} className="text-[12px] text-ink-600">
                Nombre del enlace
              </Label>
              <Input
                id={ids.nombre}
                value={nombreEnlace}
                onChange={(event) => setNombreEnlace(event.target.value)}
                className={CAPTURE_FIELD}
              />
            </div>
          </div>
        )}
        {errores.soporte && (
          <p id={`${prefijo}-soporte-error`} role="alert" className="text-[12.5px] text-destructivo">
            {errores.soporte}
          </p>
        )}
        <p className="text-[12px] text-ink-600">Puedes guardarlo sin soporte y adjuntarlo después desde el historial.</p>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className={CAPTURE_BUTTON} disabled={enviando} onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" className={CAPTURE_BUTTON} disabled={enviando || sobreTope}>
          Guardar avance
        </Button>
      </div>
      <InlineError
        message={create.isError ? errorMessage(create.error, "No pudimos registrar el avance. Inténtalo de nuevo.") : null}
        className="sm:col-span-2"
      />
    </form>
  );
}

function Campo({
  id,
  label,
  ayuda,
  error,
  errorId,
  children,
}: {
  id: string;
  label: string;
  ayuda?: ReactNode;
  error?: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-[12px] text-ink-600">
          {label}
        </Label>
        {ayuda}
      </span>
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-[12.5px] text-destructivo">
          {error}
        </p>
      )}
    </div>
  );
}
