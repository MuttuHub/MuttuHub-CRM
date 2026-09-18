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
    usuario: {
      findFirst: vi.fn(),
    },
    proyecto: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = {
  id: "gerencia-1",
  rol: "GERENCIA",
  puede_ver_tablero_gerencial: false,
} as Usuario;
const visualizador = {
  id: "colab-1",
  rol: "COLABORADOR",
  puede_ver_tablero_gerencial: true,
} as Usuario;
const colaboradorSinFlag = {
  id: "colab-2",
  rol: "COLABORADOR",
  puede_ver_tablero_gerencial: false,
} as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function proyectoRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "proy-1",
    codigo: overrides.codigo ?? "P-001",
    nombre: overrides.nombre ?? "Proyecto Uno",
    cliente_id: overrides.cliente_id ?? "cli-1",
    oportunidad_id: overrides.oportunidad_id ?? null,
    territorio: overrides.territorio ?? "Barranquilla",
    linea_estrategica: overrides.linea_estrategica ?? "EMPLEABILIDAD",
    fecha_inicio: overrides.fecha_inicio ?? new Date("2026-01-01"),
    fecha_fin: overrides.fecha_fin ?? new Date("2026-12-31"),
    estado: overrides.estado ?? "PLANIFICACION",
    beneficiarios_meta: overrides.beneficiarios_meta ?? 100,
    responsable_id: overrides.responsable_id ?? "colab-1",
    umbrales_override: overrides.umbrales_override ?? null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    cliente: { nombre: "Cliente Uno" },
    responsable: { nombre: "Colab Uno" },
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  codigo: "P-002",
  nombre: "Proyecto Nuevo",
  cliente_id: "cli-1",
  territorio: "Cartagena",
  linea_estrategica: "SOCIAL",
  fecha_inicio: "2026-02-01",
  fecha_fin: "2026-11-30",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects", () => {
  it("returns every project for a management-role actor", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findMany).mockResolvedValue([proyectoRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects"));

    expect(res.status).toBe(200);
    expect(db.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.proyectos).toHaveLength(1);
  });

  it("returns every project for a COLABORADOR with the puede_ver_tablero_gerencial flag (visualizador)", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findMany).mockResolvedValue([proyectoRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects"));

    expect(res.status).toBe(200);
    expect(db.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null } }),
    );
  });

  it("scopes to own projects for a COLABORADOR without the flag", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.proyecto.findMany).mockResolvedValue([] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects"));

    expect(res.status).toBe(200);
    expect(db.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, responsable_id: "colab-2" } }),
    );
  });

  it("filters by oportunidad_id when the query param is present (entity-dialogs CTA lookup)", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findMany).mockResolvedValue([proyectoRow({ oportunidad_id: "op-1" })] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects?oportunidad_id=op-1"));

    expect(res.status).toBe(200);
    expect(db.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, oportunidad_id: "op-1" } }),
    );
  });
});

describe("POST /api/v1/projects", () => {
  it("returns 403 for a COLABORADOR, even with the visualizador flag", async () => {
    authAs(visualizador);

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when cliente_id does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when linea_estrategica is not in the closed enum", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ ...VALID_BODY, linea_estrategica: "INVENTADA" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.cliente.findFirst).not.toHaveBeenCalled();
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the responsable does not exist or is inactive", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ ...VALID_BODY, responsable_id: "inactivo-1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.create).not.toHaveBeenCalled();
  });

  it("creates the project on the happy path, defaulting responsable_id to the caller, and audits it", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "gerencia-1" } as never);
    vi.mocked(db.proyecto.create).mockResolvedValue(
      proyectoRow({ id: "proy-new", responsable_id: "gerencia-1" }) as never,
    );

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(201);
    expect(db.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cliente_id: "cli-1", responsable_id: "gerencia-1" }),
      }),
    );
    expect(db.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gerencia-1", activo: true } }),
    );
    const json = await res.json();
    expect(json.proyecto).toMatchObject({ id: "proy-new", codigo: "P-001" });
  });
});
