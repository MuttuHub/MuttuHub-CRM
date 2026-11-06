// Controles de validación de un gasto (S6 U6): Validar / Rechazar (con motivo) para el
// gestor que NO registró el gasto, y el texto "Tú lo registraste" para quien sí. Los usa la
// fila de la ficha y la cola entre proyectos. La API es la autoridad (403 al registrante, 409
// OVERSPEND_BLOCKED, 409 datos incompletos); aquí solo se evita el viaje obvio y se muestra el
// error del servidor en línea.

"use client";

import { useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { CAPTURE_TEXTAREA, InlineError } from "@/components/proyectos/ui";
import { useRejectExpense, useValidateExpense } from "@/hooks/projects";

export const PROPIO_TEXT = "Tú lo registraste";
export const SIN_PERMISO_VALIDAR =
  "No tienes permisos para validar gastos. Solo Gerencia o Administración pueden validarlos mientras el proyecto está en ejecución.";
export const SIN_SOPORTE_HINT = "Adjunta un soporte para poder validarlo.";
export const INCOMPLETO_HINT = "Completa el tipo y número de identificación del tercero antes de validar.";

/** Rechazo en línea: un botón que revela un motivo obligatorio y confirma. */
function RejectControl({
  pending,
  onConfirm,
}: {
  pending: boolean;
  onConfirm: (motivo: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const id = useId();

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-destructivo" onClick={() => setAbierto(true)}>
        Rechazar
      </Button>
    );
  }

  return (
    <form
      aria-label="Rechazar gasto"
      onSubmit={(event) => {
        event.preventDefault();
        const limpio = motivo.trim();
        if (limpio !== "") onConfirm(limpio);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <Label htmlFor={id} className="sr-only">
        Motivo del rechazo
      </Label>
      <Input
        id={id}
        aria-label="Motivo del rechazo"
        value={motivo}
        onChange={(event) => setMotivo(event.target.value)}
        placeholder="Motivo del rechazo"
        className="h-10 w-52 px-2.5 text-base md:text-[12px]"
      />
      <Button type="submit" size="sm" variant="destructive" disabled={pending || motivo.trim() === ""}>
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        Confirmar rechazo
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </form>
  );
}

export const SUPERA_HINT = "Este gasto supera lo asignado al rubro: por ahora no se puede validar.";
export const MOTIVO_VACIO = "El motivo no puede estar vacío.";
export const MOTIVO_LARGO = "El motivo es demasiado largo.";
export const MOTIVO_MAX = 500;

/**
 * Actions of the «Validar gasto» panel (redesign T3): the motivo is always visible, «Validar gasto» is disabled with
 * its reason (no identification, no support, or over the rubro: that block stays until the PO decides), and
 * «Rechazar» checks the motivo first and then asks to confirm (the two-step rejection stays, PO question 3).
 * `onHecho` runs after a successful validation or rejection so the panel can move to the next expense.
 * Mount it with `key={gastoId}`: changing expense discards the motivo.
 */
export function AccionesPanelValidacion({
  projectId,
  gastoId,
  datosIncompletos,
  sinSoporte,
  superaAsignado,
  onHecho,
}: {
  projectId: string;
  gastoId: string;
  datosIncompletos: boolean;
  sinSoporte: boolean;
  superaAsignado: boolean;
  onHecho: () => void;
}) {
  const validar = useValidateExpense();
  const rechazar = useRejectExpense();
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const pending = validar.isPending || rechazar.isPending;
  const bloqueo = datosIncompletos ? INCOMPLETO_HINT : sinSoporte ? SIN_SOPORTE_HINT : superaAsignado ? SUPERA_HINT : null;
  const error = validar.isError
    ? errorMessage(validar.error, "No pudimos validar el gasto. Inténtalo de nuevo.")
    : rechazar.isError
      ? errorMessage(rechazar.error, "No pudimos rechazar el gasto. Inténtalo de nuevo.")
      : null;

  function pedirRechazo() {
    const limpio = motivo.trim();
    const problema = limpio === "" ? MOTIVO_VACIO : limpio.length > MOTIVO_MAX ? MOTIVO_LARGO : null;
    setErrorMotivo(problema);
    if (problema) {
      setConfirmando(false);
      motivoRef.current?.focus();
      return;
    }
    setConfirmando(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-motivo`} className="text-[12.5px] text-ink-700">
          Motivo (obligatorio si lo rechazas)
        </Label>
        <textarea
          ref={motivoRef}
          id={`${id}-motivo`}
          value={motivo}
          rows={3}
          aria-invalid={errorMotivo ? true : undefined}
          aria-describedby={errorMotivo ? `${id}-motivo-error` : undefined}
          onChange={(event) => {
            setMotivo(event.target.value);
            setConfirmando(false);
          }}
          className={CAPTURE_TEXTAREA}
        />
        {errorMotivo && (
          <p id={`${id}-motivo-error`} className="text-[12.5px] text-destructivo">
            {errorMotivo}
          </p>
        )}
      </div>

      <div
        data-testid="validar-gasto-acciones"
        className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-popover px-4 py-3 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0"
      >
        {bloqueo && (
          <p id={`${id}-bloqueo`} className="text-[12.5px] text-ink-600">
            {bloqueo}
          </p>
        )}
        <InlineError message={error} />
        {confirmando ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => rechazar.mutate({ projectId, id: gastoId, motivo: motivo.trim() }, { onSuccess: onHecho })}
            >
              {rechazar.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Confirmar rechazo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
            <Button type="button" variant="outline" disabled={pending} onClick={pedirRechazo}>
              Rechazar
            </Button>
            <Button
              type="button"
              disabled={pending || bloqueo !== null}
              aria-describedby={bloqueo ? `${id}-bloqueo` : undefined}
              onClick={() => validar.mutate({ projectId, id: gastoId }, { onSuccess: onHecho })}
            >
              {validar.isPending && <LoaderCircle className="size-4 animate-spin" />}
              Validar gasto
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ValidacionControles({
  projectId,
  gastoId,
  propio,
  datosIncompletos,
  sinSoporte = false,
}: {
  projectId: string;
  gastoId: string;
  /** El gasto lo registró quien consulta: no puede validarlo ni rechazarlo. */
  propio: boolean;
  datosIncompletos: boolean;
  /** Sin soportes vivos no se puede validar (la API responde 409); Rechazar sigue disponible. */
  sinSoporte?: boolean;
}) {
  const validar = useValidateExpense();
  const rechazar = useRejectExpense();

  if (propio) {
    return <span className="text-[12px] font-semibold text-ink-500">{PROPIO_TEXT}</span>;
  }

  const pending = validar.isPending || rechazar.isPending;
  const error = validar.isError
    ? errorMessage(validar.error, "No pudimos validar el gasto. Inténtalo de nuevo.")
    : rechazar.isError
      ? errorMessage(rechazar.error, "No pudimos rechazar el gasto. Inténtalo de nuevo.")
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          disabled={pending || datosIncompletos || sinSoporte}
          title={datosIncompletos ? INCOMPLETO_HINT : sinSoporte ? SIN_SOPORTE_HINT : undefined}
          onClick={() => validar.mutate({ projectId, id: gastoId })}
        >
          {validar.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Validar
        </Button>
        <RejectControl
          pending={rechazar.isPending}
          onConfirm={(motivo) => rechazar.mutate({ projectId, id: gastoId, motivo })}
        />
      </div>
      {sinSoporte && !datosIncompletos && <p className="text-[12px] text-ink-600">{SIN_SOPORTE_HINT}</p>}
      <InlineError message={error} />
    </div>
  );
}
