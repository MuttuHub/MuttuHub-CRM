// Source of the validated expenses (E) of the financial ficha.
//
// S6: only VALIDADO expenses count (REGISTRADO, RECHAZADO and ANULADO never do), each mapped to
// the rubro of its budget line. The route and the pure lib (`computeFicha`) do not change: the
// ficha itself keeps E unavailable for a BORRADOR project (`ejecucion_disponible`).

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toCents, type Cents } from "@/lib/proyectos/money";
import type { GastoEstado } from "@/lib/proyectos/ficha-financiera";
import type { Periodo } from "@/lib/proyectos/weeks";

export type GastoAgregable = { rubroId: string; periodo: Periodo; valor: Cents; estado: GastoEstado };

export type GastosFuente = {
  /** False when E is not real (no expense source, or the project is still BORRADOR): no color is shown. */
  disponible: boolean;
  gastos: GastoAgregable[];
};

export async function loadGastosValidados(
  proyectoId: string,
  client: Pick<Prisma.TransactionClient, "gasto"> = db,
): Promise<GastosFuente> {
  const rows = await client.gasto.findMany({
    where: { proyecto_id: proyectoId, estado: "VALIDADO" },
    select: { periodo: true, monto_cop: true, linea: { select: { rubro_id: true } } },
  });
  return {
    disponible: true,
    gastos: rows.map((row) => ({
      rubroId: row.linea.rubro_id,
      periodo: row.periodo,
      valor: toCents(row.monto_cop),
      estado: "VALIDADO" as const,
    })),
  };
}
