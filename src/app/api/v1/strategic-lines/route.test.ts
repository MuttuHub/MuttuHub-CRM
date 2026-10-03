import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txLineaCreate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn() };
});

vi.mock("@/lib/db", () => ({
  db: {
    lineaEstrategicaCatalogo: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    // Interactive-form $transaction: the route reads/writes through the tx
    // client, so the fake forwards to the hoisted tx mock.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ lineaEstrategicaCatalogo: { create: mocks.txLineaCreate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const usuario = {
  id: "user-1",
  rol: "COLABORADOR",
} as Usuario;

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

const LINEA_CODES = ["LE01", "LE02", "LE03", "LE04", "LE05", "LE06", "LE07", "LE08"];

function lineaRow(codigo: string, index: number) {
  return {
    id: `linea-${index}`,
    codigo,
    nombre: `Nombre ${codigo}`,
    activo: true,
    fecha_suspension: null,
    orden: index + 1,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/strategic-lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(user: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario: user,
    supabaseUser: {} as never,
  });
}

beforeEach(() => {
  mockAuthenticated(admin);
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
  vi.mocked(db.lineaEstrategicaCatalogo.findUnique).mockResolvedValue(null);
  mocks.txLineaCreate.mockResolvedValue(lineaRow("LE01", 0) as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/strategic-lines", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    expect(db.lineaEstrategicaCatalogo.findMany).not.toHaveBeenCalled();
  });

  it("GET /strategic-lines returns the 8 active lines ordered by codigo for any authenticated user", async () => {
    mockAuthenticated(usuario);
    const rows = LINEA_CODES.map((codigo, index) => lineaRow(codigo, index));
    vi.mocked(db.lineaEstrategicaCatalogo.findMany).mockResolvedValue(rows as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.lineas.map((linea: { codigo: string }) => linea.codigo)).toEqual(LINEA_CODES);
    expect(db.lineaEstrategicaCatalogo.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        activo: true,
        fecha_suspension: true,
        orden: true,
        created_at: true,
        updated_at: true,
      },
    });
  });
});

describe("POST /api/v1/strategic-lines", () => {
  it("returns 403 when the caller is not an administrador", async () => {
    vi.mocked(requireApiRole).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), {
        status: 403,
      }),
    });

    const res = await POST(postRequest({ codigo: "LE09", nombre: "Nueva" }));

    expect(res.status).toBe(403);
    expect(db.lineaEstrategicaCatalogo.findUnique).not.toHaveBeenCalled();
    expect(mocks.txLineaCreate).not.toHaveBeenCalled();
  });

  it("creates a strategic line with an immutable codigo and audits CREAR", async () => {
    const res = await POST(postRequest({ codigo: "LE09", nombre: "Cooperación", orden: 9 }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.linea.codigo).toBe("LE01");
    expect(mocks.txLineaCreate).toHaveBeenCalledWith({
      data: { codigo: "LE09", nombre: "Cooperación", orden: 9 },
      select: expect.objectContaining({ codigo: true, activo: true, fecha_suspension: true }),
    });
    expect(vi.mocked(logChange)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "admin-1",
        accion: "CREAR",
        entidad: "linea",
        entidad_id: "linea-0",
      }),
    );
  });

  it("rejects a duplicate codigo with 409 CONFLICT before inserting", async () => {
    vi.mocked(db.lineaEstrategicaCatalogo.findUnique).mockResolvedValue({ id: "linea-1" } as never);

    const res = await POST(postRequest({ codigo: "LE01", nombre: "Duplicada" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(mocks.txLineaCreate).not.toHaveBeenCalled();
  });

  it("returns the same 409 CONFLICT when the insert hits the unique index (race condition)", async () => {
    mocks.txLineaCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await POST(postRequest({ codigo: "LE01", nombre: "Duplicada" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  it("requires codigo and nombre", async () => {
    const res = await POST(postRequest({ nombre: "Sin código" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txLineaCreate).not.toHaveBeenCalled();
  });

  it("rejects a blank nombre", async () => {
    const res = await POST(postRequest({ codigo: "LE09", nombre: "   " }));

    expect(res.status).toBe(400);
    expect(mocks.txLineaCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/strategic-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.txLineaCreate).not.toHaveBeenCalled();
  });
});
