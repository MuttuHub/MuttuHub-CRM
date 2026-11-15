import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveF_V1 } from "@/lib/proyectos/__fixtures__/versiones";

const mocks = vi.hoisted(() => ({
  loadLive: vi.fn(),
  parametros: { modificacion_bloquea_periodos_pasados: { valor: true, confirmado: false } },
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/versiones", () => ({ loadLiveProyecto: mocks.loadLive }));
vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn(async () => mocks.parametros) }));

import { evaluarSolicitud, loadEjecutadoPorLinea } from "./modificaciones";

const lineaDe = (codigo: string | null, actividad: string | null = null) => ({
  rubro: { codigo },
  actividad: actividad === null ? null : { codigo: actividad },
});
const gasto = (
  codigo: string | null,
  monto: string,
  actividad: string | null = null,
  repartos: { valor: string; linea: ReturnType<typeof lineaDe> }[] = [],
) => ({
  monto_cop: monto,
  linea: lineaDe(codigo, actividad),
  repartos,
});
const cliente = (gastos: unknown[], rubros: unknown[] = []) =>
  ({
    gasto: { findMany: vi.fn(async () => gastos) },
    rubro: { findMany: vi.fn(async () => rubros) },
  }) as never;

beforeEach(() => {
  // The current month decides which cells are frozen: pin the clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T17:00:00.000Z"));
  mocks.loadLive.mockResolvedValue({ entrada: {}, live: liveF_V1() });
  mocks.parametros.modificacion_bloquea_periodos_pasados.valor = true;
});

afterEach(() => vi.useRealTimers());

describe("loadEjecutadoPorLinea", () => {
  it("sums the executed expenses per legacy line (its rubro code) and skips legacy rubros without a code", async () => {
    const total = await loadEjecutadoPorLinea(cliente([gasto("R12", "1000.50"), gasto("R12", "2000"), gasto("R01", "5"), gasto(null, "9")]), "pry-1");
    expect(Object.fromEntries(total)).toEqual({ R12: BigInt(300050), R01: BigInt(500) });
  });

  it("keys an activity line by ACT|RUBRO, so two lines of one rubro add up apart (T13 S5)", async () => {
    const total = await loadEjecutadoPorLinea(cliente([gasto("R12", "100", "1.1"), gasto("R12", "40", "1.2"), gasto("R12", "1", "1.1")]), "pry-1");
    expect(Object.fromEntries(total)).toEqual({ "1.1|R12": BigInt(10100), "1.2|R12": BigInt(4000) });
  });

  // T14 cross-lane debt: a split invoice is executed row by row, never whole on its header's line.
  it("puts each row of a split invoice on its own line and keeps a gasto without rows on its header (S9)", async () => {
    const repartida = gasto("R12", "1000000", "1.2", [
      { valor: "350000", linea: lineaDe("R12", "1.2") },
      { valor: "650000", linea: lineaDe("R12", "1.3") },
    ]);
    const total = await loadEjecutadoPorLinea(cliente([repartida, gasto("R12", "10", "1.2")]), "pry-1");
    expect(Object.fromEntries(total)).toEqual({ "1.2|R12": BigInt(35001000), "1.3|R12": BigInt(65000000) });
  });

  it("reads REGISTRADO and VALIDADO: a registered expense already counts as executed (AJ-08)", async () => {
    const findMany = vi.fn(async () => []);
    await loadEjecutadoPorLinea({ gasto: { findMany } } as never, "pry-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proyecto_id: "pry-1", estado: { in: ["REGISTRADO", "VALIDADO"] } },
      }),
    );
  });
});

describe("evaluarSolicitud", () => {
  const traslado = [
    { elemento: "presupuesto" as const, clave: "R12", campo: "asignado", antes: "24000000", despues: "23000000" },
    { elemento: "presupuesto" as const, clave: "R13", campo: "asignado", antes: "12800000", despues: "13800000" },
    { elemento: "programacion" as const, clave: "R12|2027-01", campo: "valor", antes: "6000000", despues: "5000000" },
    { elemento: "programacion" as const, clave: "R13|2027-01", campo: "valor", antes: "3200000", despues: "4200000" },
  ];

  it("runs the rules with the executed E and the parameter of the settings", async () => {
    const { reglas } = await evaluarSolicitud(cliente([gasto("R12", "23500000")]), "pry-1", { tipo: "TRASLADO", detalle: traslado });
    expect(reglas.map((r) => r.codigo)).toEqual(["A_MENOR_QUE_EJECUTADO"]);
  });

  it("accepts a clean request", async () => {
    const { reglas } = await evaluarSolicitud(cliente([]), "pry-1", { tipo: "TRASLADO", detalle: traslado });
    expect(reglas).toEqual([]);
  });

  it("refuses a rubro that is not in the catalog (or is suspended) before the rules run", async () => {
    const detalle = [
      { elemento: "presupuesto" as const, clave: "R99", campo: "asignado", antes: "0", despues: "100" },
      { elemento: "programacion" as const, clave: "R99|2026-10", campo: "valor", antes: "0", despues: "100" },
    ];
    const { reglas } = await evaluarSolicitud(cliente([], []), "pry-1", { tipo: "ADICION", detalle });
    expect(reglas).toEqual([
      { codigo: "ELEMENTO_INEXISTENTE", clave: "R99", mensaje: "El rubro «R99» no existe o está suspendido." },
    ]);
  });

  it("reads an existing activity line by its line key, without looking it up in the catalog (T13 S5)", async () => {
    const live = liveF_V1();
    mocks.loadLive.mockResolvedValue({
      entrada: {},
      live: {
        ...live,
        presupuesto: live.presupuesto.map((r) => ({ ...r, codigo_linea: r.rubro_codigo === "R12" ? "1.2|R12" : r.rubro_codigo })),
        programacion: live.programacion.map((c) => ({ ...c, codigo_linea: c.rubro_codigo === "R12" ? "1.2|R12" : c.rubro_codigo })),
      },
    });
    const porLinea = traslado.map((i) => ({ ...i, clave: i.clave.replace(/^R12/, "1.2|R12") }));
    const rubro = vi.fn(async () => []);
    const { reglas } = await evaluarSolicitud({ gasto: { findMany: vi.fn(async () => []) }, rubro: { findMany: rubro } } as never, "pry-1", { tipo: "TRASLADO", detalle: porLinea });
    expect(reglas).toEqual([]);
    expect(rubro).not.toHaveBeenCalled();
  });

  it("brings a catalog rubro into the budget with its name", async () => {
    const detalle = [
      { elemento: "presupuesto" as const, clave: "R20", campo: "asignado", antes: "0", despues: "100" },
      { elemento: "programacion" as const, clave: "R20|2026-12", campo: "valor", antes: "0", despues: "100" },
    ];
    const { reglas, catalogo } = await evaluarSolicitud(cliente([], [{ codigo: "R20", nombre: "Imprevistos" }]), "pry-1", { tipo: "ADICION", detalle });
    expect(reglas).toEqual([]);
    expect(catalogo.get("R20")).toBe("Imprevistos");
  });
});
