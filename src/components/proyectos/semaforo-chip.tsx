// Chip único del semáforo (S10 WU1). El COLOR llega calculado por el servidor y aquí solo se pinta
// (el cliente jamás lo recalcula). Rojo usa el tono `destructivo` (el mismo vocabulario que
// `toneFromSemaforo`). El texto SIEMPRE lleva la palabra del color, más un punto: nunca solo color.

"use client";

import type * as React from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { toneFromSemaforo } from "@/lib/estado-tone";
import type { ColorSemaforo } from "@/hooks/projects";

export const SEMAFORO_LABEL: Record<ColorSemaforo, string> = {
  verde: "Verde",
  amarillo: "Amarillo",
  rojo: "Rojo",
};

export function SemaforoChip({
  color,
  prefix,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  color: ColorSemaforo;
  /** Texto previo, p. ej. "Semáforo técnico" -> "Semáforo técnico: Rojo". */
  prefix?: string;
}) {
  const word = SEMAFORO_LABEL[color];
  return (
    <StatusChip tone={toneFromSemaforo(color)} data-color={color} className={className} {...props}>
      {prefix ? `${prefix}: ${word}` : word}
    </StatusChip>
  );
}
