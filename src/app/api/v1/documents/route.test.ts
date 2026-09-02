// jsdom (the project's default vitest environment) doesn't implement
// Request.formData() correctly — every multipart POST failed with a generic
// 400 "Cuerpo de la solicitud no válido." regardless of the actual body.
// Node's native Request/FormData/File (undici) handle it correctly.
// @vitest-environment node
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
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    documentoVersion: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    documentoCliente: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    usuario: {
      findMany: vi.fn(),
    },
    cliente: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { GET, POST } from "./route";

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

function baseListMocks() {
  vi.mocked(db.documento.count).mockResolvedValue(0);
  vi.mocked(db.documentoVersion.groupBy).mockResolvedValue([]);
  vi.mocked(db.documentoVersion.findMany).mockResolvedValue([]);
  vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);
  vi.mocked(db.usuario.findMany).mockResolvedValue([]);
}

function uploadForm(fields: Record<string, string> = {}, file?: File): FormData {
  const form = new FormData();
  form.set("file", file ?? new File([new Uint8Array([1, 2, 3])], "informe.pdf", { type: "application/pdf" }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

function postRequest(form: FormData): Request {
  return new Request("http://localhost/api/v1/documents", { method: "POST", body: form });
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

describe("GET /api/v1/documents", () => {
  it("lists documents for a full-access role without restricting categories", async () => {
    baseListMocks();
    vi.mocked(db.documento.findMany).mockResolvedValue([docRow({ categoria: "Legal" })]);
    vi.mocked(db.documento.count).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/v1/documents"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    const where = vi.mocked(db.documento.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.categoria).toBeUndefined();
  });

  it("excludes restricted categories from the where clause for a COLABORADOR", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    baseListMocks();
    vi.mocked(db.documento.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/documents"));

    expect(res.status).toBe(200);
    const where = vi.mocked(db.documento.findMany).mock.calls[0]![0]!.where as { categoria?: { notIn?: string[] } };
    expect(where.categoria?.notIn).toEqual(["Legal", "Administrativo-financiero"]);
    const countWhere = vi.mocked(db.documento.count).mock.calls[0]![0]!.where as { categoria?: { notIn?: string[] } };
    expect(countWhere.categoria?.notIn).toEqual(["Legal", "Administrativo-financiero"]);
  });

  it("returns a document from a non-restricted category to a COLABORADOR", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    baseListMocks();
    vi.mocked(db.documento.findMany).mockResolvedValue([docRow({ categoria: "Comercial" })]);
    vi.mocked(db.documento.count).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/v1/documents"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  it("returns 400 for an invalid categoria filter", async () => {
    const res = await GET(new Request("http://localhost/api/v1/documents?categoria=NoExiste"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("filters by carpeta in the where clause", async () => {
    baseListMocks();
    vi.mocked(db.documento.findMany).mockResolvedValue([]);
    vi.mocked(db.documento.count).mockResolvedValue(0);

    const res = await GET(new Request("http://localhost/api/v1/documents?carpeta=folder-1"));

    expect(res.status).toBe(200);
    const where = vi.mocked(db.documento.findMany).mock.calls[0]![0]!.where as { carpeta_id?: string };
    expect(where.carpeta_id).toBe("folder-1");
  });

  it("returns 400 for an invalid page number", async () => {
    const res = await GET(new Request("http://localhost/api/v1/documents?page=0"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /api/v1/documents", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never);
    // Sin coincidencia de título por defecto; los tests de duplicados la
    // sobreescriben explícitamente.
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);
  });

  it("creates the document and its first version (201)", async () => {
    vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: "doc-new", categoria: "Comercial" }));
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-1",
      documento_id: "doc-new",
      numero_version: 1,
      storage_path: "documentos/general/doc-new/v1_informe.pdf",
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
      contenido_texto: null,
      texto_estado: null,
    });
    vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" })));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(db.documento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoria: "Comercial", autor_id: "admin-1" }) }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "documento", entidad_id: "doc-new", accion: "crear" }),
    );
  });

  it("returns 403 when a COLABORADOR uploads to a restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });

    const res = await POST(postRequest(uploadForm({ categoria: "Legal" })));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR to upload to a non-restricted category", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: "doc-new", categoria: "Comercial", autor_id: "user-1" }));
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-1",
      documento_id: "doc-new",
      numero_version: 1,
      storage_path: "documentos/general/doc-new/v1_informe.pdf",
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "user-1",
      created_at: new Date("2026-01-01"),
      contenido_texto: null,
      texto_estado: null,
    });
    vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" })));

    expect(res.status).toBe(201);
  });

  it("rejects a disallowed file type (400)", async () => {
    const badFile = new File([new Uint8Array([1])], "malware.exe", { type: "application/x-msdownload" });

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" }, badFile)));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("rejects a file over the 10 MB limit (413)", async () => {
    const bigFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" }, bigFile)));

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the form has no 'file' field", async () => {
    const form = new FormData();
    form.set("categoria", "Comercial");

    const res = await POST(postRequest(form));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for an invalid categoria", async () => {
    const res = await POST(postRequest(uploadForm({ categoria: "NoExiste" })));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("soft-deletes the orphaned document and returns 500 when the upload fails", async () => {
    vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: "doc-new", categoria: "Comercial" }));
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: new Error("boom") }),
        }),
      },
    } as never);

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" })));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(db.documento.update).toHaveBeenCalledWith({
      where: { id: "doc-new" },
      data: { deleted_at: expect.any(Date) },
    });
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" })));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("returns 400 when cliente_id does not exist", async () => {
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial", cliente_id: "no-existe" })));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  // QA audit finding #4: a duplicate title used to silently create a second,
  // independent document instead of offering to version the existing one.
  describe("duplicate title (QA audit finding #4)", () => {
    it("returns 409 with the existing document instead of creating a duplicate", async () => {
      vi.mocked(db.documento.findFirst).mockResolvedValue(
        docRow({ id: "doc-existing" }) as never,
      );

      const res = await POST(
        postRequest(uploadForm({ categoria: "Comercial", titulo: "Informe final" })),
      );

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        code: "CONFLICT",
        documento: { id: "doc-existing", titulo: "Informe final" },
      });
      expect(db.documento.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { titulo: { equals: "Informe final", mode: "insensitive" }, deleted_at: null },
        }),
      );
      expect(db.documento.create).not.toHaveBeenCalled();
    });

    it("creates the document anyway when force is true, skipping the duplicate check", async () => {
      vi.mocked(db.documento.findFirst).mockResolvedValue(
        docRow({ id: "doc-existing" }) as never,
      );
      vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: "doc-new", categoria: "Comercial" }));
      vi.mocked(db.documentoVersion.create).mockResolvedValue({
        id: "v-1",
        documento_id: "doc-new",
        numero_version: 1,
        storage_path: "documentos/general/doc-new/v1_informe.pdf",
        tamano_bytes: 3,
        tipo_archivo: "application/pdf",
        subido_por_id: "admin-1",
        created_at: new Date("2026-01-01"),
        contenido_texto: null,
        texto_estado: null,
      });
      vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);

      const res = await POST(
        postRequest(uploadForm({ categoria: "Comercial", titulo: "Informe final", force: "true" })),
      );

      expect(res.status).toBe(201);
      expect(db.documento.findFirst).not.toHaveBeenCalled();
      expect(db.documento.create).toHaveBeenCalled();
    });

    // Code review finding on PR #23: the duplicate-title lookup didn't
    // exclude restricted categories for a COLABORADOR, so a 409 could leak
    // the existence/id of a document in a category that role can't even list.
    it("excludes restricted categories from the duplicate lookup for a COLABORADOR", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({
        ok: true,
        usuario: colaborador,
        supabaseUser: {} as never,
      });
      vi.mocked(db.documento.findFirst).mockResolvedValue(null);
      vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: "doc-new", categoria: "Comercial", autor_id: "user-1" }));
      vi.mocked(db.documentoVersion.create).mockResolvedValue({
        id: "v-1",
        documento_id: "doc-new",
        numero_version: 1,
        storage_path: "documentos/general/doc-new/v1_informe.pdf",
        tamano_bytes: 3,
        tipo_archivo: "application/pdf",
        subido_por_id: "user-1",
        created_at: new Date("2026-01-01"),
        contenido_texto: null,
        texto_estado: null,
      });
      vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);

      const res = await POST(
        postRequest(uploadForm({ categoria: "Comercial", titulo: "Informe final" })),
      );

      expect(res.status).toBe(201);
      expect(db.documento.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoria: { notIn: ["Legal", "Administrativo-financiero"] },
          }),
        }),
      );
    });

    // Code review finding on PR #23: the lookup ran outside the try/catch,
    // so a DB error there crashed with a raw 500 instead of the {error, code}
    // envelope every other failure in this handler returns.
    it("returns the standard error envelope when the duplicate lookup itself fails", async () => {
      vi.mocked(db.documento.findFirst).mockRejectedValue(new Error("db down"));

      const res = await POST(
        postRequest(uploadForm({ categoria: "Comercial", titulo: "Informe final" })),
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    });
  });
});
