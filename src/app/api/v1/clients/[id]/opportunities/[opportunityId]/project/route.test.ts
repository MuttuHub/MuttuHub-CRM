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
      findFirst: vi.fn(),
    },
    proyecto: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaboradorConFlagResponsable = {
  id: "colab-1",
  rol: "COLABORADOR",
  gestiona_oportunidades: true,
} as Usuario;
const colaboradorSinFlag = {
  id: "colab-1",
  rol: "COLABORADOR",
  gestiona_oportunidades: false,
} as Usuario;

function authAs(usuario: Usuario | null) {
  if (usuario === null) {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    } as never);
    return;
  }
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "cli-1", opportunityId: "op-1" }) };

const VALID_BODY = {
  codigo: "P-100",
  nombre: "Proyecto desde oportunidad",
  territorio: "Soledad",
  linea_estrategica: "PRODUCTIVIDAD",
  fecha_inicio: "2026-09-01",
  fecha_fin: "2027-03-01",
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ganadaEjecucion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "op-1",
    cliente_id: "cli-1",
    estado: "GANADA",
    fase: "EJECUCION",
    ...overrides,
  };
}

function proyectoRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "proy-new",
    codigo: overrides.codigo ?? "P-100",
    nombre: overrides.nombre ?? "Proyecto desde oportunidad",
    cliente_id: "cli-1",
    oportunidad_id: "op-1",
    territorio: "Soledad",
    linea_estrategica: "PRODUCTIVIDAD",
    fecha_inicio: new Date("2026-09-01"),
    fecha_fin: new Date("2027-03-01"),
    estado: "PLANIFICACION",
    beneficiarios_meta: 0,
    responsable_id: overrides.responsable_id ?? "gerencia-1",
    umbrales_override: null,
    created_at: new Date("2026-09-18"),
    updated_at: new Date("2026-09-18"),
    cliente: { nombre: "Cliente Uno" },
    responsable: { nombre: "Gerencia Uno" },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/clients/:id/opportunities/:opportunityId/project", () => {
  it("returns 401 when unauthenticated", async () => {
    authAs(null);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(401);
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 403 when the user lacks canManageOpportunity on the client", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who passes the client gate but is not a management role (T9 — second gate: canCreateProject)", async () => {
    authAs(colaboradorConFlagResponsable);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.findFirst).not.toHaveBeenCalled();
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the opportunity does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the opportunity's fase is not EJECUCION", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(
      ganadaEjecucion({ fase: "PROSPECCION" }) as never,
    );

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the opportunity is already linked to a Proyecto (pre-check)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(ganadaEjecucion() as never);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-existing" } as never);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body (zod)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(ganadaEjecucion() as never);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ ...VALID_BODY, codigo: "" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("creates the project with oportunidad_id set, defaults responsable_id to the caller, and audits it (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(ganadaEjecucion() as never);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    vi.mocked(db.proyecto.create).mockResolvedValue(proyectoRow() as never);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(201);
    expect(db.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cliente_id: "cli-1",
          oportunidad_id: "op-1",
          responsable_id: "gerencia-1",
        }),
      }),
    );
    const json = await res.json();
    expect(json.proyecto).toMatchObject({ id: "proy-new", oportunidad_id: "op-1" });
  });

  it("never accepts cliente_id/oportunidad_id from the request body", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(ganadaEjecucion() as never);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    vi.mocked(db.proyecto.create).mockResolvedValue(proyectoRow() as never);

    const res = await POST(
      postRequest({ ...VALID_BODY, cliente_id: "cli-OTRO", oportunidad_id: "op-OTRO" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cliente_id: "cli-1", oportunidad_id: "op-1" }),
      }),
    );
  });
});
