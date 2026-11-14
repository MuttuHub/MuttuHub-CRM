// POST /api/v1/projects/:id/programming/move (T13, S4). The rule itself (same line, open months, the total of
// the line unchanged, the audit row) is pinned live in prisma/programacion-mover.invariant.test.ts; this file
// pins the route wiring: gate order, body, the current Bogota month and the answer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ mover: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/presupuesto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/presupuesto")>();
  return { ...actual, moverProgramacion: mocks.mover };
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

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({
    id: "pry-1",
    estado,
    valor_total: new Prisma.Decimal(100),
    fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
    fecha_fin: new Date("2026-12-18T00:00:00.000Z"),
    miembros: miembro ? [{ id: "m-1" }] : [],
  }) as never;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const CUERPO = { linea_id: "lin-1", origen: "2026-11", destino: "2026-12", valor: "2000000" };
const post = (body: unknown = CUERPO) =>
  new Request("http://localhost/api/v1/projects/pry-1/programming/move", { method: "POST", body: JSON.stringify(body) });

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  // 2026-11-14 in Bogota: November is the current month.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T15:00:00.000Z"));
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  mocks.mover.mockResolvedValue({ estado: "EN_EJECUCION", filas: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST programming/move", () => {
  it("moves in one transaction with the line, both months, the value in cents, the caller and the current month", async () => {
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.mover).toHaveBeenCalledWith(
      { marca: "tx" },
      {
        proyectoId: "pry-1",
        usuarioId: "ger-1",
        lineaId: "lin-1",
        origen: "2026-11",
        destino: "2026-12",
        valor: BigInt(200000000),
        periodoActual: "2026-11",
      },
    );
    expect(await res.json()).toEqual({ estado: "EN_EJECUCION", filas: [] });
  });

  it("lets a member Gestor move; 403 for a non-member, 404 when missing, 409 outside EN_EJECUCION", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await POST(post(), ctx)).status).toBe(200);

    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", false));
    expect((await POST(post(), ctx)).status).toBe(403);

    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(), ctx)).status).toBe(404);

    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("BORRADOR"));
    const borrador = await POST(post(), ctx);
    expect(borrador.status).toBe(409);
    expect((await borrador.json()).error).toBe("Solo se pueden mover valores entre meses de un proyecto en ejecución.");
    expect(mocks.mover).toHaveBeenCalledTimes(1);
  });

  it("answers 400 for a malformed body without touching the data", async () => {
    for (const cuerpo of [
      { ...CUERPO, origen: "noviembre" },
      { ...CUERPO, valor: "dos millones" },
      { linea_id: "lin-1", origen: "2026-11", destino: "2026-12" },
      { ...CUERPO, extra: true },
    ]) {
      const res = await POST(post(cuerpo), ctx);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("VALIDATION_ERROR");
    }
    expect(mocks.mover).not.toHaveBeenCalled();
  });

  it("answers the 400 / 409 the rule aborts with", async () => {
    const respuesta = Response.json(
      { error: "El mes 2026-10 ya cerró: no se pueden mover valores desde ni hacia un mes cerrado.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
    mocks.mover.mockRejectedValue(new RespuestaAbortada(respuesta as never));
    const res = await POST(post({ ...CUERPO, origen: "2026-10" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("El mes 2026-10 ya cerró: no se pueden mover valores desde ni hacia un mes cerrado.");
  });
});
