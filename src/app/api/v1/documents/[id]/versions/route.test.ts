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
      findFirst: vi.fn(),
    },
    documentoVersion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

function uploadForm(fields: Record<string, string> = {}, file?: File): FormData {
  const form = new FormData();
  form.set("file", file ?? new File([new Uint8Array([1, 2, 3])], "informe.pdf", { type: "application/pdf" }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

function postRequest(form: FormData): Request {
  return new Request("http://localhost/api/v1/documents/doc-1/versions", { method: "POST", body: form });
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

describe("GET /api/v1/documents/:id/versions", () => {
  it("lists versions for a full-access role regardless of category", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Legal" }));
    vi.mocked(db.documentoVersion.findMany).mockResolvedValue([
      {
        id: "v-2",
        documento_id: "doc-1",
        numero_version: 2,
        storage_path: "documentos/general/doc-1/v2_informe.pdf",
        tamano_bytes: 10,
        tipo_archivo: "application/pdf",
        subido_por_id: "admin-1",
        created_at: new Date("2026-01-02"),
      },
    ] as never);
    vi.mocked(db.usuario.findMany).mockResolvedValue([{ id: "admin-1", nombre: "Admin Uno" }] as never);

    const res = await GET(
      new Request("http://localhost/api/v1/documents/doc-1/versions"),
      routeContext(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versiones).toHaveLength(1);
    expect(body.versiones[0]).toMatchObject({ numero_version: 2, subido_por_nombre: "Admin Uno" });
  });

  it("returns 403 when a COLABORADOR lists versions of a restricted category document", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Legal" }));

    const res = await GET(
      new Request("http://localhost/api/v1/documents/doc-1/versions"),
      routeContext(),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a COLABORADOR to list versions of a non-restricted category document", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Comercial" }));
    vi.mocked(db.documentoVersion.findMany).mockResolvedValue([]);
    vi.mocked(db.usuario.findMany).mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/v1/documents/doc-1/versions"),
      routeContext(),
    );

    expect(res.status).toBe(200);
  });

  it("returns 404 when the document does not exist", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/documents/doc-1/versions"),
      routeContext(),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("POST /api/v1/documents/:id/versions", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never);
    vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);
  });

  it("creates version 1 when the document has no prior versions", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-1",
      documento_id: "doc-1",
      numero_version: 1,
      storage_path: "documentos/general/doc-1/v1_informe.pdf",
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(postRequest(uploadForm()), routeContext());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(db.documentoVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ numero_version: 1 }) }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "documento", entidad_id: "doc-1", accion: "editar" }),
    );
  });

  it("numbers the new version as max(numero_version) + 1", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue({ numero_version: 3 } as never);
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-4",
      documento_id: "doc-1",
      numero_version: 4,
      storage_path: "documentos/general/doc-1/v4_informe.pdf",
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-04"),
    } as never);

    const res = await POST(postRequest(uploadForm()), routeContext());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(4);
    expect(db.documentoVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ numero_version: 4 }) }),
    );
  });

  it("returns 403 when a COLABORADOR uploads a version to a restricted category document", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Legal" }));

    const res = await POST(postRequest(uploadForm()), routeContext());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR to upload a version to a non-restricted category document", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: colaborador,
      supabaseUser: {} as never,
    });
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow({ categoria: "Comercial" }));
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-1",
      documento_id: "doc-1",
      numero_version: 1,
      storage_path: "documentos/general/doc-1/v1_informe.pdf",
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "user-1",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(postRequest(uploadForm()), routeContext());

    expect(res.status).toBe(201);
  });

  it("returns 404 when the document does not exist", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(uploadForm()), routeContext());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("rejects a disallowed file type (400)", async () => {
    const badFile = new File([new Uint8Array([1])], "malware.exe", { type: "application/x-msdownload" });

    const res = await POST(postRequest(uploadForm({}, badFile)), routeContext());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  // S0.9a: the ceiling moved from a hardcoded 10 MB to the shared 25 MB
  // (MAX_FILE_SIZE_MB). The size guard runs inside parseUploadForm, BEFORE the
  // document lookup, so an over-limit body still answers 413 with no valid
  // document fixture — that ordering is deliberate and asserted here.
  it("rejects a file over the 25 MB limit (413)", async () => {
    const bigFile = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm({}, bigFile)), routeContext());

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(body.error).toBe("El archivo supera el límite de 25 MB.");
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("accepts exactly 25 MB", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-limite",
      documento_id: "doc-1",
      numero_version: 1,
      storage_path: "documentos/general/doc-1/v1_limite.pdf",
      tamano_bytes: 25 * 1024 * 1024,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
    } as never);
    const atLimit = new File([new Uint8Array(25 * 1024 * 1024)], "limite.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm({}, atLimit)), routeContext());

    expect(res.status).toBe(201);
  });

  // The behaviour change itself, not just the new ceiling: 10 MB + 1 byte is
  // the exact size the old 10 MB policy rejected and the unified policy accepts.
  it("accepts a 10 MB + 1 byte file the old 10 MB ceiling rejected (S0.9a)", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-11",
      documento_id: "doc-1",
      numero_version: 1,
      storage_path: "documentos/general/doc-1/v1_once.pdf",
      tamano_bytes: 10 * 1024 * 1024 + 1,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
    } as never);
    const onceRejected = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "once.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm({}, onceRejected)), routeContext());

    expect(res.status).toBe(201);
  });

  it("returns 500 when Supabase is not configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await POST(postRequest(uploadForm()), routeContext());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("returns 500 when the upload to storage fails", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: new Error("boom") }),
        }),
      },
    } as never);

    const res = await POST(postRequest(uploadForm()), routeContext());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });
});

