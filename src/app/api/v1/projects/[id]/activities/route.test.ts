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
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = {
  id: "gerencia-1",
  rol: "GERENCIA",
  puede_ver_tablero_gerencial: false,
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

const routeContext = { params: Promise.resolve({ id: "proy-1" }) };

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/activities", {
    method: "POST",
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

const VALID_BODY = {
  meta_id: "meta-1",
  nombre: "Actividad Uno",
  peso: 2,
  fecha_planificada: "2026-03-01",
  porcentaje_avance: 50,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id/activities", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/activities"), routeContext);

    expect(res.status).toBe(404);
  });

  it("returns 403 for a COLABORADOR without view access on the project", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/activities"), routeContext);

    expect(res.status).toBe(403);
  });

  it("returns 200 with the project's activities", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.actividad.findMany).mockResolvedValue([actividadRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/activities"), routeContext);

    expect(res.status).toBe(200);
    expect(db.actividad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyecto_id: "proy-1", deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.actividades).toHaveLength(1);
  });
});

describe("POST /api/v1/projects/:id/activities", () => {
  it("returns 400 when required fields are missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(404);
    expect(db.actividad.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(403);
    expect(db.actividad.create).not.toHaveBeenCalled();
  });

  it("rejects a meta_id from another project with a clean 400 (API-layer check; the DB composite FK from Unit 1 is the real backstop)", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ ...VALID_BODY, meta_id: "meta-de-otro-proyecto" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.meta.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "meta-de-otro-proyecto", proyecto_id: "proy-1", deleted_at: null } }),
    );
    expect(db.actividad.create).not.toHaveBeenCalled();
  });

  it("creates the activity on the happy path, forcing proyecto_id from the URL", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue({ id: "meta-1" } as never);
    vi.mocked(db.actividad.create).mockResolvedValue(actividadRow({ id: "act-new" }) as never);

    const res = await POST(postRequest(VALID_BODY), routeContext);

    expect(res.status).toBe(201);
    expect(db.actividad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ proyecto_id: "proy-1", meta_id: "meta-1", peso: 2, porcentaje_avance: 50 }),
      }),
    );
    const json = await res.json();
    expect(json.actividad).toMatchObject({ id: "act-new" });
  });

  it("defaults peso to 1 and porcentaje_avance to 0 when omitted", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue({ id: "meta-1" } as never);
    vi.mocked(db.actividad.create).mockResolvedValue(actividadRow({ id: "act-new" }) as never);

    const res = await POST(
      postRequest({ meta_id: "meta-1", nombre: "Actividad Sin Peso", fecha_planificada: "2026-03-01" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.actividad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ peso: 1, porcentaje_avance: 0 }) }),
    );
  });
});
