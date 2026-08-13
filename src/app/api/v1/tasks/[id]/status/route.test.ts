import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { PATCH } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = { params: Promise.resolve({ id: "task-1" }) };

function taskRowSelect(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    titulo: "Tarea uno",
    descripcion: null,
    responsable_id: overrides.responsable_id ?? "colab-1",
    cliente_id: null,
    estado: overrides.newEstado ?? "EN_CURSO",
    origen: "KANBAN",
    prioridad: null,
    fecha_entrega: null,
    etiquetas: [],
    motivo_bloqueo: overrides.storedMotivo ?? null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    responsable: { nombre: "Colab Uno" },
    cliente: null,
    _count: { comentarios: 0, subtareas: 0 },
  };
}

/** getTaskForWrite's findFirst select shape. */
function writeTareaRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    responsable_id: overrides.responsable_id ?? "colab-1",
    cliente_id: null,
    estado: overrides.estado ?? "EN_CURSO",
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
  return new Request("http://localhost/api/v1/tasks/task-1/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/tasks/:id/status", () => {
  it("returns 400 when estado is missing", async () => {
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
      writeTareaRow({ responsable_id: "other-user" }) as never,
    );

    const res = await PATCH(patchRequest({ estado: "EN_CURSO" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.tarea.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the task does not exist", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ estado: "EN_CURSO" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows a COLABORADOR who is the task's responsable to move it", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "colab-1" }) as never);
    vi.mocked(db.tarea.update).mockResolvedValue(taskRowSelect() as never);

    const res = await PATCH(patchRequest({ estado: "EN_CURSO" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to move any task", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ responsable_id: "other-user" }) as never);
    vi.mocked(db.tarea.update).mockResolvedValue(taskRowSelect() as never);

    const res = await PATCH(patchRequest({ estado: "EN_CURSO" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns 400 when moving to BLOQUEADA without motivo_bloqueo", async () => {
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

  it("moves to BLOQUEADA and stores the trimmed motivo_bloqueo when provided", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(writeTareaRow({ motivo_bloqueo: null }) as never);
    vi.mocked(db.tarea.update).mockResolvedValue(
      taskRowSelect({ newEstado: "BLOQUEADA", storedMotivo: "Esperando insumos" }) as never,
    );

    const res = await PATCH(
      patchRequest({ estado: "BLOQUEADA", motivo_bloqueo: "  Esperando insumos  " }),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(db.tarea.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { estado: "BLOQUEADA", motivo_bloqueo: "Esperando insumos" },
      select: expect.anything(),
    });
  });

  it("re-blocking without a new motivo keeps the previously stored motivo", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(
      writeTareaRow({ estado: "BLOQUEADA", motivo_bloqueo: "Motivo anterior" }) as never,
    );
    vi.mocked(db.tarea.update).mockResolvedValue(
      taskRowSelect({ newEstado: "BLOQUEADA", storedMotivo: "Motivo anterior" }) as never,
    );

    const res = await PATCH(patchRequest({ estado: "BLOQUEADA" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.tarea.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { estado: "BLOQUEADA", motivo_bloqueo: "Motivo anterior" },
      select: expect.anything(),
    });
  });

  // Regression test: leaving BLOQUEADA must always clear motivo_bloqueo,
  // even when the request body doesn't mention the field at all.
  it("clears the stored motivo_bloqueo when the task leaves BLOQUEADA", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findFirst).mockResolvedValue(
      writeTareaRow({ estado: "BLOQUEADA", motivo_bloqueo: "Ya resuelto" }) as never,
    );
    vi.mocked(db.tarea.update).mockResolvedValue(
      taskRowSelect({ newEstado: "EN_CURSO", storedMotivo: null }) as never,
    );

    const res = await PATCH(patchRequest({ estado: "EN_CURSO" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.tarea.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { estado: "EN_CURSO", motivo_bloqueo: null },
      select: expect.anything(),
    });
  });
});
