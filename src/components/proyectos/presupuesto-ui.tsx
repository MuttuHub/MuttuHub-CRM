// Piezas compartidas de la sección "Presupuesto" (S5 U5): lectura de montos
// escritos por el usuario y campo de monto. Los montos viajan como string
// decimal y se manejan en centavos (bigint): nunca pasan por Number().

"use client";

import { Input } from "@/components/ui/input";
import { fromCents, toCents } from "@/lib/proyectos/money";

export const MONTO_INVALIDO = "Ingresa un monto válido con máximo dos decimales.";

/** `"1500000,5"` -> `"1500000.50"`. Vacío cuenta como $0. `null` si no es un monto válido. */
export function parseMontoInput(text: string): string | null {
  const limpio = text.trim().replace(",", ".");
  if (limpio === "") return "0.00";
  if (!/^\d+(?:\.\d{1,2})?$/.test(limpio)) return null;
  return fromCents(toCents(limpio));
}

/** `"59500000.00"` -> `"59500000"` (se conservan los centavos si existen). */
export function montoToInput(valor: string): string {
  return valor.endsWith(".00") ? valor.slice(0, -3) : valor;
}

export function MoneyInput({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className ?? "w-full min-w-24 px-2 text-right text-base md:text-[12.5px] tabular-nums"}
    />
  );
}
