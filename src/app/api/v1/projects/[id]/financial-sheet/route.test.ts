// GET /api/v1/projects/:id/financial-sheet (S5 U4). F-F1 end to end through the route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";
import { toCents } from "@/lib/proyectos/money";

const mocks = vi.hoisted(() => ({
  parametros: {
    tolerancia: { valor: 10, confirmado: false },
    retraso: { valor: 70, confirmado: false },
  } as Record<string, { valor: number | boolean; confirmado: boolean }>,
  lineaFindMany: vi.fn(),
  celdaFindMany: vi.fn(),
  loadGastos: vi.fn(),
  loadTecnico: vi.fn(),
  versionFindFirst: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn(async () => mocks.parametros) }));
vi.mock("@/lib/api/financiera", () => ({ loadGastosValidados: mocks.loadGastos }));
vi.mock("@/lib/api/tecnico", () => ({ loadTecnicoStatus: mocks.loadTecnico }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    lineaPresupuestal: { findMany: mocks.lineaFindMany },
    programacionPeriodo: { findMany: mocks.celdaFindMany },
    versionProyecto: { findFirst: mocks.versionFindFirst },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const visualizador = { id: "vis-1", rol: "VISUALIZADOR", puede_ver_tablero_gerencial: true } as unknown as Usuario;

const proyecto = (over: object = {}, miembro = false) =>
  ({
    id: "pry-1",
    estado: "EN_EJECUCION",
    valor_total: new Prisma.Decimal("83500000"),
    fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
    fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
    miembros: miembro ? [{ id: "m-1" }] : [],
    ...over,
  }) as never;

const rubro = (id: string, codigo: string, nombre: string, orden: number) => ({ codigo, nombre, orden, activo: true, id });
// F-F1: R01 59.5M (14.875M x4), R12 24M (6M x4), project 2026-10..2027-01.
const lineas = [
  { id: "l12", rubro_id: "r12", monto_proyectado_cop: new Prisma.Decimal("24000000"), rubro: rubro("r12", "R12", "Transporte", 12) },
  { id: "l01", rubro_id: "r01", monto_proyectado_cop: new Prisma.Decimal("59500000"), rubro: rubro("r01", "R01", "Personal", 1) },
];
const PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01"];
const celdas = [
  ...PERIODOS.map((periodo, i) => ({ id: `c01-${i}`, linea_id: "l01", periodo, valor: new Prisma.Decimal("14875000") })),
  ...PERIODOS.map((periodo, i) => ({ id: `c12-${i}`, linea_id: "l12", periodo, valor: new Prisma.Decimal("6000000") })),
];
const gasto = (rubroId: string, periodo: string, valor: string, estado = "VALIDADO") => ({
  rubroId,
  periodo,
  valor: toCents(valor),
  estado,
});
const gastosF1 = [
  gasto("r01", "2026-10", "12000000"),
  gasto("r01", "2026-11", "15000000"),
  gasto("r12", "2026-10", "7000000"),
  gasto("r12", "2026-11", "6500000"),
  gasto("r01", "2026-11", "5000000", "REGISTRADO"),
  gasto("r12", "2026-10", "800000", "RECHAZADO"),
  gasto("r01", "2026-12", "3000000"),
];

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const get = (qs = "?corte=2026-11") => new Request(`http://localhost/api/v1/projects/pry-1/financial-sheet${qs}`);
function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
  mocks.parametros = {
    tolerancia: { valor: 10, confirmado: false },
    retraso: { valor: 70, confirmado: false },
  };
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  mocks.lineaFindMany.mockResolvedValue(lineas);
  mocks.celdaFindMany.mockResolvedValue(celdas);
  mocks.loadGastos.mockResolvedValue({ disponible: true, gastos: gastosF1 });
  mocks.loadTecnico.mockResolvedValue({ color: "verde" });
  mocks.versionFindFirst.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("GET financial-sheet: F-F1 golden", () => {
  it("computes R01 verde, R12 rojo and the total row from the sums", async () => {
    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ base: "vigente", corte: "2026-11", estado: "EN_EJECUCION", ejecucion_disponible: true });
    expect(body.rubros.map((r: { codigo: string }) => r.codigo)).toEqual(["R01", "R12"]);
    expect(body.rubros[0]).toMatchObject({
      rubro_id: "r01",
      nombre: "Personal",
      asignado: "59500000.00",
      programado: "29750000.00",
      ejecutado: "27000000.00",
      diferencia: "-2750000.00",
      ep_decimas: 908,
      ea_decimas: 454,
      umbral_rojo: "32725000.00",
      color: "verde",
    });
    expect(body.rubros[1]).toMatchObject({
      codigo: "R12",
      programado: "12000000.00",
      ejecutado: "13500000.00",
      diferencia: "1500000.00",
      ep_decimas: 1125,
      ea_decimas: 563,
      umbral_rojo: "13200000.00",
      color: "rojo",
    });
    expect(body.total).toMatchObject({
      rubro_id: null,
      nombre: "Total",
      asignado: "83500000.00",
      programado: "41750000.00",
      ejecutado: "40500000.00",
      diferencia: "-1250000.00",
      ep_decimas: 970,
      ea_decimas: 485,
      umbral_rojo: "45925000.00",
      color: "verde",
    });
    expect(body.parametros).toEqual({ tolerancia: 10, retraso: 70, confirmado: false });
  });

  it("reads the technical status at the end of the corte month clipped to today (Bogota)", async () => {
    await GET(get("?corte=2026-11"), ctx);
    expect(mocks.loadTecnico).toHaveBeenCalledWith(expect.objectContaining({ proyectoId: "pry-1", corte: "2026-11-20" }));
    await GET(get("?corte=2026-10"), ctx);
    expect(mocks.loadTecnico).toHaveBeenLastCalledWith(expect.objectContaining({ corte: "2026-10-31" }));
  });

  it("raises the delay alert on the total row only with E/P below the threshold and a non-verde technical color", async () => {
    mocks.loadGastos.mockResolvedValue({ disponible: true, gastos: [gasto("r01", "2026-10", "20000000")] });
    mocks.loadTecnico.mockResolvedValue({ color: "rojo" });
    expect((await (await GET(get(), ctx)).json()).alerta_retraso).toBe(true);
    mocks.loadTecnico.mockResolvedValue({ color: "verde" });
    expect((await (await GET(get(), ctx)).json()).alerta_retraso).toBe(false);
    // 97 % of the programmed amount: no alert even with a rojo technical color.
    mocks.loadGastos.mockResolvedValue({ disponible: true, gastos: gastosF1 });
    mocks.loadTecnico.mockResolvedValue({ color: "rojo" });
    expect((await (await GET(get(), ctx)).json()).alerta_retraso).toBe(false);
  });

  it("uses the configured tolerance (amarillo at 10 %, rojo at 0 %)", async () => {
    mocks.loadGastos.mockResolvedValue({ disponible: true, gastos: [gasto("r12", "2026-10", "13000000")] });
    expect((await (await GET(get(), ctx)).json()).rubros[1].color).toBe("amarillo");
    mocks.parametros.tolerancia = { valor: 0, confirmado: true };
    expect((await (await GET(get(), ctx)).json()).rubros[1].color).toBe("rojo");
  });
});

