// Step indicator of the "Nuevo proyecto" page, as in the v7 prototype: numbered circles, a check for the
// steps already done, the active step inverted and every enabled step clickable. Steps 2-5 stay disabled
// until step 1 has created the project. Purely presentational: the page owns the navigation.

"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PASOS, estadoDePaso, pasoHabilitado } from "./stepper-logic";

export function NuevoProyectoStepper({
  actual,
  hayProyecto,
  aprobado = false,
  onSeleccionar,
}: {
  actual: number;
  hayProyecto: boolean;
  /** Baseline approved: the Revisión pill reads as done (it can still be the current step). */
  aprobado?: boolean;
  onSeleccionar: (numero: number) => void;
}) {
  return (
    <nav aria-label="Pasos para crear el proyecto">
      <ol className="flex flex-wrap gap-2">
        {PASOS.map((paso) => {
          const estado = estadoDePaso(paso.numero, actual, hayProyecto, aprobado);
          const esActual = paso.numero === actual;
          const habilitado = pasoHabilitado(paso.numero, hayProyecto);
          return (
            <li key={paso.numero}>
              <button
                type="button"
                disabled={!habilitado}
                aria-current={esActual ? "step" : undefined}
                data-estado={estado}
                onClick={() => onSeleccionar(paso.numero)}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-full border py-0 pr-3.5 pl-1.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors",
                  esActual
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-strong bg-panel text-ink-900 enabled:hover:bg-ink-100",
                  !habilitado && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-[12.5px]",
                    esActual
                      ? "bg-background text-foreground"
                      : estado === "hecho"
                        ? "bg-exito-bg text-exito"
                        : "bg-ink-100 text-ink-700",
                  )}
                >
                  {estado === "hecho" ? <Check className="size-3.5" strokeWidth={2.4} /> : paso.numero}
                </span>
                {paso.etiqueta}
                {estado === "hecho" && <span className="sr-only"> (completado)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
