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

const routeContext = { params: Promise.resolve({ id: "proy-1", goalId: "meta-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/goals/meta-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function metaRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "meta-1",
    proyecto_id: overrides.proyecto_id ?? "proy-1",
    nombre: overrides.nombre ?? "Meta Uno",
    descripcion: overrides.descripcion ?? null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/goals/:goalId", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals/meta-1"), routeContext);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a COLABORADOR without view access on the project", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals/meta-1"), routeContext);

    expect(res.status).toBe(403);
  });

  it("returns 404 when the meta does not belong to this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals/meta-1"), routeContext);

    expect(res.status).toBe(404);
    expect(db.meta.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "meta-1", proyecto_id: "proy-1", deleted_at: null } }),
    );
  });

  it("returns 200 with the meta on the happy path", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(metaRow() as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals/meta-1"), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/projects/:id/goals/:goalId", () => {
  it("returns 400 when the body is empty", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await PATCH(patchRequest({ nombre: "Meta Editada" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.meta.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the meta does not belong to this project", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Meta Editada" }), routeContext);

    expect(res.status).toBe(404);
    expect(db.meta.update).not.toHaveBeenCalled();
  });

  it("updates the meta on the happy path", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(metaRow() as never);
    vi.mocked(db.meta.update).mockResolvedValue(metaRow({ nombre: "Meta Editada" }) as never);

    const res = await PATCH(patchRequest({ nombre: "Meta Editada" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.meta.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "meta-1" }, data: { nombre: "Meta Editada" } }),
    );
  });
});

describe("DELETE /api/v1/projects/:id/goals/:goalId", () => {
  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await DELETE(new Request("http://localhost/api/v1/projects/proy-1/goals/meta-1"), routeContext);

    expect(res.status).toBe(403);
    expect(db.meta.update).not.toHaveBeenCalled();
  });

  it("soft-deletes via deleted_at (never a hard delete)", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(metaRow() as never);
    vi.mocked(db.meta.update).mockResolvedValue(metaRow() as never);

    const res = await DELETE(new Request("http://localhost/api/v1/projects/proy-1/goals/meta-1"), routeContext);

    expect(res.status).toBe(204);
    expect(db.meta.update).toHaveBeenCalledWith({
      where: { id: "meta-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
