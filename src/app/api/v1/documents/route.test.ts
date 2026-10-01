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
      update: vi.fn(),
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
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

vi.mock("@/lib/api/extract-text", () => ({
  extractForVersion: vi.fn().mockResolvedValue({
    contenido_texto: null,
    texto_estado: "sin_texto",
  }),
}));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { extractForVersion } from "@/lib/api/extract-text";
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

  it("searches content via the FTS candidate query and marks the match", async () => {
    baseListMocks();
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      { id: "doc-1", match: "contenido" },
      { id: "doc-2", match: "metadatos" },
    ]);
    vi.mocked(db.documento.findMany).mockResolvedValue([
      docRow({ id: "doc-1", categoria: "Comercial" }),
      docRow({ id: "doc-2", categoria: "Comercial" }),
    ]);
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      { id: "doc-1", headline: "…de «contrato marco» vigente…" },
    ]);

    const res = await GET(new Request("http://localhost/api/v1/documents?q=contrato"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    const doc1 = body.items.find((i: { id: string }) => i.id === "doc-1");
    const doc2 = body.items.find((i: { id: string }) => i.id === "doc-2");
    expect(doc1).toMatchObject({ match: "contenido", snippet: "…de «contrato marco» vigente…" });
    expect(doc2.match).toBe("metadatos");
    expect(doc2.snippet).toBeUndefined();
  });

  it("runs ts_headline only for the matched ids on the page", async () => {
    baseListMocks();
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      { id: "doc-1", match: "contenido" },
    ]);
    vi.mocked(db.documento.findMany).mockResolvedValue([
      docRow({ id: "doc-1", categoria: "Comercial" }),
    ]);
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      { id: "doc-1", headline: "snippet" },
    ]);

    await GET(new Request("http://localhost/api/v1/documents?q=algo"));

    // $queryRaw se llama exactamente dos veces: candidatos + ts_headline.
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
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

  // S0.9a: the ceiling moved from a hardcoded 10 MB to the shared 25 MB
  // (MAX_FILE_SIZE_MB). The size guard runs before any DB write, so an
  // over-limit body answers 413 with no document fixture at all.
  it("rejects a file over the 25 MB limit (413)", async () => {
    const bigFile = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" }, bigFile)));

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(body.error).toBe("El archivo supera el límite de 25 MB.");
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("accepts exactly 25 MB", async () => {
    vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: "doc-limite", categoria: "Comercial" }));
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-limite",
      documento_id: "doc-limite",
      numero_version: 1,
      storage_path: "documentos/general/doc-limite/v1_limite.pdf",
      tamano_bytes: 25 * 1024 * 1024,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
      contenido_texto: null,
      texto_estado: null,
    } as never);
    const atLimit = new File([new Uint8Array(25 * 1024 * 1024)], "limite.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" }, atLimit)));

    expect(res.status).toBe(201);
  });

  // The behaviour change itself, not just the new ceiling: 10 MB + 1 byte is
  // the exact size the old 10 MB policy rejected and the unified policy accepts.
  it("accepts a 10 MB + 1 byte file the old 10 MB ceiling rejected (S0.9a)", async () => {
    vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: "doc-11", categoria: "Comercial" }));
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-11",
      documento_id: "doc-11",
      numero_version: 1,
      storage_path: "documentos/general/doc-11/v1_once.pdf",
      tamano_bytes: 10 * 1024 * 1024 + 1,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
      contenido_texto: null,
      texto_estado: null,
    } as never);
    const onceRejected = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "once.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm({ categoria: "Comercial" }, onceRejected)));

    expect(res.status).toBe(201);
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

// ADR-13 signed-upload document CREATION (S0.9b item 1): the browser uploaded a
// brand-new document straight to Storage with a URL signed for the FINAL key
// documentos/{cliente}/{id}/v1_{nombre}. The confirm branch creates the row with
// THAT id, re-checking the key ownership, the object size and the whole upload
// policy — never trusting a client-supplied id.
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const CONFIRM_PATH = `documentos/general/${DOC_ID}/v1_informe.pdf`;

