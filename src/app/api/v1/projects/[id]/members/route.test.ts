// GET/POST /api/v1/projects/:id/members (contract E-07, P02/P07).
//
// These cases run against a mocked `@/lib/db` and pin the authorization order
// (404 for a missing project before 403), the manager-only write gate and the
// validation of the user being added. The 409 for an already-active member and
// the re-add after a soft removal are enforced by the partial unique index
// `proyecto_miembros_activo_uq`, so they are proven against the live database
// in prisma/proyecto-miembros-routes.invariant.test.ts; here the 409 is only
// checked to be the route's mapping of the index's P2002.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txCreate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    usuario: { findFirst: vi.fn() },
    proyectoMiembro: { findMany: vi.fn() },
    // Interactive-form $transaction: the route writes through the tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ proyectoMiembro: { create: mocks.txCreate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const proyectoScoped = { id: "pry-1", miembros: [] };
const miembroRow = {
  id: "mem-1",
  created_at: new Date("2026-10-07T12:00:00.000Z"),
  removed_at: null,
  agregado_por_id: "ger-1",
  usuario: { id: "coord-9", nombre: "Ana Gómez", rol: "COORDINADOR" },
};

const routeContext = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function getRequest(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/members");
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The exact P2002 payload Prisma 7 + @prisma/adapter-pg produces for the partial index. */
function uniqueViolation(fields: string[], constraintName: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "ProyectoMiembro",
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage: `duplicate key value violates unique constraint "${constraintName}"`,
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoScoped as never);
  vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "coord-9", rol: "COORDINADOR", activo: true } as never);
  vi.mocked(db.proyectoMiembro.findMany).mockResolvedValue([miembroRow] as never);
  mocks.txCreate.mockResolvedValue(miembroRow as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/members", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), { status: 401 }),
    });

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(401);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or soft-deleted project before deciding permissions", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
  });

  it("returns 403 for a COORDINADOR who is not an active member", async () => {
    authAs(coordinador);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(db.proyectoMiembro.findMany).not.toHaveBeenCalled();
  });

  it("lists only the ACTIVE members of the project", async () => {
    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.miembros).toEqual([
      {
        id: "mem-1",
        usuario: { id: "coord-9", nombre: "Ana Gómez", rol: "COORDINADOR" },
        agregado_por_id: "ger-1",
        created_at: "2026-10-07T12:00:00.000Z",
        removed_at: null,
      },
    ]);
    expect(db.proyectoMiembro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proyecto_id: "pry-1", removed_at: null },
      }),
    );
  });
});

describe("POST /api/v1/projects/:id/members", () => {
  it("returns 404 for a missing or soft-deleted project before deciding permissions", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ usuario_id: "coord-9" }), routeContext);

    expect(res.status).toBe(404);
    expect(db.usuario.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 for a COORDINADOR and never looks the target user up", async () => {
    authAs(coordinador);

    const res = await POST(postRequest({ usuario_id: "coord-9" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(db.usuario.findFirst).not.toHaveBeenCalled();
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR", async () => {
    authAs(colaborador);

    const res = await POST(postRequest({ usuario_id: "coord-9" }), routeContext);

    expect(res.status).toBe(403);
  });

  it("returns 400 when the body is not a JSON object", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/projects/pry-1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("coord-9"),
      }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(db.usuario.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when usuario_id is missing", async () => {
    const res = await POST(postRequest({}), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a COLABORADOR member and rejects a role outside the member set", async () => {
    vi.mocked(db.usuario.findFirst).mockResolvedValue({
      id: "colab-9",
      rol: "COLABORADOR",
      activo: true,
    } as never);

    const ok = await POST(postRequest({ usuario_id: "colab-9" }), routeContext);
    expect(ok.status).toBe(201);

    vi.mocked(db.usuario.findFirst).mockResolvedValue({
      id: "ger-9",
      rol: "GERENCIA",
      activo: true,
    } as never);

    const res = await POST(postRequest({ usuario_id: "ger-9" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe(
      "Solo un Coordinador o un Colaborador puede ser integrante del equipo del proyecto.",
    );

    // Restore the file's default target so later tests are independent.
    vi.mocked(db.usuario.findFirst).mockResolvedValue({
      id: "coord-9",
      rol: "COORDINADOR",
      activo: true,
    } as never);
  });

  it("returns 400 when the target user does not exist", async () => {
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ usuario_id: "nadie" }), routeContext);

    expect(res.status).toBe(400);
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the target COORDINADOR is inactive", async () => {
    vi.mocked(db.usuario.findFirst).mockResolvedValue({
      id: "coord-9",
      rol: "COORDINADOR",
      activo: false,
    } as never);

    const res = await POST(postRequest({ usuario_id: "coord-9" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("El usuario no existe o está inactivo.");
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("adds the member with agregado_por_id set to the acting user and audits CREAR", async () => {
    const res = await POST(postRequest({ usuario_id: "coord-9" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.miembro).toEqual({
      id: "mem-1",
      usuario: { id: "coord-9", nombre: "Ana Gómez", rol: "COORDINADOR" },
      agregado_por_id: "ger-1",
      created_at: "2026-10-07T12:00:00.000Z",
      removed_at: null,
    });
    expect(mocks.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { proyecto_id: "pry-1", usuario_id: "coord-9", agregado_por_id: "ger-1" },
      }),
    );
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "proyecto_miembro",
        entidad_id: "mem-1",
        proyecto_id: "pry-1",
      }),
    );
  });

  it("maps the partial index P2002 to 409 CONFLICT", async () => {
    mocks.txCreate.mockRejectedValue(
      uniqueViolation(["proyecto_id", "usuario_id"], "proyecto_miembros_activo_uq"),
    );

    const res = await POST(postRequest({ usuario_id: "coord-9" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  it("does not swallow an unrelated unique violation (500)", async () => {
    mocks.txCreate.mockRejectedValue(
      uniqueViolation(["codigo"], "otro_indice_inexistente_uq"),
    );

    const res = await POST(postRequest({ usuario_id: "coord-9" }), routeContext);

    expect(res.status).toBe(500);
  });
});
