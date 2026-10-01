// POST /api/v1/uploads/sign — ADR-13 signed direct-to-storage uploads
// (S0.9b). The endpoint authorises the actor on the target, validates the
// shared upload policy, computes the storage key SERVER-SIDE and returns a
// Supabase signed upload URL plus the policy limits. It must never echo the
// service key, bucket credentials, or a public object URL.
//
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
      findFirst: vi.fn(),
    },
    documentoCliente: {
      findMany: vi.fn(),
    },
    tarea: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

const SERVICE_ROLE_KEY = "service-role-secret";
const gerencia = { id: "gerencia-1", nombre: "Gerencia", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", nombre: "Colab", rol: "COLABORADOR" } as Usuario;

function signRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

/** getTaskForWrite's findFirst select shape. */
function writeTareaRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    responsable_id: overrides.responsable_id ?? "gerencia-1",
    cliente_id: null,
    estado: "EN_CURSO",
    motivo_bloqueo: null,
    cliente: null,
  };
}

const SIGNED_URL =
  "https://proj.supabase.co/storage/v1/object/upload/sign/tareas/task-1/abc_informe.pdf?token=tok";

function mockSignOk() {
  const createSignedUploadUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: SIGNED_URL, token: "tok", path: "ignored" },
    error: null,
  });
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({ createSignedUploadUrl }),
    },
  } as never);
  return createSignedUploadUrl;
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  // No settings row -> loadDocCategories falls back to the factory catalog.
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
  vi.mocked(db.documentoCliente.findMany).mockResolvedValue([]);
  vi.mocked(db.documentoVersion.findFirst).mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/uploads/sign", () => {
  it("sign returns a signed upload URL for a server-chosen key when the actor may upload", async () => {
    const createSignedUploadUrl = mockSignOk();
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);

    const res = await POST(
      signRequest({
        kind: "tarea_adjunto",
        ref_id: "task-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        tipo_mime: "application/pdf",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // The key is chosen server-side with today's task convention.
    expect(body.storage_path).toMatch(/^tareas\/task-1\/[0-9a-f-]{36}_informe\.pdf$/);
    expect(body.token).toBe("tok");
    expect(body.signed_url).toBe(SIGNED_URL);
    expect(body.max_bytes).toBe(25 * 1024 * 1024);
    expect(body.allowed_extensions.sort()).toEqual([
      "docx",
      "jpeg",
      "jpg",
      "pdf",
      "png",
      "pptx",
      "xlsx",
    ]);
    // The exact server key was the one signed, not anything the client sent.
    expect(createSignedUploadUrl).toHaveBeenCalledWith(body.storage_path);
  });

  it("sign uses the document version convention for a documento_version target", async () => {
    const createSignedUploadUrl = mockSignOk();
    vi.mocked(db.documento.findFirst).mockResolvedValue({
      id: "doc-1",
      categoria: "Comercial",
    } as never);
    vi.mocked(db.documentoVersion.findFirst).mockResolvedValue({ numero_version: 2 } as never);
    vi.mocked(db.documentoCliente.findMany).mockResolvedValue([{ cliente_id: "cli-1" }] as never);

    const res = await POST(
      signRequest({
        kind: "documento_version",
        ref_id: "doc-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        tipo_mime: "application/pdf",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storage_path).toBe("documentos/cli-1/doc-1/v3_informe.pdf");
    expect(createSignedUploadUrl).toHaveBeenCalledWith("documentos/cli-1/doc-1/v3_informe.pdf");
  });

  it("sign rejects size > 25 MB and disallowed types before issuing a URL", async () => {
    const createSignedUploadUrl = mockSignOk();
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);

    const tooBig = await POST(
      signRequest({
        kind: "tarea_adjunto",
        ref_id: "task-1",
        nombre: "grande.pdf",
        tamano_bytes: 25 * 1024 * 1024 + 1,
        tipo_mime: "application/pdf",
      }),
    );
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toMatchObject({ code: "FILE_TOO_LARGE" });

    const badType = await POST(
      signRequest({
        kind: "tarea_adjunto",
        ref_id: "task-1",
        nombre: "report.exe",
        tamano_bytes: 3,
        tipo_mime: "application/pdf",
      }),
    );
    expect(badType.status).toBe(400);
    expect(await badType.json()).toMatchObject({ code: "VALIDATION_ERROR" });

    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("sign never returns the service key or a public URL", async () => {
    mockSignOk();
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);

    const res = await POST(
      signRequest({
        kind: "tarea_adjunto",
        ref_id: "task-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        tipo_mime: "application/pdf",
      }),
    );

    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(SERVICE_ROLE_KEY);
    expect(raw).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role");
    expect(raw).not.toContain("/object/public/");
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      expect(raw).not.toContain(process.env.NEXT_PUBLIC_SUPABASE_URL);
    }
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
      "allowed_extensions",
      "max_bytes",
      "signed_url",
      "storage_path",
      "token",
    ]);
  });

  it("sign rejects an actor without permission on the target", async () => {
    const createSignedUploadUrl = mockSignOk();
    authAs(colaborador);
    // The COLABORADOR is neither the task's nor the client's responsable.
    vi.mocked(db.tarea.findFirst).mockResolvedValue(
      writeTareaRow({ responsable_id: "other-user" }) as never,
    );

    const res = await POST(
      signRequest({
        kind: "tarea_adjunto",
        ref_id: "task-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
        tipo_mime: "application/pdf",
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("sign returns 401 when there is no session", async () => {
    const createSignedUploadUrl = mockSignOk();
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Sesión no válida o expirada.", code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const res = await POST(
      signRequest({
        kind: "tarea_adjunto",
        ref_id: "task-1",
        nombre: "informe.pdf",
        tamano_bytes: 3,
      }),
    );

    expect(res.status).toBe(401);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("sign rejects a malformed body without signing", async () => {
    const createSignedUploadUrl = mockSignOk();

    const res = await POST(new Request("http://localhost/api/v1/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
