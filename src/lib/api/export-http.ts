// Pieces the S9 export routes share: the Excel response and the `formato` guard (PDF is not available yet,
// N-23: the later default is the browser print page).

import { apiError } from "@/lib/api/errors";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const FORMATO_NO_DISPONIBLE_MESSAGE = "Formato no disponible. Por ahora solo se exporta en Excel (xlsx).";

/** `formato` defaults to xlsx; anything else (pdf included) is a 400. */
export function validarFormato(raw: string | null): Response | null {
  return raw === null || raw === "" || raw === "xlsx" ? null : apiError(FORMATO_NO_DISPONIBLE_MESSAGE, 400, "VALIDATION_ERROR");
}

export function respuestaXlsx(buffer: Buffer, nombreArchivo: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${nombreArchivo.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    },
  });
}
