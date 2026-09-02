import { afterEach, describe, expect, it, vi } from "vitest";
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
    tarea: {
      findFirst: vi.fn(),
    },
    adjuntoTarea: {
      findFirst: vi.fn(),
    },
    documento: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "task-1", attachmentId: "att-1" }) };

/** Read-gate's findFirst select shape (task only needs to exist + be non-deleted). */
function readTareaRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "task-1",
    deleted_at: overrides.deleted_at ?? null,
  };
}

/** Adjunto with optional link to a Documento (controls categoria gate). */
function adjuntoRow(opts: { documentoId?: string | null } = {}) {
  return {
    id: "att-1",
    tarea_id: "task-1",
    storage_path: "tareas/task-1/x_a.pdf",
    documento_id: opts.documentoId ?? null,
  };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function request(): Request {
  return new Request("http://localhost/api/v1/tasks/task-1/attachments/att-1/download");
}

function mockSignedUrlOk() {
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://signed.example/file" },
          error: null,
        }),
      }),
    },
  } as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks/:id/attachments/:attachmentId/download", () => {
  // PR 3 (Slice B1): read scope is now global. The download gate switches
  // from `getTaskForWrite` (write authority) to a READ gate — any
  // authenticated user passes, EXCEPT if the underlying Documento.categoria
  // is restricted (existing 403 path, untouched).
  it("redirects (302) for a COLABORADOR who is NOT the task's responsable, when the adjunto has no linked Documento", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(adjuntoRow() as never);

    mockSignedUrlOk();

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example/file");
  });

  it("redirects (302) for a COLABORADOR downloading an attachment linked to a non-restricted 'Operativo' Documento", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(adjuntoRow({ documentoId: "doc-1" }) as never);
    vi.mocked(db.documento.findFirst).mockResolvedValue({ id: "doc-1", categoria: "Operativo" } as never);

    mockSignedUrlOk();

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example/file");
  });

  it("returns 403 for a COLABORADOR downloading an attachment linked to a restricted 'Legal' Documento (categoria gate survives the read-scope unlock)", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(adjuntoRow({ documentoId: "doc-2" }) as never);
    vi.mocked(db.documento.findFirst).mockResolvedValue({ id: "doc-2", categoria: "Legal" } as never);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    // The signed URL must NOT be generated for a restricted-category download.
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 200/302 for a GERENCIA caller on the same restricted 'Legal' adjunto (full-access sees everything)", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(adjuntoRow({ documentoId: "doc-2" }) as never);
    vi.mocked(db.documento.findFirst).mockResolvedValue({ id: "doc-2", categoria: "Legal" } as never);

    mockSignedUrlOk();

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(302);
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 404 when the attachment does not belong to the task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(null);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 500 when Supabase is not configured", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(adjuntoRow() as never);
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("returns 500 when generating the signed URL fails", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(adjuntoRow() as never);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    vi.mocked(createSupabaseAdmin).mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
        }),
      },
    } as never);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("redirects (302) to the signed URL for a full-access role on any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(readTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(adjuntoRow() as never);
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    mockSignedUrlOk();

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(302);
  });
});
