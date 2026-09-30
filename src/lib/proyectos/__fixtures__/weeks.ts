/**
 * F-W1 — the worked example from the RF v2.0 Estructura document
 * ("CedeTextil" structural example, §4.9 of the v2 SDD).
 *
 * Project starts 2026-10-05 and ends 2027-01-29 → 17 weeks across four months.
 * Activity 1.4 runs from week 3 to week 6, so it carries 4 weeks of weight.
 */
export const F_W1 = {
  fechaInicio: "2026-10-05",
  fechaFin: "2027-01-29",
  duracionSemanas: 17,
  periodos: ["2026-10", "2026-11", "2026-12", "2027-01"],
  actividad14: {
    semanaInicio: 3,
    semanaFin: 6,
    inicio: "2026-10-19",
    fin: "2026-11-15",
    pesoPorDefecto: 4,
  },
} as const
