import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findFirst: vi.fn(),
    },
    oportunidad: {
      findFirst: vi.fn(),
    },
    tarea: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    usuario: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaboradorConFlag = {
  id: "colab-1",
  rol: "COLABORADOR",
  gestiona_oportunidades: true,
} as Usuario;
const colaboradorSinFlag = {
  id: "colab-1",
  rol: "COLABORADOR",
  gestiona_oportunidades: false,
} as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "cli-1", opportunityId: "op-1" }) };

function taskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "task-1",
    titulo: overrides.titulo ?? "Tarea uno",
    descripcion: overrides.descripcion ?? null,
    responsable_id: overrides.responsable_id ?? "colab-1",
    cliente_id: overrides.cliente_id ?? "cli-1",
    oportunidad_id: overrides.oportunidad_id ?? "op-1",
    estado: overrides.estado ?? "POR_HACER",
    origen: overrides.origen ?? "KANBAN",
    prioridad: overrides.prioridad ?? null,
    fecha_entrega: overrides.fecha_entrega ?? null,
    etiquetas: overrides.etiquetas ?? [],
    motivo_bloqueo: overrides.motivo_bloqueo ?? null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    responsable: { nombre: "Colab Uno" },
    cliente: { nombre: "Cliente Uno", responsable_id: overrides.cliente_responsable_id ?? "colab-1" },
    oportunidad: { id: "op-1", nombre: "Oportunidad Uno", fase: "PROSPECCION" },
    _count: { comentarios: 0, subtareas: 0 },
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/:id/opportunities/:opportunityId/tasks", () => {
  it("returns the task list linked to the opportunity (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1" } as never);
    vi.mocked(db.tarea.findMany).mockResolvedValue([taskRow()] as never);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1/tasks"),
      routeContext,
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tareas).toHaveLength(1);
    expect(db.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { oportunidad_id: "op-1", deleted_at: null } }),
    );
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1/tasks"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR without the commercial flag", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1/tasks"),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 404 when the opportunity does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1/tasks"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/clients/:id/opportunities/:opportunityId/tasks", () => {
  it("creates a task inheriting cliente_id and oportunidad_id from the opportunity (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1" } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.tarea.create).mockResolvedValue(taskRow({ id: "task-new" }) as never);

    const res = await POST(
      postRequest({ titulo: "Tarea nueva", responsable_id: "colab-1" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.tarea.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cliente_id: "cli-1", oportunidad_id: "op-1" }),
      }),
    );
  });

  // "sin permitir override inconsistente" — a body cliente_id/oportunidad_id
  // is never honored; the values always come from the URL/opportunity.
  it("ignores an inconsistent cliente_id/oportunidad_id sent in the body", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1" } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.tarea.create).mockResolvedValue(taskRow({ id: "task-new" }) as never);

    const res = await POST(
      postRequest({
        titulo: "Tarea nueva",
        responsable_id: "colab-1",
        cliente_id: "cli-OTRO",
        oportunidad_id: "op-OTRO",
      }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.tarea.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cliente_id: "cli-1", oportunidad_id: "op-1" }),
      }),
    );
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await POST(postRequest({ titulo: "Tarea nueva", responsable_id: "colab-1" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.tarea.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the opportunity does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ titulo: "Tarea nueva", responsable_id: "colab-1" }), routeContext);

    expect(res.status).toBe(404);
    expect(db.tarea.create).not.toHaveBeenCalled();
  });

  it("returns 400 when titulo is missing", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);

    const res = await POST(postRequest({ responsable_id: "colab-1" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.create).not.toHaveBeenCalled();
  });
});
