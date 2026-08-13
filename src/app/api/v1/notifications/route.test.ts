import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";
import { addLocalDays, startOfLocalDay } from "@/lib/alerts";

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
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const colaborador = {
  id: "colab-1",
  rol: "COLABORADOR",
} as Usuario;

const coordinador = {
  id: "coord-1",
  rol: "COORDINADOR",
} as Usuario;

const inicioHoy = startOfLocalDay();
const ayer = new Date(inicioHoy.getTime() - 24 * 60 * 60 * 1000);
const enTresDias = addLocalDays(inicioHoy, 2);

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function get(qs = ""): Request {
  return new Request(`http://localhost/api/v1/notifications${qs}`);
}

const tareaVencidaKanban = {
  id: "t1",
  titulo: "Vencida Kanban",
  estado: "POR_HACER",
  fecha_entrega: ayer,
  origen: "KANBAN",
  responsable_id: "colab-1",
  responsable: { nombre: "Ana" },
  cliente_id: null,
  cliente: null,
};

const tareaVencidaCrm = {
  id: "t2",
  titulo: "Vencida CRM",
  estado: "POR_HACER",
  fecha_entrega: ayer,
  origen: "CRM",
  responsable_id: "colab-1",
  responsable: { nombre: "Ana" },
  cliente_id: "c1",
  cliente: { nombre: "Cliente A" },
};

const tareaProximos = {
  id: "t3",
  titulo: "Próxima",
  estado: "POR_HACER",
  fecha_entrega: enTresDias,
  origen: "KANBAN",
  responsable_id: "colab-1",
  responsable: { nombre: "Ana" },
  cliente_id: null,
  cliente: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/notifications", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(get());

    expect(res.status).toBe(401);
  });

  it("scopes to responsable_id for COLABORADOR", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);

    await GET(get());

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBe("colab-1");
  });

  it("does not scope by responsable_id for full-access roles", async () => {
    mockAuth(coordinador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);

    await GET(get());

    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("creates a new notificacion row for a newly-seen alert and derives its tipo from bucket + origen", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([tareaVencidaKanban, tareaVencidaCrm] as never);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([]);
    vi.mocked(db.notificacion.create)
      .mockResolvedValueOnce({ id: "n1" } as never)
      .mockResolvedValueOnce({ id: "n2" } as never);

    const res = await GET(get());
    const json = await res.json();

    expect(db.notificacion.create).toHaveBeenCalledWith({
      data: { usuario_id: "colab-1", tarea_id: "t1", tipo: "TAREA_VENCIDA" },
      select: { id: true },
    });
    expect(db.notificacion.create).toHaveBeenCalledWith({
      data: { usuario_id: "colab-1", tarea_id: "t2", tipo: "COMPROMISO_VENCIDO" },
      select: { id: true },
    });
    expect(json.total).toBe(2);
    expect(json.vencidos).toHaveLength(2);
    expect(json.vencidos.every((i: { notificacion_id: string | null }) => i.notificacion_id)).toBe(true);
    expect(json.leidas_ids).toEqual([]);
  });

  it("preserves the leida flag from an existing notificacion row", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([tareaVencidaKanban] as never);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([
      { id: "n1", tarea_id: "t1", tipo: "TAREA_VENCIDA", leida: true },
    ] as never);

    const res = await GET(get());
    const json = await res.json();

    expect(db.notificacion.create).not.toHaveBeenCalled();
    expect(db.notificacion.update).not.toHaveBeenCalled();
    expect(json.leidas_ids).toEqual(["n1"]);
    expect(json.vencidos[0].notificacion_id).toBe("n1");
  });

  it("with ?leida=false, filters out already-read alerts", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([tareaVencidaKanban, tareaProximos] as never);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([
      { id: "n1", tarea_id: "t1", tipo: "TAREA_VENCIDA", leida: true },
      { id: "n3", tarea_id: "t3", tipo: "POR_VENCER", leida: false },
    ] as never);

    const res = await GET(get("?leida=false"));
    const json = await res.json();

    expect(json.vencidos).toHaveLength(0);
    expect(json.proximos3).toHaveLength(1);
    expect(json.proximos3[0].notificacion_id).toBe("n3");
  });
});
