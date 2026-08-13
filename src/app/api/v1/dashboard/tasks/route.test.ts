import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
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

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function get(qs = ""): Request {
  return new Request(`http://localhost/api/v1/dashboard/tasks${qs}`);
}

/** Mocks the two sequential db.tarea.findMany calls (tareas, then vencidas). */
function mockTareas(tareas: unknown[], vencidas: unknown[] = []) {
  vi.mocked(db.tarea.findMany)
    .mockResolvedValueOnce(tareas as never)
    .mockResolvedValueOnce(vencidas as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/dashboard/tasks", () => {
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

  it("returns 400 for a malformed 'hasta' filter", async () => {
    mockAuth(coordinador);

    const res = await GET(get("?hasta=bad-date"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.tarea.findMany).not.toHaveBeenCalled();
  });

  it("scopes the board query to responsable_id for COLABORADOR", async () => {
    mockAuth(colaborador);
    mockTareas([]);

    const res = await GET(get());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ scope: "own" });
    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBe("colab-1");
  });

  it("does not scope the board query for full-access roles", async () => {
    mockAuth(coordinador);
    mockTareas([]);

    const res = await GET(get());

    expect(await res.json()).toMatchObject({ scope: "all" });
    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("computes por_columna counts across the visible board states", async () => {
    mockAuth(coordinador);
    mockTareas([
      { id: "t1", estado: "POR_HACER", fecha_entrega: null, updated_at: new Date(), responsable_id: "u1", responsable: { nombre: "Ana" } },
      { id: "t2", estado: "EN_CURSO", fecha_entrega: null, updated_at: new Date(), responsable_id: "u1", responsable: { nombre: "Ana" } },
      { id: "t3", estado: "EN_CURSO", fecha_entrega: null, updated_at: new Date(), responsable_id: "u2", responsable: { nombre: "Beto" } },
    ]);

    const res = await GET(get());
    const json = await res.json();

    expect(json.por_columna).toEqual(
      expect.arrayContaining([
        { estado: "POR_HACER", label: expect.any(String), count: 1 },
        { estado: "EN_CURSO", label: expect.any(String), count: 2 },
        { estado: "COMPLETADA", label: expect.any(String), count: 0 },
      ]),
    );
  });

  it("computes cumplimiento_por_persona: cumplida requires COMPLETADA closed on/before fecha_entrega", async () => {
    mockAuth(coordinador);
    const fechaEntrega = new Date("2026-01-10T00:00:00.000Z");
    mockTareas([
      // Closed on time -> cumplida.
      {
        id: "t1",
        estado: "COMPLETADA",
        fecha_entrega: fechaEntrega,
        updated_at: new Date("2026-01-09T00:00:00.000Z"),
        responsable_id: "u1",
        responsable: { nombre: "Ana" },
      },
      // Closed late -> completada but not cumplida.
      {
        id: "t2",
        estado: "COMPLETADA",
        fecha_entrega: fechaEntrega,
        updated_at: new Date("2026-01-15T00:00:00.000Z"),
        responsable_id: "u1",
        responsable: { nombre: "Ana" },
      },
    ]);

    const res = await GET(get());
    const json = await res.json();

    expect(json.cumplimiento_por_persona).toEqual([
      {
        responsable_id: "u1",
        nombre: "Ana",
        total: 2,
        completadas: 2,
        cumplidas: 1,
        porc: 50,
      },
    ]);
  });

  it("maps the vencidas list with responsable and cliente names", async () => {
    mockAuth(coordinador);
    mockTareas(
      [],
      [
        {
          id: "v1",
          titulo: "Tarea vencida",
          fecha_entrega: new Date("2026-01-01T00:00:00.000Z"),
          responsable: { nombre: "Ana" },
          cliente: { nombre: "Cliente A" },
        },
        {
          id: "v2",
          titulo: "Sin cliente",
          fecha_entrega: new Date("2026-01-02T00:00:00.000Z"),
          responsable: { nombre: "Beto" },
          cliente: null,
        },
      ],
    );

    const res = await GET(get());
    const json = await res.json();

    expect(json.vencidas.count).toBe(2);
    expect(json.vencidas.lista).toEqual([
      {
        id: "v1",
        titulo: "Tarea vencida",
        responsable_nombre: "Ana",
        fecha_entrega: "2026-01-01T00:00:00.000Z",
        cliente_nombre: "Cliente A",
      },
      {
        id: "v2",
        titulo: "Sin cliente",
        responsable_nombre: "Beto",
        fecha_entrega: "2026-01-02T00:00:00.000Z",
        cliente_nombre: null,
      },
    ]);
  });
});