describe("GET financial-sheet: BORRADOR keeps E unavailable (S6)", () => {
  it("answers ejecucion_disponible false for a BORRADOR project even when the source is available", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ estado: "BORRADOR" }));
    mocks.loadGastos.mockResolvedValue({ disponible: true, gastos: [] });
    const body = await (await GET(get(), ctx)).json();
    expect(body.ejecucion_disponible).toBe(false);
    for (const row of [...body.rubros, body.total]) {
      expect(row).toMatchObject({ color: null, ep_decimas: null, ea_decimas: null });
    }
    expect(mocks.loadTecnico).not.toHaveBeenCalled();
  });

  it("keeps E and colors for an EN_EJECUCION project with an available source", async () => {
    mocks.loadGastos.mockResolvedValue({ disponible: true, gastos: gastosF1 });
    expect((await (await GET(get(), ctx)).json()).ejecucion_disponible).toBe(true);
  });
});

describe("GET financial-sheet: E not available until S6", () => {
  beforeEach(() => {
    mocks.loadGastos.mockResolvedValue({ disponible: false, gastos: [] });
  });

  it("flags ejecucion_disponible false and renders no colors, percentages or alert", async () => {
    const body = await (await GET(get(), ctx)).json();
    expect(body.ejecucion_disponible).toBe(false);
    for (const row of [...body.rubros, body.total]) {
      expect(row).toMatchObject({ ejecutado: "0.00", color: null, ep_decimas: null, ea_decimas: null });
    }
    expect(body.alerta_retraso).toBe(false);
    expect(body.rubros[0]).toMatchObject({ asignado: "59500000.00", programado: "29750000.00" });
    expect(mocks.loadTecnico).not.toHaveBeenCalled();
  });

  it("carries aggregates only: no per-gasto or support keys anywhere in the payload", async () => {
    mocks.loadGastos.mockResolvedValue({ disponible: true, gastos: gastosF1 });
    const text = JSON.stringify(await (await GET(get(), ctx)).json());
    for (const key of ["gastos", "soporte", "tercero", "nit", "proveedor", "factura", "descripcion"]) {
      expect(text.toLowerCase(), key).not.toContain(`"${key}`);
    }
  });
});

