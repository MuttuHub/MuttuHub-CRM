// POST /api/v1/projects/:id/baseline/approve (S8 U3, E-25).
//
// Mocked `@/lib/db` and the atomic writer: pins the order (404 -> 403 -> 409), who may approve and how
// the writer's aborts become responses. The writer itself (v0, estado, audit in one tx) is proven live
// in prisma/linea-base.invariant.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ marker: "tx" })),
  },
}));

vi.mock("@/lib/api/versiones", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/versiones")>();
  return { ...actual, aprobarLineaBase: vi.fn() };
});

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { aprobarLineaBase } from "@/lib/api/versiones";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const request = () => new Request("http://localhost/api/v1/projects/pry-1/baseline/approve", { method: "POST" });

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "BORRADOR" } as never);
  vi.mocked(aprobarLineaBase).mockResolvedValue({
    version: { id: "ver-1", numero: 0, aprobado_at: "2026-10-08T12:00:00.000Z" },
    proyecto: { id: "pry-1", estado: "EN_EJECUCION" },
  });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/projects/:id/baseline/approve", () => {
  it("answers 404 for a missing project before anything else", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    authAs(coordinador);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(404);
    expect(aprobarLineaBase).not.toHaveBeenCalled();
  });

  it("answers 403 for a COORDINADOR: only ADM/GER approve the baseline", async () => {
    authAs(coordinador);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(403);
    expect(aprobarLineaBase).not.toHaveBeenCalled();
  });

  it("answers 409 when the baseline is already approved", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION" } as never);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "INVALID_STATE",
      error: "El proyecto ya tiene línea base aprobada.",
    });
    expect(aprobarLineaBase).not.toHaveBeenCalled();
  });

  it("answers 409 when the project is not in Borrador", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "CANCELADO" } as never);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Solo se puede aprobar la línea base de un proyecto en Borrador.");
  });

  it("returns the writer's 409 with every failed precondition", async () => {
    vi.mocked(aprobarLineaBase).mockRejectedValue(
      new RespuestaAbortada(
        apiError("La línea base no se puede aprobar: hay precondiciones sin cumplir.", 409, "INVALID_STATE", {
          precondiciones: [{ codigo: "SIN_OBJETIVOS", mensaje: "El proyecto no tiene objetivos." }],
        }),
      ),
    );
    const res = await POST(request(), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_STATE");
    expect(json.precondiciones).toEqual([{ codigo: "SIN_OBJETIVOS", mensaje: "El proyecto no tiene objetivos." }]);
  });

  it("approves in one transaction and answers 201 with version 0", async () => {
    const res = await POST(request(), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      version: { id: "ver-1", numero: 0, aprobado_at: "2026-10-08T12:00:00.000Z" },
      proyecto: { id: "pry-1", estado: "EN_EJECUCION" },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(aprobarLineaBase).toHaveBeenCalledWith(
      { marker: "tx" },
      expect.objectContaining({ proyectoId: "pry-1", usuarioId: "ger-1" }),
    );
  });

  it("does not swallow an unexpected failure: 500 envelope", async () => {
    vi.mocked(aprobarLineaBase).mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request(), ctx);
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
