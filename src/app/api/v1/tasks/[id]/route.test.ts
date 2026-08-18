import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    comentarioTarea: {
      findMany: vi.fn(),
    },
    usuario: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    cliente: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { DELETE, GET, PATCH } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "task-1" }) };

function taskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "task-1",
    titulo: overrides.titulo ?? "Tarea uno",
    descripcion: overrides.descripcion ?? null,
    responsable_id: overrides.responsable_id ?? "colab-1",
    cliente_id: overrides.cliente_id ?? null,
    estado: overrides.estado ?? "POR_HACER",
    origen: overrides.origen ?? "KANBAN",
    prioridad: overrides.prioridad ?? null,
    fecha_entrega: overrides.fecha_entrega ?? null,
    etiquetas: overrides.etiquetas ?? [],
    motivo_bloqueo: overrides.motivo_bloqueo ?? null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    responsable: { nombre: "Colab Uno" },
    cliente: overrides.cliente_id ? { nombre: "Cliente Uno" } : null,
    _count: { comentarios: 0, subtareas: 0 },
  };
}

/** getTaskForWrite's findFirst select shape (includes cliente.responsable_id). */
function writeTareaRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    responsable_id: overrides.responsable_id ?? "colab-1",
    cliente_id: overrides.cliente_id ?? null,
    estado: overrides.estado ?? "POR_HACER",
    motivo_bloqueo: overrides.motivo_bloqueo ?? null,
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
  return new Request("http://localhost/api/v1/tasks/task-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks/:id", () => {
  it("returns 404 for a COLABORADOR who is not the task's responsable (out of read scope)", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null); // scoped query excludes it

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the task for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.tarea.findUnique).mockResolvedValue(taskRow() as never);
    vi.mocked(db.comentarioTarea.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.task).toMatchObject({ id: "task-1" });
  });

  it("returns any task for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.tarea.findUnique).mockResolvedValue(taskRow() as never);
    vi.mocked(db.comentarioTarea.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns the comment thread ascending with author names joined", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue({ id: "task-1" } as never);
    vi.mocked(db.tarea.findUnique).mockResolvedValue(taskRow() as never);
    vi.mocked(db.comentarioTarea.findMany).mockResolvedValue([
      { id: "c-1", autor_id: "user-9", texto: "Primero", created_at: new Date("2026-01-01") },
    ] as never);
    vi.mocked(db.usuario.findMany).mockResolvedValue([{ id: "user-9", nombre: "Ana" }] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    const json = await res.json();
    expect(json.task.comentarios).toEqual([
      expect.objectContaining({ id: "c-1", autor_nombre: "Ana" }),
    ]);
  });
});

describe("PATCH /api/v1/tasks/:id", () => {
  it("returns 400 for an empty body (schema requires at least one field)", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid estado value", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ estado: "NOT_REAL" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(
      writeTareaRow({ responsable_id: "other-user", clienteResponsableId: "other-user" }) as never,
    );

    const res = await PATCH(patchRequest({ titulo: "Nuevo título" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.tarea.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ titulo: "Nuevo título" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows a COLABORADOR who is the task's responsable to update it", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.tarea.update).mockResolvedValue(taskRow({ titulo: "Nuevo título" }) as never);

    const res = await PATCH(patchRequest({ titulo: "Nuevo título" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.tarea.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task-1" }, data: { titulo: "Nuevo título" } }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "tarea", entidad_id: "task-1", accion: "editar" }),
    );
  });

  it("allows a COLABORADOR who is the linked client's responsable (but not the task's) to update it", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(
      writeTareaRow({ responsable_id: "other-user", clienteResponsableId: "colab-1" }) as never,
    );
    vi.mocked(db.tarea.update).mockResolvedValue(taskRow({ titulo: "Nuevo título" }) as never);

    const res = await PATCH(patchRequest({ titulo: "Nuevo título" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to update any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.tarea.update).mockResolvedValue(taskRow({ titulo: "Nuevo título" }) as never);

    const res = await PATCH(patchRequest({ titulo: "Nuevo título" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns 400 when moving to BLOQUEADA without a motivo_bloqueo", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ motivo_bloqueo: null }) as never);

    const res = await PATCH(patchRequest({ estado: "BLOQUEADA" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Indica un motivo para bloquear.",
    });
    expect(db.tarea.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the new responsable does not exist or is inactive", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ responsable_id: "ghost" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.update).not.toHaveBeenCalled();
  });

  it("returns 400 when cliente_id does not exist or was deleted", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow() as never);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ cliente_id: "no-existe" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/tasks/:id", () => {
  it("returns 403 for a COLABORADOR who is neither the task's nor the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.tarea.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft-deletes the task (204) for a COLABORADOR who is the responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.tarea.update).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.tarea.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { deleted_at: expect.any(Date) },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "tarea", entidad_id: "task-1", accion: "eliminar" }),
    );
  });

  it("soft-deletes any task (204) for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.tarea.update).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/tasks/task-1"), routeContext);

    expect(res.status).toBe(204);
  });
});
