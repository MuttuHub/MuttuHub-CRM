// Short dates and times of the redesigned Documentos and Historial tabs («02 nov 2026», «05 nov», «9:50 p. m.»,
// «Jueves 05 nov 2026»). Instants (`created_at`) are read in Bogotá time; calendar dates (`YYYY-MM-DD`, or that
// date at UTC midnight) are read as they are, so they never move one day back. Pure functions, no I/O.

const ZONA = "America/Bogota";
const SIN_DATO = "—";
const FECHA = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

type Partes = { dia: string; mes: string; anio: string; semana: string };

function partes(fecha: Date, timeZone: string): Partes {
  const valores = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    weekday: "long",
    timeZone,
  }).formatToParts(fecha);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => valores.find((parte) => parte.type === tipo)?.value ?? "";
  return { dia: de("day"), mes: de("month").replace(".", ""), anio: de("year"), semana: de("weekday") };
}

/** A calendar date (`2026-11-05`, or `2026-11-05T00:00:00.000Z`) as a UTC `Date`; `null` otherwise. */
function fechaCalendario(valor: string): Date | null {
  const match = FECHA.exec(valor);
  if (!match) return null;
  const fecha = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function instante(valor: string): Date | null {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** «02 nov 2026» for an instant (Bogotá). */
export function fechaCorta(valor: string | null | undefined): string {
  const fecha = valor ? instante(valor) : null;
  if (!fecha) return SIN_DATO;
  const { dia, mes, anio } = partes(fecha, ZONA);
  return `${dia} ${mes} ${anio}`;
}

/** «05 nov» for a calendar date (the date of a report, not when it was typed). */
export function diaMes(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const fecha = fechaCalendario(valor) ?? instante(valor);
  if (!fecha) return "";
  const { dia, mes } = partes(fecha, fechaCalendario(valor) ? "UTC" : ZONA);
  return `${dia} ${mes}`;
}

/** «Jueves 05 nov 2026» for the day of an instant (Bogotá). */
export function tituloDia(valor: string): string {
  const fecha = instante(valor);
  if (!fecha) return SIN_DATO;
  const { dia, mes, anio, semana } = partes(fecha, ZONA);
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${dia} ${mes} ${anio}`;
}

/** `YYYY-MM-DD` of an instant in Bogotá: the key that groups the Historial by day. */
export function claveDia(valor: string): string {
  const fecha = instante(valor);
  if (!fecha) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    fecha,
  );
}

/** «9:50 p. m.» for an instant (Bogotá). */
export function hora(valor: string): string {
  const fecha = instante(valor);
  if (!fecha) return SIN_DATO;
  return fecha.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: ZONA });
}
