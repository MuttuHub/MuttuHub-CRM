import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txUpsert: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        setting: { upsert: mocks.txUpsert },
        auditoriaCambio: { createMany: mocks.createMany },
      }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2";
import { GET, PATCH } from "./route";

const admin = { id: "admin-1", rol: "ADMINISTRADOR" } as Usuario;
const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/settings/semaforo-v2", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function forbidden() {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), { status: 403 }),
  });
}

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: gerencia,
    supabaseUser: {} as never,
  });
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/settings/semaforo-v2", () => {
  it("returns the defaults (all unconfirmed) when nothing is stored, for any authenticated user", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.parametros).toEqual(PARAMETROS_V2_DEFAULT);
  });

  it("falls back to the defaults on malformed stored data", async () => {
    vi.mocked(db.setting.findUnique).mockResolvedValue({ value: "garbage" } as never);

    const json = await (await GET()).json();

    expect(json.parametros).toEqual(PARAMETROS_V2_DEFAULT);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), { status: 401 }),
    });

    expect((await GET()).status).toBe(401);
  });
});

describe("PATCH /api/v1/settings/semaforo-v2", () => {
  it("is 403 for a non-admin (GERENCIA) and writes nothing", async () => {
    forbidden();

    const res = await PATCH(patchRequest({ umbral1: { valor: 5 } }));

    expect(res.status).toBe(403);
    expect(requireApiRole).toHaveBeenCalledWith(["ADMINISTRADOR"]);
    expect(mocks.txUpsert).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("writes one CAMBIAR_PARAMETRO audit row per changed field, in the same transaction", async () => {
    const res = await PATCH(
      patchRequest({
        umbral1: { valor: 5, confirmado: true },
        retraso: { valor: 60 },
        avance_requiere_medio: { valor: true },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.parametros.umbral1).toEqual({ valor: 5, confirmado: true });
    expect(json.parametros.retraso).toEqual({ valor: 60, confirmado: false });

    const stored = mocks.txUpsert.mock.calls[0][0];
    expect(stored.where).toEqual({ key: "semaforo_parametros_v2" });
    expect(stored.update.updated_by).toBe("admin-1");

    const rows = mocks.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accion: "CAMBIAR_PARAMETRO",
          entidad: "parametro",
          entidad_id: "semaforo_parametros_v2",
          usuario_id: "admin-1",
          campo: "umbral1.valor",
          valor_anterior: 10,
          valor_nuevo: 5,
        }),
        expect.objectContaining({ campo: "umbral1.confirmado", valor_anterior: false, valor_nuevo: true }),
        expect.objectContaining({ campo: "retraso.valor", valor_anterior: 70, valor_nuevo: 60 }),
      ]),
    );
  });

  it("flips confirmado only when it is explicitly sent", async () => {
    vi.mocked(db.setting.findUnique).mockResolvedValue({
      value: { ...PARAMETROS_V2_DEFAULT, tolerancia: { valor: 10, confirmado: true } },
    } as never);

    const json = await (await PATCH(patchRequest({ tolerancia: { valor: 12 } }))).json();

    expect(json.parametros.tolerancia).toEqual({ valor: 12, confirmado: true });
    const rows = mocks.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { campo: string }) => r.campo)).toEqual(["tolerancia.valor"]);
  });

  it("does not write or audit when nothing changes", async () => {
    const res = await PATCH(patchRequest({ umbral1: { valor: 10 } }));

    expect(res.status).toBe(200);
    expect(mocks.txUpsert).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["umbral1 >= umbral2", { umbral1: { valor: 25 } }],
    ["a percentage above 100", { retraso: { valor: 101 } }],
    ["a negative percentage", { tolerancia: { valor: -1 } }],
    ["a non-boolean flag", { avance_requiere_medio: { valor: "si" } }],
    ["an unknown parameter", { inventado: { valor: 1 } }],
    ["an empty parameter object", { umbral1: {} }],
    ["an empty body", {}],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await PATCH(patchRequest(body));

    expect(res.status).toBe(400);
    expect(mocks.txUpsert).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid JSON body with 400", async () => {
    expect((await PATCH(patchRequest("{nope"))).status).toBe(400);
  });
});
