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
  // The catalog lookups answer the `id: { in: [...] }` they are given, so the
  // referential checks read like the query they replace.
  const matching = (rows: { id: string }[]) => (args: unknown) => {
    const ids = (args as { where?: { id?: { in?: string[] } } }).where?.id?.in ?? [];
    return Promise.resolve(rows.filter((row) => ids.includes(row.id)));
  };

  return {
    db: {
      proyecto: { findFirst: vi.fn() },
      usuario: { findFirst: vi.fn() },
      lineaEstrategicaCatalogo: {
        findMany: vi.fn(matching([{ id: "linea-1" }, { id: "linea-2" }])),
      },
      municipio: { findMany: vi.fn(matching([{ id: "mun-1" }, { id: "mun-2" }])) },
      // Interactive-form $transaction: the route reads/writes through the tx
      // client, so the fake forwards to the hoisted tx mocks.
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
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

  it("returns 403 for a COORDINADOR until S2.6 resolves membership", async () => {
    authAs(coordinador);

    const res = await GET(getRequest(), routeContext);

    expect(res.status).toBe(403);
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
    expect(json.error).toBe("La fecha de fin no puede ser anterior a la de inicio.");
    expect(mocks.txUpdate).not.toHaveBeenCalled();

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

  it("never touches diferencia_valor_oportunidad and returns no alertas", async () => {
    const res = await PATCH(patchRequest({ valor_total: 245450000 }), routeContext);
    const json = await res.json();

    expect(res.status).toBe(200);
    const [updateArgs] = mocks.txUpdate.mock.calls[0]! as [{ data: { valor_total: Prisma.Decimal } }];
    expect(String(updateArgs.data.valor_total)).toBe("245450000");
    expect(json.proyecto.diferencia_valor_oportunidad).toBeNull();
    expect(json.proyecto).not.toHaveProperty("alertas");
  });

  it("returns the wrapped 500 envelope when the transaction fails", async () => {
    mocks.txUpdate.mockRejectedValue(new Error("boom"));

    const res = await PATCH(patchRequest({ nombre: "Explota" }), routeContext);

    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});
