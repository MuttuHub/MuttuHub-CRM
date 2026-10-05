// GET /api/v1/projects — list + filters + read scope (E-02, REQ-ACC-02).
//
// The `@/lib/db` fake answers the visibility clause it is given: an empty
// `id: { in: [] }` scope yields no rows, so the "who sees what" assertions test
// behaviour instead of only the shape of the `where`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindMany: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findMany: mocks.proyectoFindMany },
  },
}));

import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const administrador = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const proyectoRow = {
  id: "pry-1",
  codigo: "PRY-2026-001",
  nombre: "CedeTextil",
  estado: "BORRADOR",
  origen: "OPORTUNIDAD",
  cliente: { id: "cli-1", nombre: "CedeTextil S.A." },
  responsable: { id: "user-2", nombre: "Ana Gómez" },
  responsable_id: "user-2",
  fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
  fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
  valor_total: new Prisma.Decimal("245450000.00"),
  diferencia_valor_oportunidad: null,
  beneficiarios_meta: 120,
  lineas: [
    { principal: true, linea: { id: "linea-1", codigo: "LE01", nombre: "Empleabilidad" } },
    { principal: false, linea: { id: "linea-2", codigo: "LE02", nombre: "Emprendimiento" } },
  ],
  municipios: [{ municipio: { id: "mun-1", nombre: "Medellín", departamento: "Antioquia" } }],
};

/** A draft without dates or responsable, which must not break the projection. */
const borradorIncompleto = {
  ...proyectoRow,
  id: "pry-2",
  codigo: "PRY-2026-002",
  responsable: null,
  fecha_inicio: null,
  fecha_fin: null,
  valor_total: null,
  beneficiarios_meta: null,
  lineas: [],
  municipios: [],
};

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

/** The fake honours the visibility clause the route composes. */
function dbReturns(rows: unknown[]) {
  mocks.proyectoFindMany.mockImplementation(
    (args: { where?: { id?: { in?: string[] } } }) => {
      const scope = args.where?.id?.in;
      return Promise.resolve(scope && scope.length === 0 ? [] : rows);
    },
  );
}

function listRequest(query = ""): Request {
  return new Request(`http://localhost/api/v1/projects${query}`);
}

beforeEach(() => {
  authAs(gerencia);
  dbReturns([proyectoRow]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(listRequest());

    expect(res.status).toBe(401);
    expect(mocks.proyectoFindMany).not.toHaveBeenCalled();
  });

  it("returns the exact ProjectItemV2 shape with derived duracion_semanas", async () => {
    const res = await GET(listRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.proyectos).toEqual([
      {
        id: "pry-1",
        codigo: "PRY-2026-001",
        nombre: "CedeTextil",
        estado: "BORRADOR",
        origen: "OPORTUNIDAD",
        cliente: { id: "cli-1", nombre: "CedeTextil S.A." },
        responsable: { id: "user-2", nombre: "Ana Gómez" },
        fecha_inicio: "2026-10-05",
        fecha_fin: "2027-01-29",
        duracion_semanas: 17,
        valor_total: "245450000",
        diferencia_valor_oportunidad: null,
        beneficiarios_meta: 120,
        lineas: [
          { id: "linea-1", codigo: "LE01", nombre: "Empleabilidad", principal: true },
          { id: "linea-2", codigo: "LE02", nombre: "Emprendimiento", principal: false },
        ],
        municipios: [{ id: "mun-1", nombre: "Medellín", departamento: "Antioquia" }],
      },
    ]);
  });

  it("keeps duracion_semanas null and name fields empty on an incomplete draft", async () => {
    authAs(administrador);
    dbReturns([borradorIncompleto]);

    const res = await GET(listRequest());
    const json = await res.json();

    expect(json.proyectos[0]).toMatchObject({
      fecha_inicio: null,
      fecha_fin: null,
      duracion_semanas: null,
      responsable: null,
      lineas: [],
      municipios: [],
    });
  });

  it("queries with the shared select, the projects order and no scope clause for management", async () => {
    await GET(listRequest());

    expect(mocks.proyectoFindMany).toHaveBeenCalledWith({
      where: { deleted_at: null },
      orderBy: { codigo: "asc" },
      select: expect.objectContaining({
        codigo: true,
        estado: true,
        lineas: { select: { principal: true, linea: { select: expect.anything() } } },
        municipios: { select: { municipio: { select: expect.anything() } } },
      }),
    });
  });

  it("applies every E-02 filter to the where clause", async () => {
    await GET(
      listRequest(
        "?estado=BORRADOR&cliente_id=cli-9&linea_id=linea-7&municipio_id=mun-3&responsable_id=user-5",
      ),
    );

    expect(mocks.proyectoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deleted_at: null,
          estado: "BORRADOR",
          cliente_id: "cli-9",
          responsable_id: "user-5",
          lineas: { some: { linea_id: "linea-7" } },
          municipios: { some: { municipio_id: "mun-3" } },
        },
      }),
    );
  });

  it("rejects an unknown estado with 400 VALIDATION_ERROR", async () => {
    const res = await GET(listRequest("?estado=INVENTADO"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.proyectoFindMany).not.toHaveBeenCalled();
  });

  it("narrows a COLABORADOR to nothing (REQ-ACC-02: no flag, no membership)", async () => {
    authAs(colaborador);

    const res = await GET(listRequest());
    const json = await res.json();

    expect(mocks.proyectoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, id: { in: [] } } }),
    );
    expect(json.proyectos).toEqual([]);
  });

  it("narrows a COORDINADOR to nothing until S2.6 resolves membership", async () => {
    authAs(coordinador);

    const res = await GET(listRequest());
    const json = await res.json();

    expect(mocks.proyectoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, id: { in: [] } } }),
    );
    expect(json.proyectos).toEqual([]);
  });

  it("returns the wrapped 500 envelope when the query fails", async () => {
    mocks.proyectoFindMany.mockRejectedValue(new Error("boom"));

    const res = await GET(listRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("INTERNAL_ERROR");
  });
});
