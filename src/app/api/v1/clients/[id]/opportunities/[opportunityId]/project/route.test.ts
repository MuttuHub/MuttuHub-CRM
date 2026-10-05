// POST /api/v1/clients/:id/opportunities/:opportunityId/project (E-05):
// one-step GANADA -> project. The opportunity conversion (`fase = EJECUCION`,
// `fecha_adjudicacion` only while null), the project creation and BOTH audit
// rows (CONVERTIR + CREAR) happen in one transaction, so a failed audit insert
// rolls the conversion back with the creation.
//
// `cliente_id` is derived from the URL, never from the body; `nombre` and
// `valor_total` prefill from the opportunity when the client omits them.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  clienteFindFirst: vi.fn(),
  oportunidadFindFirst: vi.fn(),
  proyectoFindFirst: vi.fn(),
  usuarioFindFirst: vi.fn(),
  lineaFindMany: vi.fn(),
  municipioFindMany: vi.fn(),
  transaction: vi.fn(),
  txOportunidadUpdate: vi.fn(),
  txProyectoCreate: vi.fn(),
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
  // Honors both the `id: { in: [...] }` and the `activo` filter; the `-3` rows
  // are suspended and must be rejected by the creation path.
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
      cliente: { findFirst: mocks.clienteFindFirst },
      oportunidad: { findFirst: mocks.oportunidadFindFirst },
      proyecto: { findFirst: mocks.proyectoFindFirst },
      usuario: { findFirst: mocks.usuarioFindFirst },
      lineaEstrategicaCatalogo: {
        findMany: vi.fn(
          matching([{ id: "linea-1", activo: true }, { id: "linea-3", activo: false }]),
        ),
      },
      municipio: {
        findMany: vi.fn(
          matching([{ id: "mun-1", activo: true }, { id: "mun-3", activo: false }]),
        ),
      },
      $transaction: mocks.transaction,
    },
  };
});

import { requireApiUser } from "@/lib/supabase/server";
import { nextProjectCode } from "@/lib/api/project-code";
import { logChanges } from "@/lib/api/audit-cambios";
import { PROJECT_CREATE_FROM_OPPORTUNITY_FORBIDDEN_FIELDS } from "@/app/api/v1/projects/route";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const routeContext = {
  params: Promise.resolve({ id: "cli-1", opportunityId: "opp-1" }),
};

const oportunidad = {
  id: "opp-1",
  cliente_id: "cli-1",
  nombre: "CedeTextil",
  estado: "GANADA",
  fase: "PROSPECCION",
  fecha_adjudicacion: null,
  valor_estimado_cop: new Prisma.Decimal("245450000.00"),
  deleted_at: null,
};

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
  lineas: [{ principal: true, linea: { id: "linea-1", codigo: "LE01", nombre: "Empleabilidad" } }],
  municipios: [{ municipio: { id: "mun-1", nombre: "Medellín", departamento: "Antioquia" } }],
};

/** Body without `nombre`/`valor_total` so the prefill path is exercised. */
const prefillBody = {
  responsable_id: "user-2",
  lineas: [{ id: "linea-1", principal: true }],
  municipio_ids: ["mun-1"],
  fecha_inicio: "2026-10-05",
  fecha_fin: "2027-01-29",
  beneficiarios_meta: 120,
};

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/opportunities/opp-1/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Same shape the verifier observed from the live DB: fields live under `meta`. */
function uniqueViolation(fields: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { constraint: { fields } } } },
  });
}

