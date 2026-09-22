import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: {
      findFirst: vi.fn(),
    },
    meta: {
      findFirst: vi.fn(),
    },
    indicador: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, PATCH, DELETE } from "./route";

const gerencia = {
  id: "gerencia-1",
  rol: "GERENCIA",
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

const routeContext = { params: Promise.resolve({ id: "proy-1", indicatorId: "indicador-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/indicators/indicador-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function indicadorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "indicador-1",
    proyecto_id: overrides.proyecto_id ?? "proy-1",
    meta_id: overrides.meta_id ?? null,
    nombre: overrides.nombre ?? "Personas capacitadas",
    unidad: overrides.unidad ?? "personas",
    meta_valor: overrides.meta_valor ?? 100,
    valor_actual: overrides.valor_actual ?? null,
    cuenta_beneficiarios: overrides.cuenta_beneficiarios ?? false,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/indicators/:indicatorId", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/projects/proy-1/indicators/indicador-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
  });

  it("returns 403 for a COLABORADOR without view access on the project", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(
      new Request("http://localhost/api/v1/projects/proy-1/indicators/indicador-1"),
      routeContext,
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when the indicador does not belong to this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/projects/proy-1/indicators/indicador-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.indicador.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "indicador-1", proyecto_id: "proy-1", deleted_at: null } }),
    );
  });

  it("returns 200 with the indicador on the happy path", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findFirst).mockResolvedValue(indicadorRow() as never);

    const res = await GET(
      new Request("http://localhost/api/v1/projects/proy-1/indicators/indicador-1"),
      routeContext,
    );

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/projects/:id/indicators/:indicatorId", () => {
  it("returns 400 when the body is empty", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when meta_valor is zero or negative", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ meta_valor: 0 }), routeContext);

    expect(res.status).toBe(400);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when valor_actual is negative", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ valor_actual: -5 }), routeContext);

    expect(res.status).toBe(400);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await PATCH(patchRequest({ nombre: "Indicador Editado" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.indicador.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the indicador does not belong to this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Indicador Editado" }), routeContext);

    expect(res.status).toBe(404);
    expect(db.indicador.update).not.toHaveBeenCalled();
  });

  it("rejects re-pointing meta_id to a meta from another project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findFirst).mockResolvedValue(indicadorRow() as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ meta_id: "meta-de-otro-proyecto" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.indicador.update).not.toHaveBeenCalled();
  });

  it("updates the indicador on the happy path", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findFirst).mockResolvedValue(indicadorRow() as never);
    vi.mocked(db.indicador.update).mockResolvedValue(indicadorRow({ nombre: "Indicador Editado" }) as never);

    const res = await PATCH(patchRequest({ nombre: "Indicador Editado" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.indicador.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "indicador-1" }, data: { nombre: "Indicador Editado" } }),
    );
  });
});

describe("DELETE /api/v1/projects/:id/indicators/:indicatorId", () => {
  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/projects/proy-1/indicators/indicador-1"),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(db.indicador.update).not.toHaveBeenCalled();
  });

  it("soft-deletes via deleted_at (never a hard delete)", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findFirst).mockResolvedValue(indicadorRow() as never);
    vi.mocked(db.indicador.update).mockResolvedValue(indicadorRow() as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/projects/proy-1/indicators/indicador-1"),
      routeContext,
    );

    expect(res.status).toBe(204);
    expect(db.indicador.update).toHaveBeenCalledWith({
      where: { id: "indicador-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
