// Test sentinel (PR 3, Slice B1): the daily email is PERSONAL — it lists
// only the tasks that belong to the calling user, even after the read-scope
// unlock. This is the only endpoint that intentionally keeps the personal
// scope when reads otherwise became global.
//
// The route mirrors `notifications/route.ts` (scope = "own" for COLABORADOR,
// "all" for full-access roles) and runs buildSnapshot(usuario, scope) before
// sending the email. We assert that COLABORADOR's task query includes
// `responsable_id = self` and that full-access roles do not — same
// regression sentinel pattern as notifications/route.test.ts.

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
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendDailySummary: vi.fn().mockResolvedValue({ ok: true }),
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

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
  return new Request(`http://localhost/api/v1/cron/daily${qs}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/cron/daily", () => {
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

  // REGRESSION SENTINEL (PR 3): the daily digest is PERSONAL. A COLABORADOR
  // must only see their own tasks, even though tasks/clients/dashboard
  // reads are otherwise global. Mirrors notifications/route.test.ts.
  it("scopes the task query to responsable_id for COLABORADOR (personal digest)", async () => {
    mockAuth(colaborador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([]);

    await GET(get());

    expect(db.tarea.findMany).toHaveBeenCalled();
    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBe("colab-1");
  });

  it("does not scope by responsable_id for full-access roles", async () => {
    mockAuth(coordinador);
    vi.mocked(db.tarea.findMany).mockResolvedValue([]);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([]);

    await GET(get());

    expect(db.tarea.findMany).toHaveBeenCalled();
    const where = vi.mocked(db.tarea.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("returns 200 with a per-user summary envelope", async () => {
    mockAuth(colaborador);
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
      {
        id: "t2",
        titulo: "Próxima",
        estado: "EN_CURSO",
        fecha_entrega: enTresDias,
        origen: "CRM",
        responsable_id: "colab-1",
        responsable: { nombre: "Ana" },
        cliente_id: "c1",
        cliente: { nombre: "Cliente A" },
      },
    ] as never);
    vi.mocked(db.notificacion.findMany).mockResolvedValue([]);
    vi.mocked(db.notificacion.create).mockResolvedValue({ id: "n1" } as never);

    const res = await GET(get());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      scope: "own",
      total: expect.any(Number),
    });
    expect(json.total).toBeGreaterThanOrEqual(0);
  });
});