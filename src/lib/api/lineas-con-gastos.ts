import type { Prisma } from "@prisma/client";

type LectorGastos = Pick<Prisma.TransactionClient, "gasto" | "gastoReparto">;

/**
 * Whether any of these budget lines already carries an expense: as the header line of a gasto
 * (`gastos.linea_id`) or as a row of a split invoice (`gastos_reparto.linea_id`). T14: a line whose only
 * expense is a non-first distribution row is not the header's line, yet it cannot be deleted (the row's
 * foreign key is NO ACTION), so every «this line has expenses» check asks both tables.
 */
export async function lineasTienenGastos(
  client: LectorGastos,
  proyectoId: string,
  lineaIds: readonly string[],
): Promise<boolean> {
  if (lineaIds.length === 0) return false;
  const ids = [...lineaIds];
  if ((await client.gasto.count({ where: { proyecto_id: proyectoId, linea_id: { in: ids } } })) > 0) return true;
  return (await client.gastoReparto.count({ where: { proyecto_id: proyectoId, linea_id: { in: ids } } })) > 0;
}
