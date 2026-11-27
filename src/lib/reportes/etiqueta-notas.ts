// Notes printed under the tag report (S2 footnote, L11 period notes), shared by the tab, the print view and
// the Excel export. Kept apart from `etiqueta-xlsx.ts` so the client bundle never imports exceljs.

export const NOTA_ETIQUETAS =
  "Si un cliente tiene dos etiquetas, aparece en los dos reportes. Por eso los totales de distintas etiquetas no se deben sumar entre sí."
export const NOTA_TAREAS_PERIODO = "Las tareas con fecha de entrega anterior al inicio del período no se incluyen."
export const NOTA_DIAS_SIN_INTERACCION = "Los días sin interacción se cuentan hasta hoy, no hasta el corte."
