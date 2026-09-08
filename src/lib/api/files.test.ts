import { describe, expect, it } from "vitest";
import { isAllowedFileType, fileExtension, sanitizeFileName } from "./files";

describe("isAllowedFileType — .pptx (plan Fase 2, 4A-bis)", () => {
  it("accepts a .pptx by extension", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "presentacion.pptx", {
      type: "application/octet-stream",
    });
    expect(isAllowedFileType(file)).toBe(true);
  });

  it("accepts a .pptx by MIME type", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "sin-extension", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    expect(isAllowedFileType(file)).toBe(true);
  });

  it("still rejects an unallowed type (both extension and MIME)", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "virus.exe", {
      type: "application/x-msdownload",
    });
    expect(isAllowedFileType(file)).toBe(false);
  });

  it("still accepts the other allowed formats", () => {
    const pdf = new File([new Uint8Array([1])], "doc.pdf", { type: "application/pdf" });
    const docx = new File([new Uint8Array([1])], "doc.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(isAllowedFileType(pdf)).toBe(true);
    expect(isAllowedFileType(docx)).toBe(true);
  });
});

describe("fileExtension", () => {
  it("lowercases and strips the dot", () => {
    expect(fileExtension("DECK.PPTX")).toBe("pptx");
  });
});

// Regresión reportada por el jefe: subir un documento a un cliente fallaba
// con "No pudimos subir el archivo" — Supabase Storage rechazaba la key con
// `StorageApiError: Invalid key ... InvalidKey` en cuanto el nombre del
// archivo tenía una tilde o una ñ (aislado con "técnico" vs "tecnico" y
// "ñ" vs "n" contra el storage real). sanitizeFileName solo limpiaba "/" y
// "\\", dejando pasar cualquier caracter no-ASCII.
describe("sanitizeFileName — Supabase Storage rechaza keys no-ASCII (InvalidKey)", () => {
  it("quita tildes de vocales", () => {
    expect(sanitizeFileName("Documento técnico.pdf")).toBe("Documento tecnico.pdf");
  });

  it("reemplaza la ñ por n", () => {
    expect(sanitizeFileName("diseño-final.pdf")).toBe("diseno-final.pdf");
  });

  it("reproduce el nombre real que rompía la subida", () => {
    const sanitized = sanitizeFileName("Documento técnico - Cedetextil 08.01.26 (1).pdf");
    expect(sanitized).toBe("Documento tecnico - Cedetextil 08.01.26 (1).pdf");
    // Nada fuera del set seguro de Supabase Storage (letras/números ASCII,
    // espacio, y ! - _ . * ' ( )).
    expect(sanitized).toMatch(/^[A-Za-z0-9 !\-_.*'()]+$/);
  });

  it("conserva paréntesis, guiones y espacios (ya eran válidos)", () => {
    expect(sanitizeFileName("con (parentesis) - y guion.pdf")).toBe(
      "con (parentesis) - y guion.pdf",
    );
  });

  it("preserva la extensión al recortar por el límite de longitud", () => {
    const long = "á".repeat(200) + ".pdf";
    const sanitized = sanitizeFileName(long);
    expect(sanitized.endsWith(".pdf")).toBe(true);
    expect(sanitized).not.toMatch(/[áé]/i);
  });

  it("sigue reemplazando separadores de path", () => {
    expect(sanitizeFileName("carpeta/archivo.pdf")).toBe("carpeta_archivo.pdf");
  });
});