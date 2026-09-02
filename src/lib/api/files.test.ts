import { describe, expect, it } from "vitest";
import { isAllowedFileType, fileExtension } from "./files";

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