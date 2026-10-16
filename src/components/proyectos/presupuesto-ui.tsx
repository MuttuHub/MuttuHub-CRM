// Piezas compartidas de la sección "Presupuesto" (S5 U5): lectura de montos
// escritos por el usuario y campo de monto. Los montos viajan como string
// decimal y se manejan en centavos (bigint): nunca pasan por Number().

import { fromCents, toCents } from "@/lib/proyectos/money";

export const MONTO_INVALIDO = "Ingresa un monto válido con máximo dos decimales; usa coma para los decimales (1.500,50).";

// es-CO: el punto SIEMPRE es separador de miles y la coma el único decimal. Un texto que no encaje
// en esa forma no se reinterpreta: se rechaza para que nunca cambie de valor en silencio.
const MONTO_ES_CO = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/;

/** `"1.234.567,5"` -> `"1234567.50"`. Vacío cuenta como $0. `null` si no es un monto válido. */
export function parseMontoInput(text: string): string | null {
  const limpio = text.trim();
  if (limpio === "") return "0.00";
  const match = MONTO_ES_CO.exec(limpio);
  if (!match) return null;
  const entero = match[1].replace(/\./g, "");
  return fromCents(toCents(match[2] ? `${entero}.${match[2]}` : entero));
}

/** `"1234567,5"` -> `"1.234.567,5"`: agrupa miles solo si el texto es un monto válido; si no, lo deja igual. */
export function formatMontoInput(text: string): string {
  const match = MONTO_ES_CO.exec(text);
  if (!match) return text;
  const entero = match[1].replace(/\./g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return match[2] ? `${entero},${match[2]}` : entero;
}

/** `"59500000.00"` -> `"59500000"`, `"1500000.50"` -> `"1500000,50"`: el valor guardado como lo escribiría el usuario. */
export function montoToInput(valor: string): string {
  return (valor.endsWith(".00") ? valor.slice(0, -3) : valor).replace(".", ",");
}
