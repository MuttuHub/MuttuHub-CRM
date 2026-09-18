import { describe, expect, it } from "vitest";
import {
  isAllowedFileType,
  fileExtension,
  isValidExternalUrl,
  projectSupportStoragePath,
  sanitizeFileName,
} from "./files";

describe("sanitizeFileName", () => {
  // Regression: Supabase Storage rejects keys with spaces/diacritics as
  // "Invalid key" (400) — this broke uploads for any Spanish file name.
  it("strips spaces and accents while preserving the extension", () => {
    expect(sanitizeFileName("Informe Financiero Óptimo.docx")).toBe(
      "Informe_Financiero_Optimo.docx",
    );
  });
});

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

// tablero-seguimiento-social, T8/D8: soportes de proyecto reusan
// sanitizeFileName pero con su propia convención de key de storage
// (proyectos/{proyecto_id}/soportes/{soporte_id}_{nombre-sanitizado}).
describe("projectSupportStoragePath", () => {
  it("builds the storage key from proyecto_id, soporte_id and the sanitized name", () => {
    expect(projectSupportStoragePath("proy-1", "sop-1", "Informe Óptimo.pdf")).toBe(
      "proyectos/proy-1/soportes/sop-1_Informe_Optimo.pdf",
    );
  });

  it("uses a different soporte_id for a second upload on the same project", () => {
    expect(projectSupportStoragePath("proy-1", "sop-2", "acta.pdf")).toBe(
      "proyectos/proy-1/soportes/sop-2_acta.pdf",
    );
  });
});

// D8: solo esquema https, validado con el constructor URL (no una regex).
describe("isValidExternalUrl", () => {
  it("accepts a well-formed https:// URL", () => {
    expect(isValidExternalUrl("https://drive.google.com/folder/abc")).toBe(true);
  });

  it("rejects an http:// URL (scheme must be https)", () => {
    expect(isValidExternalUrl("http://drive.google.com/folder/abc")).toBe(false);
  });

  it("rejects a file:// URL", () => {
    expect(isValidExternalUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects a malformed string that is not a URL at all", () => {
    expect(isValidExternalUrl("not-a-url")).toBe(false);
  });
});