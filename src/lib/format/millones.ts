import { formatCOP } from "@/lib/proyectos/money"

const UN_MILLON_CENTAVOS = BigInt(100_000_000)
const DECIMA_DE_MILLON = BigInt(10_000_000)

/**
 * `$ 177,4 M` (como el diseño v6): millones con un decimal, calculado en bigint; por debajo del millón se usa
 * el formato estándar de la app (`formatCOP`).
 */
export function formatMillones(cents: bigint): string {
  if (cents < UN_MILLON_CENTAVOS) return formatCOP(cents)
  const decimas = (cents + DECIMA_DE_MILLON / BigInt(2)) / DECIMA_DE_MILLON
  const entero = (decimas / BigInt(10)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const decimal = decimas % BigInt(10)
  return `$ ${entero}${decimal === BigInt(0) ? "" : `,${decimal}`} M`
}
