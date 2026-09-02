import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { extractDocumentText } from "./extract-text";

/** Fixtures armados en memoria (plan §Verificación): sin archivos en disco. */
async function docxBytes(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  const blob = await zip.generateAsync({ type: "uint8array" });
  return blob as unknown as Uint8Array;
}

async function pptxBytes(slides: string[][]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<?xml version=\"1.0\"?><Types/>");
  slides.forEach((texts, i) => {
    const shapes = texts
      .map(
        (t) =>
          `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`,
      )
      .join("");
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`,
    );
  });
  const blob = await zip.generateAsync({ type: "uint8array" });
  return blob as unknown as Uint8Array;
}

async function xlsxBytes(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  ws.addRow(["Nombre", "Sector"]);
  ws.addRow(["Alcaldía de Cali", "Gobierno local"]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

describe("extractDocumentText", () => {
  it("extracts the text of a docx (jszip)", async () => {
    const bytes = await docxBytes(["Primer párrafo", "Segundo párrafo"]);
    const res = await extractDocumentText(bytes, "informe.docx");
    expect(res).toEqual({ ok: true, texto: "Primer párrafo Segundo párrafo" });
  });

  it("produces two text blocks for two pptx slides", async () => {
    const bytes = await pptxBytes([["Título uno"], ["Contenido de la segunda diapositiva"]]);
    const res = await extractDocumentText(bytes, "deck.pptx");
    expect(res.ok).toBe(true);
    if (res.ok) {
      const blocks = res.texto.split("\n\n");
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toBe("Título uno");
      expect(blocks[1]).toBe("Contenido de la segunda diapositiva");
    }
  });

  it("returns SIN_TEXTO for a pptx with no text (images only), not ERROR", async () => {
    const bytes = await pptxBytes([[]]);
    const res = await extractDocumentText(bytes, "deck-solo-imagenes.pptx");
    expect(res).toEqual({ ok: false, code: "SIN_TEXTO" });
  });

  it("extracts the text of an xlsx (exceljs)", async () => {
    const bytes = await xlsxBytes();
    const res = await extractDocumentText(bytes, "clientes.xlsx");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.texto).toContain("Alcaldía de Cali");
      expect(res.texto).toContain("Gobierno local");
    }
  });

  it("returns SIN_TEXTO for a jpg (no OCR by policy)", async () => {
    const res = await extractDocumentText(new Uint8Array([1, 2, 3]), "foto.jpg", "image/jpeg");
    expect(res).toEqual({ ok: false, code: "SIN_TEXTO" });
  });

  it("never throws: an invalid pdf returns ERROR, not a crash", async () => {
    const res = await extractDocumentText(new Uint8Array([1, 2, 3]), "roto.pdf", "application/pdf");
    expect(res).toEqual({ ok: false, code: "ERROR" });
  });
});