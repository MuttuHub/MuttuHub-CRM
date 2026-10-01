// Shared create-document gates (QA audit #4 + PRD §6.2). The ADR-13 sign
// endpoint calls the guard BEFORE it issues the upload URL (so a bad categoria
// or a duplicate title never reaches Storage), and the JSON confirm branch calls
// it again as defence in depth (the sign→confirm race is unavoidable).
//
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: vi.fn(),
    },
    documento: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { guardDocumentCreate, MAX_TITULO_LENGTH } from "./documents";

const gerencia = { id: "gerencia-1", nombre: "Gerencia", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", nombre: "Colab", rol: "COLABORADOR" } as Usuario;

beforeEach(() => {
  vi.clearAllMocks();
  // No settings row -> loadDocCategories falls back to the factory catalog
  // (Comercial…Otro; Legal / Administrativo-financiero restricted).
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
  vi.mocked(db.documento.findFirst).mockResolvedValue(null);
});

describe("guardDocumentCreate", () => {
  it("accepts a valid categoria and returns the normalized titulo", async () => {
    const result = await guardDocumentCreate({
      usuario: gerencia,
      titulo: "  Informe final  ",
      categoria: "Comercial",
      force: false,
    });

    expect(result).toEqual({ ok: true, titulo: "Informe final" });
  });

  it("truncates the titulo to MAX_TITULO_LENGTH", async () => {
    const result = await guardDocumentCreate({
      usuario: gerencia,
      titulo: "x".repeat(MAX_TITULO_LENGTH + 50),
      categoria: "Comercial",
      force: false,
    });

    expect(result.ok && result.titulo.length).toBe(MAX_TITULO_LENGTH);
  });

  it("rejects a categoria that is not in the live catalog (400)", async () => {
    const result = await guardDocumentCreate({
      usuario: gerencia,
      titulo: "Informe",
      categoria: "NoExiste",
      force: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a restricted categoria for a COLABORADOR (403)", async () => {
    const result = await guardDocumentCreate({
      usuario: colaborador,
      titulo: "Informe",
      categoria: "Legal",
      force: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the duplicate-title 409 envelope with the existing documento", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue({
      id: "doc-existing",
      titulo: "Informe final",
    } as never);

    const result = await guardDocumentCreate({
      usuario: gerencia,
      titulo: "Informe final",
      categoria: "Comercial",
      force: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
    expect(await result.response.json()).toMatchObject({
      code: "CONFLICT",
      documento: { id: "doc-existing", titulo: "Informe final" },
    });
  });

  it("skips the duplicate lookup when force is true", async () => {
    const result = await guardDocumentCreate({
      usuario: gerencia,
      titulo: "Informe final",
      categoria: "Comercial",
      force: true,
    });

    expect(result).toEqual({ ok: true, titulo: "Informe final" });
    expect(db.documento.findFirst).not.toHaveBeenCalled();
  });

  // H3: the lookup must stay case-insensitive AND scoped to live rows. Without
  // these exact assertions, dropping either `mode: "insensitive"` or
  // `deleted_at: null` from the guard would not fail any test.
  it("scopes the duplicate lookup to live rows with a case-insensitive title match", async () => {
    await guardDocumentCreate({
      usuario: gerencia,
      titulo: "Informe final",
      categoria: "Comercial",
      force: false,
    });

    expect(db.documento.findFirst).toHaveBeenCalledWith({
      where: {
        titulo: { equals: "Informe final", mode: "insensitive" },
        deleted_at: null,
      },
      select: { id: true, titulo: true },
    });
  });

  it("excludes restricted categories from the duplicate lookup for a COLABORADOR", async () => {
    await guardDocumentCreate({
      usuario: colaborador,
      titulo: "Informe final",
      categoria: "Comercial",
      force: false,
    });

    expect(db.documento.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoria: { notIn: ["Legal", "Administrativo-financiero"] },
        }),
      }),
    );
  });
});