describe("GET financial-sheet: corte, base and state", () => {
  it("defaults the corte to the current month clipped into the project periods", async () => {
    expect((await (await GET(get(""), ctx)).json()).corte).toBe("2026-11");
    vi.setSystemTime(new Date("2026-08-01T15:00:00.000Z"));
    expect((await (await GET(get(""), ctx)).json()).corte).toBe("2026-10");
    vi.setSystemTime(new Date("2027-06-01T15:00:00.000Z"));
    expect((await (await GET(get(""), ctx)).json()).corte).toBe("2027-01");
  });

  it("answers 400 for a malformed corte or one outside the project periods", async () => {
    for (const corte of ["2026-13", "2026-11-05", "noviembre", "2026-09", "2027-02"]) {
      expect((await GET(get(`?corte=${corte}`), ctx)).status, corte).toBe(400);
    }
  });

  it("answers 409 for base=original while there is no v0 and 400 for an unknown base", async () => {
    const original = await GET(get("?corte=2026-11&base=original"), ctx);
    expect(original.status).toBe(409);
    expect((await original.json()).error).toBe("La versión original aún no existe.");
    expect((await GET(get("?corte=2026-11&base=otra"), ctx)).status).toBe(400);
    expect((await GET(get("?corte=2026-11&base=vigente"), ctx)).status).toBe(200);
  });

  it("answers 409 while the project has no dates", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({ fecha_inicio: null, fecha_fin: null }));
    expect((await GET(get(), ctx)).status).toBe(409);
  });
});

describe("GET financial-sheet: base=original (S8 U5)", () => {
  // v0 froze R12 at 25.000.000 (6.250.000 per month); the vigente says 24.000.000 after a traslado.
  const snapshotV0 = {
    schema: 1,
    proyecto: { valor_total: "84500000.00", fecha_inicio: "2026-10-05", fecha_fin: "2027-01-29", beneficiarios_meta: 500 },
    presupuesto: [
      { rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "59500000.00" },
      { rubro_codigo: "R12", rubro_nombre: "Transporte", asignado: "25000000.00" },
    ],
    programacion: PERIODOS.flatMap((periodo) => [
      { rubro_codigo: "R01", periodo, valor: "14875000.00" },
      { rubro_codigo: "R12", periodo, valor: "6250000.00" },
    ]),
    actividades: [],
    entregables: [],
    indicadores: [],
  };

  it("computes A and P from the v0 snapshot and E from the live validated expenses", async () => {
    mocks.versionFindFirst.mockResolvedValue({ snapshot: snapshotV0 });
    const res = await GET(get("?corte=2026-11&base=original"), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(mocks.versionFindFirst.mock.calls[0]![0].where).toEqual({ proyecto_id: "pry-1", numero: 0 });
    expect(body.base).toBe("original");
    expect(body.rubros.map((r: { codigo: string }) => r.codigo)).toEqual(["R01", "R12"]);
    expect(body.rubros[1]).toMatchObject({
      rubro_id: "r12",
      asignado: "25000000.00",
      programado: "12500000.00",
      ejecutado: "13500000.00",
      diferencia: "1000000.00",
      ep_decimas: 1080,
      umbral_rojo: "13750000.00",
      color: "amarillo", // E is above P but inside the tolerance: the pure computeFicha decides
    });
    expect(body.total).toMatchObject({ asignado: "84500000.00", programado: "42250000.00", ejecutado: "40500000.00" });
  });

  it("gives a rubro that is only in the vigente a zero row and one only in v0 a synthetic row", async () => {
    mocks.versionFindFirst.mockResolvedValue({
      snapshot: { ...snapshotV0, presupuesto: [{ rubro_codigo: "R01", rubro_nombre: "Personal", asignado: "59500000.00" }, { rubro_codigo: "R20", rubro_nombre: "Imprevistos", asignado: "100.00" }], programacion: [] },
    });
    const body = await (await GET(get("?corte=2026-11&base=original"), ctx)).json();
    const r12 = body.rubros.find((r: { codigo: string }) => r.codigo === "R12");
    expect(r12).toMatchObject({ asignado: "0.00", programado: "0.00", ejecutado: "13500000.00" });
    const r20 = body.rubros.find((r: { codigo: string }) => r.codigo === "R20");
    expect(r20).toMatchObject({ nombre: "Imprevistos", asignado: "100.00", ejecutado: "0.00" });
  });

  it("takes the periods of the corte from the v0 dates", async () => {
    mocks.versionFindFirst.mockResolvedValue({ snapshot: { ...snapshotV0, proyecto: { ...snapshotV0.proyecto, fecha_fin: "2026-12-18" } } });
    expect((await GET(get("?corte=2027-01&base=original"), ctx)).status).toBe(400);
    expect((await GET(get("?corte=2026-12&base=original"), ctx)).status).toBe(200);
  });
});

describe("GET financial-sheet: access", () => {
  it("answers 404, 403 for COLABORADOR and a non-member COORDINADOR, 200 for a member, 200 for a flagged VIS and 403 for an unflagged one", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    for (const usuario of [colaborador, coordinador]) {
      authAs(usuario);
      expect((await GET(get(), ctx)).status, usuario.rol).toBe(403);
    }
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto({}, true));
    expect((await GET(get(), ctx)).status).toBe(200);
    // The gerencial flag is a real column since S9.2: it opens the read (aggregates only), nothing else.
    authAs(visualizador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
    expect((await GET(get(), ctx)).status).toBe(200);
    authAs({ ...visualizador, puede_ver_tablero_gerencial: false } as unknown as Usuario);
    expect((await GET(get(), ctx)).status).toBe(403);
  });
});
