import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findFirst: vi.fn(),
    },
    contacto: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "cli-1" }) };

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/:id/contacts", () => {
  it("returns the contact list (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.contacto.findMany).mockResolvedValue([
      { id: "con-1", cliente_id: "cli-1", nombre: "Juan", deleted_at: null },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/contacts"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.contactos).toHaveLength(1);
    expect(db.contacto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cliente_id: "cli-1", deleted_at: null } }),
    );
  });

  it("returns 404 when the client does not exist or is soft-deleted", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/contacts"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.contacto.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a COLABORADOR who is NOT the client's responsable", async () => {
    authAs(colaborador);
    // loadClientScoped forces responsable_id into the where for non full-access
    // roles, so a foreign client never matches -> null -> 404.
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/contacts"), routeContext);

    expect(res.status).toBe(404);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cli-1", responsable_id: "colab-1" }),
      }),
    );
  });

  it("allows a COLABORADOR who IS the client's responsable to read contacts", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/contacts"), routeContext);

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to read contacts for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.contacto.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/contacts"), routeContext);

    expect(res.status).toBe(200);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-1", deleted_at: null } }),
    );
  });

  it("returns the v7 Relaciones quadrant fields (poder/interes/fuerza_relacion/owner_id)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.contacto.findMany).mockResolvedValue([
      {
        id: "con-1",
        cliente_id: "cli-1",
        nombre: "Juan",
        poder: 4,
        interes: 5,
        fuerza_relacion: 3,
        owner_id: "11111111-1111-1111-1111-111111111111",
        deleted_at: null,
      },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/contacts"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.contactos[0]).toMatchObject({
      poder: 4,
      interes: 5,
      fuerza_relacion: 3,
      owner_id: "11111111-1111-1111-1111-111111111111",
    });
  });
});

describe("POST /api/v1/clients/:id/contacts", () => {
  it("creates a contact (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.create).mockResolvedValue({ id: "con-1", nombre: "Juan" } as never);

    const res = await POST(postRequest({ nombre: "Juan", correo: "juan@acme.com" }), routeContext);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.contacto).toMatchObject({ id: "con-1", nombre: "Juan" });
  });

  it("returns 400 when nombre is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ correo: "juan@acme.com" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.contacto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when nombre exceeds the 200-char limit", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "a".repeat(201) }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for an invalid correo", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Juan", correo: "not-an-email" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for an invalid rol_decision", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Juan", rol_decision: "NOT_REAL" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.contacto.create).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await POST(postRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.contacto.create).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable to create a contact", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.create).mockResolvedValue({ id: "con-1", nombre: "Juan" } as never);

    const res = await POST(postRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(201);
  });

  it("allows a full-access role to create a contact for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);
    vi.mocked(db.contacto.create).mockResolvedValue({ id: "con-1", nombre: "Juan" } as never);

    const res = await POST(postRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(201);
  });

  it("persists the v7 Relaciones quadrant fields", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.create).mockResolvedValue({ id: "con-1", nombre: "Juan" } as never);

    const res = await POST(
      postRequest({
        nombre: "Juan",
        poder: 4,
        interes: 5,
        fuerza_relacion: 3,
        owner_id: "11111111-1111-1111-1111-111111111111",
      }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.contacto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        poder: 4,
        interes: 5,
        fuerza_relacion: 3,
        owner_id: "11111111-1111-1111-1111-111111111111",
      }),
    });
  });

  it("returns 400 when poder is outside 1..5", async () => {
    authAs(gerencia);

    for (const poder of [0, 6]) {
      const res = await POST(postRequest({ nombre: "Juan", poder }), routeContext);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(db.contacto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when interes is outside 1..5", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Juan", interes: 9 }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when fuerza_relacion is outside 1..3", async () => {
    authAs(gerencia);

    for (const fuerza_relacion of [0, 4]) {
      const res = await POST(postRequest({ nombre: "Juan", fuerza_relacion }), routeContext);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });
});
