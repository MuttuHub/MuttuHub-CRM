// GET/POST /api/v1/projects/:id/allies (T4b, S9/S13/S14).
//
// Mocked `@/lib/db`: pins the authorization order (404 before 403), the posición propia gate,
// validation and the audit row. The `(proyecto_id, cliente_id)` uniqueness itself is a DB rule
// proven in prisma/posicion-propia.invariant.test.ts; here only its P2002 → 409 mapping.

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
    cliente: { findMany: vi.fn() },
    proyectoCliente: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ proyectoCliente: { create: mocks.txCreate } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;
// Reads every project through the gerencial flag, but is never a project editor.
const visualizadorGerencial = {
  id: "vis-1",
  rol: "VISUALIZADOR",
  puede_ver_tablero_gerencial: true,
} as unknown as Usuario;

const proyectoPP = { id: "pry-1", origen: "POSICION_PROPIA", estado: "BORRADOR", miembros: [] };

const aliadoRow = {
  id: "ali-1",
  rol: "FINANCIADOR",
  estado: "COMPROMETIDO",
  aporte_cop: new Prisma.Decimal("50000000.00"),
  created_at: new Date("2026-11-26T12:00:00.000Z"),
  updated_at: new Date("2026-11-26T12:00:00.000Z"),
  cliente: { id: "cli-1", nombre: "Fundación Milagro" },
};

const routeContext = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function getRequest(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/allies");
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/allies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoPP as never);
  vi.mocked(db.cliente.findMany).mockResolvedValue([{ id: "cli-1" }] as never);
  vi.mocked(db.proyectoCliente.findMany).mockResolvedValue([aliadoRow] as never);
  mocks.txCreate.mockResolvedValue({ ...aliadoRow, cliente_id: "cli-1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/allies", () => {
  it("lists the allies with the amount as a number", async () => {
    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.aliados).toEqual([
      {
        id: "ali-1",
        cliente: { id: "cli-1", nombre: "Fundación Milagro" },
        rol: "FINANCIADOR",
        estado: "COMPROMETIDO",
        aporte_cop: 50000000,
        created_at: "2026-11-26T12:00:00.000Z",
        updated_at: "2026-11-26T12:00:00.000Z",
      },
    ]);
  });

  it("answers 404 for a missing project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(404);
  });

  it("lets a gerencial VISUALIZADOR read the allies", async () => {
    authAs(visualizadorGerencial);

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(200);
  });

  it("answers 403 to a non-member COLABORADOR", async () => {
    authAs(colaborador);

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(403);
    expect(db.proyectoCliente.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/projects/:id/allies", () => {
  const body = { cliente_id: "cli-1", rol: "FINANCIADOR", estado: "COMPROMETIDO", aporte_cop: 50000000 };

  it("adds an ally and audits CREAR proyecto_cliente", async () => {
    const res = await POST(postRequest(body), routeContext);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.aliado).toMatchObject({ id: "ali-1", rol: "FINANCIADOR", aporte_cop: 50000000 });
    const [createArgs] = mocks.txCreate.mock.calls[0]! as [{ data: Record<string, unknown> }];
    expect(createArgs.data).toMatchObject({
      proyecto_id: "pry-1",
      cliente_id: "cli-1",
      rol: "FINANCIADOR",
      estado: "COMPROMETIDO",
    });
    expect(vi.mocked(logChange).mock.calls[0]![1]).toEqual({
      usuario_id: "ger-1",
      accion: "CREAR",
      entidad: "proyecto_cliente",
      entidad_id: "ali-1",
      proyecto_id: "pry-1",
      valor_nuevo: {
        cliente_id: "cli-1",
        rol: "FINANCIADOR",
        estado: "COMPROMETIDO",
        aporte_cop: "50000000.00",
      },
    });
  });

  it("defaults the state to EN_GESTION and the contribution to null", async () => {
    await POST(postRequest({ cliente_id: "cli-1", rol: "PROSPECTO" }), routeContext);

    const [createArgs] = mocks.txCreate.mock.calls[0]! as [{ data: Record<string, unknown> }];
    expect(createArgs.data).toMatchObject({ estado: "EN_GESTION", aporte_cop: null });
  });

  it("answers 409 on a project that is not posición propia", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ ...proyectoPP, origen: "INDEPENDIENTE" } as never);

    const res = await POST(postRequest(body), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("Solo los proyectos de posición propia tienen aliados.");
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("answers 409 on a suspended, closed or cancelled project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ ...proyectoPP, estado: "CERRADO" } as never);

    const res = await POST(postRequest(body), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe(
      "No se pueden cambiar los aliados de un proyecto suspendido, cerrado o cancelado.",
    );
  });

  it("answers 403 to a non-member COLABORADOR (S14 default: canEditProjectData)", async () => {
    authAs(colaborador);

    const res = await POST(postRequest(body), routeContext);

    expect(res.status).toBe(403);
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("answers 403 to a gerencial VISUALIZADOR: reading is not editing", async () => {
    authAs(visualizadorGerencial);

    const res = await POST(postRequest(body), routeContext);

    expect(res.status).toBe(403);
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("answers 404 before 403 for a missing project", async () => {
    authAs(colaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(body), routeContext);

    expect(res.status).toBe(404);
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("lets a member COLABORADOR add an ally", async () => {
    authAs(colaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({
      ...proyectoPP,
      miembros: [{ id: "mem-1" }],
    } as never);

    const res = await POST(postRequest(body), routeContext);

    expect(res.status).toBe(201);
  });

  it("answers 404 when the client does not exist", async () => {
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    const res = await POST(postRequest(body), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("El cliente aliado no existe.");
  });

  it("rejects a negative contribution", async () => {
    const res = await POST(postRequest({ ...body, aporte_cop: -1 }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("El aporte no puede ser negativo.");
  });

  it("maps the (proyecto_id, cliente_id) unique violation to 409", async () => {
    mocks.txCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["proyecto_id", "cliente_id"] },
      }),
    );

    const res = await POST(postRequest(body), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("Este cliente ya es aliado del proyecto.");
  });
});
