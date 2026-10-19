// The KPI block of ONE project (S9 U4), shared by `GET projects/:id/kpis` and the project export so both
// answer the very same numbers: 409 (no dates) -> 400 (corte, base) -> `loadKpisPortafolio` over a single
// project (one code path with the portfolio; `base=original` feeds the frozen version 0).

import { loadKpisPortafolio, type ProyectoKpiBase } from "@/lib/api/kpis-portafolio";
import { apiError } from "@/lib/api/errors";
import { parseCorteFecha } from "@/lib/api/kpis-http";
import { resolverBase } from "@/lib/api/versiones";
import { getSemaforoParametrosV2 } from "@/lib/settings";
import type { KpisProyecto } from "@/lib/proyectos/kpis";

export const SIN_FECHAS_MESSAGE = "El proyecto aún no tiene fechas de inicio y fin.";

export async function calcularKpisProyecto(input: {
  proyecto: ProyectoKpiBase;
  corteParam: string | null;
  baseParam: string | null;
}): Promise<{ ok: true; value: { base: "vigente" | "original"; kpis: KpisProyecto } } | { ok: false; response: Response }> {
  const { proyecto } = input;
  if (!proyecto.fecha_inicio || !proyecto.fecha_fin) {
    return { ok: false, response: apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE") };
  }
  const corte = parseCorteFecha(input.corteParam);
  if (!corte.ok) return corte;
  const base = await resolverBase(proyecto.id, input.baseParam);
  if (!base.ok) return base;

  const parametros = await getSemaforoParametrosV2();
  const kpis = await loadKpisPortafolio({
    proyectos: [proyecto],
    corte: corte.corte,
    parametros,
    original: base.value.base === "original" ? { proyectoId: proyecto.id, snapshot: base.value.snapshot } : undefined,
  });
  return { ok: true, value: { base: base.value.base, kpis: kpis.get(proyecto.id) as KpisProyecto } };
}
