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

vi.mock("@/lib/db", () => {
  // $transaction calls the callback with `db` itself as `tx`, so tests keep
  // asserting on the same db.xxx.create mocks regardless of whether the
  // route wraps writes in a transaction (see PR #29 code review: the mirror
  // writes are now atomic).
  const db = {
    tarea: {
      findFirst: vi.fn(),
    },
    adjuntoTarea: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    documento: {
      create: vi.fn(),
    },
    documentoCliente: {
      create: vi.fn(),
    },
    documentoVersion: {
      create: vi.fn(),
    },
    setting: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(db)),
  };
  return { db };
});

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "task-1" }) };

/** getTaskForWrite's findFirst select shape. */
function writeTareaRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    responsable_id: overrides.responsable_id ?? "colab-1",
    cliente_id: null,
    estado: "EN_CURSO",
    motivo_bloqueo: null,
    cliente: overrides.clienteResponsableId
      ? { responsable_id: overrides.clienteResponsableId }
      : null,
  };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function uploadForm(file?: File): FormData {
  const form = new FormData();
  form.set("file", file ?? new File([new Uint8Array([1, 2, 3])], "informe.pdf", { type: "application/pdf" }));
  return form;
}

function postRequest(form: FormData): Request {
  return new Request("http://localhost/api/v1/tasks/task-1/attachments", {
    method: "POST",
    body: form,
  });
}

function mockUploadOk() {
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/file" }, error: null }),
      }),
    },
  } as never);
}

