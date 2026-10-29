// Adjuntar un soporte a un gasto que ya existe (B8, S2): los gastos importados desde Excel nacen
// sin soporte y el adjunto viene aparte. Mismo flujo que el formulario de registro (archivo:
// firma -> subida -> confirmación; o enlace https). Lo muestra la fila solo a quien registró el
// gasto mientras es editable; la API es la autoridad (403, 409, máximo 5).
//
// Delgado sobre el control genérico (`adjuntar-soporte.tsx`, AJ-06 T1): solo acota la mutación del
// gasto a la forma `{ soporte }` que el control espera (le agrega el `id` del gasto por fuera).

"use client";

import { AdjuntarArchivoControl, type AdjuntarArchivoMutation } from "@/components/proyectos/adjuntar-soporte";
import { SIN_SOPORTE_TEXT } from "@/components/proyectos/gasto-form";
import { useAttachExpenseSupport } from "@/hooks/projects";

/** Tope de soportes vivos por gasto (mismo valor que `MAX_SOPORTES` de la API). */
export const MAX_SOPORTES_POR_GASTO = 5;
export const ADJUNTAR_ERROR = "No pudimos adjuntar el soporte. Inténtalo de nuevo.";

export function AdjuntarSoporte({ projectId, gastoId }: { projectId: string; gastoId: string }) {
  const adjuntarGasto = useAttachExpenseSupport(projectId);

  const adjuntar: AdjuntarArchivoMutation = {
    mutate: (variables, options) => adjuntarGasto.mutate({ id: gastoId, soporte: variables.soporte }, options),
    isPending: adjuntarGasto.isPending,
    isError: adjuntarGasto.isError,
    error: adjuntarGasto.error,
    reset: () => adjuntarGasto.reset(),
  };

  return <AdjuntarArchivoControl adjuntar={adjuntar} errorFallback={ADJUNTAR_ERROR} sinSoporteText={SIN_SOPORTE_TEXT} />;
}