describe("POST /api/v1/documents — signed-upload confirm mode", () => {
  function confirmRequest(body: unknown): Request {
    return new Request("http://localhost/api/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function confirmBody(overrides: Record<string, unknown> = {}) {
    return {
      storage_path: CONFIRM_PATH,
      documento_id: DOC_ID,
      nombre: "informe.pdf",
      tamano_bytes: 3,
      tipo_mime: "application/pdf",
      titulo: "Informe final",
      categoria: "Comercial",
      etiquetas: [],
      ...overrides,
    };
  }

  function mockStorage(size: number | null) {
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          info: vi.fn().mockResolvedValue(
            size === null
              ? { data: null, error: new Error("not found") }
              : { data: { size }, error: null },
          ),
          download: vi.fn().mockResolvedValue({
            data: new Blob([new Uint8Array([1, 2, 3])]),
            error: null,
          }),
        }),
      },
    } as never);
  }

  function mockStorageThrow() {
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          info: vi.fn().mockRejectedValue(new Error("storage down")),
        }),
      },
    } as never);
  }

  function mockCreateOk() {
    vi.mocked(db.documento.create).mockResolvedValue(docRow({ id: DOC_ID }) as never);
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-1",
      documento_id: DOC_ID,
      numero_version: 1,
      storage_path: CONFIRM_PATH,
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
      contenido_texto: null,
      texto_estado: null,
    } as never);
    vi.mocked(db.documentoVersion.update).mockResolvedValue({} as never);
    vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);
  }

  beforeEach(() => {
    mockStorage(3);
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);
  });

  it("creates the document with the id derived from the signed key, its v1 version, audit and extraction", async () => {
    mockCreateOk();

    const res = await POST(confirmRequest(confirmBody()));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(db.documento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: DOC_ID,
          titulo: "Informe final",
          categoria: "Comercial",
          autor_id: "admin-1",
        }),
      }),
    );
    expect(db.documentoVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documento_id: DOC_ID,
          numero_version: 1,
          storage_path: CONFIRM_PATH,
          tamano_bytes: 3,
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "documento", entidad_id: DOC_ID, accion: "crear" }),
    );
    expect(extractForVersion).toHaveBeenCalled();
    // The extracted fields must actually be persisted, not just a bare update.
    expect(db.documentoVersion.update).toHaveBeenCalledWith({
      where: { id: "v-1" },
      data: { contenido_texto: null, texto_estado: "sin_texto" },
    });
  });

  it("fails closed when the storage_path does not match the declared document id or key shape", async () => {
    mockCreateOk();

    for (const body of [
      confirmBody({ storage_path: `documentos/general/other-doc/v1_informe.pdf` }),
      confirmBody({ storage_path: `documentos/general/${DOC_ID}evil/v1_informe.pdf` }),
      confirmBody({ documento_id: "other-doc" }),
      confirmBody({ storage_path: `tareas/${DOC_ID}/abc_informe.pdf` }),
      confirmBody({ storage_path: `/documentos/general/${DOC_ID}/v1_informe.pdf` }),
      confirmBody({ storage_path: `documentos/general/${DOC_ID}/../v1_informe.pdf` }),
      confirmBody({ storage_path: `documentos//${DOC_ID}/v1_informe.pdf` }),
      confirmBody({ storage_path: `documentos/general/${DOC_ID}` }),
      confirmBody({ storage_path: `documentos/general/${DOC_ID}/v1_otro.pdf` }),
      confirmBody({
        storage_path: "documentos/general/not-a-uuid/v1_informe.pdf",
        documento_id: "not-a-uuid",
      }),
    ]) {
      const res = await POST(confirmRequest(body));
      expect(res.status, JSON.stringify(body.storage_path)).toBe(400);
      const json = await res.json();
      expect(json.code, JSON.stringify(body.storage_path)).toBe("VALIDATION_ERROR");
      expect(json.error, JSON.stringify(body.storage_path)).toContain("no corresponde");
    }
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("fails closed when the declared cliente_id disagrees with the key folder", async () => {
    mockCreateOk();
    const path = `documentos/cli-1/${DOC_ID}/v1_informe.pdf`;

    const res = await POST(
      confirmRequest(confirmBody({ storage_path: path, cliente_id: "cli-2" })),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("rejects when the storage object is missing or larger than declared", async () => {
    mockCreateOk();

    mockStorage(null);
    const missing = await POST(confirmRequest(confirmBody()));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toContain("no está disponible");

    mockStorage(999);
    const oversized = await POST(confirmRequest(confirmBody()));
    expect(oversized.status).toBe(400);
    expect((await oversized.json()).error).toContain("no está disponible");

    expect(db.documento.create).not.toHaveBeenCalled();
  });

  // Correction C2: `storedObjectSize` sits outside the create try/catch and POST
  // is a bare export, so a THROWN Storage error used to escape as a framework
  // 500 instead of the {error, code} envelope. The test rejects the call rather
  // than returning an { error } object (the sibling test covers that shape).
  it("returns the error envelope when the storage info call throws", async () => {
    mockCreateOk();
    mockStorageThrow();

    const res = await POST(confirmRequest(confirmBody()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("no está disponible");
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("rejects a disallowed file name before creating anything", async () => {
    mockCreateOk();
    const res = await POST(confirmRequest(confirmBody({ nombre: "malware.exe", storage_path: `documentos/general/${DOC_ID}/v1_malware.exe` })));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("returns 409 with the existing document on a duplicate title unless force is true", async () => {
    mockCreateOk();
    vi.mocked(db.documento.findFirst).mockResolvedValue(
      docRow({ id: "doc-existing", categoria: "Comercial" }) as never,
    );

    const conflict = await POST(confirmRequest(confirmBody()));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: "CONFLICT",
      documento: { id: "doc-existing" },
    });
    expect(db.documento.create).not.toHaveBeenCalled();

    vi.mocked(db.documento.findFirst).mockClear();
    const forced = await POST(confirmRequest(confirmBody({ force: true })));
    expect(forced.status).toBe(201);
    expect(db.documento.findFirst).not.toHaveBeenCalled();
    expect(db.documento.create).toHaveBeenCalled();
  });

  it("rejects an invalid categoria and the restricted categories for a COLABORADOR", async () => {
    mockCreateOk();
    const invalid = await POST(confirmRequest(confirmBody({ categoria: "NoExiste" })));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });

    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    const restricted = await POST(confirmRequest(confirmBody({ categoria: "Legal" })));
    expect(restricted.status).toBe(403);
    expect(await restricted.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown cliente without creating anything", async () => {
    mockCreateOk();
    const path = `documentos/cli-1/${DOC_ID}/v1_informe.pdf`;
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(
      confirmRequest(confirmBody({ storage_path: path, cliente_id: "cli-1" })),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.documento.create).not.toHaveBeenCalled();
  });

  // Correction C4: assert the cliente link is actually written (it was mocked
  // but never asserted).
  it("links the cliente derived from the signed key to the new document", async () => {
    mockCreateOk();
    const path = `documentos/cli-1/${DOC_ID}/v1_informe.pdf`;
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);

    const res = await POST(
      confirmRequest(confirmBody({ storage_path: path, cliente_id: "cli-1" })),
    );

    expect(res.status).toBe(201);
    expect(db.documentoCliente.create).toHaveBeenCalledWith({
      data: { documento_id: DOC_ID, cliente_id: "cli-1" },
    });
  });

  // Correction C4: prove the extraction RESULT is written, not just that the
  // row was updated (would still pass if the fields were dropped).
  it("persists the extracted text fields returned by extractForVersion", async () => {
    mockCreateOk();
    vi.mocked(extractForVersion).mockResolvedValueOnce({
      contenido_texto: "texto extraído",
      texto_estado: "ok",
    });

    const res = await POST(confirmRequest(confirmBody()));

    expect(res.status).toBe(201);
    expect(db.documentoVersion.update).toHaveBeenCalledWith({
      where: { id: "v-1" },
      data: { contenido_texto: "texto extraído", texto_estado: "ok" },
    });
  });
});