// ADR-13 signed-upload confirm mode (S0.9b): the browser uploaded straight to
// Storage, so it confirms with JSON { storage_path, nombre, tamano_bytes }
// instead of multipart bytes. The route authorises exactly like the multipart
// path, rejects a key that does not belong to this document, verifies the
// object in Storage and inserts the same row (same audit, same response shape).
describe("POST /api/v1/documents/:id/versions — signed-upload confirm mode", () => {
  function confirmRequest(body: unknown): Request {
    return new Request("http://localhost/api/v1/documents/doc-1/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function mockInfo(size: number | null) {
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          info: vi.fn().mockResolvedValue(
            size === null
              ? { data: null, error: new Error("not found") }
              : { data: { size }, error: null },
          ),
        }),
      },
    } as never);
  }

  beforeEach(() => {
    vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);
  });

  it("confirm rejects a storage_path outside the key issued for this project", async () => {
    mockInfo(3);
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());

    for (const storage_path of [
      "documentos/general/other-doc/v1_informe.pdf",
      "documentos/general/doc-1evil/v1_informe.pdf",
      "tareas/doc-1/abc_informe.pdf",
      "/documentos/general/doc-1/v1_informe.pdf",
      "documentos/general/doc-1/../doc-1/v1_informe.pdf",
    ]) {
      const res = await POST(
        confirmRequest({ storage_path, nombre: "informe.pdf", tamano_bytes: 3 }),
        routeContext(),
      );
      expect(res.status, storage_path).toBe(400);
      const body = await res.json();
      expect(body.code, storage_path).toBe("VALIDATION_ERROR");
      expect(body.error, storage_path).toContain("no corresponde");
    }
    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("confirm rejects when the storage object is missing or larger than declared", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());

    mockInfo(null);
    const missing = await POST(
      confirmRequest({
        storage_path: "documentos/general/doc-1/v1_informe.pdf",
        nombre: "informe.pdf",
        tamano_bytes: 3,
      }),
      routeContext(),
    );
    expect(missing.status).toBe(400);
    const missingBody = await missing.json();
    expect(missingBody.code).toBe("VALIDATION_ERROR");
    expect(missingBody.error).toContain("no está disponible");

    mockInfo(999);
    const oversized = await POST(
      confirmRequest({
        storage_path: "documentos/general/doc-1/v1_informe.pdf",
        nombre: "informe.pdf",
        tamano_bytes: 3,
      }),
      routeContext(),
    );
    expect(oversized.status).toBe(400);
    const oversizedBody = await oversized.json();
    expect(oversizedBody.code).toBe("VALIDATION_ERROR");
    expect(oversizedBody.error).toContain("no está disponible");

    expect(db.documentoVersion.create).not.toHaveBeenCalled();
  });

  it("confirm inserts the row and audits when the object exists and matches", async () => {
    mockInfo(3);
    vi.mocked(db.documento.findFirst).mockResolvedValue(docRow());
    vi.mocked(db.documentoVersion.create).mockResolvedValue({
      id: "v-1",
      documento_id: "doc-1",
      numero_version: 1,
      storage_path: "documentos/general/doc-1/v1_informe.pdf",
      tamano_bytes: 3,
      tipo_archivo: "application/pdf",
      subido_por_id: "admin-1",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(
      confirmRequest({
        storage_path: "documentos/general/doc-1/v1_informe.pdf",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        tipo_mime: "application/pdf",
      }),
      routeContext(),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(db.documentoVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documento_id: "doc-1",
          numero_version: 1,
          storage_path: "documentos/general/doc-1/v1_informe.pdf",
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "documento", entidad_id: "doc-1", accion: "editar" }),
    );
  });
});
