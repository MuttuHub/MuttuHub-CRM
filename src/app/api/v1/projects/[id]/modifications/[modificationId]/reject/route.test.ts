// POST /api/v1/projects/:id/modifications/:modificationId/reject (S8 U4, E-26).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  solicitudFindFirst: vi.fn(),
  solicitudFindFirstOrThrow: vi.fn(),
  usuarioFindMany: vi.fn(),
  rechazar: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: mocks.proyectoFindFirst },
    solicitudModificacion: { findFirst: mocks.solicitudFindFirst, findFirstOrThrow: mocks.solicitudFindFirstOrThrow },
    usuario: { findMany: mocks.usuarioFindMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ marker: "tx" })),
  },
}));
vi.mock("@/lib/api/modificaciones", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/modificaciones")>();
  return { ...actual, rechazarModificacion: mocks.rechazar };
});

import { requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1", modificationId: "sol-1" }) };
const request = (body: unknown = { comentario: "No hay presupuesto" }) =>
  new Request("http://localhost/api/v1/projects/pry-1/modifications/sol-1/reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1" });
  mocks.solicitudFindFirst.mockResolvedValue({ id: "sol-1", estado: "PENDIENTE" });
  mocks.solicitudFindFirstOrThrow.mockResolvedValue({
    id: "sol-1",
    tipo: "TRASLADO",
    motivo: "Mover",
    detalle: [],
    version_base_numero: 0,
    estado: "RECHAZADA",
    solicitado_por_id: "coord-1",
    solicitado_at: new Date("2026-10-08T12:00:00.000Z"),
    decidido_por_id: "ger-1",
    decidido_at: new Date("2026-10-08T13:00:00.000Z"),
    comentario_decision: "No hay presupuesto",
    version: null,
  });
  mocks.usuarioFindMany.mockResolvedValue([{ id: "coord-1", nombre: "Carla" }, { id: "ger-1", nombre: "Gina" }]);
  mocks.rechazar.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/projects/:id/modifications/:modificationId/reject", () => {
  it.each(["SUSPENDIDO", "CERRADO", "CANCELADO"])("answers 409 when the project is %s (frozen, B7)", async (estado) => {
    mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1", estado });
    const res = await POST(request(), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "INVALID_STATE",
      error: "No se pueden aprobar o rechazar modificaciones de un proyecto suspendido, cerrado o cancelado.",
    });
    expect(mocks.rechazar).not.toHaveBeenCalled();
  });

  it("answers 404 / 403 / 404 / 409 in that order", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await POST(request(), ctx)).status).toBe(404);
    mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1" });
    authAs(coordinador);
    expect((await POST(request(), ctx)).status).toBe(403);
    authAs(gerencia);
    mocks.solicitudFindFirst.mockResolvedValue(null);
    expect((await POST(request(), ctx)).status).toBe(404);
    mocks.solicitudFindFirst.mockResolvedValue({ id: "sol-1", estado: "RECHAZADA" });
    const res = await POST(request(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("La solicitud ya fue decidida.");
    expect(mocks.rechazar).not.toHaveBeenCalled();
  });

  it("requires the comment", async () => {
    for (const body of [{}, { comentario: "   " }, { comentario: "ok", extra: 1 }]) {
      const res = await POST(request(body), ctx);
      expect(res.status).toBe(400);
    }
    const res = await POST(request({}), ctx);
    expect((await res.json()).error).toBe("El comentario es obligatorio al rechazar.");
    expect(mocks.rechazar).not.toHaveBeenCalled();
  });

  it("rejects and answers 200 with the request", async () => {
    const res = await POST(request(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.solicitud).toMatchObject({ estado: "RECHAZADA", comentario_decision: "No hay presupuesto", version_numero: null });
    expect(mocks.rechazar).toHaveBeenCalledWith(
      { marker: "tx" },
      { proyectoId: "pry-1", solicitudId: "sol-1", usuarioId: "ger-1", comentario: "No hay presupuesto" },
    );
  });
});
