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
    vi.mocked(db.notificacion.findMany).mockResolvedValue([
      { id: "n1", tarea_id: "t1", tipo: "TAREA_VENCIDA", leida: false },
    ] as never);
    vi.mocked(db.notificacion.updateMany).mockResolvedValue({ count: 1 } as never);

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

    const res = await PATCH();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(db.notificacion.updateMany).not.toHaveBeenCalled();
    expect(json).toEqual({ ok: true, updated: 0 });
  });
});
