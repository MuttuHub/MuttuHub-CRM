// X2 (plan-trabajo-ux-crm.md, F0.4): the Excel imports used to apply on ANY
// `modo` other than "validar", so a typo like "aplicarr" wrote the project.
// One shared reader keeps the rule identical in every import route:
//   - "validar" → preview only, nothing is written;
//   - "aplicar" or no `modo` at all → apply (the app's own clients send no
//     `modo` when they apply, so absence keeps meaning apply);
//   - anything else → 400 before any parsing or write.

export const MODO_INVALIDO_MESSAGE = "El modo debe ser «validar» o «aplicar».";

export type ModoImport = "validar" | "aplicar";

/** Reads the `modo` form field; `null` means an explicit value that is neither "validar" nor "aplicar". */
export function leerModoImport(valor: FormDataEntryValue | null): ModoImport | null {
  if (valor === null) return "aplicar";
  if (valor === "validar" || valor === "aplicar") return valor;
  return null;
}
