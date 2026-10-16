import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";
import { startOfLocalDay } from "@/lib/alerts";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    tarea: {
      findMany: vi.fn(),
    },
    notificacion: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { PATCH } from "./route";

const colaborador = {
  id: "colab-1",
  rol: "COLABORADOR",
} as Usuario;

const ayer = new Date(startOfLocalDay().getTime() - 24 * 60 * 60 * 1000);

function mockAuth() {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: colaborador,
    supabaseUser: {} as never,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

/** Task reconciliation and project-notification reads share `notificacion.findMany`; tell them apart by `where.tipo.in`. */
function mockNotificaciones(taskRows: unknown[], projectRows: unknown[] = []) {
  vi.mocked(db.notificacion.findMany).mockImplementation((async (args: { where?: { tipo?: { in?: unknown } } }) =>
    args?.where?.tipo?.in ? projectRows : taskRows) as never);
}

describe("PATCH /api/v1/notifications/read-all", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await PATCH();

    expect(res.status).toBe(401);
  });

  it("marks every tarea_id currently in the snapshot as read", async () => {
    mockAuth();
    vi.mocked(db.tarea.findMany).mockResolvedValue([
      {
        id: "t1",
        titulo: "Vencida",
        estado: "POR_HACER",
        fecha_entrega: ayer,
        origen: "KANBAN",
        responsable_id: "colab-1",
        responsable: { nombre: "Ana" },
        cliente_id: null,
        cliente: null,
      },
    ] as never);
    mockNotificaciones([
      { id: "n1", tarea_id: "t1", tipo: "TAREA_VENCIDA", leida: false },
    ] as never[]);
    vi.mocked(db.notificacion.updateMany)
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValue({ count: 0 } as never);

    const res = await PATCH();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(db.notificacion.updateMany).toHaveBeenCalledWith({
      where: { usuario_id: "colab-1", tarea_id: { in: ["t1"] } },
      data: { leida: true },
    });
    expect(json).toEqual({ ok: true, updated: 1 });
  });

  it("does not call updateMany when the snapshot is empty", async () => {
    mockAuth();
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    mockNotificaciones([]);
    vi.mocked(db.notificacion.updateMany).mockResolvedValue({ count: 0 } as never);

    const res = await PATCH();
    const json = await res.json();

    expect(res.status).toBe(200);
    // No task rows to mark: the only updateMany left is the actor's own project-notification one.
    expect(db.notificacion.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tarea_id: expect.anything() }) }),
    );
    expect(json).toEqual({ ok: true, updated: 0 });
  });
});

describe("PATCH /api/v1/notifications/read-all: proyectos group (S6)", () => {
  it("also marks the GERENCIA user's unread overspend rows as read", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: { id: "ger-1", rol: "GERENCIA" } as Usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([
      { id: "p1", tipo: "SOBREGASTO_RUBRO", leida: false, proyecto_id: "pry-1", gasto_id: "g", created_at: new Date(), proyecto: { codigo: "PRY-001" } },
    ] as never);
    vi.mocked(db.notificacion.updateMany).mockResolvedValue({ count: 1 } as never);

    const json = await (await PATCH()).json();

    expect(db.notificacion.updateMany).toHaveBeenCalledWith({
      where: { usuario_id: "ger-1", tipo: { in: ["SOBREGASTO_RUBRO", "GASTO_RECHAZADO"] }, leida: false },
      data: { leida: true },
    });
    expect(json).toEqual({ ok: true, updated: 1 });
  });

  it("marks a non-GERENCIA author's rejected-expense rows as read, never overspend rows", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: { id: "col-1", rol: "COLABORADOR" } as Usuario,
      supabaseUser: {} as never,
    });
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([] as never);
    vi.mocked(db.notificacion.updateMany).mockResolvedValue({ count: 1 } as never);

    await PATCH();

    expect(db.notificacion.updateMany).toHaveBeenCalledWith({
      where: { usuario_id: "col-1", tipo: { in: ["GASTO_RECHAZADO"] }, leida: false },
      data: { leida: true },
    });
  });
});
