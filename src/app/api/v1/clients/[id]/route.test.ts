import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findFirst: vi.fn(),
      update: vi.fn(),
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
import { GET, PATCH, DELETE } from "./route";

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
  created_at: new Date("2026-01-01"),
  tamano_org: null,
  canal_contacto_inicial: null,
  fecha_primer_contacto: null,
  prioridades_identificadas: null,
  riesgos_barreras: null,
  resumen_relacion: null,
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

const routeContext = { params: Promise.resolve({ id: "cli-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1", {
    method: "PATCH",
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

describe("GET /api/v1/clients/:id", () => {
  it("returns the client detail for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({
      ...baseClientRow,
      _count: { contactos: 2, oportunidades: 1, bitacora: 3, tareas: 0 },
    } as never);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cliente).toMatchObject({
      id: "cli-1",
      responsable_nombre: "Colab Uno",
      contactos_count: 2,
      oportunidades_count: 1,
      bitacora_count: 3,
      tareas_abiertas_count: 0,
    });
  });

  it("returns 404 when the client does not exist or is soft-deleted", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("scopes a COLABORADOR who is NOT the responsable to 404 (query itself excludes it)", async () => {
    authAs(colaborador);
    // The route forces responsable_id: usuario.id into the findFirst where for
    // non full-access roles, so a foreign client simply never matches.
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(404);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cli-1", deleted_at: null, responsable_id: "colab-1" }),
      }),
    );
  });

  it("allows a COLABORADOR who IS the responsable to read the client", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({
      ...baseClientRow,
      _count: { contactos: 0, oportunidades: 0, bitacora: 0, tareas: 0 },
    } as never);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(200);
  });

  it("does not force responsable_id into the where clause for a full-access role", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({
      ...baseClientRow,
      _count: { contactos: 0, oportunidades: 0, bitacora: 0, tareas: 0 },
    } as never);

    await GET(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cli-1", deleted_at: null },
      }),
    );
  });
});

describe("PATCH /api/v1/clients/:id", () => {
  it("updates a client (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);
    vi.mocked(db.cliente.update).mockResolvedValue({
      ...baseClientRow,
      nombre: "Acme Renamed",
    } as never);

    const res = await PATCH(patchRequest({ nombre: "Acme Renamed" }), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cliente).toMatchObject({ nombre: "Acme Renamed", responsable_nombre: "Colab Uno" });
  });

  it("returns 400 for an invalid tipo_cliente", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ tipo_cliente: "NOT_REAL" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.cliente.update).not.toHaveBeenCalled();
  });

  it("returns 400 when nombre exceeds the 200-char limit", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ nombre: "a".repeat(201) }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when the body has no fields to update", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Envía al menos un campo para actualizar.",
    });
    expect(db.cliente.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the client does not exist or is soft-deleted", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Acme Renamed" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({
      ...baseClientRow,
      responsable_id: "someone-else",
    } as never);

    const res = await PATCH(patchRequest({ nombre: "Acme Renamed" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.cliente.update).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the responsable to update the client", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);
    vi.mocked(db.cliente.update).mockResolvedValue({
      ...baseClientRow,
      nombre: "Acme Renamed",
    } as never);

    const res = await PATCH(patchRequest({ nombre: "Acme Renamed" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns 403 when a COLABORADOR tries to transfer the client to another responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);

    const res = await PATCH(patchRequest({ responsable_id: "someone-else" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "FORBIDDEN",
      error: "No puedes cambiar el responsable de un cliente que no es tuyo.",
    });
    expect(db.cliente.update).not.toHaveBeenCalled();
  });

  it("allows a full-access role to transfer the client to another responsable", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "other-user", nombre: "Otro" } as never);
    vi.mocked(db.cliente.update).mockResolvedValue({
      ...baseClientRow,
      responsable_id: "other-user",
      responsable: { nombre: "Otro" },
    } as never);

    const res = await PATCH(
      patchRequest({ nombre: "Acme", responsable_id: "other-user" }),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(db.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responsable_id: "other-user" }) }),
    );
  });

  it("returns 400 when the new responsable does not exist or is inactive", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);

    const res = await PATCH(
      patchRequest({ nombre: "Acme", responsable_id: "ghost" }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "El responsable no existe o está inactivo.",
    });
    expect(db.cliente.update).not.toHaveBeenCalled();
  });

  it("BUG FIX regression: accepts responsable_id as the only field sent", async () => {
    // Used to hit the "at least one field" guard: it checked the built
    // update-data object AFTER responsable_id was excluded from it, so a
    // body containing only responsable_id built an empty object and got
    // rejected before the reassignment logic ever ran.
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "other-user", nombre: "Otro" } as never);
    vi.mocked(db.cliente.update).mockResolvedValue({
      ...baseClientRow,
      responsable_id: "other-user",
      responsable: { nombre: "Otro" },
    } as never);

    const res = await PATCH(patchRequest({ responsable_id: "other-user" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.usuario.findFirst).toHaveBeenCalled();
    expect(db.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ responsable_id: "other-user" }) }),
    );
  });

  it("still rejects a genuinely empty body with no recognized fields at all", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Envía al menos un campo para actualizar.",
    });
    expect(db.usuario.findFirst).not.toHaveBeenCalled();
    expect(db.cliente.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/clients/:id", () => {
  it("soft-deletes a client (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);
    vi.mocked(db.cliente.update).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-1" }, data: { deleted_at: expect.any(Date) } }),
    );
  });

  it("returns 404 when the client does not exist or is soft-deleted", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(404);
    expect(db.cliente.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({
      ...baseClientRow,
      responsable_id: "someone-else",
    } as never);

    const res = await DELETE(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.cliente.update).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the responsable to delete the client", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ ...baseClientRow } as never);
    vi.mocked(db.cliente.update).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(204);
  });

  it("allows a full-access role to delete any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({
      ...baseClientRow,
      responsable_id: "someone-else",
    } as never);
    vi.mocked(db.cliente.update).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/clients/cli-1"), routeContext);

    expect(res.status).toBe(204);
  });
});
