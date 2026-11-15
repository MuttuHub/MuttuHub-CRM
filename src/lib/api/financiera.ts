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
// S10: además la actividad de la línea (`actividad_id`, nulo en una línea heredada), para que la vista
// «Por actividad» y la vista «Por rubro» se armen con esta única lista y su ejecutado total no pueda
// diferir. Requerida y nullable: toda fila declara de qué actividad es, y null es la fila «Sin actividad».
type GastoAgregable = {
  rubroId: string;
  lineaId: string;
  actividadId: string | null;
  periodo: Periodo;
  valor: Cents;
  estado: GastoEstado;
};

export type GastosFuente = {
  /** False when E is not real (no expense source, or the project is still BORRADOR): no color is shown. */
  disponible: boolean;
  gastos: GastoAgregable[];
};

// S9/T14.2-B1: una fila por línea del reparto, no la factura entera en la línea de su cabecera. Las facturas de
// una sola fila (todas las anteriores al reparto y las que siguen llegando sin `repartos`) producen exactamente
// lo mismo que antes. Todo escritor (la API, la importación de Excel y el seed) graba ya sus filas; un gasto sin
// filas de reparto —solo un dato viejo o un script que escriba a mano— sigue contando su total en la línea de su
// cabecera, para que E no pierda un peso. Una sola consulta: la ficha no paga un viaje extra por el reparto.
export async function loadGastosEjecutados(
  proyectoId: string,
  client: Pick<Prisma.TransactionClient, "gasto"> = db,
): Promise<GastosFuente> {
  const lineaSelect = { select: { id: true, rubro_id: true, actividad_id: true } } as const;
  const rows = await client.gasto.findMany({
    where: { proyecto_id: proyectoId, estado: { in: [...ESTADOS_EJECUTADOS] } },
    select: {
      periodo: true,
      monto_cop: true,
      estado: true,
      linea: lineaSelect,
      // Un `Gasto` que llega sin la relación (una fila armada a mano) se lee como si no tuviera reparto.
      repartos: { select: { valor: true, linea: lineaSelect } },
    },
  });
  return {
    disponible: true,
    gastos: rows.flatMap((row) => {
      const repartos = row.repartos ?? [];
      if (repartos.length === 0) {
        return [
          {
            rubroId: row.linea.rubro_id,
            lineaId: row.linea.id,
            actividadId: row.linea.actividad_id,
            periodo: row.periodo,
            valor: toCents(row.monto_cop),
            estado: row.estado,
          },
        ];
      }
      return repartos.map((reparto) => ({
        rubroId: reparto.linea.rubro_id,
        lineaId: reparto.linea.id,
        actividadId: reparto.linea.actividad_id,
        periodo: row.periodo,
        valor: toCents(reparto.valor),
        estado: row.estado,
      }));
    }),
  };
}
