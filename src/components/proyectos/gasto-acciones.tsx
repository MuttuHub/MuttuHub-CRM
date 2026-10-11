// Controles de validación de un gasto (S6 U6): Validar / Rechazar (con motivo) para el
// gestor que NO registró el gasto, y el texto "Tú lo registraste" para quien sí. Los usa la
// fila de la ficha y la cola entre proyectos. La API es la autoridad (403 al registrante, 409
// OVERSPEND_BLOCKED, 409 datos incompletos); aquí solo se evita el viaje obvio y se muestra el
// error del servidor en línea.

"use client";

import { useId, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { InlineError } from "@/components/proyectos/ui";
import { useRejectExpense, useValidateExpense } from "@/hooks/projects";

export const PROPIO_TEXT = "Tú lo registraste";
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
        className="h-10 w-52 bg-panel px-2.5 text-[12px]"
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

export function ValidacionControles({
  projectId,
  gastoId,
  propio,
  datosIncompletos,
}: {
  projectId: string;
  gastoId: string;
  /** El gasto lo registró quien consulta: no puede validarlo ni rechazarlo. */
  propio: boolean;
  datosIncompletos: boolean;
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
          disabled={pending || datosIncompletos}
          title={datosIncompletos ? INCOMPLETO_HINT : undefined}
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
      <InlineError message={error} />
    </div>
  );
}
