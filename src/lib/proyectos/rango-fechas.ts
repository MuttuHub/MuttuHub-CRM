// V-03 (PO-4): a project's start date must be STRICTLY before its end date. One validator shared by the
// API (create, convert, patch), the creation form and aligned with the Excel template import.

export const MENSAJE_RANGO_FECHAS = "La fecha de fin debe ser posterior a la fecha de inicio."

/** True when `inicio` is strictly before `fin`. Compares calendar days; accepts ISO date strings or Dates; unparsable input is false. */
export function rangoFechasValido(inicio: Date | string, fin: Date | string): boolean {
  const desde = diaUtc(inicio)
  const hasta = diaUtc(fin)
  return !Number.isNaN(desde) && !Number.isNaN(hasta) && desde < hasta
}

/** Calendar day (UTC midnight), as the API stores `@db.Date`: two instants of the same day are equal. */
function diaUtc(valor: Date | string): number {
  return new Date(valor).setUTCHours(0, 0, 0, 0)
}
