import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    contacto: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const admin = { id: "admin-1", rol: "ADMINISTRADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/v1/contacts${query}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/contacts", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
    expect(db.contacto.findMany).not.toHaveBeenCalled();
  });

  it("returns the cross-client list with cliente and owner context (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.contacto.findMany).mockResolvedValue([
      {
        id: "con-1",
        cliente_id: "cli-1",
        cliente: { nombre: "Aliado Uno" },
        nombre: "Juan",
        cargo: "Director",
        correo: "juan@acme.com",
        telefono: "3001234567",
        rol_decision: "DECISOR",
        notas: null,
        poder: 4,
        interes: 5,
        fuerza_relacion: 3,
        owner_id: "gerencia-1",
        owner: { nombre: "Gerencia Uno" },
        created_at: new Date("2026-01-01"),
      },
    ] as never);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.contactos).toEqual([
      {
        id: "con-1",
        cliente_id: "cli-1",
        cliente_nombre: "Aliado Uno",
        nombre: "Juan",
        cargo: "Director",
        correo: "juan@acme.com",
        telefono: "3001234567",
        rol_decision: "DECISOR",
        notas: null,
        poder: 4,
        interes: 5,
        fuerza_relacion: 3,
        owner_id: "gerencia-1",
        owner_nombre: "Gerencia Uno",
        created_at: new Date("2026-01-01").toISOString(),
      },
    ]);
  });

  it("returns a null owner_nombre when owner_id is not set", async () => {
    authAs(gerencia);
    vi.mocked(db.contacto.findMany).mockResolvedValue([
      {
        id: "con-1",
        cliente_id: "cli-1",
        cliente: { nombre: "Aliado Uno" },
        nombre: "Juan",
        cargo: null,
        correo: null,
        telefono: null,
        rol_decision: null,
        notas: null,
        poder: null,
        interes: null,
        fuerza_relacion: null,
        owner_id: null,
        owner: null,
        created_at: new Date("2026-01-01"),
      },
    ] as never);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.contactos[0]).toMatchObject({ owner_id: null, owner_nombre: null });
  });

  it("filters by cliente_id", async () => {
    authAs(gerencia);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    const res = await GET(getRequest("?cliente_id=cli-1"));

    expect(res.status).toBe(200);
    expect(db.contacto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cliente_id: "cli-1" }),
      }),
    );
  });

  it("filters by quadrant presence when con_quadrante=true", async () => {
    authAs(gerencia);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    const res = await GET(getRequest("?con_quadrante=true"));

    expect(res.status).toBe(200);
    expect(db.contacto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          poder: { not: null },
          interes: { not: null },
        }),
      }),
    );
  });

  it("filters by exact poder and interes", async () => {
    authAs(gerencia);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    const res = await GET(getRequest("?poder=4&interes=5"));

    expect(res.status).toBe(200);
    expect(db.contacto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ poder: 4, interes: 5 }),
      }),
    );
  });

  it("returns 400 when poder is outside 1..5", async () => {
    authAs(gerencia);

    const res = await GET(getRequest("?poder=6"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.contacto.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when interes is not an integer", async () => {
    authAs(gerencia);

    const res = await GET(getRequest("?interes=abc"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it.each([
    ["COLABORADOR", colaborador],
    ["COORDINADOR", coordinador],
  ])("scopes a %s to the clients they are responsable of (P1)", async (_rol, usuario) => {
    authAs(usuario);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const call = vi.mocked(db.contacto.findMany).mock.calls[0][0];
    expect(call?.where?.cliente).toEqual({ deleted_at: null, responsable_id: usuario.id });
    expect(call?.where?.deleted_at).toBeNull();
  });

  it("keeps the responsable scope when cliente_id targets another user's client", async () => {
    authAs(colaborador);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    await GET(getRequest("?cliente_id=cli-ajeno"));

    const call = vi.mocked(db.contacto.findMany).mock.calls[0][0];
    expect(call?.where).toMatchObject({
      cliente_id: "cli-ajeno",
      cliente: { deleted_at: null, responsable_id: "colab-1" },
    });
  });

  it.each([
    ["GERENCIA", gerencia],
    ["ADMINISTRADOR", admin],
  ])("a %s sees every client's contacts (no responsable scope)", async (_rol, usuario) => {
    authAs(usuario);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    await GET(getRequest());

    const call = vi.mocked(db.contacto.findMany).mock.calls[0][0];
    expect(call?.where?.cliente).toEqual({ deleted_at: null });
  });
});
