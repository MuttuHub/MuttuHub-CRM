import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    subtarea: {
      groupBy: vi.fn(),
    },
    usuario: {
      findFirst: vi.fn(),
    },
    cliente: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

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
    responsable: { nombre: overrides.responsable_nombre ?? "Colab Uno" },
    cliente: overrides.cliente_id ? { nombre: "Cliente Uno" } : null,
    _count: { comentarios: 0, subtareas: 0 },
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
  return new Request("http://localhost/api/v1/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(db.subtarea.groupBy).mockResolvedValue([]);
  vi.mocked(db.tarea.count).mockResolvedValue(0);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/tasks", () => {
  it("returns the task list for a full-access role without restricting scope", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([taskRow()] as never);
    vi.mocked(db.tarea.count).mockResolvedValue(1);

    const res = await GET(new Request("http://localhost/api/v1/tasks"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(1);
    expect(json.items[0]).toMatchObject({ id: "task-1", responsable_nombre: "Colab Uno" });
    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("scopes a COLABORADOR to their own tasks (forces responsable_id in the where clause)", async () => {
    authAs(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);

    // Even if the caller tries to look at someone else's book via the
    // `responsable` query param, the scope must win — the route ignores it.
    await GET(new Request("http://localhost/api/v1/tasks?responsable=other-user"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBe("colab-1");
  });

  it("does not force responsable_id for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/tasks?responsable=other-user"));

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBe("other-user");
  });

  it("returns 400 for an invalid estado filter", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/tasks?estado=NOT_REAL"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid origen filter", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/tasks?origen=NOT_REAL"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for a limit over the 100 cap", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/tasks?limit=101"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for an invalid page number", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/tasks?page=0"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("attaches subtotal_hechas from the groupBy aggregation", async () => {
    authAs(gerencia);
    vi.mocked(db.tarea.findMany).mockResolvedValue([taskRow({ id: "task-1" })] as never);
    vi.mocked(db.tarea.count).mockResolvedValue(1);
    vi.mocked(db.subtarea.groupBy).mockResolvedValue([
      { tarea_id: "task-1", _count: { _all: 3 } },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/tasks"));

    const json = await res.json();
    expect(json.items[0].subtotal_hechas).toBe(3);
  });
});

describe("POST /api/v1/tasks", () => {
  it("creates a task with default estado/origen (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.tarea.create).mockResolvedValue(taskRow({ id: "task-new" }) as never);

    const res = await POST(postRequest({ titulo: "Tarea nueva", responsable_id: "colab-1" }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.task).toMatchObject({ id: "task-new" });
    expect(db.tarea.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "POR_HACER", origen: "KANBAN" }),
      }),
    );
  });

  it("forces the responsable to self when a COLABORADOR creates a task, ignoring the body's responsable_id", async () => {
    authAs(colaborador);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.tarea.create).mockResolvedValue(taskRow({ id: "task-new" }) as never);

    const res = await POST(postRequest({ titulo: "Tarea nueva", responsable_id: "someone-else" }));

    expect(res.status).toBe(201);
    expect(db.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "colab-1", activo: true } }),
    );
    expect(db.tarea.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responsable_id: "colab-1" }) }),
    );
  });

  it("returns 400 when titulo is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ responsable_id: "colab-1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.create).not.toHaveBeenCalled();
  });

  it("returns 400 when titulo exceeds the 200-char limit", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ titulo: "a".repeat(201), responsable_id: "colab-1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when creating a BLOQUEADA task without motivo_bloqueo", async () => {
    authAs(gerencia);

    const res = await POST(
      postRequest({ titulo: "Tarea nueva", responsable_id: "colab-1", estado: "BLOQUEADA" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Indica un motivo para bloquear.",
    });
    expect(db.tarea.create).not.toHaveBeenCalled();
  });

  it("creates a BLOQUEADA task when motivo_bloqueo is provided", async () => {
    authAs(gerencia);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.tarea.create).mockResolvedValue(
      taskRow({ id: "task-new", estado: "BLOQUEADA", motivo_bloqueo: "Esperando insumos" }) as never,
    );

    const res = await POST(
      postRequest({
        titulo: "Tarea nueva",
        responsable_id: "colab-1",
        estado: "BLOQUEADA",
        motivo_bloqueo: "Esperando insumos",
      }),
    );

    expect(res.status).toBe(201);
  });

  it("returns 400 when the chosen responsable does not exist or is inactive", async () => {
    authAs(gerencia);
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ titulo: "Tarea nueva", responsable_id: "ghost" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "El responsable no existe o está inactivo.",
    });
    expect(db.tarea.create).not.toHaveBeenCalled();
  });

  it("returns 400 when cliente_id does not exist or was deleted", async () => {
    authAs(gerencia);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(
      postRequest({ titulo: "Tarea nueva", responsable_id: "colab-1", cliente_id: "no-existe" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.create).not.toHaveBeenCalled();
  });
});