beforeEach(() => {
  authAs(gerencia);
  mocks.clienteFindFirst.mockResolvedValue({ id: "cli-1", responsable_id: "user-2" });
  mocks.oportunidadFindFirst.mockResolvedValue(oportunidad);
  mocks.proyectoFindFirst.mockResolvedValue(null);
  mocks.usuarioFindFirst.mockResolvedValue({ id: "user-2" });
  vi.mocked(nextProjectCode).mockResolvedValue("PRY-2026-001");
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      oportunidad: { update: mocks.txOportunidadUpdate },
      proyecto: { create: mocks.txProyectoCreate },
    }),
  );
  mocks.txOportunidadUpdate.mockResolvedValue({ ...oportunidad, fase: "EJECUCION" });
  mocks.txProyectoCreate.mockResolvedValue(proyectoRow);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/clients/:id/opportunities/:opportunityId/project (E-05)", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await POST(postRequest(prefillBody), routeContext);

    expect(res.status).toBe(401);
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a role without canCreateProject", async () => {
    authAs(colaborador);

    const res = await POST(postRequest(prefillBody), routeContext);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("creating from a GANADA opportunity converts it (fase EJECUCION, fecha_adjudicacion) in the same transaction", async () => {
    const res = await POST(postRequest(prefillBody), routeContext);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.proyecto.codigo).toBe("PRY-2026-001");

    expect(mocks.txOportunidadUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: { fase: "EJECUCION", fecha_adjudicacion: expect.any(Date) },
    });

    const [createArgs] = mocks.txProyectoCreate.mock.calls[0]! as [
      { data: Record<string, unknown> },
    ];
    expect(createArgs.data).toMatchObject({
      codigo: "PRY-2026-001",
      nombre: "CedeTextil",
      cliente_id: "cli-1",
      oportunidad_id: "opp-1",
      responsable_id: "user-2",
      origen: "OPORTUNIDAD",
      lineas: { create: [{ linea_id: "linea-1", principal: true }] },
      municipios: { create: [{ municipio_id: "mun-1" }] },
    });
    expect(String(createArgs.data.valor_total)).toBe("245450000");
  });

  it("audits CONVERTIR and CREAR with the same logChanges call", async () => {
    await POST(postRequest(prefillBody), routeContext);

    expect(vi.mocked(logChanges)).toHaveBeenCalledTimes(1);
    const [, rows] = vi.mocked(logChanges).mock.calls[0]!;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          usuario_id: "ger-1",
          accion: "CONVERTIR",
          entidad: "oportunidad",
          entidad_id: "opp-1",
          proyecto_id: "pry-1",
        }),
        expect.objectContaining({
          usuario_id: "ger-1",
          accion: "CREAR",
          entidad: "proyecto",
          entidad_id: "pry-1",
          proyecto_id: "pry-1",
        }),
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("does not overwrite fecha_adjudicacion of an already converted opportunity", async () => {
    mocks.oportunidadFindFirst.mockResolvedValue({
      ...oportunidad,
      fase: "EJECUCION",
      fecha_adjudicacion: new Date("2026-09-01T00:00:00.000Z"),
    });

    const res = await POST(postRequest(prefillBody), routeContext);

    expect(res.status).toBe(201);
    expect(mocks.txOportunidadUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: { fase: "EJECUCION" },
    });
  });

  it("lets the client override the prefilled nombre and valor_total", async () => {
    const res = await POST(
      postRequest({ ...prefillBody, nombre: "Otro nombre", valor_total: 100000000 }),
      routeContext,
    );

    expect(res.status).toBe(201);
    const [createArgs] = mocks.txProyectoCreate.mock.calls[0]! as [
      { data: Record<string, unknown> },
    ];
    expect(createArgs.data.nombre).toBe("Otro nombre");
    expect(String(createArgs.data.valor_total)).toBe("100000000");
  });

  it("returns 409 for an opportunity that is not GANADA", async () => {
    mocks.oportunidadFindFirst.mockResolvedValue({ ...oportunidad, estado: "EN_NEGOCIACION" });

    const res = await POST(postRequest(prefillBody), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toBe("Solo se crea un proyecto desde una oportunidad en estado Ganada.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
    expect(mocks.txOportunidadUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 for an opportunity that already has a project", async () => {
    mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-9" });

    const res = await POST(postRequest(prefillBody), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toBe("Esta oportunidad ya tiene un proyecto.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("returns 404 for an opportunity of another client or unknown", async () => {
    mocks.oportunidadFindFirst.mockResolvedValue(null);

    const res = await POST(postRequest(prefillBody), routeContext);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.code).toBe("NOT_FOUND");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it.each(PROJECT_CREATE_FROM_OPPORTUNITY_FORBIDDEN_FIELDS)(
    "rejects the forbidden field '%s' with 400",
    async (field) => {
      const res = await POST(postRequest({ ...prefillBody, [field]: "x" }), routeContext);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe("VALIDATION_ERROR");
      expect(json.error).toBe(`El campo '${field}' no se puede establecer en este endpoint.`);
      expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
    },
  );

  it("rejects a syntactically valid JSON scalar body", async () => {
    for (const scalar of ['"x"', "42", "false"]) {
      const response = await POST(
        new Request("http://localhost/api/v1/clients/cli-1/opportunities/opp-1/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: scalar,
        }),
        routeContext,
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("answers 409 when the oportunidad_id unique index wins the race (P2002)", async () => {
    mocks.transaction.mockRejectedValueOnce(uniqueViolation(["oportunidad_id"]));

    const res = await POST(postRequest(prefillBody), routeContext);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
    expect(json.error).toBe("Esta oportunidad ya tiene un proyecto.");
  });

  it("does not swallow an unrelated unique violation (P2002 on codigo -> 500)", async () => {
    mocks.transaction.mockRejectedValueOnce(uniqueViolation(["codigo"]));

    const res = await POST(postRequest(prefillBody), routeContext);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("INTERNAL_ERROR");
  });

  it("rejects a suspended strategic line (V-04)", async () => {
    const res = await POST(
      postRequest({ ...prefillBody, lineas: [{ id: "linea-3", principal: true }] }),
      routeContext,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Alguna de las líneas estratégicas no existe o está suspendida.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });

  it("rejects a suspended municipio (V-04)", async () => {
    const res = await POST(
      postRequest({ ...prefillBody, municipio_ids: ["mun-3"] }),
      routeContext,
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toBe("Algún municipio no existe o está suspendido.");
    expect(mocks.txProyectoCreate).not.toHaveBeenCalled();
  });
});
