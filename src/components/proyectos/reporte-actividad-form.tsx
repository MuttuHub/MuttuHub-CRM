// Formulario de "Registrar avance" a nivel ACTIVIDAD (AJ-01, S2/S3): fecha (tope hoy en
// Bogotá), porcentaje de avance (0-100) y una observación OBLIGATORIA que explique qué se
// ejecutó y qué falta. A diferencia de `EjecucionAvanceForm` (por entregable): aquí la
// observación es obligatoria, no hay justificación de exceso y no hay medio en la creación —
// el medio se adjunta después con `AdjuntarArchivoControl` (S11). La API es la única
// autoridad de las reglas de negocio (mayor que el último reportado, tope sin entregables
// completos); este formulario solo valida lo obvio (campos vacíos) y muestra el 409 del
// servidor tal cual, igual que el resto de formularios de esta app.

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INVALID_NUMBER, formError, parseNumber } from "@/components/proyectos/estructura-ui";
import { CAPTURE_BUTTON, CAPTURE_FIELD, CAPTURE_TEXTAREA, InlineError } from "@/components/proyectos/ui";
import { useCreateActivityReport, type ProjectActivity } from "@/hooks/projects";
import { todayInBogota } from "@/lib/proyectos/weeks";

export function ReporteActividadForm({
  projectId,
  actividad,
  onDone,
}: {
  projectId: string;
  actividad: ProjectActivity;
  onDone: () => void;
}) {
  const create = useCreateActivityReport(projectId, actividad.id);
  const [fecha, setFecha] = useState(todayInBogota());
  const [porcentaje, setPorcentaje] = useState("");
  const [observacion, setObservacion] = useState("");
  const [local, setLocal] = useState<string | null>(null);

  function submit() {
    if (fecha === "") {
      setLocal("La fecha es obligatoria.");
      return;
    }
    if (fecha > todayInBogota()) {
      setLocal("La fecha del avance no puede ser posterior a hoy.");
      return;
    }
    const porcentajeNum = parseNumber(porcentaje);
    if (porcentajeNum === null || porcentajeNum <= 0 || porcentajeNum > 100) {
      setLocal(INVALID_NUMBER);
      return;
    }
    if (observacion.trim() === "") {
      setLocal("La observación es obligatoria.");
      return;
    }

    setLocal(null);
    create.mutate(
      { fecha, porcentaje: porcentajeNum, observacion: observacion.trim() },
      { onSuccess: onDone },
    );
  }

  const nombre = `reporte-${actividad.id}`;

  return (
    <form
      aria-label={`Registrar avance ${actividad.codigo}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mt-2 grid gap-2.5 rounded-inner border border-border bg-panel p-3 sm:grid-cols-2"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${nombre}-fecha`} className="text-[12px] text-ink-600">
          Fecha
        </Label>
        <Input
          id={`${nombre}-fecha`}
          type="date"
          max={todayInBogota()}
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          className={CAPTURE_FIELD}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${nombre}-porcentaje`} className="text-[12px] text-ink-600">
          Porcentaje de avance
        </Label>
        <Input
          id={`${nombre}-porcentaje`}
          inputMode="decimal"
          value={porcentaje}
          onChange={(event) => setPorcentaje(event.target.value)}
          className={CAPTURE_FIELD}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <Label htmlFor={`${nombre}-obs`} className="text-[12px] text-ink-600">
          Observación
        </Label>
        <textarea
          id={`${nombre}-obs`}
          value={observacion}
          onChange={(event) => setObservacion(event.target.value)}
          className={CAPTURE_TEXTAREA}
        />
      </div>

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
