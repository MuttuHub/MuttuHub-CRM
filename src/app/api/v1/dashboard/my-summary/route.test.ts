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
    cliente: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const MS_DIA = 24 * 60 * 60 * 1000;

const administrador = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function get(qs = ""): Request {
  return new Request(`http://localhost/api/v1/dashboard/my-summary${qs}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/my-summary", () => {
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

  it("always scopes to 'own', even for a full-access role like ADMINISTRADOR", async () => {
    mockAuth(administrador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    const res = await GET(get());
    const json = await res.json();

    expect(json.scope).toBe("own");
    const tareaWhere = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(tareaWhere.responsable_id).toBe("admin-1");
    const clienteWhere = vi.mocked(db.cliente.findMany).mock.calls[0]![0]!.where;
    expect(clienteWhere).toEqual({ deleted_at: null, responsable_id: "admin-1" });
  });

  it("buckets tareas into activas/vencidas/hoy and compromisos_pendientes", async () => {
    mockAuth(administrador);
    const inicioHoy = startOfLocalDay();

    vi.mocked(db.tarea.findMany).mockResolvedValue([
      {
        id: "t1",
        titulo: "Vencida sin compromiso",
        estado: "POR_HACER",
        fecha_entrega: new Date(inicioHoy.getTime() - MS_DIA),
        origen: "KANBAN",
      },
      {
        id: "t2",
        titulo: "Vence hoy, es compromiso",
        estado: "EN_CURSO",
        fecha_entrega: new Date(inicioHoy.getTime() + 1000),
        origen: "CRM",
      },
      {
        id: "t3",
        titulo: "Compromiso sin fecha",
        estado: "BLOQUEADA",
        fecha_entrega: null,
        origen: "AMBOS",
      },
      {
        id: "t4",
        titulo: "Vencida y compromiso",
        estado: "POR_HACER",
        fecha_entrega: new Date(inicioHoy.getTime() - MS_DIA),
        origen: "CRM",
      },
    ] as never);
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    const res = await GET(get());
    const json = await res.json();

    expect(json.activas.count).toBe(4);
    expect(json.vencidas.count).toBe(2);
    expect(json.vencidas.items.map((i: { id: string }) => i.id)).toEqual(["t1", "t4"]);
    expect(json.hoy.count).toBe(1);
    expect(json.compromisos_pendientes.count).toBe(3);
    expect(json.compromisos_pendientes.vencidos).toBe(1);
  });

  it("maps clientes_asignados to id/nombre/estado/prioridad", async () => {
    mockAuth(administrador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.cliente.findMany).mockResolvedValue([
      { id: "c1", nombre: "Cliente A", estado: "PROSPECTO", prioridad: "ALTA" },
      { id: "c2", nombre: "Cliente B", estado: "CLIENTE_ACTIVO", prioridad: "BAJA" },
    ] as never);

    const res = await GET(get());
    const json = await res.json();

    expect(json.clientes_asignados).toEqual({
      count: 2,
      items: [
        { cliente_id: "c1", nombre: "Cliente A", estado: "PROSPECTO", prioridad: "ALTA" },
        { cliente_id: "c2", nombre: "Cliente B", estado: "CLIENTE_ACTIVO", prioridad: "BAJA" },
      ],
    });
  });

  it("returns 400 for a malformed date filter", async () => {
    mockAuth(administrador);

    const res = await GET(get("?desde=bad"));

    expect(res.status).toBe(400);
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });
});
