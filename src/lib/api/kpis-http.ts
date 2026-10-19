// HTTP-side helpers shared by the S9 KPI routes (portfolio dashboard, per-project KPIs, exports):
// the corte parser and the JSON projection of the pure KPI blocks (bigint cents -> decimal strings).

import { apiError } from "@/lib/api/errors";
import { fromCents } from "@/lib/proyectos/money";
import type { KpisPortafolio, KpisProyecto } from "@/lib/proyectos/kpis";
import { assertIsoDate, todayInBogota, type IsoDate } from "@/lib/proyectos/weeks";

export const CORTE_INVALIDO_MESSAGE = "El corte no es válido. Usa el formato AAAA-MM-DD.";

/** Calendar date `AAAA-MM-DD`; absent or empty means today in Bogota. */
export function parseCorteFecha(raw: string | null): { ok: true; corte: IsoDate } | { ok: false; response: Response } {
  const corte = raw === null || raw === "" ? todayInBogota() : raw;
  try {
    assertIsoDate(corte);
  } catch {
    return { ok: false, response: apiError(CORTE_INVALIDO_MESSAGE, 400, "VALIDATION_ERROR") };
  }
  return { ok: true, corte };
}

/** A KPI block as JSON: only the financial money fields change (cents -> "1234.50"). */
export function serializeKpis(kpis: KpisProyecto) {
  const { financiero, ...rest } = kpis;
  return {
    ...rest,
    financiero: financiero
      ? {
          ...financiero,
          asignado: fromCents(financiero.asignado),
          programado: fromCents(financiero.programado),
          ejecutado: fromCents(financiero.ejecutado),
        }
      : null,
  };
}

/** The portfolio aggregate as JSON (`por_estado` travels apart, at the top of the response). */
export function serializeAgregado(agregado: KpisPortafolio) {
  const { por_estado: _porEstado, financiero, ...rest } = agregado;
  void _porEstado;
  return {
    ...rest,
    financiero: {
      ...financiero,
      asignado: fromCents(financiero.asignado),
      programado: fromCents(financiero.programado),
      ejecutado: fromCents(financiero.ejecutado),
    },
  };
}
