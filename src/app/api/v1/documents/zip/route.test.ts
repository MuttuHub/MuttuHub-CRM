import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
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
      findMany: vi.fn(),
    },
    documentoVersion: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

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

function mockNoSettingRow() {
  // loadDocCategories falls back to the factory constants (Legal /
  // Administrativo-financiero restricted) when there's no settings row.
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
}

function postRequest(ids: string[]): Request {
  return new Request("http://localhost/api/v1/documents/zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

/** Wires groupBy + findMany so loadActiveVersions resolves one version per doc id. */
function mockActiveVersions(
  versions: { documento_id: string; numero_version: number; storage_path: string }[],
) {
  vi.mocked(db.documentoVersion.groupBy).mockResolvedValue(
    versions.map((v) => ({
      documento_id: v.documento_id,
      _max: { numero_version: v.numero_version },
    })) as never,
  );
  vi.mocked(db.documentoVersion.findMany).mockResolvedValue(
    versions.map((v) => ({
      id: `${v.documento_id}-v${v.numero_version}`,
      documento_id: v.documento_id,
      numero_version: v.numero_version,
      storage_path: v.storage_path,
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
    })) as never,
  );
}

function mockSignedUrlPerPath() {
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn((path: string) =>
          Promise.resolve({ data: { signedUrl: `https://storage.example/${path}` }, error: null }),
        ),
      }),
    },
  } as never);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  mockNoSettingRow();
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/v1/documents/zip", () => {
  it("bundles multiple documents into a zip (happy path)", async () => {
    vi.mocked(db.documento.findMany).mockResolvedValue([
      { id: "doc-1", titulo: "Informe uno", categoria: "Comercial" },
      { id: "doc-2", titulo: "Informe dos", categoria: "Comercial" },
    ] as never);
    mockActiveVersions([
      { documento_id: "doc-1", numero_version: 1, storage_path: "documentos/general/doc-1/v1_informe.pdf" },
      { documento_id: "doc-2", numero_version: 1, storage_path: "documentos/general/doc-2/v1_informe.pdf" },
    ]);
    mockSignedUrlPerPath();

    const res = await POST(postRequest(["doc-1", "doc-2"]));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(zip.files);
    expect(names).toContain("Informe uno_v1.pdf");
    expect(names).toContain("Informe dos_v1.pdf");
    expect(names).not.toContain("README.txt");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 403 before any signed URL when one selected document is in a restricted category (all-or-nothing)", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findMany).mockResolvedValue([
      { id: "doc-1", titulo: "Informe uno", categoria: "Comercial" },
      { id: "doc-2", titulo: "Contrato", categoria: "Legal" },
    ] as never);

    const res = await POST(postRequest(["doc-1", "doc-2"]));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR when any selected document is restricted, even if others aren't", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findMany).mockResolvedValue([
      { id: "doc-1", titulo: "Informe uno", categoria: "Comercial" },
      { id: "doc-2", titulo: "Contrato", categoria: "Legal" },
    ] as never);

    const res = await POST(postRequest(["doc-1", "doc-2"]));

    expect(res.status).toBe(403);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR to zip documents that are all in non-restricted categories", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findMany).mockResolvedValue([
      { id: "doc-1", titulo: "Informe uno", categoria: "Comercial" },
    ] as never);
    mockActiveVersions([
      { documento_id: "doc-1", numero_version: 1, storage_path: "documentos/general/doc-1/v1_informe.pdf" },
    ]);
    mockSignedUrlPerPath();

    const res = await POST(postRequest(["doc-1"]));

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to zip documents in restricted categories", async () => {
    vi.mocked(db.documento.findMany).mockResolvedValue([
      { id: "doc-1", titulo: "Contrato", categoria: "Legal" },
    ] as never);
    mockActiveVersions([
      { documento_id: "doc-1", numero_version: 1, storage_path: "documentos/general/doc-1/v1_contrato.pdf" },
    ]);
    mockSignedUrlPerPath();

    const res = await POST(postRequest(["doc-1"]));

    expect(res.status).toBe(200);
  });

  it("skips a document whose fetch fails and adds a README.txt with the failure, keeping the rest", async () => {
    vi.mocked(db.documento.findMany).mockResolvedValue([
      { id: "doc-1", titulo: "Informe uno", categoria: "Comercial" },
      { id: "doc-2", titulo: "Informe dos", categoria: "Comercial" },
    ] as never);
    mockActiveVersions([
      { documento_id: "doc-1", numero_version: 1, storage_path: "documentos/general/doc-1/v1_informe.pdf" },
      { documento_id: "doc-2", numero_version: 1, storage_path: "documentos/general/doc-2/v1_informe.pdf" },
    ]);
    mockSignedUrlPerPath();
    fetchMock.mockImplementation((url: string) =>
      url.includes("doc-2")
        ? Promise.resolve({ ok: false, status: 500 })
        : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) }),
    );

    const res = await POST(postRequest(["doc-1", "doc-2"]));

    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(zip.files);
    expect(names).toContain("Informe uno_v1.pdf");
    expect(names).not.toContain("Informe dos_v1.pdf");
    expect(names).toContain("README.txt");
    const readme = await zip.files["README.txt"]!.async("text");
    expect(readme).toContain("Informe dos");
  });

  it("rejects more than the 50-document limit (400)", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `doc-${i}`);

    const res = await POST(postRequest(ids));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.documento.findMany).not.toHaveBeenCalled();
  });

  it("rejects an empty ids array (400)", async () => {
    const res = await POST(postRequest([]));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when one of the ids does not exist", async () => {
    vi.mocked(db.documento.findMany).mockResolvedValue([
      { id: "doc-1", titulo: "Informe uno", categoria: "Comercial" },
    ] as never);

    const res = await POST(postRequest(["doc-1", "doc-inexistente"]));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 500 when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await POST(postRequest(["doc-1"]));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(db.documento.findMany).not.toHaveBeenCalled();
  });
});
