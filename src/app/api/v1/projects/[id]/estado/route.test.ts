// POST /api/v1/projects/:id/estado (B7, S2-S4).
//
// Mocked `@/lib/db` and the writer: pins the order (404 -> 403 -> 400 -> 409), who may change the
// estado and how the writer's aborts become responses. The writer is unit-tested in
// src/lib/api/estado-proyecto.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ marker: "tx" })),
  },
}));

vi.mock("@/lib/api/estado-proyecto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/estado-proyecto")>();
  return { ...actual, cambiarEstadoProyecto: vi.fn() };
});

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { cambiarEstadoProyecto } from "@/lib/api/estado-proyecto";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const administrador = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/v1/projects/pry-1/estado", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function proyectoEn(estado: string) {
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado } as never);
}

beforeEach(() => {
  authAs(gerencia);
  proyectoEn("EN_EJECUCION");
  vi.mocked(cambiarEstadoProyecto).mockResolvedValue({ proyecto: { id: "pry-1", estado: "SUSPENDIDO" } });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/projects/:id/estado", () => {
  it("answers 404 for a missing project before anything else", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    authAs(coordinador);
    const res = await POST(request({ accion: "SUSPENDER", motivo: "x" }), ctx);
    expect(res.status).toBe(404);
    expect(cambiarEstadoProyecto).not.toHaveBeenCalled();
  });

  it.each([coordinador, colaborador])("answers 403 for a $rol: only ADM/GER change the estado", async (usuario) => {
    authAs(usuario);
    for (const accion of ["SUSPENDER", "CERRAR", "CANCELAR"]) {
      const res = await POST(request({ accion, motivo: "x" }), ctx);
      expect(res.status).toBe(403);
    }
    proyectoEn("CERRADO");
    expect((await POST(request({ accion: "REABRIR", motivo: "x" }), ctx)).status).toBe(403);
    expect(cambiarEstadoProyecto).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown accion or a missing motivo", async () => {
    const sinMotivo = await POST(request({ accion: "SUSPENDER" }), ctx);
    expect(sinMotivo.status).toBe(400);
    expect((await sinMotivo.json()).code).toBe("VALIDATION_ERROR");
    expect((await POST(request({ accion: "BORRAR", motivo: "x" }), ctx)).status).toBe(400);
    expect(cambiarEstadoProyecto).not.toHaveBeenCalled();
  });

  it("answers 409 for a transition the current estado does not allow, without writing", async () => {
    proyectoEn("CANCELADO");
    const res = await POST(request({ accion: "REABRIR", motivo: "x" }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "INVALID_STATE",
      error: "Solo se puede reabrir un proyecto cerrado.",
    });
    expect(cambiarEstadoProyecto).not.toHaveBeenCalled();
  });

  it("changes the estado for GERENCIA and ADMINISTRADOR with the trimmed motivo", async () => {
    const res = await POST(request({ accion: "SUSPENDER", motivo: "  Sin fondos " }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ proyecto: { id: "pry-1", estado: "SUSPENDIDO" } });
    expect(cambiarEstadoProyecto).toHaveBeenCalledWith(
      { marker: "tx" },
      { proyectoId: "pry-1", usuarioId: "ger-1", accion: "SUSPENDER", motivo: "Sin fondos" },
    );

    authAs(administrador);
    proyectoEn("CERRADO");
    expect((await POST(request({ accion: "REABRIR", motivo: "Informe pendiente" }), ctx)).status).toBe(200);
  });

  it("returns the writer's 409 when the estado changed before the lock", async () => {
    vi.mocked(cambiarEstadoProyecto).mockRejectedValue(
      new RespuestaAbortada(apiError("Solo se puede suspender un proyecto en ejecución.", 409, "INVALID_STATE")),
    );
    const res = await POST(request({ accion: "SUSPENDER", motivo: "x" }), ctx);
    expect(res.status).toBe(409);
  });
});