beforeEach(() => {
  // No setting row -> loadDocCategories() falls back to the factory
  // constants, which include "Otro" (the category the mirror prefers).
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks/:id/attachments", () => {
  it("returns 404 for a COLABORADOR who is not the task's responsable (out of read scope)", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/attachments"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the attachments for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.adjuntoTarea.findMany).mockResolvedValue([
      { id: "a-1", nombre: "informe.pdf", tamano_bytes: 3, created_at: new Date("2026-01-01") },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/attachments"), routeContext);

    expect(res.status).toBe(200);
    expect((await res.json()).adjuntos).toHaveLength(1);
  });

  it("returns the attachments for a full-access role on any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.adjuntoTarea.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/attachments"), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/tasks/:id/attachments", () => {
  it("returns 500 when Supabase is not configured", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await POST(postRequest(uploadForm()), routeContext);

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the form has no 'file' field", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);

    const form = new FormData();
    const res = await POST(postRequest(form), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a disallowed file type (400)", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    const badFile = new File([new Uint8Array([1])], "malware.exe", { type: "application/x-msdownload" });

    const res = await POST(postRequest(uploadForm(badFile)), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("accepts only the shared allowlist: pdf, docx, xlsx, pptx, jpg, jpeg, png", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    mockUploadOk();

    const files: File[] = [
      new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" }),
      new File([new Uint8Array([1])], "b.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      new File([new Uint8Array([1])], "c.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      new File([new Uint8Array([1])], "d.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      new File([new Uint8Array([1])], "e.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1])], "f.jpeg", { type: "image/jpeg" }),
      new File([new Uint8Array([1])], "g.png", { type: "image/png" }),
    ];

    for (const file of files) {
      vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
        id: `a-${file.name}`,
        nombre: file.name,
        tamano_bytes: file.size,
        created_at: new Date("2026-01-01"),
      } as never);
      const res = await POST(postRequest(uploadForm(file)), routeContext);
      expect(res.status, `${file.name} should be accepted`).toBe(201);
    }
  });

  // S0.9a: task attachments used to run their own, wider policy (doc, ppt,
  // csv, txt, heic, zip + a duplicated 25 MB constant). They now share the
  // single allowlist from @/lib/api/files, so the removed types must fail
  // with the shared message.
  it("rejects a .zip attachment now that the policy is unified", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    const zip = new File([new Uint8Array([1])], "paquete.zip", { type: "application/zip" });

    const res = await POST(postRequest(uploadForm(zip)), routeContext);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(body.error).toBe(
      "Solo se aceptan PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), JPG/JPEG o PNG.",
    );
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("rejects the other types dropped from the widened task list (doc, ppt, csv, txt, heic)", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);

    const dropped: File[] = [
      new File([new Uint8Array([1])], "viejo.doc", { type: "application/msword" }),
      new File([new Uint8Array([1])], "viejo.ppt", { type: "application/vnd.ms-powerpoint" }),
      new File([new Uint8Array([1])], "datos.csv", { type: "text/csv" }),
      new File([new Uint8Array([1])], "notas.txt", { type: "text/plain" }),
      new File([new Uint8Array([1])], "foto.heic", { type: "image/heic" }),
    ];

    for (const file of dropped) {
      const res = await POST(postRequest(uploadForm(file)), routeContext);
      expect(res.status, `${file.name} should be rejected`).toBe(400);
    }
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("rejects a file over the 25 MB limit (413)", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    const bigFile = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "grande.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm(bigFile)), routeContext);

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toMatchObject({ code: "FILE_TOO_LARGE" });
    // The message interpolates the shared MAX_FILE_MB, not a literal.
    expect(body.error).toBe("El archivo supera el límite de 25 MB.");
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("accepts exactly 25 MB (the limit is exclusive)", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
      id: "a-limite",
      nombre: "limite.pdf",
      tamano_bytes: 25 * 1024 * 1024,
      created_at: new Date("2026-01-01"),
    } as never);
    mockUploadOk();
    const atLimit = new File([new Uint8Array(25 * 1024 * 1024)], "limite.pdf", {
      type: "application/pdf",
    });

    const res = await POST(postRequest(uploadForm(atLimit)), routeContext);

    expect(res.status).toBe(201);
  });

  it("honors MAX_FILE_SIZE_MB env override for the size limit", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    const original = process.env.MAX_FILE_SIZE_MB;
    process.env.MAX_FILE_SIZE_MB = "1";
    vi.resetModules();
    try {
      const { POST: postWithOverride } = await import("./route");
      const bigFile = new File([new Uint8Array(1 * 1024 * 1024 + 1)], "grande.pdf", {
        type: "application/pdf",
      });

      const res = await postWithOverride(postRequest(uploadForm(bigFile)), routeContext);

      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body).toMatchObject({ code: "FILE_TOO_LARGE" });
      expect(body.error).toEqual(expect.stringContaining("1 MB"));
    } finally {
      if (original === undefined) delete process.env.MAX_FILE_SIZE_MB;
      else process.env.MAX_FILE_SIZE_MB = original;
      vi.resetModules();
    }
  });

  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);

    const res = await POST(postRequest(uploadForm()), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(uploadForm()), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("uploads and returns 201 with a signed download_url for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
      id: "a-1",
      nombre: "informe.pdf",
      tamano_bytes: 3,
      created_at: new Date("2026-01-01"),
    } as never);
    mockUploadOk();

    const res = await POST(postRequest(uploadForm()), routeContext);

    expect(res.status).toBe(201);
    const json = await res.json();
    // BUG FIX regression: download_url used to carry the raw Supabase
    // createSignedUrl `data` payload ({ signedUrl }) instead of the plain
    // URL string the sibling download route hands out — now unwrapped.
    expect(json.adjunto).toMatchObject({
      id: "a-1",
      download_url: "https://signed.example/file",
    });
  });

  it("allows a full-access role to upload to any task", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
      id: "a-1",
      nombre: "informe.pdf",
      tamano_bytes: 3,
      created_at: new Date("2026-01-01"),
    } as never);
    mockUploadOk();

    const res = await POST(postRequest(uploadForm()), routeContext);

    expect(res.status).toBe(201);
  });

  it("soft-fails the signed URL (download_url: null) without failing the whole request", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
      id: "a-1",
      nombre: "informe.pdf",
      tamano_bytes: 3,
      created_at: new Date("2026-01-01"),
    } as never);
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
        }),
      },
    } as never);

    const res = await POST(postRequest(uploadForm()), routeContext);

    expect(res.status).toBe(201);
    expect((await res.json()).adjunto.download_url).toBeNull();
  });

  // Regression: Supabase Storage rejects keys with spaces/diacritics
  // ("Invalid key", 400) — a file name like this used to crash the upload
  // in production for ANY user writing in Spanish.
  it("sanitizes a file name with spaces and accents before uploading to storage", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
      id: "a-1",
      nombre: "Informe Financiero Óptimo.docx",
      tamano_bytes: 1,
      created_at: new Date("2026-01-01"),
    } as never);
    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: uploadMock,
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/file" }, error: null }),
        }),
      },
    } as never);
    const file = new File([new Uint8Array([1])], "Informe Financiero Óptimo.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const res = await POST(postRequest(uploadForm(file)), routeContext);

    expect(res.status).toBe(201);
    const uploadedPath = uploadMock.mock.calls[0]![0] as string;
    expect(uploadedPath).toMatch(/^[A-Za-z0-9._/-]+$/);
    expect(uploadedPath).not.toMatch(/\s/);
  });

  // QA audit finding #12: a task attachment used to live only in
  // adjuntos_tareas and never showed up in the Document Repository.
  describe("mirrors into the Document Repository", () => {
    it("creates a Documento + version reusing the same storage_path, and links it back", async () => {
      authAs(gerencia);
      vi.mocked(isSupabaseConfigured).mockReturnValue(true);
      vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
      vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
        id: "a-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        created_at: new Date("2026-01-01"),
      } as never);
      vi.mocked(db.documento.create).mockResolvedValue({ id: "doc-1" } as never);
      mockUploadOk();

      const res = await POST(postRequest(uploadForm()), routeContext);

      expect(res.status).toBe(201);
      expect(db.documento.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ titulo: "informe.pdf", categoria: "Otro" }) }),
      );
      const versionCall = vi.mocked(db.documentoVersion.create).mock.calls[0]![0]!;
      expect(versionCall.data).toMatchObject({ documento_id: "doc-1", numero_version: 1 });
      expect(versionCall.data.storage_path).toMatch(/^tareas\/task-1\//); // same path, no re-upload
      expect(db.adjuntoTarea.update).toHaveBeenCalledWith({
        where: { id: "a-1" },
        data: { documento_id: "doc-1" },
      });
      expect(db.documentoCliente.create).not.toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: "documento", entidad_id: "doc-1", accion: "crear" }),
      );
    });

    it("also links the mirrored document to the task's client when the task has one", async () => {
      authAs(gerencia);
      vi.mocked(isSupabaseConfigured).mockReturnValue(true);
      vi.mocked(db.tarea.findFirst).mockResolvedValue({
        ...writeTareaRow({ responsable_id: "gerencia-1" }),
        cliente_id: "cli-1",
      } as never);
      vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
        id: "a-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        created_at: new Date("2026-01-01"),
      } as never);
      vi.mocked(db.documento.create).mockResolvedValue({ id: "doc-1" } as never);
      mockUploadOk();

      const res = await POST(postRequest(uploadForm()), routeContext);

      expect(res.status).toBe(201);
      expect(db.documentoCliente.create).toHaveBeenCalledWith({
        data: { documento_id: "doc-1", cliente_id: "cli-1" },
      });
    });

    it("does not fail the attachment upload when the mirror write fails", async () => {
      authAs(gerencia);
      vi.mocked(isSupabaseConfigured).mockReturnValue(true);
      vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
      vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
        id: "a-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        created_at: new Date("2026-01-01"),
      } as never);
      vi.mocked(db.documento.create).mockRejectedValue(new Error("db down"));
      mockUploadOk();

      const res = await POST(postRequest(uploadForm()), routeContext);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.adjunto).toMatchObject({ id: "a-1" });
    });

    // Code review finding on PR #29: the category was hardcoded to "Otro"
    // without checking the live catalog, so a document could be mirrored
    // with a category that no longer exists if an admin removed it.
    it("falls back to the first live category when Otro isn't in the catalog", async () => {
      authAs(gerencia);
      vi.mocked(isSupabaseConfigured).mockReturnValue(true);
      vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
      vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
        id: "a-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        created_at: new Date("2026-01-01"),
      } as never);
      vi.mocked(db.setting.findUnique).mockResolvedValue({
        value: [
          { nombre: "Comercial", restringida: false },
          { nombre: "Proyectos", restringida: false },
        ],
      } as never);
      vi.mocked(db.documento.create).mockResolvedValue({ id: "doc-1" } as never);
      mockUploadOk();

      const res = await POST(postRequest(uploadForm()), routeContext);

      expect(res.status).toBe(201);
      expect(db.documento.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoria: "Comercial" }) }),
      );
    });

    // Code review finding on PR #29: the 4 mirror writes ran as separate
    // steps in one try/catch with no rollback, so a failure after creating
    // the Documento left it orphaned in the database (no version, visible
    // but undownloadable) — a mock can't observe a real commit/rollback, so
    // this asserts the writes actually go through db.$transaction instead
    // of being called directly, which is what gives them that guarantee.
    it("wraps the mirror writes in a single db.$transaction", async () => {
      authAs(gerencia);
      vi.mocked(isSupabaseConfigured).mockReturnValue(true);
      vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
      vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
        id: "a-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        created_at: new Date("2026-01-01"),
      } as never);
      vi.mocked(db.documento.create).mockResolvedValue({ id: "doc-1" } as never);
      mockUploadOk();

      const res = await POST(postRequest(uploadForm()), routeContext);

      expect(res.status).toBe(201);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it("does not link the attachment back when a later step in the mirror transaction fails", async () => {
      authAs(gerencia);
      vi.mocked(isSupabaseConfigured).mockReturnValue(true);
      vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
      vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
        id: "a-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        created_at: new Date("2026-01-01"),
      } as never);
      vi.mocked(db.documento.create).mockResolvedValue({ id: "doc-1" } as never);
      vi.mocked(db.documentoVersion.create).mockRejectedValue(new Error("db down"));
      mockUploadOk();

      const res = await POST(postRequest(uploadForm()), routeContext);

      // The attachment upload itself still succeeds (best-effort mirror)...
      expect(res.status).toBe(201);
      // ...but the transaction aborted before the last step, so the
      // attachment never got linked to the (now-failed) mirror document.
      expect(db.adjuntoTarea.update).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  it("returns 500 when the storage upload fails", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: new Error("boom") }),
        }),
      },
    } as never);

    const res = await POST(postRequest(uploadForm()), routeContext);

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });
});

