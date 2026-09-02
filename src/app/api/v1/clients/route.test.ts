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

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
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

  // PR 2 (Slice A): every client row carries `puede_editar` (server-authoritative).
  // Spec: canEditClient(cliente, actor). Same full-access / COLABORADOR matrix
  // as canEditClient in src/lib/permissions.test.ts, but asserted at the API
  // boundary so a future code change that drops the flag is caught immediately.
  describe("puede_editar per row (PR 2)", () => {
    it("ADMINISTRADOR gets puede_editar: true for any client", async () => {
      authAs({ id: "admin-1", rol: "ADMINISTRADOR" } as Usuario);
      vi.mocked(db.cliente.findMany).mockResolvedValue([{ ...baseClientRow, responsable_id: "other-user" }] as never);

      const res = await GET(new Request("http://localhost/api/v1/clients"));
      const json = await res.json();
      expect(json.items[0].puede_editar).toBe(true);
    });

    it("GERENCIA gets puede_editar: true for any client", async () => {
      authAs(gerencia);
      vi.mocked(db.cliente.findMany).mockResolvedValue([{ ...baseClientRow, responsable_id: "other-user" }] as never);

      const res = await GET(new Request("http://localhost/api/v1/clients"));
      const json = await res.json();
      expect(json.items[0].puede_editar).toBe(true);
    });

    it("COORDINADOR gets puede_editar: true for any client", async () => {
      authAs({ id: "coord-1", rol: "COORDINADOR" } as Usuario);
      vi.mocked(db.cliente.findMany).mockResolvedValue([{ ...baseClientRow, responsable_id: "other-user" }] as never);

      const res = await GET(new Request("http://localhost/api/v1/clients"));
      const json = await res.json();
      expect(json.items[0].puede_editar).toBe(true);
    });

    it("COLABORADOR as the client's responsable gets puede_editar: true", async () => {
      authAs(colaborador);
      vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);

      const res = await GET(new Request("http://localhost/api/v1/clients"));
      const json = await res.json();
      expect(json.items[0].puede_editar).toBe(true);
    });

    it("COLABORADOR NOT the client's responsable gets puede_editar: false", async () => {
      authAs(colaborador);
      vi.mocked(db.cliente.findMany).mockResolvedValue([{ ...baseClientRow, responsable_id: "other-user" }] as never);

      const res = await GET(new Request("http://localhost/api/v1/clients"));
      const json = await res.json();
      expect(json.items[0].puede_editar).toBe(false);
    });
  });

  // PR 3 (Slice B1): read scope is now global. COLABORADOR sees every client
  // in the list (no `responsable_id = self` rewrite when no filter is
  // present), and the `responsable` query param is honored as-is (never
  // silently rewritten to self). The write gates below (POST forces
  // responsable=self, PATCH/DELETE still return 403 on foreign records) stay
  // intact.
  it("does NOT scope a COLABORADOR to their own clients (sees every client)", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);

    await GET(new Request("http://localhost/api/v1/clients"));

    const where = vi.mocked(db.cliente.findMany).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.responsable_id).toBeUndefined();
  });

  it("honors the `responsable` query param for a COLABORADOR (filter is NOT silently rewritten to self)", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([]);

    await GET(new Request("http://localhost/api/v1/clients?responsable=other-user"));

    expect(db.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ responsable_id: "other-user" }),
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

  // Production data gotcha: every imported compromiso had fecha_entrega = null
  // (empty Excel column). The enrichment used to exclude undated tasks twice
  // (WHERE not-null + a JS guard), so the ficha wrongly showed "Sin
  // compromisos abiertos". Undated open tasks must now surface as
  // next_compromiso, sorting after dated ones.
  it("picks an undated open task as next_compromiso instead of hiding it", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findMany).mockResolvedValue([baseClientRow] as never);
    vi.mocked(db.tarea.findMany).mockResolvedValue([
      { id: "t-1", titulo: "Seguimiento", fecha_entrega: null, cliente_id: "cli-1" },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/clients"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items[0].next_compromiso).toEqual({
      id: "t-1",
      titulo: "Seguimiento",
      fecha_entrega: null,
    });
    expect(db.tarea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ fecha_entrega: expect.anything() }),
        orderBy: { fecha_entrega: { sort: "asc", nulls: "last" } },
      }),
    );
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
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "cliente", entidad_id: "cli-1", accion: "crear" }),
    );
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
