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
  return new Request("http://localhost/api/v1/projects/proy-1/goals", {
    method: "POST",
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

describe("GET /api/v1/projects/:id/goals", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR who is neither the responsable nor a management viewer", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns 200 with the project's metas for the visualizador", async () => {
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findMany).mockResolvedValue([metaRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals"), routeContext);

    expect(res.status).toBe(200);
    expect(db.meta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyecto_id: "proy-1", deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.metas).toHaveLength(1);
  });

  it("returns 200 for the project's own responsable", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.findMany).mockResolvedValue([] as never);

    const res = await GET(new Request("http://localhost/api/v1/projects/proy-1/goals"), routeContext);

    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/projects/:id/goals", () => {
  it("returns 400 when nombre is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ nombre: "Meta Nueva" }), routeContext);

    expect(res.status).toBe(404);
    expect(db.meta.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable", async () => {
    authAs(colaboradorAjeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await POST(postRequest({ nombre: "Meta Nueva" }), routeContext);

    expect(res.status).toBe(403);
    expect(db.meta.create).not.toHaveBeenCalled();
  });

  it("creates the meta with proyecto_id forced from the URL, ignoring any proyecto_id sent in the body", async () => {
    authAs(responsableColaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.meta.create).mockResolvedValue(metaRow({ id: "meta-new" }) as never);

    const res = await POST(
      postRequest({ nombre: "Meta Nueva", proyecto_id: "otro-proyecto" }),
      routeContext,
    );

    expect(res.status).toBe(201);
    expect(db.meta.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proyecto_id: "proy-1" }) }),
    );
    const json = await res.json();
    expect(json.meta).toMatchObject({ id: "meta-new" });
  });
});
