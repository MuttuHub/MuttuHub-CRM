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

const routeContext = { params: Promise.resolve({ id: "proy-1" }) };

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/proy-1/indicators", {
    method: "POST",
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

describe("GET /api/v1/projects/:id/indicators", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/indicators"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR who is neither the responsable nor a management viewer", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/indicators"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 200 with the project's indicadores for the visualizador", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findMany).mockResolvedValue([indicadorRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/indicators"), routeContext);

    expect(res.status).toBe(200);
    expect(db.indicador.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyecto_id: "proy-1", deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.indicadores).toHaveLength(1);
  });

  it("returns 200 for the project's own responsable", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.findMany).mockResolvedValue([] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/indicators"), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/projects/:id/indicators", () => {
  it("returns 400 when nombre is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ unidad: "personas", meta_valor: 10 }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when unidad is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Indicador Uno", meta_valor: 10 }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when meta_valor is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Indicador Uno", unidad: "personas" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when meta_valor is zero or negative", async () => {
    authAs(gerencia);

    const res = await POST(
      postRequest({ nombre: "Indicador Uno", unidad: "personas", meta_valor: 0 }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when valor_actual is negative", async () => {
    authAs(gerencia);

    const res = await POST(
      postRequest({ nombre: "Indicador Uno", unidad: "personas", meta_valor: 10, valor_actual: -1 }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await POST(
      postRequest({ nombre: "Indicador Nuevo", unidad: "personas", meta_valor: 10 }),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.indicador.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await POST(
      postRequest({ nombre: "Indicador Nuevo", unidad: "personas", meta_valor: 10 }),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(db.indicador.create).not.toHaveBeenCalled();
  });

  it("returns 400 when meta_id belongs to another project", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue(null);

    const res = await POST(
      postRequest({
        nombre: "Indicador Nuevo",
        unidad: "personas",
        meta_valor: 10,
        meta_id: "meta-de-otro-proyecto",
      }),
      routeContext,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.indicador.create).not.toHaveBeenCalled();
  });

  it("creates the indicador with proyecto_id forced from the URL, ignoring any proyecto_id sent in the body", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.indicador.create).mockResolvedValue(indicadorRow({ id: "indicador-new" }) as never);

    const res = await POST(
      postRequest({
        nombre: "Indicador Nuevo",
        unidad: "personas",
        meta_valor: 10,
        proyecto_id: "otro-proyecto",
      }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.indicador.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proyecto_id: "proy-1" }) }),
    );
    const json = await res.json();
    expect(json.indicador).toMatchObject({ id: "indicador-new" });
  });

  it("creates the indicador with a meta_id that belongs to this project", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findFirst).mockResolvedValue({ id: "meta-1" } as never);
    vi.mocked(db.indicador.create).mockResolvedValue(
      indicadorRow({ id: "indicador-new", meta_id: "meta-1" }) as never,
    );

    const res = await POST(
      postRequest({ nombre: "Indicador Nuevo", unidad: "personas", meta_valor: 10, meta_id: "meta-1" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.meta.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "meta-1", proyecto_id: "proy-1", deleted_at: null } }),
    );
    expect(db.indicador.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ meta_id: "meta-1" }) }),
    );
  });
});
