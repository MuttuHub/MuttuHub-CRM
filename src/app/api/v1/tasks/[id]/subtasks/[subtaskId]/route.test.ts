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
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { DELETE, PATCH } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "task-1", subtaskId: "sub-1" }) };

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

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/tasks/task-1/subtasks/sub-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/tasks/:id/subtasks/:subtaskId", () => {
  it("returns 400 for an empty body (schema requires at least one field)", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.subtarea.update).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);

    const res = await PATCH(patchRequest({ completada: true }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.subtarea.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ completada: true }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 404 when the subtask does not belong to this task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);
    vi.mocked(db.subtarea.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ completada: true }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.subtarea.update).not.toHaveBeenCalled();
  });

  it("updates the subtask for a COLABORADOR who is the task's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.subtarea.findFirst).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(db.subtarea.update).mockResolvedValue({
      id: "sub-1",
      titulo: "Paso 1",
      completada: true,
      tarea_id: "task-1",
    } as never);

    const res = await PATCH(patchRequest({ completada: true }), routeContext);

    expect(res.status).toBe(200);
    expect(db.subtarea.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sub-1" }, data: { completada: true } }),
    );
  });

  it("allows a full-access role to update any task's subtask", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.subtarea.findFirst).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(db.subtarea.update).mockResolvedValue({
      id: "sub-1",
      titulo: "Nuevo título",
      completada: false,
      tarea_id: "task-1",
    } as never);

    const res = await PATCH(patchRequest({ titulo: "Nuevo título" }), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/v1/tasks/:id/subtasks/:subtaskId", () => {
  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1/subtasks/sub-1"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.subtarea.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1/subtasks/sub-1"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 404 when the subtask does not belong to this task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);
    vi.mocked(db.subtarea.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1/subtasks/sub-1"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.subtarea.delete).not.toHaveBeenCalled();
  });

  it("deletes the subtask (204) for a COLABORADOR who is the task's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.subtarea.findFirst).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(db.subtarea.delete).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1/subtasks/sub-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.subtarea.delete).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });

  it("deletes any task's subtask (204) for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.subtarea.findFirst).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(db.subtarea.delete).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1/subtasks/sub-1"), routeContext);

    expect(res.status).toBe(204);
  });
});
