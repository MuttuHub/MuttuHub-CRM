import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: vi.fn(),
    },
    documento: {
      findFirst: vi.fn(),
    },
    documentoVersion: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

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

function docRow(overrides: Partial<{ id: string; categoria: string }> = {}) {
  return {
    id: overrides.id ?? "doc-1",
    categoria: overrides.categoria ?? "Comercial",
  } as never;
}

function mockNoSettingRow() {
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
}

function routeContext(id = "doc-1") {
  return { params: Promise.resolve({ id }) };
}

function mockSignedUrl(url = "https://storage.example/signed") {
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: url }, error: null }),
      }),
    },
  } as never);
}

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  mockNoSettingRow();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/documents/:id/download", () => {
  it("redirects to a signed URL for a full-access role regardless of category", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Legal" }));
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue({
      storage_path: "documentos/general/doc-1/v1_informe.pdf",
    } as never);
    mockSignedUrl();

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1/download"), routeContext());

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/signed");
  });

  it("returns 403 for a COLABORADOR before generating any signed URL for a restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Legal" }));

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1/download"), routeContext());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("redirects a COLABORADOR to a signed URL for a non-restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Comercial" }));
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue({
      storage_path: "documentos/general/doc-1/v1_informe.pdf",
    } as never);
    mockSignedUrl();

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1/download"), routeContext());

    expect(res.status).toBe(302);
  });

  it("returns 404 when the document does not exist", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1/download"), routeContext());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 404 when the document has no versions", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1/download"), routeContext());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 500 when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1/download"), routeContext());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("returns 500 when the signed URL generation fails", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue({
      storage_path: "documentos/general/doc-1/v1_informe.pdf",
    } as never);
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
        }),
      },
    } as never);

    const res = await GET(new Request("http://localhost/api/v1/documents/doc-1/download"), routeContext());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
