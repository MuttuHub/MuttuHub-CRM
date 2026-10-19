// POST/GET /api/v1/projects/:id/modifications (S8 U4, E-26).
//
// Mocked db and dry run: pins the order (404 -> 403 -> 409 -> 400), who may request (ADM/GER or a
// member COORDINADOR, A-01), the need of a v0, the RF-28 answer and the SOLICITAR audit. The rules
// themselves are covered in proyectos/modificaciones.test.ts and the approval live in
// prisma/modificaciones.invariant.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  versionFindFirst: vi.fn(),
  versionAggregate: vi.fn(),
  solicitudCreate: vi.fn(),
  solicitudFindMany: vi.fn(),
  usuarioFindMany: vi.fn(),
  evaluar: vi.fn(),
  logChange: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", () => ({ logChange: mocks.logChange }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: mocks.proyectoFindFirst },
    versionProyecto: { findFirst: mocks.versionFindFirst, aggregate: mocks.versionAggregate },
    solicitudModificacion: { create: mocks.solicitudCreate, findMany: mocks.solicitudFindMany },
    usuario: { findMany: mocks.usuarioFindMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ solicitudModificacion: { create: mocks.solicitudCreate } }),
    ),
  },
}));
vi.mock("@/lib/api/modificaciones", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/modificaciones")>();
  return { ...actual, evaluarSolicitud: mocks.evaluar };
});

import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const visualizador = { id: "vis-1", rol: "VISUALIZADOR", puede_ver_tablero_gerencial: false } as unknown as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const BODY = {
  tipo: "TRASLADO",
  motivo: "Mover transporte a dotación",
  detalle: [
    { elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "24000000", despues: "23000000" },
    { elemento: "presupuesto", clave: "R13", campo: "asignado", antes: "12800000", despues: "13800000" },
  ],
};
const post = (body: unknown = BODY) =>
  new Request("http://localhost/api/v1/projects/pry-1/modifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const get = () => new Request("http://localhost/api/v1/projects/pry-1/modifications");

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const proyecto = (estado = "EN_EJECUCION", miembro = false) => ({ id: "pry-1", estado, miembros: miembro ? [{ id: "m-1" }] : [] });

const fila = (over: object = {}) => ({
  id: "sol-1",
  tipo: "TRASLADO",
  motivo: "Mover",
  detalle: BODY.detalle,
  version_base_numero: 0,
  estado: "PENDIENTE",
  solicitado_por_id: "ger-1",
  solicitado_at: new Date("2026-10-08T12:00:00.000Z"),
  decidido_por_id: null,
  decidido_at: null,
  comentario_decision: null,
  version: null,
  ...over,
});

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.versionFindFirst.mockResolvedValue({ id: "v0" });
  mocks.versionAggregate.mockResolvedValue({ _max: { numero: 2 } });
  mocks.evaluar.mockResolvedValue({ live: {}, reglas: [], catalogo: new Map() });
  mocks.solicitudCreate.mockResolvedValue(fila({ version_base_numero: 2 }));
  mocks.solicitudFindMany.mockResolvedValue([fila()]);
  mocks.usuarioFindMany.mockResolvedValue([{ id: "ger-1", nombre: "Gina" }]);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/v1/projects/:id/modifications", () => {
  it("answers 404 for a missing project before anything else", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    authAs(visualizador);
    expect((await POST(post(), ctx)).status).toBe(404);
  });

  it("answers 403 for a COLABORADOR, a VISUALIZADOR and a COORDINADOR who is not a member", async () => {
    for (const usuario of [colaborador, visualizador, coordinador]) {
      authAs(usuario);
      const res = await POST(post(), ctx);
      expect(res.status).toBe(403);
    }
    expect(mocks.solicitudCreate).not.toHaveBeenCalled();
  });

  it("lets a member COORDINADOR request (A-01)", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION", true));
    const res = await POST(post(), ctx);
    expect(res.status).toBe(201);
    expect(mocks.solicitudCreate.mock.calls[0]![0].data.solicitado_por_id).toBe("coord-1");
  });

  it("answers 409 when the project is not EN_EJECUCION", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("BORRADOR"));
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Solo se pueden solicitar modificaciones de un proyecto en ejecución.");
  });

  it("answers 409 when the project has no v0 (a QA project moved by script)", async () => {
    mocks.versionFindFirst.mockResolvedValue(null);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("El proyecto no tiene línea base aprobada.");
  });

  it("answers 400 for a malformed body, an empty detail and an empty motivo", async () => {
    expect((await POST(post({ ...BODY, tipo: "OTRO" }), ctx)).status).toBe(400);
    expect((await POST(post({ ...BODY, detalle: [] }), ctx)).status).toBe(400);
    const res = await POST(post({ ...BODY, motivo: "   " }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("El motivo es obligatorio.");
    expect((await POST(post({ ...BODY, valor_total: "1" }), ctx)).status).toBe(400); // detalle never carries valor_total
  });

  it("answers 400 with every broken rule", async () => {
    mocks.evaluar.mockResolvedValue({
      live: {},
      catalogo: new Map(),
      reglas: [
        { codigo: "A_MENOR_QUE_EJECUTADO", clave: "R12", mensaje: "El valor asignado de «R12» no puede quedar por debajo de lo ya ejecutado ($ 23.500.000)." },
        { codigo: "PERIODO_PASADO", clave: "R12|2026-10", mensaje: "El periodo 2026-10 ya transcurrió: no se puede reprogramar." },
      ],
    });
    const res = await POST(post(), ctx);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toContain("«R12»");
    expect(json.reglas.map((r: { codigo: string }) => r.codigo)).toEqual(["A_MENOR_QUE_EJECUTADO", "PERIODO_PASADO"]);
    expect(mocks.solicitudCreate).not.toHaveBeenCalled();
  });

  it("stores the request against the newest version, audits SOLICITAR and answers 201", async () => {
    const res = await POST(post(), ctx);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.solicitud).toMatchObject({ id: "sol-1", estado: "PENDIENTE", version_base_numero: 2, solicitado_por: { id: "ger-1", nombre: "Gina" } });
    expect(mocks.solicitudCreate.mock.calls[0]![0].data).toMatchObject({
      proyecto_id: "pry-1",
      tipo: "TRASLADO",
      motivo: "Mover transporte a dotación",
      version_base_numero: 2,
      solicitado_por_id: "ger-1",
    });
    expect(mocks.logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "SOLICITAR", entidad: "solicitud", entidad_id: "sol-1", proyecto_id: "pry-1", usuario_id: "ger-1" }),
    );
  });
});

describe("GET /api/v1/projects/:id/modifications", () => {
  it("lists the requests newest first with the requester resolved", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(mocks.solicitudFindMany.mock.calls[0]![0].orderBy).toEqual([{ solicitado_at: "desc" }, { id: "desc" }]);
    expect(json.solicitudes).toHaveLength(1);
    expect(json.solicitudes[0]).toMatchObject({ id: "sol-1", solicitado_por: { id: "ger-1", nombre: "Gina" }, decidido_por: null });
  });

  it("answers 404 and 403 before listing", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto());
    authAs(colaborador);
    expect((await GET(get(), ctx)).status).toBe(403);
  });

  it("lets a member COORDINADOR read", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await GET(get(), ctx)).status).toBe(200);
  });
});
