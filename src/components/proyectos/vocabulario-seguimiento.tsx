// Plain words for the tracking controls shared by Ejecución, Indicadores, Financiero and the portfolio (U5):
// the plan base (vigente / original), the cut-off date and the provisional semáforo thresholds. One place so
// every screen says the same thing and no jargon (Corte, Vigente, Original (v0), No confirmado) leaks back.

"use client";

import { ToneBadge } from "@/components/crm/shared";
import { HelpHint } from "@/components/ui/help-hint";
import type { ProjectBase } from "@/hooks/projects";

/** Label (and accessible name) of the base selector. */
export const ETIQUETA_BASE = "Comparar con";

/** Visible name of each base option. */
export const NOMBRE_BASE: Record<ProjectBase, string> = {
  vigente: "Plan actual",
  original: "Plan inicial",
};

/** Tooltip of a disabled base selector (draft project: there is no initial plan yet). */
export const BASE_NO_DISPONIBLE = "El plan inicial estará disponible cuando se apruebe la línea base.";

/** Label (and accessible name) of the cut-off date or month selector. */
export const ETIQUETA_CORTE = "Calcular hasta";

/** "Datos al 15 mar 2026": the date the figures are computed at. */
export function datosAl(fecha: string): string {
  return `Datos al ${fecha}`;
}

/** Options of the base selector; the initial plan only when it exists. */
export function OpcionesBase({ conOriginal = true }: { conOriginal?: boolean }) {
  return (
    <>
      <option value="vigente">{NOMBRE_BASE.vigente}</option>
      {conOriginal && <option value="original">{NOMBRE_BASE.original}</option>}
    </>
  );
}

/** Help next to the base selector. Kept outside the <label> so its button does not focus the select. */
export function AyudaBase() {
  return (
    <HelpHint label={ETIQUETA_BASE}>
      El plan actual incluye las modificaciones aprobadas. El plan inicial es el de la línea base, antes de
      cualquier modificación.
    </HelpHint>
  );
}

const PROVISIONAL = "Umbrales sin confirmar";

/** Badge shown while the semáforo thresholds are not confirmed, with its explanation. */
export function SemaforoProvisional() {
  return (
    <span className="inline-flex items-center gap-1">
      <ToneBadge tone="neutro" label={PROVISIONAL} />
      <HelpHint label={PROVISIONAL}>
        Gerencia aún no ha confirmado los umbrales que deciden el color del semáforo; pueden cambiar.
      </HelpHint>
    </span>
  );
}
