// Extracción de texto de los formatos del Repositorio (plan Fase 2, 4B).
// Una sola dependencia nueva (unpdf, build serverless de pdf.js); docx y pptx
// se resuelven con el jszip que ya usa zip/route.ts (un .docx/.pptx es un ZIP
// OOXML), xlsx con el exceljs del export, y jpg/png no tienen texto (sin OCR
// por política: tesseract.js viola el presupuesto serverless y la política de
// dependencias). El texto vive en DocumentoVersion.contenido_texto y alimenta
// el índice GIN full-text.
//
// Contrato (testeado): nunca lanza — el caller decide si un fallo es "error"
// (reintentable) o "sin_texto". Un .pptx con solo imágenes produce "sin_texto",
// no "error".

import { extractText as extractPdfText } from "unpdf";
import JSZip from "jszip";
import ExcelJS from "exceljs";

export type ExtractResult =
  | { ok: true; texto: string }
  | { ok: false; code: "SIN_TEXTO" | "ERROR" };

export const MAX_EXTRACTED_CHARS = 200_000; // tope del plan 4B
export const EXTRACT_TIMEOUT_MS = 5_000; // tope del plan 4B

/** Carrera contra el reloj: la extracción nunca debe secar la subida. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function truncate(texto: string): string {
  return texto.length > MAX_EXTRACTED_CHARS
    ? texto.slice(0, MAX_EXTRACTED_CHARS)
    : texto;
}

/** PDF: unpdf (build de pdf.js para serverless, sin worker). */
async function extractPdf(bytes: Uint8Array): Promise<string | null> {
  const pdf = await extractPdfText(new Uint8Array(bytes), { mergePages: true });
  return pdf.text || null;
}

/** OOXML (docx y pptx): un ZIP; se unen los <w:t> (Word) o los <a:t> (slides). */
async function extractOoxml(
  bytes: Uint8Array,
  kind: "docx" | "pptx",
): Promise<string | null> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = kind === "docx" ? ["word/document.xml"] : Object.keys(zip.files).filter(
    (name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"),
  );
  if (entries.length === 0) return null;

  const blocks: string[] = [];
  for (const entry of entries) {
    const file = zip.file(entry);
    if (!file) continue;
    const xml = await file.async("string");
    // <w:t>...</w:t> para Word, <a:t>...</a:t> para diapositivas — el mismo
    // patrón de texto dentro del XML OOXML.
    const textNodes = [...xml.matchAll(/<(?:w:t|a:t)(?:[^>]*)>([^<]*)<\/(?:w:t|a:t)>/g)]
      .map((m) => m[1])
      .filter((t) => t.trim().length > 0);
    if (textNodes.length > 0) {
      blocks.push(textNodes.join(" "));
    }
  }
  if (blocks.length === 0) return null;
  return blocks.join("\n\n");
}

/** XLSX: exceljs — texto de todas las celdas, fila a fila. */
async function extractXlsx(bytes: Uint8Array): Promise<string | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  const blocks: string[] = [];
  for (const sheet of workbook.worksheets) {
    const rows: string[] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) {
        const value = row.getCell(c).value;
        if (value === null || value === undefined) continue;
        const text = String(value).trim();
        if (text !== "") cells.push(text);
      }
      if (cells.length > 0) rows.push(cells.join(" | "));
    }
    if (rows.length > 0) blocks.push(`${sheet.name}\n${rows.join("\n")}`);
  }
  if (blocks.length === 0) return null;
  return blocks.join("\n\n");
}

/**
 * Extrae el texto de los bytes de un archivo del Repositorio. Nunca lanza:
 * cualquier error interno se devuelve como `{ ok: false, code: "ERROR" }` para
 * que el POST de subida siga siendo 201 (el archivo del usuario está a salvo;
 * la extracción es una preocupación secundaria).
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  fileName: string,
  mimeType?: string,
): Promise<ExtractResult> {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  try {
    let texto: string | null = null;
    if (ext === "pdf" || mimeType === "application/pdf") {
      texto = await extractPdf(bytes);
    } else if (ext === "docx" || mimeType?.includes("wordprocessingml")) {
      texto = await extractOoxml(bytes, "docx");
    } else if (ext === "pptx" || mimeType?.includes("presentationml")) {
      texto = await extractOoxml(bytes, "pptx");
    } else if (ext === "xlsx" || mimeType?.includes("spreadsheetml")) {
      texto = await extractXlsx(bytes);
    }
    // jpg/png (y cualquier otro permitido sin extractor): sin OCR, no hay texto.
    if (texto === null || texto.trim() === "") {
      return { ok: false, code: "SIN_TEXTO" };
    }
    return { ok: true, texto: truncate(texto) };
  } catch {
    return { ok: false, code: "ERROR" };
  }
}

/**
 * La extracción inline de una subida: con timeout, nunca lanza. Devuelve los
 * campos a persistir en DocumentoVersion (texto_estado siempre; contenido_texto
 * solo cuando hay texto). Un fallo nunca tumba el POST — la versión ya se
 * creó y el documento sigue siendo buscable por metadatos.
 */
export async function extractForVersion(
  bytes: Uint8Array,
  fileName: string,
  mimeType?: string,
): Promise<{ contenido_texto: string | null; texto_estado: "ok" | "sin_texto" | "error" }> {
  try {
    const res = await withTimeout(extractDocumentText(bytes, fileName, mimeType), EXTRACT_TIMEOUT_MS);
    if (!res.ok) {
      return {
        contenido_texto: null,
        texto_estado: res.code === "SIN_TEXTO" ? "sin_texto" : "error",
      };
    }
    return { contenido_texto: res.texto, texto_estado: "ok" };
  } catch {
    return { contenido_texto: null, texto_estado: "error" };
  }
}