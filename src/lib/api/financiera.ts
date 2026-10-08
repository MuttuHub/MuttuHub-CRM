// Source of the validated expenses (E) of the financial ficha.
//
// S5 has no `Gasto` table: E is unavailable until S6, which only replaces the
// body of `loadGastosValidados` (the route and the pure lib do not change).

import type { Cents } from "@/lib/proyectos/money";
import type { GastoEstado } from "@/lib/proyectos/ficha-financiera";
import type { Periodo } from "@/lib/proyectos/weeks";

export type GastoAgregable = { rubroId: string; periodo: Periodo; valor: Cents; estado: GastoEstado };

export type GastosFuente = {
  /** False while no expense source exists: E is not real and no color is shown. */
  disponible: boolean;
  gastos: GastoAgregable[];
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the S6 body reads it
export async function loadGastosValidados(_proyectoId: string): Promise<GastosFuente> {
  return { disponible: false, gastos: [] };
}
