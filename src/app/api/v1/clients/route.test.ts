import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    usuario: {
      findFirst: vi.fn(),
    },
    oportunidad: {
      groupBy: vi.fn(),
    },
    tarea: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const baseClientRow = {
  id: "cli-1",
  nombre: "Acme",
  empresa: "Acme Corp",
  tipo_cliente: "EMPRESA_PRIVADA",
  estado: "PROSPECTO",
  prioridad: "ALTA",
  ubicacion: "Bogotá",
  responsable_id: "colab-1",
  updated_at: new Date("2026-01-01"),
  responsable: { nombre: "Colab Uno" },
};

function mockEnrichmentEmpty() {
  vi.mocked(db.oportunidad.groupBy).mockResolvedValue([]);
  vi.mocked(db.tarea.groupBy).mockResolvedValue([]);
  vi.mocked(db.tarea.findMany).mockResolvedValue([]);
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function postRequest(body: unknown, query = ""): Request {
  return new Request(`http://localhost/api/v1/clients${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockEnrichmentEmpty();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients", () => {
  it("returns the client list for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);

    const res = await GET(new Request("http://localhost/api/v1/clients"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(1);
    expect(json.items[0]).toMatchObject({ id: "cli-1", responsable_nombre: "Colab Uno" });
  });

  it("scopes a COLABORADOR to their own clients (forces responsable_id in the where clause)", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);

    // Even if the caller tries to look at someone else's book via the
    // `responsable` query param, the scope must win.
    await GET(new Request("http://localhost/api/v1/clients?responsable=other-user"));

    expect(db.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ responsable_id: "colab-1" }),
      }),
    );
  });

  it("does not force responsable_id for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/clients?responsable=other-user"));

    expect(db.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ responsable_id: "other-user" }),
      }),
    );
  });

  it("returns 400 for an invalid tipo filter", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/clients?tipo=NOT_REAL"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("returns 400 when 'desde' is after 'hasta'", async () => {
    authAs(gerencia);

    const res = await GET(
      new Request("http://localhost/api/v1/clients?desde=2026-02-01&hasta=2026-01-01"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "La fecha final no puede ser anterior a la inicial.",
    });
  });

  it("returns 400 for an invalid limit", async () => {
    authAs(gerencia);

    const res = await GET(new Request("http://localhost/api/v1/clients?limit=999"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("POST /api/v1/clients", () => {
  it("creates a client (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.cliente.create).mockResolvedValue({
      ...baseClientRow,
      tamano_org: null,
      canal_contacto_inicial: null,
      fecha_primer_contacto: null,
      prioridades_identificadas: null,
      riesgos_barreras: null,
      resumen_relacion: null,
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(
      postRequest({ nombre: "Acme", tipo_cliente: "EMPRESA_PRIVADA", responsable_id: "colab-1" }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.cliente).toMatchObject({ id: "cli-1", responsable_nombre: "Colab Uno" });
  });

  it("returns 400 when nombre is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ tipo_cliente: "EMPRESA_PRIVADA", responsable_id: "colab-1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.cliente.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid tipo_cliente", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Acme", tipo_cliente: "NOT_REAL", responsable_id: "colab-1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when nombre exceeds the 200-char limit", async () => {
    authAs(gerencia);

    const res = await POST(
      postRequest({ nombre: "a".repeat(201), tipo_cliente: "EMPRESA_PRIVADA", responsable_id: "colab-1" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when the chosen responsable does not exist or is inactive", async () => {
    authAs(gerencia);
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);

    const res = await POST(
      postRequest({ nombre: "Acme", tipo_cliente: "EMPRESA_PRIVADA", responsable_id: "ghost" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "El responsable no existe o está inactivo.",
    });
    expect(db.cliente.create).not.toHaveBeenCalled();
  });

  it("forces the responsable to self when a COLABORADOR creates a client, ignoring the body's responsable_id", async () => {
    authAs(colaborador);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "colab-1", nombre: "Colab Uno" } as never);
    vi.mocked(db.cliente.create).mockResolvedValue({
      ...baseClientRow,
      tamano_org: null,
      canal_contacto_inicial: null,
      fecha_primer_contacto: null,
      prioridades_identificadas: null,
      riesgos_barreras: null,
      resumen_relacion: null,
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(
      postRequest({ nombre: "Acme", tipo_cliente: "EMPRESA_PRIVADA", responsable_id: "someone-else" }),
    );

    expect(res.status).toBe(201);
    expect(db.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "colab-1", activo: true } }),
    );
    expect(db.cliente.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responsable_id: "colab-1" }) }),
    );
  });
});
