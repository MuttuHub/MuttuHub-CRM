// Turns what a person typed in the modification form into the `detalle` of the request (S8 U6). Pure:
// the server (`validarModificacion`) stays the authority on every rule; this only keeps the fields that
// really changed and sends `antes` exactly as the person saw it, so the API can detect a stale form.

import { toCents } from "./money"
import { CAMPOS_PERMITIDOS, type DetalleElemento, type TipoModificacion } from "./modificaciones"

export type { TipoModificacion }

/** One editable input: what it pointed at, the value shown and what is typed now ("" = untouched). */
export type CampoEditable = { elemento: DetalleElemento; clave: string; campo: string; antes: string; valor: string }

export type DetalleModificacion = { elemento: DetalleElemento; clave: string; campo: string; antes: string; despues: string }

/** The fields each tipo may touch: the SAME matrix the API enforces, used here only to offer the right inputs. */
export function camposPermitidos(tipo: TipoModificacion): Partial<Record<DetalleElemento, readonly string[]>> {
  return CAMPOS_PERMITIDOS[tipo];
}

/** "4" and "4.00" are the same amount; anything that is not a decimal compares literally. */
function igual(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (x === y) return true;
  try {
    return toCents(x) === toCents(y);
  } catch {
    return false;
  }
}

export function construirDetalle(tipo: TipoModificacion, campos: readonly CampoEditable[]): DetalleModificacion[] {
  const permitidos = CAMPOS_PERMITIDOS[tipo];
  return campos
    .filter((c) => permitidos[c.elemento]?.includes(c.campo))
    .filter((c) => c.valor.trim() !== "" && !igual(c.valor, c.antes))
    .map((c) => ({ elemento: c.elemento, clave: c.clave, campo: c.campo, antes: c.antes, despues: c.valor.trim() }));
}
