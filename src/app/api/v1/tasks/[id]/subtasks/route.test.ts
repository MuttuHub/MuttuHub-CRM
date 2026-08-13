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
    subtarea: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/tasks/task-1/subtasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks/:id/subtasks", () => {
  it("returns 404 for a COLABORADOR who is not the task's responsable (out of read scope)", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/subtasks"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the checklist for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.subtarea.findMany).mockResolvedValue([
      { id: "s-1", titulo: "Paso 1", completada: false, tarea_id: "task-1" },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/subtasks"), routeContext);

    expect(res.status).toBe(200);
    expect((await res.json()).subtareas).toHaveLength(1);
  });

  it("returns the checklist for a full-access role on any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.subtarea.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1/subtasks"), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/tasks/:id/subtasks", () => {
  it("returns 400 when titulo is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.subtarea.create).not.toHaveBeenCalled();
  });

  it("returns 400 when titulo exceeds the 200-char limit", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ titulo: "a".repeat(201) }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);

    const res = await POST(postRequest({ titulo: "Paso 1" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.subtarea.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ titulo: "Paso 1" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates the subtask (completada defaults to false) for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.subtarea.create).mockResolvedValue({
      id: "s-1",
      titulo: "Paso 1",
      completada: false,
      tarea_id: "task-1",
    } as never);

    const res = await POST(postRequest({ titulo: "Paso 1" }), routeContext);

    expect(res.status).toBe(201);
    expect(db.subtarea.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completada: false }) }),
    );
  });

  it("allows a full-access role to add a subtask to any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.subtarea.create).mockResolvedValue({
      id: "s-1",
      titulo: "Paso 1",
      completada: true,
      tarea_id: "task-1",
    } as never);

    const res = await POST(postRequest({ titulo: "Paso 1", completada: true }), routeContext);

    expect(res.status).toBe(201);
  });
});
