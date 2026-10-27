// POST /api/v1/projects/:id/modifications/:modificationId/approve (S8 U4, E-26).
//
// Mocked db and writer: pins the order (404 -> 403 -> 404 -> 409), ADM/GER only and how the writer's
// aborts become responses. The atomic writer is proven live in prisma/modificaciones.invariant.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  solicitudFindFirst: vi.fn(),
  solicitudFindFirstOrThrow: vi.fn(),
  usuarioFindMany: vi.fn(),
  aplicar: vi.fn(),
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
  return { ...actual, aplicarModificacion: mocks.aplicar };
});

import { requireApiUser } from "@/lib/supabase/server";
import { apiError, RespuestaAbortada } from "@/lib/api/errors";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1", modificationId: "sol-1" }) };
const request = () => new Request("http://localhost/api/v1/projects/pry-1/modifications/sol-1/approve", { method: "POST" });

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
    estado: "APROBADA",
    solicitado_por_id: "coord-1",
    solicitado_at: new Date("2026-10-08T12:00:00.000Z"),
    decidido_por_id: "ger-1",
    decidido_at: new Date("2026-10-08T13:00:00.000Z"),
    comentario_decision: null,
    version: { numero: 1 },
  });
  mocks.usuarioFindMany.mockResolvedValue([
    { id: "coord-1", nombre: "Carla" },
    { id: "ger-1", nombre: "Gina" },
  ]);
  mocks.aplicar.mockResolvedValue({ version: { id: "ver-1", numero: 1, aprobado_at: "2026-10-08T13:00:00.000Z" } });
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/projects/:id/modifications/:modificationId/approve", () => {
  it.each(["SUSPENDIDO", "CERRADO", "CANCELADO"])("answers 409 when the project is %s (frozen, B7)", async (estado) => {
    mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1", estado });
    const res = await POST(request(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Solo se pueden aprobar o rechazar modificaciones de un proyecto en ejecución.",
    );
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing project before anything else", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    authAs(coordinador);
    expect((await POST(request(), ctx)).status).toBe(404);
  });

  it("answers 403 for a COORDINADOR: only ADM/GER approve (A-01)", async () => {
    authAs(coordinador);
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });

  it("answers 404 for a request that is not of this project", async () => {
    mocks.solicitudFindFirst.mockResolvedValue(null);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(404);
    expect(mocks.solicitudFindFirst.mock.calls[0]![0].where).toEqual({ id: "sol-1", proyecto_id: "pry-1" });
  });

  it("answers 409 for a request already decided", async () => {
    mocks.solicitudFindFirst.mockResolvedValue({ id: "sol-1", estado: "APROBADA" });
    const res = await POST(request(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("La solicitud ya fue decidida.");
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });

  it("returns the writer's 400 with every broken rule and its 409s", async () => {
    mocks.aplicar.mockRejectedValue(
      new RespuestaAbortada(
        apiError("El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000).", 400, "VALIDATION_ERROR", {
          reglas: [{ codigo: "A_MENOR_QUE_EJECUTADO", clave: "R12", mensaje: "x" }],
        }),
      ),
    );
    const res = await POST(request(), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).reglas[0].codigo).toBe("A_MENOR_QUE_EJECUTADO");

    mocks.aplicar.mockRejectedValue(
      new RespuestaAbortada(apiError("La solicitud se basa en una versión anterior; vuelve a crearla.", 409, "INVALID_STATE")),
    );
    expect((await POST(request(), ctx)).status).toBe(409);
  });

  it("approves in one transaction and answers 200 with the new version and the request", async () => {
    const res = await POST(request(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.version).toEqual({ id: "ver-1", numero: 1, aprobado_at: "2026-10-08T13:00:00.000Z" });
    expect(json.solicitud).toMatchObject({ id: "sol-1", estado: "APROBADA", version_numero: 1, decidido_por: { id: "ger-1", nombre: "Gina" } });
    expect(mocks.aplicar).toHaveBeenCalledWith({ marker: "tx" }, { proyectoId: "pry-1", solicitudId: "sol-1", usuarioId: "ger-1" });
  });

  it("does not swallow an unexpected failure: 500 envelope", async () => {
    mocks.aplicar.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request(), ctx)).status).toBe(500);
    spy.mockRestore();
  });
});
