// GET /api/v1/projects/:id (E-06 / P02) and PATCH /api/v1/projects/:id
// (E-06 / P06): general data only while estado = BORRADOR, one transaction with
// one audit row per changed field, per changed line and per changed municipio.
//
// Covers the 403/401 the S0.7 commit deferred to this slice: a role without
// project-management authority is refused before anything is read or written.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  txUpdate: vi.fn(),
  txFindUniqueOrThrow: vi.fn(),
  txLineasDeleteMany: vi.fn(),
  txLineasCreateMany: vi.fn(),
  txMunicipiosDeleteMany: vi.fn(),
  txMunicipiosCreateMany: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChanges: vi.fn() };
});

vi.mock("@/lib/db", () => {
  // The catalog lookups answer the `id: { in: [...] }` and `activo` they are
  // given. PATCH is existence-only, so it never sends `activo` and still sees
  // the suspended `-3` rows; the `activo` filter only exists so the asymmetry
  // is pinned (a future PATCH change to active-only would fail the test).
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
      proyecto: { findFirst: vi.fn() },
      usuario: { findFirst: vi.fn() },
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
      // Interactive-form $transaction: the route reads/writes through the tx
      // client, so the fake forwards to the hoisted tx mocks.
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: mocks.lock,
          proyecto: {
            update: mocks.txUpdate,
            findUniqueOrThrow: mocks.txFindUniqueOrThrow,
          },
          proyectoLinea: {
            deleteMany: mocks.txLineasDeleteMany,
            createMany: mocks.txLineasCreateMany,
          },
          proyectoMunicipio: {
            deleteMany: mocks.txMunicipiosDeleteMany,
            createMany: mocks.txMunicipiosCreateMany,
          },
        }),
      ),
    },
  };
});

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { GET, PATCH } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const existente = {
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
  lineas: [{ principal: true, linea: { id: "linea-1", codigo: "LE01", nombre: "Empleabilidad" } }],
  municipios: [{ municipio: { id: "mun-1", nombre: "Medellín", departamento: "Antioquia" } }],
  // Membership probe folded into the GET existence read (S2.6): the default
  // fixture is a non-member, so non-managers fall through to the 403.
  miembros: [],
};

const routeContext = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/projects/pry-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(): Request {
  return new Request("http://localhost/api/v1/projects/pry-1");
}

