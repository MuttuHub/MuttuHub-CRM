// Verdad de presentación compartida de la UI de proyectos.
//
// `project-list.tsx` enlaza a la ficha (`project-ficha.tsx`), así que la
// ficha no puede depender del listado: antes importaba de él
// `ESTADO_PROYECTO_META` y `formatFechaCalendario`, y el ciclo
// listado → ficha → listado invertía el orden natural padre → hijo. Estas
// piezas son solo de UI (etiqueta, tono y formato de fecha), de modo que viven
// acá, en un módulo neutral que ambos componentes importan.
//
// No hay acceso a datos ni reglas de autorización en este archivo: el alcance
// del portafolio lo aplica la API y los hooks.

import type { AccionAuditoria, EstadoProyecto, OrigenProyecto } from "@prisma/client";
import type { UiTone } from "@/lib/catalogs";
import { diferenciaRealPlanPp } from "@/lib/proyectos/avance";

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

/** Etiqueta humana de cada acción del libro (`auditoria_cambios`). */
export const ACCION_AUDITORIA_META: Record<AccionAuditoria, string> = {
  CREAR: "Creación",
  EDITAR: "Edición",
  IMPORTAR: "Importación",
  APROBAR: "Aprobación",
  VALIDAR: "Validación",
  RECHAZAR: "Rechazo",
  SUSPENDER: "Suspensión",
  CAMBIAR_PARAMETRO: "Cambio de parámetro",
  ANULAR: "Anulación",
  SOLICITAR: "Solicitud",
  EXPORTAR: "Exportación",
  CONVERTIR: "Conversión",
};

/** Nombre legible de la entidad auditada; una entidad desconocida fuera del módulo conserva su valor. */
export const ENTIDAD_AUDITORIA_META: Record<string, string> = {
  oportunidad: "Oportunidad",
  proyecto: "Proyecto",
  proyecto_miembro: "Integrante del equipo",
  parametro: "Parámetro del semáforo",
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

/**
 * Instante ISO del libro -> fecha y hora legibles. A diferencia de
 * `formatFechaCalendario`, `created_at` es un instante real (no una fecha de
 * calendario), así que se formatea en la zona local del navegador.
 */
export function formatFechaHora(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return SIN_DATO;

  const fecha = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(fecha.getTime())) return SIN_DATO;

  return fecha.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CAMPO_AUDITORIA_META: Record<string, string> = {
  codigo: "Código",
  nombre: "Nombre",
  origen: "Origen",
  cliente_id: "Cliente",
  fecha_inicio: "Fecha de inicio",
  fecha_fin: "Fecha de fin",
  valor_total: "Valor total",
  beneficiarios_meta: "Beneficiarios meta",
  responsable_id: "Responsable",
  lineas: "Líneas estratégicas",
  municipios: "Municipios",
  fase: "Fase",
  fecha_adjudicacion: "Fecha de adjudicación",
  id: "Id",
  principal: "Principal",
};

/** Etiqueta de un `campo` (o de una clave de un valor JSON); sin traducción, el nombre original. */
export function etiquetaCampoAuditoria(campo: string): string {
  return CAMPO_AUDITORIA_META[campo] ?? campo;
}

/** Valores de enum que el libro guarda y conviene leer en español. */
const VALOR_AUDITORIA_META: Record<string, string> = {
  PROSPECCION: "Prospección",
  EJECUCION: "Ejecución",
};

/**
 * Valor de una columna JSON del libro -> texto para mostrar, sin volcar el JSON
 * crudo. `null`/`undefined` y las claves nulas de un objeto se omiten: una
 * conversión se lee "Fase: Prospección → Fase: Ejecución" y no arrastra una
 * fecha de adjudicación vacía.
 */
export function describeAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return VALOR_AUDITORIA_META[value] ?? value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) {
    return value.map(describeAuditValue).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => {
        const texto =
          key === "origen" && typeof val === "string"
            ? (ORIGEN_PROYECTO_META[val as OrigenProyecto] ?? val)
            : describeAuditValue(val);
        return texto === "" ? "" : `${etiquetaCampoAuditoria(key)}: ${texto}`;
      })
      .filter(Boolean)
      .join(" · ");
  }
  return String(value);
}

/** Forma mínima que `agruparHistorial` necesita de una fila del libro. */
export type AuditHistoryEntryLike = {
  id: string;
  lote_id: string | null;
  entidad: string;
  created_at: string;
};

export type AuditHistoryStep<T extends AuditHistoryEntryLike> = {
  key: string;
  created_at: string;
  entries: T[];
};

/**
 * Agrupa las filas por `lote_id`: una operación completa (por ejemplo la
 * conversión de la oportunidad + la creación del proyecto) se lee como UN paso
 * con su instante. Una fila sin `lote_id` es su propio paso. Dentro del paso se
 * ordena por `entidad` para que la conversión (oportunidad) preceda a la
 * creación (proyecto), sin depender del uuid que desempató la consulta.
 */
export function agruparHistorial<T extends AuditHistoryEntryLike>(
  entries: readonly T[],
): AuditHistoryStep<T>[] {
  const pasos: AuditHistoryStep<T>[] = [];
  const byKey = new Map<string, AuditHistoryStep<T>>();

  for (const entry of entries) {
    const key = entry.lote_id ?? `fila:${entry.id}`;
    let paso = byKey.get(key);
    if (!paso) {
      paso = { key, created_at: entry.created_at, entries: [] };
      byKey.set(key, paso);
      pasos.push(paso);
    }
    paso.entries.push(entry);
  }

  for (const paso of pasos) {
    paso.entries.sort(
      (a, b) =>
        a.entidad.localeCompare(b.entidad) || a.id.localeCompare(b.id),
    );
  }

  return pasos;
}

const PP = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/**
 * Deviation shown to the user: real - plan in percentage points, always signed ("+11,7 pp" ahead of plan,
 * "-35,7 pp" behind). The API's `desviacion_pp` is plan - real (it feeds the semáforo), so it is flipped here.
 */
export function formatDiferenciaPp(desviacionPp: number): string {
  const rounded = Math.round(diferenciaRealPlanPp(desviacionPp) * 10) / 10;
  const value = rounded === 0 ? 0 : rounded;
  return `${value > 0 ? "+" : ""}${PP.format(value)} pp`;
}
