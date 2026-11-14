// POST /api/v1/projects/:id/programming/confirm (T13, S7). The rule itself (every line at $0 pending, who and
// when, the audit row) is pinned live in prisma/linea-base.invariant.test.ts; this file pins the route wiring.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ confirmar: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/presupuesto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/presupuesto")>();
  return { ...actual, confirmarProgramacion: mocks.confirmar };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ marca: "tx" })),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { RespuestaAbortada } from "@/lib/api/errors";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = (estado = "BORRADOR", miembro = false, over: object = {}) =>
  ({
    id: "pry-1",
    estado,
    valor_total: new Prisma.Decimal(100),
    fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
    fecha_fin: new Date("2026-12-18T00:00:00.000Z"),
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const post = () => new Request("http://localhost/api/v1/projects/pry-1/programming/confirm", { method: "POST" });

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  mocks.confirmar.mockResolvedValue({ estado: "BORRADOR", programacion_confirmada: { at: "x", por_id: "ger-1" } });
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("POST programming/confirm", () => {
  it("confirms in one transaction with the project periods and the caller, and answers the view", async () => {
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.confirmar).toHaveBeenCalledWith(
      { marca: "tx" },
      { proyectoId: "pry-1", usuarioId: "ger-1", periodos: ["2026-10", "2026-11", "2026-12"] },
    );
    expect((await res.json()).programacion_confirmada).toEqual({ at: "x", por_id: "ger-1" });
  });

  it("lets a member Gestor confirm; 403 for a non-member, 404 when missing, 409 outside BORRADOR or without dates", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", true));
    expect((await POST(post(), ctx)).status).toBe(200);

    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false));
    expect((await POST(post(), ctx)).status).toBe(403);

    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(), ctx)).status).toBe(404);

    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION"));
    expect((await POST(post(), ctx)).status).toBe(409);

    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR", false, { fecha_inicio: null }));
    expect((await POST(post(), ctx)).status).toBe(409);
    expect(mocks.confirmar).toHaveBeenCalledTimes(1);
  });

  it("answers the 409 the rule aborts with, pending lines included", async () => {
    const respuesta = Response.json(
      { error: "No se puede confirmar la programación: hay líneas con valor pendiente por programar.", pendientes: [] },
      { status: 409 },
    );
    mocks.confirmar.mockRejectedValue(new RespuestaAbortada(respuesta as never));
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("No se puede confirmar la programación: hay líneas con valor pendiente por programar.");
  });
});