// ADR-13 signed-upload confirm mode (S0.9b): the browser uploaded straight to
// Storage, so it confirms with JSON { storage_path, nombre, tamano_bytes }
// instead of multipart bytes. The route authorises exactly like the multipart
// path, rejects a key that does not belong to this task, verifies the object
// in Storage and inserts the same row (same mirror, same response shape).
describe("POST /api/v1/tasks/:id/attachments — signed-upload confirm mode", () => {
  function confirmRequest(body: unknown): Request {
    return new Request("http://localhost/api/v1/tasks/task-1/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function mockInfoAndSignedUrl(size: number | null) {
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          info: vi.fn().mockResolvedValue(
            size === null
              ? { data: null, error: new Error("not found") }
              : { data: { size }, error: null },
          ),
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://signed.example/file" },
            error: null,
          }),
        }),
      },
    } as never);
  }

  it("confirm rejects a storage_path outside the key issued for this project", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    mockInfoAndSignedUrl(3);

    for (const storage_path of [
      "tareas/task-2/abc_informe.pdf",
      "tareas/task-1evil/abc_informe.pdf",
      "documentos/general/doc-1/v1_informe.pdf",
      "/tareas/task-1/abc_informe.pdf",
      "tareas/task-1/../task-2/abc_informe.pdf",
    ]) {
      const res = await POST(
        confirmRequest({ storage_path, nombre: "informe.pdf", tamano_bytes: 3 }),
        routeContext,
      );
      expect(res.status, storage_path).toBe(400);
      const body = await res.json();
      expect(body.code, storage_path).toBe("VALIDATION_ERROR");
      expect(body.error, storage_path).toContain("no corresponde");
    }
    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("confirm rejects when the storage object is missing or larger than declared", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);

    mockInfoAndSignedUrl(null);
    const missing = await POST(
      confirmRequest({
        storage_path: "tareas/task-1/abc_informe.pdf",
        nombre: "informe.pdf",
        tamano_bytes: 3,
      }),
      routeContext,
    );
    expect(missing.status).toBe(400);
    const missingBody = await missing.json();
    expect(missingBody.code).toBe("VALIDATION_ERROR");
    expect(missingBody.error).toContain("no está disponible");

    mockInfoAndSignedUrl(999);
    const oversized = await POST(
      confirmRequest({
        storage_path: "tareas/task-1/abc_informe.pdf",
        nombre: "informe.pdf",
        tamano_bytes: 3,
      }),
      routeContext,
    );
    expect(oversized.status).toBe(400);
    const oversizedBody = await oversized.json();
    expect(oversizedBody.code).toBe("VALIDATION_ERROR");
    expect(oversizedBody.error).toContain("no está disponible");

    expect(db.adjuntoTarea.create).not.toHaveBeenCalled();
  });

  it("confirm inserts the row and audits when the object exists and matches", async () => {
    authAs(gerencia);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "gerencia-1" }) as never);
    mockInfoAndSignedUrl(3);
    vi.mocked(db.adjuntoTarea.create).mockResolvedValue({
      id: "a-1",
      nombre: "informe.pdf",
      tamano_bytes: 3,
      created_at: new Date("2026-01-01"),
    } as never);
    vi.mocked(db.documento.create).mockResolvedValue({ id: "doc-1" } as never);
    // vi.clearAllMocks() keeps implementations, and an earlier multipart test
    // made documentoVersion.create reject; reset it so the mirror completes.
    vi.mocked(db.documentoVersion.create).mockResolvedValue({ id: "dv-1" } as never);
    vi.mocked(db.adjuntoTarea.update).mockResolvedValue({} as never);

    const res = await POST(
      confirmRequest({
        storage_path: "tareas/task-1/abc_informe.pdf",
        nombre: "informe.pdf",
        tamano_bytes: 3,
      }),
      routeContext,
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.adjunto).toMatchObject({
      id: "a-1",
      nombre: "informe.pdf",
      download_url: "https://signed.example/file",
    });
    expect(db.adjuntoTarea.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tarea_id: "task-1",
          storage_path: "tareas/task-1/abc_informe.pdf",
        }),
      }),
    );
    // Same mirror + audit as the multipart path.
    expect(db.documento.create).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "documento", entidad_id: "doc-1", accion: "crear" }),
    );
  });
});
