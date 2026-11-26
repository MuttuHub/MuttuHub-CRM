// PATCH/DELETE /api/v1/projects/:id/allies/:allyId (T4b, S9/S14).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  txUpdate: vi.fn(),
  txDelete: vi.fn(),
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
    proyectoCliente: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ proyectoCliente: { update: mocks.txUpdate, delete: mocks.txDelete } }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange, logChanges } from "@/lib/api/audit-cambios";
import { DELETE, PATCH } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const proyectoPP = { id: "pry-1", origen: "POSICION_PROPIA", estado: "EN_EJECUCION", miembros: [] };

const existente = {
  id: "ali-1",
  proyecto_id: "pry-1",
  cliente_id: "cli-1",
  rol: "PROSPECTO",
  estado: "EN_GESTION",
  aporte_cop: null,
};

const actualizado = {
  id: "ali-1",
  rol: "FINANCIADOR",
  estado: "COMPROMETIDO",
  aporte_cop: new Prisma.Decimal("30000000.00"),
  created_at: new Date("2026-11-26T12:00:00.000Z"),
  updated_at: new Date("2026-11-26T13:00:00.000Z"),
  cliente: { id: "cli-1", nombre: "Fundación Milagro" },
};

const routeContext = { params: Promise.resolve({ id: "pry-1", allyId: "ali-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function request(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1/allies/ali-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyectoPP as never);
  vi.mocked(db.proyectoCliente.findFirst).mockResolvedValue(existente as never);
  mocks.txUpdate.mockResolvedValue(actualizado);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/projects/:id/allies/:allyId", () => {
  it("updates role, state and contribution and audits one EDITAR row per changed field", async () => {
    const res = await PATCH(
      request("PATCH", { rol: "FINANCIADOR", estado: "COMPROMETIDO", aporte_cop: 30000000 }),
      routeContext,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.aliado).toMatchObject({ id: "ali-1", estado: "COMPROMETIDO", aporte_cop: 30000000 });
    const [updateArgs] = mocks.txUpdate.mock.calls[0]! as [
      { where: unknown; data: Record<string, unknown> },
    ];
    expect(updateArgs.where).toEqual({ id: "ali-1" });
    expect(updateArgs.data).toMatchObject({ rol: "FINANCIADOR", estado: "COMPROMETIDO" });
    expect(String(updateArgs.data.aporte_cop)).toBe("30000000");

    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows).toEqual([
      expect.objectContaining({ accion: "EDITAR", entidad: "proyecto_cliente", entidad_id: "ali-1", proyecto_id: "pry-1", campo: "rol", valor_anterior: "PROSPECTO", valor_nuevo: "FINANCIADOR" }),
      expect.objectContaining({ campo: "estado", valor_anterior: "EN_GESTION", valor_nuevo: "COMPROMETIDO" }),
      expect.objectContaining({ campo: "aporte_cop", valor_anterior: null, valor_nuevo: "30000000.00" }),
    ]);
  });

  it("does not audit a field sent unchanged", async () => {
    await PATCH(request("PATCH", { rol: "PROSPECTO", estado: "COMPROMETIDO" }), routeContext);

    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows.map((row) => row.campo)).toEqual(["estado"]);
  });

  it("refuses changing the client of an ally", async () => {
    const res = await PATCH(request("PATCH", { cliente_id: "cli-2" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Solo se pueden cambiar el rol, el estado y el aporte del aliado.");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("answers 404 for an ally of another project or a missing one", async () => {
    vi.mocked(db.proyectoCliente.findFirst).mockResolvedValue(null);

    const res = await PATCH(request("PATCH", { rol: "ALIADO" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("El aliado no existe.");
    expect(vi.mocked(db.proyectoCliente.findFirst).mock.calls[0]![0]).toMatchObject({
      where: { id: "ali-1", proyecto_id: "pry-1" },
    });
  });

  it("answers 403 to a non-member COLABORADOR", async () => {
    authAs(colaborador);

    const res = await PATCH(request("PATCH", { rol: "ALIADO" }), routeContext);

    expect(res.status).toBe(403);
  });

  it("answers 409 on a cancelled project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ ...proyectoPP, estado: "CANCELADO" } as never);

    const res = await PATCH(request("PATCH", { rol: "ALIADO" }), routeContext);

    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/v1/projects/:id/allies/:allyId", () => {
  it("removes the ally and audits it as EDITAR down to null", async () => {
    const res = await DELETE(request("DELETE"), routeContext);

    expect(res.status).toBe(204);
    expect(mocks.txDelete).toHaveBeenCalledWith({ where: { id: "ali-1" } });
    expect(vi.mocked(logChange).mock.calls[0]![1]).toEqual({
      usuario_id: "ger-1",
      accion: "EDITAR",
      entidad: "proyecto_cliente",
      entidad_id: "ali-1",
      proyecto_id: "pry-1",
      valor_anterior: { cliente_id: "cli-1", rol: "PROSPECTO", estado: "EN_GESTION", aporte_cop: null },
      valor_nuevo: null,
    });
  });

  it("answers 404 for a missing ally", async () => {
    vi.mocked(db.proyectoCliente.findFirst).mockResolvedValue(null);

    const res = await DELETE(request("DELETE"), routeContext);

    expect(res.status).toBe(404);
    expect(mocks.txDelete).not.toHaveBeenCalled();
  });

  it("answers 403 to a non-member COLABORADOR", async () => {
    authAs(colaborador);

    const res = await DELETE(request("DELETE"), routeContext);

    expect(res.status).toBe(403);
    expect(mocks.txDelete).not.toHaveBeenCalled();
  });
});
