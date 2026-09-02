import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findMany: vi.fn(),
    },
    bitacoraEntrada: {
      findMany: vi.fn(),
    },
    tarea: {
      findMany: vi.fn(),
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

const MS_DIA = 24 * 60 * 60 * 1000;

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function get(qs = ""): Request {
  return new Request(`http://localhost/api/v1/dashboard/clients-activity${qs}`);
}

function mockCollections(clientes: unknown[], gestiones: unknown[] = [], tareas: unknown[] = []) {
  vi.mocked(db.cliente.findMany).mockResolvedValue(clientes as never);
  vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue(gestiones as never);
  vi.mocked(db.tarea.findMany).mockResolvedValue(tareas as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/clients-activity", () => {
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

  it("returns 400 for an out-of-range dias_sin_gestion", async () => {
    mockAuth(coordinador);

    const res = await GET(get("?dias_sin_gestion=0"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-numeric dias_sin_gestion", async () => {
    mockAuth(coordinador);

    const res = await GET(get("?dias_sin_gestion=abc"));

    expect(res.status).toBe(400);
  });

  it("defaults dias_sin_gestion to 14 when absent", async () => {
    mockAuth(coordinador);
    mockCollections([]);

    const res = await GET(get());
    const json = await res.json();

    expect(json.sin_gestion.dias).toBe(14);
  });

  // PR 3: read scope is now global. The clients-activity face is "all" for
  // every role, so COLABORADOR sees the platform-wide client set.
  it("returns scope 'all' and does NOT force responsable_id for COLABORADOR", async () => {
    mockAuth(colaborador);
    mockCollections([]);

    const res = await GET(get());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ scope: "all" });
    const where = vi.mocked(db.cliente.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("flags never-gestioned and stale clients as sin_gestion, excludes recently managed ones", async () => {
    mockAuth(coordinador);
    const now = Date.now();
    mockCollections([
      {
        id: "c1",
        nombre: "Nunca gestionado",
        tipo_cliente: "OTRO",
        estado: "PROSPECTO",
        prioridad: "ALTA",
        responsable_id: "r1",
        responsable: { nombre: "Ana" },
        bitacora: [],
      },
      {
        id: "c2",
        nombre: "Gestión antigua",
        tipo_cliente: "OTRO",
        estado: "PROSPECTO",
        prioridad: "MEDIA",
        responsable_id: "r1",
        responsable: { nombre: "Ana" },
        bitacora: [{ created_at: new Date(now - 20 * MS_DIA) }],
      },
      {
        id: "c3",
        nombre: "Gestión reciente",
        tipo_cliente: "OTRO",
        estado: "PROSPECTO",
        prioridad: "BAJA",
        responsable_id: "r2",
        responsable: { nombre: "Beto" },
        bitacora: [{ created_at: new Date(now - 2 * MS_DIA) }],
      },
    ]);

    const res = await GET(get("?dias_sin_gestion=14"));
    const json = await res.json();

    const ids = json.sin_gestion.clientes.map((c: { cliente_id: string }) => c.cliente_id);
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).not.toContain("c3");
  });

  it("computes distribucion over the full scoped set, not just sin_gestion", async () => {
    mockAuth(coordinador);
    mockCollections([
      {
        id: "c1",
        nombre: "A",
        tipo_cliente: "EMPRESA_PRIVADA",
        estado: "CLIENTE_ACTIVO",
        prioridad: "ALTA",
        responsable_id: "r1",
        responsable: { nombre: "Ana" },
        bitacora: [{ created_at: new Date() }],
      },
      {
        id: "c2",
        nombre: "B",
        tipo_cliente: "EMPRESA_PRIVADA",
        estado: "PROSPECTO",
        prioridad: "BAJA",
        responsable_id: "r1",
        responsable: { nombre: "Ana" },
        bitacora: [{ created_at: new Date() }],
      },
    ]);

    const res = await GET(get());
    const json = await res.json();

    expect(json.distribucion.por_tipo).toEqual(
      expect.arrayContaining([{ tipo: "EMPRESA_PRIVADA", count: 2 }]),
    );
    expect(json.distribucion.por_estado).toEqual(
      expect.arrayContaining([
        { estado: "CLIENTE_ACTIVO", count: 1 },
        { estado: "PROSPECTO", count: 1 },
      ]),
    );
  });

  it("aggregates actividad_por_responsable from gestiones and tareas in scope, including zero-activity responsables", async () => {
    mockAuth(coordinador);
    mockCollections(
      [
        {
          id: "c1",
          nombre: "A",
          tipo_cliente: "OTRO",
          estado: "PROSPECTO",
          prioridad: "ALTA",
          responsable_id: "r1",
          responsable: { nombre: "Ana" },
          bitacora: [],
        },
        {
          id: "c2",
          nombre: "B",
          tipo_cliente: "OTRO",
          estado: "PROSPECTO",
          prioridad: "ALTA",
          responsable_id: "r2",
          responsable: { nombre: "Beto" },
          bitacora: [],
        },
      ],
      [{ cliente_id: "c1" }],
      [{ cliente_id: "c1" }, { cliente_id: "c1" }],
    );

    const res = await GET(get());
    const json = await res.json();

    expect(json.actividad_por_responsable).toEqual([
      { responsable_id: "r1", nombre: "Ana", gestiones: 1, tareas_count: 2 },
      { responsable_id: "r2", nombre: "Beto", gestiones: 0, tareas_count: 0 },
    ]);
  });
});
