// Source of the executed expenses (E) of the financial ficha.
//
// AJ-08: without an approval step, every expense that counts as executed (REGISTRADO or VALIDADO;
// RECHAZADO and ANULADO never do) is money spent. Each row keeps its real estado so the pure
// `computeFicha` can filter by period and by `cuentaComoEjecutado`. The route and the pure lib do not
// change: the ficha itself keeps E unavailable for a BORRADOR project (`ejecucion_disponible`).

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toCents, type Cents } from "@/lib/proyectos/money";
import { ESTADOS_EJECUTADOS } from "@/lib/proyectos/gastos";
import type { GastoEstado } from "@/lib/proyectos/ficha-financiera";
import type { Periodo } from "@/lib/proyectos/weeks";

// S5/T10: la línea, no sólo el rubro. Sin ella dos líneas del mismo rubro se quedan con los mismos
// gastos y el ejecutado se duplica al sumar el total.
type GastoAgregable = { rubroId: string; lineaId: string; periodo: Periodo; valor: Cents; estado: GastoEstado };

export type GastosFuente = {
  /** False when E is not real (no expense source, or the project is still BORRADOR): no color is shown. */
  disponible: boolean;
  gastos: GastoAgregable[];
};

export async function loadGastosEjecutados(
  proyectoId: string,
  client: Pick<Prisma.TransactionClient, "gasto"> = db,
): Promise<GastosFuente> {
  const rows = await client.gasto.findMany({
    where: { proyecto_id: proyectoId, estado: { in: [...ESTADOS_EJECUTADOS] } },
    select: { periodo: true, monto_cop: true, estado: true, linea: { select: { id: true, rubro_id: true } } },
  });
  return {
    disponible: true,
    gastos: rows.map((row) => ({
      rubroId: row.linea.rubro_id,
      lineaId: row.linea.id,
      periodo: row.periodo,
      valor: toCents(row.monto_cop),
      estado: row.estado,
    })),
  };
}
