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
    actividad: {
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

const routeContext = { params: Promise.resolve({ id: "proy-1", activityId: "act-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/activities/act-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function actividadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "act-1",
    proyecto_id: overrides.proyecto_id ?? "proy-1",
    meta_id: overrides.meta_id ?? "meta-1",
    nombre: overrides.nombre ?? "Actividad Uno",
    descripcion: overrides.descripcion ?? null,
    peso: overrides.peso ?? 1,
    fecha_planificada: overrides.fecha_planificada ?? new Date("2026-03-01"),
    fecha_real: overrides.fecha_real ?? null,
    porcentaje_avance: overrides.porcentaje_avance ?? 0,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/activities/:activityId", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/projects/proy-1/activities/act-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when the activity does not belong to this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/projects/proy-1/activities/act-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.actividad.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "act-1", proyecto_id: "proy-1", deleted_at: null } }),
    );
  });

  it("returns 200 with the activity on the happy path", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadRow() as never);

    const res = await GET(
      new Request("http://localhost/api/v1/projects/proy-1/activities/act-1"),
      routeContext,
    );

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/projects/:id/activities/:activityId", () => {
  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await PATCH(patchRequest({ porcentaje_avance: 75 }), routeContext);

    expect(res.status).toBe(403);
    expect(db.actividad.update).not.toHaveBeenCalled();
  });

  it("rejects re-pointing meta_id to a meta from another project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadRow() as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ meta_id: "meta-de-otro-proyecto" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.actividad.update).not.toHaveBeenCalled();
  });

  it("updates the progress percentage on the happy path", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadRow() as never);
    vi.mocked(db.actividad.update).mockResolvedValue(actividadRow({ porcentaje_avance: 75 }) as never);

    const res = await PATCH(patchRequest({ porcentaje_avance: 75 }), routeContext);

    expect(res.status).toBe(200);
    expect(db.actividad.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "act-1" }, data: { porcentaje_avance: 75 } }),
    );
  });
});

describe("DELETE /api/v1/projects/:id/activities/:activityId", () => {
  it("soft-deletes via deleted_at (never a hard delete)", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findFirst).mockResolvedValue(actividadRow() as never);
    vi.mocked(db.actividad.update).mockResolvedValue(actividadRow() as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/projects/proy-1/activities/act-1"),
      routeContext,
    );

    expect(res.status).toBe(204);
    expect(db.actividad.update).toHaveBeenCalledWith({
      where: { id: "act-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
