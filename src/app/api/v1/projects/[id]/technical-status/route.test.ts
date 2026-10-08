// GET /api/v1/projects/:id/technical-status (S4 U5). F-T1 end to end through the route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  parametros: {
    umbral1: { valor: 10, confirmado: false },
    umbral2: { valor: 20, confirmado: false },
    avance_requiere_medio: { valor: true, confirmado: false },
  } as Record<string, { valor: number | boolean; confirmado: boolean }>,
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn(async () => mocks.parametros) }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    actividad: { findMany: vi.fn() },
    avanceEntregable: { findMany: vi.fn() },
    soporteProyecto: { groupBy: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (over: object = {}, miembro = false) =>
  ({
    id: "pry-1",
    estado: "EN_EJECUCION",
    fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
    fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never;

const ent = (id: string, meta: number) => ({ id, cantidad_meta: new Prisma.Decimal(meta) });
const act = (id: string, codigo: string, ini: number, fin: number, entregables: object[]) => ({
  id,
  codigo,
  semana_inicio: ini,
  semana_fin: fin,
  peso: new Prisma.Decimal(fin - ini + 1),
  peso_manual: false,
  entregables,
});
// F-T1: activities 1.1 w1, 1.2 w2, 1.3 w3, 1.4 w3-6 (weights 1, 1, 1, 4).
const actividades = [
  act("a11", "1.1", 1, 1, [ent("a11-e1", 2), ent("a11-e2", 1)]),
  act("a12", "1.2", 2, 2, [ent("a12-e1", 2)]),
  act("a13", "1.3", 3, 3, [ent("a13-e1", 2), ent("a13-e2", 2)]),
  act("a14", "1.4", 3, 6, [ent("a14-e1", 2), ent("a14-e2", 2), ent("a14-e3", 2)]),
];
const av = (id: string, entregable_id: string, fecha: string, cantidad = 1) => ({
  id,
  entregable_id,
  fecha: new Date(`${fecha}T00:00:00.000Z`),
  cantidad: new Prisma.Decimal(cantidad),
  created_at: new Date(`${fecha}T12:00:00.000Z`),
});
const avances = [
  av("v1", "a11-e1", "2026-10-06"),
  av("v2", "a11-e1", "2026-10-08"),
  av("v3", "a11-e2", "2026-10-09"),
  av("v4", "a12-e1", "2026-10-14"),
];
const conMedio = (ids: string[]) => ids.map((avance_id) => ({ avance_id, _count: { _all: 1 } }));

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const get = (qs = "?corte=2026-10-25") =>
  new Request(`http://localhost/api/v1/projects/pry-1/technical-status${qs}`);

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T15:00:00.000Z"));
  mocks.parametros = {
    umbral1: { valor: 10, confirmado: false },
    umbral2: { valor: 20, confirmado: false },
    avance_requiere_medio: { valor: true, confirmado: false },
  };
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.actividad.findMany).mockResolvedValue(actividades as never);
  vi.mocked(db.avanceEntregable.findMany).mockResolvedValue(avances as never);
  vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue(conMedio(["v1", "v2", "v3", "v4"]) as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("GET technical-status: F-T1 golden", () => {
  it("is rojo: real 21.4 %, programmed 57.1 %, deviation 35.7 pp, thresholds not confirmed", async () => {
    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      base: "vigente",
      corte: "2026-10-25",
      estado: "EN_EJECUCION",
      avance_real: 21.4,
      avance_programado: 57.1,
      desviacion_pp: 35.7,
      color: "rojo",
      umbrales: { umbral1: 10, umbral2: 20, confirmado: false },
    });
    expect(body.actividades.map((a: { codigo: string; progreso: number; estado: string; fecha_cumplimiento: string | null }) => [
      a.codigo,
      a.progreso,
      a.estado,
      a.fecha_cumplimiento,
    ])).toEqual([
      ["1.1", 100, "FINALIZADA", "2026-10-09"],
      ["1.2", 50, "EN_CURSO", null],
      ["1.3", 0, "EN_CURSO", null],
      ["1.4", 0, "EN_CURSO", null],
    ]);
    expect(body.actividades[0]).toMatchObject({ id: "a11", peso: 1 });
  });

  it("confirmado is true only when both thresholds are confirmed", async () => {
    mocks.parametros.umbral1 = { valor: 10, confirmado: true };
    expect((await (await GET(get(), ctx)).json()).umbrales.confirmado).toBe(false);
    mocks.parametros.umbral2 = { valor: 20, confirmado: true };
    expect((await (await GET(get(), ctx)).json()).umbrales.confirmado).toBe(true);
  });

  it("derives the color from the API thresholds (35.7 pp is amarillo with 40/60)", async () => {
    mocks.parametros.umbral1 = { valor: 40, confirmado: true };
    mocks.parametros.umbral2 = { valor: 60, confirmado: true };
    expect((await (await GET(get(), ctx)).json()).color).toBe("verde");
    mocks.parametros.umbral1 = { valor: 10, confirmado: true };
    mocks.parametros.umbral2 = { valor: 40, confirmado: true };
    expect((await (await GET(get(), ctx)).json()).color).toBe("amarillo");
  });
});

describe("GET technical-status: medio requirement and corte", () => {
  it("does not count an avance without a medio while avance_requiere_medio is true", async () => {
    vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue([] as never);
    const body = await (await GET(get(), ctx)).json();
    expect(body.avance_real).toBe(0);
    expect(body.desviacion_pp).toBe(57.1);
  });

  it("counts them when avance_requiere_medio is false (F-T1b arithmetic)", async () => {
    vi.mocked(db.soporteProyecto.groupBy).mockResolvedValue([] as never);
    mocks.parametros.avance_requiere_medio = { valor: false, confirmado: true };
    const body = await (await GET(get(), ctx)).json();
    expect(body.avance_real).toBe(21.4);
  });

  it("only reads non-voided avances dated up to the corte", async () => {
    await GET(get("?corte=2026-10-10"), ctx);
    expect(db.avanceEntregable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          proyecto_id: "pry-1",
          anulado_at: null,
          fecha: { lte: new Date("2026-10-10T00:00:00.000Z") },
        }),
      }),
    );
  });

  it("defaults the corte to today in Bogota", async () => {
    const body = await (await GET(get(""), ctx)).json();
    expect(body.corte).toBe("2026-10-26");
  });

  it("answers 400 for a malformed corte", async () => {
    for (const corte of ["2026-13-45", "hoy", "2026-10-5", ""]) {
      const res = await GET(get(`?corte=${corte}`), ctx);
      // An empty value falls back to today; anything else malformed is a 400.
      expect(res.status, corte).toBe(corte === "" ? 200 : 400);
    }
  });
});

describe("GET technical-status: access", () => {
  it("answers 404, and 403 for a COLABORADOR or a non-member COORDINADOR", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    for (const usuario of [colaborador, coordinador]) {
      authAs(usuario);
      expect((await GET(get(), ctx)).status, usuario.rol).toBe(403);
    }
  });

  it("lets a member COORDINADOR read", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({}, true));
    expect((await GET(get(), ctx)).status).toBe(200);
  });

  it("answers 409 when the project has no dates yet", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ fecha_inicio: null, fecha_fin: null }));
    const res = await GET(get(), ctx);
    expect(res.status).toBe(409);
    expect(db.actividad.findMany).not.toHaveBeenCalled();
  });

  it("returns zeros for a project without activities", async () => {
    vi.mocked(db.actividad.findMany).mockResolvedValue([] as never);
    vi.mocked(db.avanceEntregable.findMany).mockResolvedValue([] as never);
    const body = await (await GET(get(), ctx)).json();
    expect(body).toMatchObject({ avance_real: 0, avance_programado: 0, desviacion_pp: 0, color: "verde", actividades: [] });
  });
});
