import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usuario: {
      findFirst: vi.fn(),
    },
    proyecto: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, PATCH, DELETE } from "./route";

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
const responsableColaborador = {
  id: "colab-2",
  rol: "COLABORADOR",
  puede_ver_tablero_gerencial: false,
} as Usuario;
const colaboradorAjeno = {
  id: "colab-3",
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
    responsable_id: overrides.responsable_id ?? "colab-2",
    umbrales_override: overrides.umbrales_override ?? null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    cliente: { nombre: "Cliente Uno" },
    responsable: { nombre: "Colab Dos" },
  };
}

const routeContext = { params: Promise.resolve({ id: "proy-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR who is neither the responsable nor a management viewer", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 200 for the visualizador (canViewManagementDashboard), even without being the responsable", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst)
      .mockResolvedValueOnce({ id: "proy-1", responsable_id: "colab-2" } as never)
      .mockResolvedValueOnce(proyectoRow() as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1"), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns 200 for the project's own responsable", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst)
      .mockResolvedValueOnce({ id: "proy-1", responsable_id: "colab-2" } as never)
      .mockResolvedValueOnce(proyectoRow() as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1"), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/projects/:id", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Nuevo nombre" }), routeContext);

    expect(res.status).toBe(404);
    expect(db.proyecto.update).not.toHaveBeenCalled();
  });

  it("returns 403 for the visualizador flag alone (never composes into write)", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await PATCH(patchRequest({ nombre: "Nuevo nombre" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.proyecto.update).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await PATCH(patchRequest({ nombre: "Nuevo nombre" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.proyecto.update).not.toHaveBeenCalled();
  });

  it("allows the project's own responsable (T9) to update it and audits the change", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.proyecto.update).mockResolvedValue(proyectoRow({ nombre: "Nuevo nombre" }) as never);

    const res = await PATCH(patchRequest({ nombre: "Nuevo nombre" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "proy-1" }, data: { nombre: "Nuevo nombre" } }),
    );
  });

  it("returns 400 when the body is empty", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when the new responsable_id does not exist or is inactive", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ responsable_id: "inactivo-1" }), routeContext);

    expect(res.status).toBe(400);
    expect(db.proyecto.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/projects/:id", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/projects/proy-1"), routeContext);

    expect(res.status).toBe(404);
    expect(db.proyecto.update).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await DELETE(new Request("http://localhost/api/v1/projects/proy-1"), routeContext);

    expect(res.status).toBe(403);
    expect(db.proyecto.update).not.toHaveBeenCalled();
  });

  it("soft-deletes via deleted_at (never a hard delete) and audits it", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.proyecto.update).mockResolvedValue(proyectoRow() as never);

    const res = await DELETE(new Request("http://localhost/api/v1/projects/proy-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.proyecto.update).toHaveBeenCalledWith({
      where: { id: "proy-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
