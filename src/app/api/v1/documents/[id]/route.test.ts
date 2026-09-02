import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: vi.fn(),
    },
    documento: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    documentoVersion: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    documentoCliente: {
      findMany: vi.fn(),
    },
    usuario: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { DELETE, GET } from "./route";

const colaborador = {
  id: "user-1",
  nombre: "Colab Uno",
  rol: "COLABORADOR",
} as Usuario;

const admin = {
  id: "admin-1",
  nombre: "Admin Uno",
  rol: "ADMINISTRADOR",
} as Usuario;

function docRow(overrides: Partial<{ id: string; categoria: string; autor_id: string }> = {}) {
  return {
    id: overrides.id ?? "doc-1",
    titulo: "Informe final",
    categoria: overrides.categoria ?? "Comercial",
    etiquetas: [],
    autor_id: overrides.autor_id ?? "user-1",
    created_at: new Date("2026-01-01"),
    deleted_at: null,
    carpeta_id: null,
  };
}

function mockNoSettingRow() {
  // db.setting.findUnique returning null makes loadDocCategories fall back
  // to the factory constants (Legal / Administrativo-financiero restricted).
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
}

function baseGetMocks() {
  vi.mocked(db.documentoVersion.findMany).mockResolvedValue([]);
  vi.mocked(db.documentoVersion.groupBy).mockResolvedValue([]);
  vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);
  vi.mocked(db.usuario.findMany).mockResolvedValue([]);
}

function routeContext(id = "doc-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  mockNoSettingRow();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/documents/:id", () => {
  it("returns the document for a full-access role regardless of category", async () => {
    baseGetMocks();
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Legal" }));

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documento.id).toBe("doc-1");
  });

  it("returns 403 when a COLABORADOR reads a document in a restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Legal" }));

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the document to a COLABORADOR for a non-restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    baseGetMocks();
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Comercial" }));

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documento.id).toBe("doc-1");
  });

  it("returns 404 when the document does not exist", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("DELETE /api/v1/documents/:id", () => {
  it("soft-deletes the document for a full-access role", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ autor_id: "someone-else" }));
    vi.mocked(db.documento.update).mockResolvedValue(docRow());

    const res = await DELETE(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(204);
    expect(db.documento.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { deleted_at: expect.any(Date) },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "documento", entidad_id: "doc-1", accion: "eliminar" }),
    );
  });

  it("returns 403 when a COLABORADOR deletes a document in a restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(
      docRow({ categoria: "Legal", autor_id: "user-1" }),
    );

    const res = await DELETE(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.documento.update).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR to delete their own document in a non-restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(
      docRow({ categoria: "Comercial", autor_id: "user-1" }),
    );
    vi.mocked(db.documento.update).mockResolvedValue(docRow());

    const res = await DELETE(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(204);
  });

  it("returns 403 when a COLABORADOR deletes a document authored by someone else", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(
      docRow({ categoria: "Comercial", autor_id: "otro-usuario" }),
    );

    const res = await DELETE(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(403);
    expect(db.documento.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the document to delete does not exist", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/documents/doc-1"), routeContext());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});
