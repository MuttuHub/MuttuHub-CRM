import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findFirst: vi.fn(),
    },
    comentarioTarea: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    usuario: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", nombre: "Gerente Uno", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", nombre: "Colab Uno", rol: "COLABORADOR" } as Usuario;

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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/tasks/task-1/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks/:id/comments", () => {
  it("returns 404 for a COLABORADOR who is not the task's responsable (out of read scope)", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/comments"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the thread ascending with author names joined for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.comentarioTarea.findMany).mockResolvedValue([
      { id: "c-1", autor_id: "user-9", texto: "Primero", created_at: new Date("2026-01-01T08:00:00Z") },
      { id: "c-2", autor_id: "colab-1", texto: "Segundo", created_at: new Date("2026-01-01T09:00:00Z") },
    ] as never);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "user-9", nombre: "Ana" },
      { id: "colab-1", nombre: "Colab Uno" },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/comments"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comentarios).toEqual([
      expect.objectContaining({ id: "c-1", autor_nombre: "Ana" }),
      expect.objectContaining({ id: "c-2", autor_nombre: "Colab Uno" }),
    ]);
    expect(db.comentarioTarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: "asc" } }),
    );
  });

  it("returns the thread for a full-access role on any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.comentarioTarea.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/comments"), routeContext);

    expect(res.status).toBe(200);
    expect((await res.json()).comentarios).toEqual([]);
  });
});

describe("POST /api/v1/tasks/:id/comments", () => {
  it("returns 400 for an empty texto", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ texto: "   " }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.comentarioTarea.create).not.toHaveBeenCalled();
  });

  it("returns 400 when texto exceeds the 4000-char limit", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ texto: "a".repeat(4001) }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.comentarioTarea.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);

    const res = await POST(postRequest({ texto: "Comentario" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.comentarioTarea.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ texto: "Comentario" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("posts the comment as the session user, ignoring any client-provided author, for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.comentarioTarea.create).mockResolvedValue({
      id: "c-1",
      autor_id: "colab-1",
      texto: "Comentario",
      created_at: new Date("2026-01-01"),
    } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ nombre: "Colab Uno" } as never);

    const res = await POST(
      postRequest({ texto: "Comentario", autor_id: "someone-else" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.comentarioTarea.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ autor_id: "colab-1", texto: "Comentario" }),
      }),
    );
    const json = await res.json();
    expect(json.comentario).toMatchObject({ autor_id: "colab-1", autor_nombre: "Colab Uno" });
  });

  it("allows a full-access role to comment on any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.comentarioTarea.create).mockResolvedValue({
      id: "c-1",
      autor_id: "gerencia-1",
      texto: "Comentario",
      created_at: new Date("2026-01-01"),
    } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ nombre: "Gerente Uno" } as never);

    const res = await POST(postRequest({ texto: "Comentario" }), routeContext);

    expect(res.status).toBe(201);
  });
});