beforeEach(() => {
  mocks.lock.mockResolvedValue([{ estado: "BORRADOR", valor_total: null }] as never);
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(existente as never);
  vi.mocked(db.usuario.findFirst).mockResolvedValue({ id: "user-2" } as never);
  mocks.txUpdate.mockResolvedValue(existente as never);
  mocks.txFindUniqueOrThrow.mockResolvedValue(existente as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/projects/:id", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(401);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
  });

  it("returns one project as ProjectItemV2", async () => {
    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.proyecto).toEqual({
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
      alertas: [],
      beneficiarios_meta: 120,
      lineas: [{ id: "linea-1", codigo: "LE01", nombre: "Empleabilidad", principal: true }],
      municipios: [{ id: "mun-1", nombre: "Medellín", departamento: "Antioquia" }],
    });
  });

  it("returns 404 for an unknown or deleted project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(db.proyecto.findFirst).toHaveBeenCalledWith({
      where: { id: "pry-1", deleted_at: null },
      select: expect.objectContaining({ codigo: true }),
    });
  });

  it("returns 403 for a COLABORADOR (P02: no project read scope)", async () => {
    authAs(colaborador);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(json.error).toBe("No tienes permisos sobre este proyecto.");
  });

  it("returns 200 for a COORDINADOR who is an active member", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({
      ...existente,
      miembros: [{ id: "miembro-1" }],
    } as never);

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns 403 for a COORDINADOR who is not an active member", async () => {
    authAs(coordinador);

    const res = await GET(getRequest(), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
  });

  it("settles existence before visibility: 404 wins even without read scope", async () => {
    authAs(colaborador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/projects/:id", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await PATCH(patchRequest({ nombre: "Otro" }), routeContext);

    expect(res.status).toBe(401);
    expect(db.proyecto.findFirst).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for a COLABORADOR without project-management authority", async () => {
    authAs(colaborador);

    const res = await PATCH(patchRequest({ nombre: "Otro" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(json.error).toBe("No tienes permisos sobre este proyecto.");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(vi.mocked(logChanges)).not.toHaveBeenCalled();
  });

  it("returns 403 for a COORDINADOR (P06 reserves general data for ADM/GER)", async () => {
    authAs(coordinador);

    const res = await PATCH(patchRequest({ nombre: "Otro" }), routeContext);

    expect(res.status).toBe(403);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Otro" }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 INVALID_STATE when the project is no longer BORRADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({
      ...existente,
      estado: "EN_EJECUCION",
    } as never);

    const res = await PATCH(patchRequest({ valor_total: 300000000 }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("INVALID_STATE");
    expect(json.error).toBe("Solo se pueden editar los datos generales de un proyecto en Borrador.");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(vi.mocked(logChanges)).not.toHaveBeenCalled();
  });

  it("updates general data and audits one row per changed field", async () => {
    const res = await PATCH(
      patchRequest({ nombre: "CedeTextil v2", beneficiarios_meta: 200 }),
      routeContext,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.proyecto.codigo).toBe("PRY-2026-001");
    expect(mocks.txUpdate).toHaveBeenCalledWith({
      where: { id: "pry-1" },
      data: { nombre: "CedeTextil v2", beneficiarios_meta: 200 },
    });
    expect(vi.mocked(logChanges)).toHaveBeenCalledTimes(1);

    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          usuario_id: "ger-1",
          accion: "EDITAR",
          entidad: "proyecto",
          entidad_id: "pry-1",
          proyecto_id: "pry-1",
          campo: "nombre",
          valor_anterior: "CedeTextil",
          valor_nuevo: "CedeTextil v2",
        },
        expect.objectContaining({
          campo: "beneficiarios_meta",
          valor_anterior: 120,
          valor_nuevo: 200,
        }),
      ]),
    );
  });

  it("does not audit a field that was sent unchanged", async () => {
    const res = await PATCH(patchRequest({ nombre: "CedeTextil" }), routeContext);

    expect(res.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalled();
    expect(vi.mocked(logChanges)).not.toHaveBeenCalled();
  });

  it("normalises dates to the stored calendar day and rejects fin before inicio", async () => {
    const res = await PATCH(
      patchRequest({ fecha_inicio: "2027-02-01T00:00:00.000Z" }),
      routeContext,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("La fecha de fin debe ser posterior a la fecha de inicio.");
    expect(mocks.txUpdate).not.toHaveBeenCalled();

    const igual = await PATCH(patchRequest({ fecha_inicio: "2027-01-29" }), routeContext);
    expect(igual.status).toBe(400);
    expect((await igual.json()).error).toBe("La fecha de fin debe ser posterior a la fecha de inicio.");

    const ok = await PATCH(patchRequest({ fecha_inicio: "2026-11-02" }), routeContext);
    expect(ok.status).toBe(200);
    expect(mocks.txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { fecha_inicio: new Date("2026-11-02T00:00:00.000Z") },
      }),
    );
  });

  it("rejects a malformed date and an invalid responsable", async () => {
    const badDate = await PATCH(patchRequest({ fecha_fin: "no-es-fecha" }), routeContext);
    expect(badDate.status).toBe(400);
    expect((await badDate.json()).error).toBe("La fecha de fin no es válida.");

    vi.mocked(db.usuario.findFirst).mockResolvedValue(null);
    const badResponsable = await PATCH(
      patchRequest({ responsable_id: "user-404" }),
      routeContext,
    );
    expect(badResponsable.status).toBe(400);
    expect((await badResponsable.json()).error).toBe(
      "El responsable no existe o está inactivo.",
    );
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("audits a responsable change against the stored column", async () => {
    const res = await PATCH(patchRequest({ responsable_id: "user-9" }), routeContext);

    expect(res.status).toBe(200);
    expect(db.usuario.findFirst).toHaveBeenCalledWith({
      where: { id: "user-9", activo: true },
      select: { id: true },
    });
    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows).toEqual([
      expect.objectContaining({
        campo: "responsable_id",
        valor_anterior: "user-2",
        valor_nuevo: "user-9",
      }),
    ]);
  });

  it("replaces the strategic lines and audits each line change", async () => {
    const res = await PATCH(
      patchRequest({
        lineas: [
          { id: "linea-1", principal: false },
          { id: "linea-2", principal: true },
        ],
      }),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(mocks.txLineasDeleteMany).toHaveBeenCalledWith({ where: { proyecto_id: "pry-1" } });
    expect(mocks.txLineasCreateMany).toHaveBeenCalledWith({
      data: [
        { proyecto_id: "pry-1", linea_id: "linea-1", principal: false },
        { proyecto_id: "pry-1", linea_id: "linea-2", principal: true },
      ],
    });
    // No scalar field was sent, so the route re-reads instead of writing.
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txFindUniqueOrThrow).toHaveBeenCalled();

    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campo: "lineas",
          valor_anterior: { id: "linea-1", principal: true },
          valor_nuevo: { id: "linea-1", principal: false },
        }),
        expect.objectContaining({
          campo: "lineas",
          valor_anterior: null,
          valor_nuevo: { id: "linea-2", principal: true },
        }),
      ]),
    );
  });

  it("rejects a line set with no principal using the exact REQ-CAT-03 copy", async () => {
    const res = await PATCH(
      patchRequest({ lineas: [{ id: "linea-1" }, { id: "linea-2" }] }),
      routeContext,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Marca una línea estratégica como principal.");
    expect(mocks.txLineasDeleteMany).not.toHaveBeenCalled();
    expect(mocks.txLineasCreateMany).not.toHaveBeenCalled();
  });

  it("rejects a line that does not exist instead of failing on the foreign key", async () => {
    vi.mocked(db.lineaEstrategicaCatalogo.findMany).mockResolvedValue([{ id: "linea-1" }] as never);

    const res = await PATCH(
      patchRequest({ lineas: [{ id: "linea-1", principal: true }, { id: "linea-9" }] }),
      routeContext,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Alguna de las líneas estratégicas no existe.");
    expect(mocks.txLineasCreateMany).not.toHaveBeenCalled();
  });

  it("still accepts a suspended line: PATCH is existence-only by design (REQ-CAT-02)", async () => {
    const res = await PATCH(
      patchRequest({ lineas: [{ id: "linea-3", principal: true }] }),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(mocks.txLineasCreateMany).toHaveBeenCalledWith({
      data: [{ proyecto_id: "pry-1", linea_id: "linea-3", principal: true }],
    });
    // Existence-only: the query must NOT filter on `activo`.
    const [findArgs] = vi.mocked(db.lineaEstrategicaCatalogo.findMany).mock.calls[0]!;
    expect(findArgs).toEqual({
      where: { id: { in: ["linea-3"] } },
      select: { id: true },
    });
  });

  it("still accepts a suspended municipio: PATCH is existence-only by design (REQ-CAT-02)", async () => {
    const res = await PATCH(patchRequest({ municipio_ids: ["mun-3"] }), routeContext);

    expect(res.status).toBe(200);
    const [findArgs] = vi.mocked(db.municipio.findMany).mock.calls[0]!;
    expect(findArgs).toEqual({
      where: { id: { in: ["mun-3"] } },
      select: { id: true },
    });
  });

  it("replaces the municipios and audits the added and removed ones", async () => {
    const res = await PATCH(
      patchRequest({ municipio_ids: ["mun-2"] }),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(mocks.txMunicipiosDeleteMany).toHaveBeenCalledWith({ where: { proyecto_id: "pry-1" } });
    expect(mocks.txMunicipiosCreateMany).toHaveBeenCalledWith({
      data: [{ proyecto_id: "pry-1", municipio_id: "mun-2" }],
    });

    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campo: "municipios",
          valor_anterior: { id: "mun-1" },
          valor_nuevo: null,
        }),
        expect.objectContaining({
          campo: "municipios",
          valor_anterior: null,
          valor_nuevo: { id: "mun-2" },
        }),
      ]),
    );
  });

  it("rejects a JSON scalar body instead of answering with a server error", async () => {
    for (const scalar of ['"x"', "42", "false"]) {
      const response = await PATCH(
        new Request("http://localhost/api/v1/projects/pry-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: scalar,
        }),
        routeContext,
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Cuerpo de la solicitud no válido.");
    }
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("rejects an empty body, an empty line set and an out-of-scope field", async () => {
    const empty = await PATCH(patchRequest({}), routeContext);
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toBe("Envía al menos un campo para actualizar.");

    const emptyLineas = await PATCH(patchRequest({ lineas: [] }), routeContext);
    expect(emptyLineas.status).toBe(400);

    const miembroIds = await PATCH(patchRequest({ miembro_ids: ["user-3"] }), routeContext);
    expect(miembroIds.status).toBe(400);
    expect((await miembroIds.json()).error).toBe(
      "El campo 'miembro_ids' no se puede modificar en este endpoint.",
    );

    const estado = await PATCH(patchRequest({ estado: "EN_EJECUCION" }), routeContext);
    expect(estado.status).toBe(400);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("leaves diferencia_valor_oportunidad alone for a project without opportunity", async () => {
    const res = await PATCH(patchRequest({ valor_total: 245450000 }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    const [updateArgs] = mocks.txUpdate.mock.calls[0]! as [
      { data: Record<string, unknown> & { valor_total: Prisma.Decimal } },
    ];
    expect(String(updateArgs.data.valor_total)).toBe("245450000");
    expect(updateArgs.data).not.toHaveProperty("diferencia_valor_oportunidad");
    expect(json.proyecto.diferencia_valor_oportunidad).toBeNull();
    expect(json.proyecto.alertas).toEqual([]);
  });

  describe("project born from an opportunity (S2.4)", () => {
    const conOportunidad = {
      ...existente,
      oportunidad: { valor_estimado_cop: new Prisma.Decimal("245400000.00") },
    };

    it("recomputes and audits diferencia_valor_oportunidad when valor_total changes", async () => {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(conOportunidad as never);
      mocks.txFindUniqueOrThrow.mockResolvedValue({
        ...conOportunidad,
        valor_total: new Prisma.Decimal("245450000.00"),
        diferencia_valor_oportunidad: new Prisma.Decimal("50000.00"),
      });

      const res = await PATCH(patchRequest({ valor_total: 245450000 }), routeContext);
      const json = await res.json();

      expect(res.status).toBe(200);
      const [updateArgs] = mocks.txUpdate.mock.calls[0]! as [{ data: Record<string, unknown> }];
      expect(String(updateArgs.data.diferencia_valor_oportunidad)).toBe("50000");
      const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            campo: "diferencia_valor_oportunidad",
            valor_anterior: null,
            valor_nuevo: "50000",
          }),
        ]),
      );
      expect(json.proyecto.alertas).toEqual([
        expect.objectContaining({ codigo: "DIFERENCIA_VALOR", diferencia: "50000.00" }),
      ]);
    });

    it("does not recompute when valor_total is not in the patch", async () => {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(conOportunidad as never);

      await PATCH(patchRequest({ nombre: "Otro" }), routeContext);

      const [updateArgs] = mocks.txUpdate.mock.calls[0]! as [{ data: Record<string, unknown> }];
      expect(updateArgs.data).not.toHaveProperty("diferencia_valor_oportunidad");
    });
  });

  it("rejects an out-of-range valor_total with 400 instead of a 500", async () => {
    const res = await PATCH(patchRequest({ valor_total: 1e15 }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range beneficiarios_meta with 400 instead of a 500", async () => {
    const res = await PATCH(patchRequest({ beneficiarios_meta: 3_000_000_000 }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("returns the wrapped 500 envelope when the transaction fails", async () => {
    mocks.txUpdate.mockRejectedValue(new Error("boom"));

    const res = await PATCH(patchRequest({ nombre: "Explota" }), routeContext);

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});

describe("project row lock (S8: a baseline approval cannot interleave with a structure write)", () => {
  const casos: [string, () => Promise<Response>, ReturnType<typeof vi.fn>][] = [
    ["PATCH", () => PATCH(patchRequest({ nombre: "CedeTextil v2" }), routeContext), mocks.txUpdate],
  ];

  it.each(casos)("%s locks the project row FOR UPDATE before writing", async (_name, call, write) => {
    const res = await call();
    expect(res.status).toBeLessThan(300);
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    const sql = mocks.lock.mock.calls[0]![0] as readonly string[];
    expect(sql.join(" ")).toMatch(/FROM "proyectos"[\s\S]*FOR UPDATE/);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]!);
  });

  it.each(casos)("%s answers 409 and writes nothing when the approval won the race", async (_name, call, write) => {
    mocks.lock.mockResolvedValue([{ estado: "EN_EJECUCION", valor_total: null }] as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(write).not.toHaveBeenCalled();
  });
});
