import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_FILE_EXTENSIONS,
  DEFAULT_MAX_FILE_MB,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  isAllowedFileType,
  isAllowedNameAndMime,
  fileExtension,
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

  // S0.9a: the rule changed from OR to AND. A friendly MIME used to carry a
  // file on its own, so `sin-extension` with a PPTX MIME was accepted. The
  // extension now decides the identity and the MIME may only confirm it: a
  // file with no allowed extension is rejected no matter what it declares.
  it("rejects a MIME-only file with no allowed extension (AND rule)", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "sin-extension", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    expect(isAllowedFileType(file)).toBe(false);
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

describe("isAllowedNameAndMime (JSON endpoints, S0.9b)", () => {
  it("mirrors the File-based rule for a bare name and MIME string", () => {
    // The sign endpoint has no File, only the declared name/MIME, so the AND
    // rule had to be reusable without constructing a File.
    expect(isAllowedNameAndMime("informe.pdf", "application/pdf")).toBe(true);
    expect(isAllowedNameAndMime("informe.pdf", null)).toBe(true);
    expect(isAllowedNameAndMime("informe.pdf", undefined)).toBe(true);
    expect(isAllowedNameAndMime("informe.pdf", "application/octet-stream")).toBe(true);
    expect(isAllowedNameAndMime("report.exe", "application/pdf")).toBe(false);
    expect(isAllowedNameAndMime("sin-extension", "application/pdf")).toBe(false);
  });
});

describe("unified upload policy — 25 MB and a strict allowlist (S0.9a)", () => {
  it("rejects a real 25 MB + 1 byte file against the shared 25 MB limit (message asserted in the route tests)", () => {
    // R3-003: this title used to promise a file and a message it never built.
    // The shared guard every upload route applies is `file.size > MAX_FILE_BYTES`
    // and the 413 message they render interpolates MAX_FILE_MB, so the limit is
    // what makes the user read "supera el límite de 25 MB." A real File drives
    // the byte comparison here; the byte-exact 413 body is asserted in the
    // route tests, where the whole request/response cycle is observable.
    const bigFile = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });
    expect(DEFAULT_MAX_FILE_MB).toBe(25);
    expect(MAX_FILE_MB).toBe(25);
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(bigFile.size).toBe(25 * 1024 * 1024 + 1);
    expect(bigFile.size > MAX_FILE_BYTES).toBe(true);
    expect(isAllowedFileType(bigFile)).toBe(true);
  });

  it("accepts exactly 25 MB", () => {
    const exactlyTwentyFiveMb = 25 * 1024 * 1024;
    expect(MAX_FILE_BYTES).toBe(exactlyTwentyFiveMb);
    // Boundary is exclusive: 25 MB + 1 byte is rejected, exactly 25 MB is not.
    expect(exactlyTwentyFiveMb > MAX_FILE_BYTES).toBe(false);
  });

  it("rejects report.exe sent with MIME application/pdf", () => {
    // Regression the AND rule exists for: the old OR check let a disallowed
    // extension through on a friendly MIME (an executable labelled as PDF).
    const spoofed = new File([new Uint8Array([1])], "report.exe", { type: "application/pdf" });
    expect(isAllowedFileType(spoofed)).toBe(false);
  });

  it("accepts photo.JPG with an empty MIME", () => {
    const file = new File([new Uint8Array([1])], "photo.JPG", { type: "" });
    expect(isAllowedFileType(file)).toBe(true);
  });

  it("accepts photo.jpeg with an empty MIME", () => {
    // `.jpeg` is the same format as `.jpg`; rejecting it would be an
    // accidental regression, not a policy narrowing.
    const file = new File([new Uint8Array([1])], "photo.jpeg", { type: "" });
    expect(isAllowedFileType(file)).toBe(true);
  });

  it("keeps the allowlist narrow: pdf, docx, xlsx, pptx, jpg, jpeg, png only", () => {
    expect([...ALLOWED_FILE_EXTENSIONS].sort()).toEqual([
      "docx",
      "jpeg",
      "jpg",
      "pdf",
      "png",
      "pptx",
      "xlsx",
    ]);
  });

  it("MAX_FILE_SIZE_MB overrides the default", async () => {
    const original = process.env.MAX_FILE_SIZE_MB;
    try {
      for (const [configured, expected] of [["5", 5], ["10", 10]] as const) {
        process.env.MAX_FILE_SIZE_MB = configured;
        vi.resetModules();
        const reloaded = await import("./files");
        expect(reloaded.MAX_FILE_MB, `MAX_FILE_SIZE_MB=${configured}`).toBe(expected);
        expect(reloaded.MAX_FILE_BYTES).toBe(expected * 1024 * 1024);
        expect(reloaded.DEFAULT_MAX_FILE_MB).toBe(25);
      }
    } finally {
      if (original === undefined) delete process.env.MAX_FILE_SIZE_MB;
      else process.env.MAX_FILE_SIZE_MB = original;
      vi.resetModules();
    }
  });

  it("falls back to the 25 MB default when MAX_FILE_SIZE_MB is unusable", async () => {
    const original = process.env.MAX_FILE_SIZE_MB;
    try {
      // "5abc" and "2.9" matter: Number.parseInt would read them as 5 and 2, so
      // an operator typo would silently LOWER the limit instead of falling back.
      for (const unusable of ["", "not-a-number", "0", "-3", "5abc", "2.9"]) {
        process.env.MAX_FILE_SIZE_MB = unusable;
        vi.resetModules();
        const reloaded = await import("./files");
        expect(reloaded.MAX_FILE_MB, `MAX_FILE_SIZE_MB=${JSON.stringify(unusable)}`).toBe(25);
        expect(reloaded.MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
      }
    } finally {
      if (original === undefined) delete process.env.MAX_FILE_SIZE_MB;
      else process.env.MAX_FILE_SIZE_MB = original;
      vi.resetModules();
    }
  });
});
