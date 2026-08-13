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
  },
}));

import { db } from "@/lib/db";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "task-1", attachmentId: "att-1" }) };

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

function request(): Request {
  return new Request("http://localhost/api/v1/tasks/task-1/attachments/att-1/download");
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks/:id/attachments/:attachmentId/download", () => {
  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
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
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(null);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 500 when Supabase is not configured", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue({ storage_path: "tareas/task-1/x_a.pdf" } as never);
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("returns 500 when generating the signed URL fails", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue({ storage_path: "tareas/task-1/x_a.pdf" } as never);
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

  it("redirects (302) to the signed URL for a COLABORADOR who is the task's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue({ storage_path: "tareas/task-1/x_a.pdf" } as never);
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

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example/file");
  });

  it("redirects (302) for a full-access role on any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue({ storage_path: "tareas/task-1/x_a.pdf" } as never);
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

    const res = await GET(request(), routeContext);

    expect(res.status).toBe(302);
  });
});
