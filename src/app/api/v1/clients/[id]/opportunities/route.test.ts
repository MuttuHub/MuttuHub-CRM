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
    oportunidad: {
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
  return new Request("http://localhost/api/v1/clients/cli-1/opportunities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/:id/opportunities", () => {
  it("returns the opportunity list (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      { id: "op-1", cliente_id: "cli-1", nombre: "Proyecto X", deleted_at: null },
    ] as never);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.oportunidades).toHaveLength(1);
    expect(db.oportunidad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cliente_id: "cli-1", deleted_at: null } }),
    );
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a COLABORADOR who is NOT the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cli-1", responsable_id: "colab-1" }),
      }),
    );
  });

  it("allows a COLABORADOR who IS the client's responsable to read opportunities", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to read opportunities for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-1", deleted_at: null } }),
    );
  });
});

describe("POST /api/v1/clients/:id/opportunities", () => {
  it("creates an opportunity defaulting estado to DISENANDO_PROPUESTA (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.oportunidad).toMatchObject({ id: "op-1", nombre: "Proyecto X" });
    expect(db.oportunidad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "DISENANDO_PROPUESTA" }) }),
    );
  });

  it("returns 400 when nombre is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.oportunidad.create).not.toHaveBeenCalled();
  });

  it("returns 400 when nombre exceeds the 300-char limit", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "a".repeat(301) }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for a negative valor_estimado_cop", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Proyecto X", valor_estimado_cop: -1 }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for an invalid estado", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Proyecto X", estado: "NOT_REAL" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.oportunidad.create).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.create).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable to create an opportunity", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(201);
  });

  it("allows a full-access role to create an opportunity for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(201);
  });
});
