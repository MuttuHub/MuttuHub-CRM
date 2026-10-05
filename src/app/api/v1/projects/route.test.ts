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
  proyectoFindFirst: vi.fn(),
  clienteFindFirst: vi.fn(),
  usuarioFindFirst: vi.fn(),
  oportunidadFindFirst: vi.fn(),
  lineaFindMany: vi.fn(),
  municipioFindMany: vi.fn(),
  txProyectoCreate: vi.fn(),
  txOportunidadUpdate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/api/project-code", () => ({
  nextProjectCode: vi.fn(),
}));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => {
  // The catalog lookups answer the `id: { in: [...] }` and `activo` they are
  // given, so the referential checks read like the query they replace. The
  // `-3` rows are suspended: creation (`onlyActive`) must not see them, PATCH
  // (existence-only) must.
  const matching = (rows: { id: string; activo?: boolean }[]) => (args: unknown) => {
    const where = (args as { where?: { id?: { in?: string[] }; activo?: boolean } }).where;
    const ids = where?.id?.in ?? [];
    return Promise.resolve(
      rows.filter(
        (row) =>
          ids.includes(row.id) && (where?.activo === undefined || row.activo === where.activo),
      ),
    );
  };

  return {
    db: {
      proyecto: { findMany: mocks.proyectoFindMany, findFirst: mocks.proyectoFindFirst },
      cliente: { findFirst: mocks.clienteFindFirst },
      usuario: { findFirst: mocks.usuarioFindFirst },
      oportunidad: { findFirst: mocks.oportunidadFindFirst },
      lineaEstrategicaCatalogo: {
        findMany: vi.fn(
          matching([
            { id: "linea-1", activo: true },
            { id: "linea-2", activo: true },
            { id: "linea-3", activo: false },
          ]),
        ),
      },
      municipio: {
        findMany: vi.fn(
          matching([
            { id: "mun-1", activo: true },
            { id: "mun-2", activo: true },
            { id: "mun-3", activo: false },
          ]),
        ),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          proyecto: { create: mocks.txProyectoCreate },
          oportunidad: { update: mocks.txOportunidadUpdate },
        }),
      ),
    },
  };
});

import { requireApiUser } from "@/lib/supabase/server";
import { nextProjectCode } from "@/lib/api/project-code";
import { logChanges } from "@/lib/api/audit-cambios";
import { GET, POST, PROJECT_CREATE_FORBIDDEN_FIELDS } from "./route";

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

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const createBody = {
  nombre: "CedeTextil",
  cliente_id: "cli-1",
  responsable_id: "user-2",
  lineas: [{ id: "linea-1", principal: true }],
  municipio_ids: ["mun-1"],
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  valor_total: 245450000,
  beneficiarios_meta: 120,
};

beforeEach(() => {
  authAs(gerencia);
  dbReturns([proyectoRow]);
  vi.mocked(nextProjectCode).mockResolvedValue("PRY-2026-001");
  mocks.clienteFindFirst.mockResolvedValue({ id: "cli-1" });
  mocks.usuarioFindFirst.mockResolvedValue({ id: "user-2" });
  mocks.txProyectoCreate.mockResolvedValue(proyectoRow);
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

describe("POST /api/v1/projects (E-03)", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await POST(postRequest(createBody));

    expect(res.status).toBe(401);
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a role without canCreateProject", async () => {
    authAs(colaborador);

    const res = await POST(postRequest(createBody));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("creates an INDEPENDIENTE project with an autogenerated code and audits CREAR", async () => {
    const res = await POST(postRequest(createBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.proyecto.codigo).toBe("PRY-2026-001");
    expect(vi.mocked(nextProjectCode)).toHaveBeenCalledWith(
      expect.anything(),
      new Date().getUTCFullYear(),
    );

    const [createArgs] = mocks.txProyectoCreate.mock.calls[0]! as [
      { data: Record<string, unknown>; select: unknown },
    ];
    expect(createArgs.data).toMatchObject({
      codigo: "PRY-2026-001",
      nombre: "CedeTextil",
      cliente_id: "cli-1",
      oportunidad_id: null,
      responsable_id: "user-2",
      origen: "INDEPENDIENTE",
      fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
      fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
      beneficiarios_meta: 120,
      lineas: { create: [{ linea_id: "linea-1", principal: true }] },
      municipios: { create: [{ municipio_id: "mun-1" }] },
    });

    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows).toEqual([
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "CREAR",
        entidad: "proyecto",
        entidad_id: "pry-1",
        proyecto_id: "pry-1",
      }),
    ]);
  });

  it("returns 404 for an unknown client", async () => {
    mocks.clienteFindFirst.mockResolvedValue(null);

    const res = await POST(postRequest(createBody));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects miembro_ids with 400", async () => {
    const res = await POST(postRequest({ ...createBody, miembro_ids: ["user-3"] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects a syntactically valid JSON scalar body", async () => {
    for (const scalar of ['"x"', "42", "false"]) {
      const response = await POST(
        new Request("http://localhost/api/v1/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: scalar,
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects a line set without a principal", async () => {
    const res = await POST(
      postRequest({ ...createBody, lineas: [{ id: "linea-1" }, { id: "linea-2" }] }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Marca una línea estratégica como principal.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects fecha_fin before fecha_inicio", async () => {
    const res = await POST(
      postRequest({ ...createBody, fecha_inicio: "2027-02-01", fecha_fin: "2026-01-01" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("La fecha de fin no puede ser anterior a la de inicio.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it.each(PROJECT_CREATE_FORBIDDEN_FIELDS)(
    "rejects the forbidden field '%s' with 400",
    async (field) => {
      const res = await POST(postRequest({ ...createBody, [field]: "x" }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("VALIDATION_ERROR");
      expect(json.error).toBe(`El campo '${field}' no se puede establecer en este endpoint.`);
      expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
    },
  );

  it("rejects an out-of-range valor_total with 400 instead of a 500", async () => {
    const res = await POST(postRequest({ ...createBody, valor_total: 1e15 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range beneficiarios_meta with 400 instead of a 500", async () => {
    const res = await POST(postRequest({ ...createBody, beneficiarios_meta: 3_000_000_000 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects a suspended strategic line at creation (V-04)", async () => {
    const res = await POST(
      postRequest({ ...createBody, lineas: [{ id: "linea-3", principal: true }] }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Alguna de las líneas estratégicas no existe o está suspendida.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects a suspended municipio at creation (V-04)", async () => {
    const res = await POST(postRequest({ ...createBody, municipio_ids: ["mun-3"] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Algún municipio no existe o está suspendido.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });
});
