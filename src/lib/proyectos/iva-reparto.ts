// EV-05 (Propuesto, accepted in D4): «el IVA de cada línea se calcula en proporción a su subtotal y se puede
// corregir». The rule is shared by the API (what each distribution row is written with) and the expense form (what
// each line shows before saving), so both compute the same cents. Pure, no I/O.

import { sumCents, type Cents } from "@/lib/proyectos/money";

export const REPARTO_IVA_SUMA_MESSAGE = "El IVA de las líneas de la distribución debe sumar exactamente el IVA de la factura.";
export const REPARTO_IVA_VALOR_MESSAGE = "El IVA de cada línea no puede ser negativo ni mayor que el valor de la línea.";
export const REPARTO_IVA_MEZCLA_MESSAGE = "Indica el IVA de todas las líneas de la distribución o de ninguna.";

/**
 * EV-05 (Propuesto, accepted in D4): «el IVA de cada línea se calcula en proporción a su subtotal y se puede
 * corregir». Without an IVA per line, each line gets the invoice IVA in proportion to its value (the same as to its
 * subtotal, the rate being the invoice's) and the leftover cents go to the last line. With an IVA on every line,
 * those are kept when each is between 0 and its line's value and they add up to the invoice IVA. Without HTTP.
 */
export function repartirIva(
  valores: readonly Cents[],
  ivaTotal: Cents,
  pedidos: readonly (Cents | null)[],
): { ok: true; value: Cents[] } | { ok: false; message: string } {
  const ZERO = BigInt(0);
  const conIva = pedidos.filter((iva) => iva !== null).length;
  if (conIva === 0) {
    const total = sumCents(valores);
    if (total === ZERO) return { ok: true, value: valores.map(() => ZERO) };
    const partes = valores.map((valor) => (ivaTotal * valor) / total);
    partes[partes.length - 1] = ivaTotal - sumCents(partes.slice(0, -1));
    return { ok: true, value: partes };
  }
  if (conIva !== pedidos.length) return { ok: false, message: REPARTO_IVA_MEZCLA_MESSAGE };
  const ivas = pedidos as readonly Cents[];
  if (ivas.some((iva, i) => iva < ZERO || iva > valores[i])) return { ok: false, message: REPARTO_IVA_VALOR_MESSAGE };
  if (sumCents(ivas) !== ivaTotal) return { ok: false, message: REPARTO_IVA_SUMA_MESSAGE };
  return { ok: true, value: [...ivas] };
}
