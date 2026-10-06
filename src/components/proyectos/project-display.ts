// Verdad de presentación compartida de la UI de proyectos.
//
// `project-list.tsx` abre la ficha (`project-ficha-dialog.tsx`), así que la
// ficha no puede depender del listado: antes importaba de él
// `ESTADO_PROYECTO_META` y `formatFechaCalendario`, y el ciclo
// listado → ficha → listado invertía el orden natural padre → hijo. Estas
// piezas son solo de UI (etiqueta, tono y formato de fecha), de modo que viven
// acá, en un módulo neutral que ambos componentes importan.
//
// No hay acceso a datos ni reglas de autorización en este archivo: el alcance
// del portafolio lo aplica la API y los hooks.

import type { EstadoProyecto, OrigenProyecto } from "@prisma/client";
import type { UiTone } from "@/lib/catalogs";

/** Etiqueta y tono de cada estado; aún no viven en src/lib/catalogs.ts. */
export const ESTADO_PROYECTO_META: Record<EstadoProyecto, { label: string; tone: UiTone }> = {
  PLANIFICACION: { label: "Planificación", tone: "info" },
  BORRADOR: { label: "Borrador", tone: "neutro" },
  EN_EJECUCION: { label: "En ejecución", tone: "activo" },
  SUSPENDIDO: { label: "Suspendido", tone: "alerta" },
  CERRADO: { label: "Cerrado", tone: "exito" },
  CANCELADO: { label: "Cancelado", tone: "destructivo" },
};

/** Mismo fraseo que el selector de origen del diálogo de creación. */
export const ORIGEN_PROYECTO_META: Record<OrigenProyecto, string> = {
  OPORTUNIDAD: "Desde una oportunidad ganada",
  INDEPENDIENTE: "Proyecto independiente",
};

const SIN_DATO = "—";

/**
 * `fecha_inicio`/`fecha_fin` son fechas de calendario (`YYYY-MM-DD`), no
 * instantes: `new Date("2026-01-05")` las lee como medianoche UTC y en
 * Colombia (UTC-5) mostrarían el día anterior. Por eso se arma la fecha en UTC
 * y se formatea en UTC — nunca con una conversión local, que es el error que
 * esta función existe para evitar. Un `Date` (columna `@db.Date` leída por el
 * driver) usa también sus componentes UTC. Exportada para sus pruebas.
 */
export function formatFechaCalendario(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return SIN_DATO;

  let fecha: Date;
  if (value instanceof Date) {
    fecha = value;
  } else {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return SIN_DATO;
    fecha = new Date(Date.UTC(year, month - 1, day));
    // Descarta días imposibles ("2026-02-30") en vez de dejar que Date los
    // desborde al mes siguiente y muestre una fecha que no existe.
    if (
      fecha.getUTCFullYear() !== year ||
      fecha.getUTCMonth() !== month - 1 ||
      fecha.getUTCDate() !== day
    ) {
      return SIN_DATO;
    }
  }
  if (Number.isNaN(fecha.getTime())) return SIN_DATO;

  return fecha.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
