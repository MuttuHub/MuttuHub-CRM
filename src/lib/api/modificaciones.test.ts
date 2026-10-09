import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveF_V1 } from "@/lib/proyectos/__fixtures__/versiones";

const mocks = vi.hoisted(() => ({
  loadLive: vi.fn(),
  parametros: { modificacion_bloquea_periodos_pasados: { valor: true, confirmado: false } },
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/versiones", () => ({ loadLiveProyecto: mocks.loadLive }));
vi.mock("@/lib/settings", () => ({ getSemaforoParametrosV2: vi.fn(async () => mocks.parametros) }));

import { evaluarSolicitud, loadEjecutadoPorRubro } from "./modificaciones";

const gasto = (codigo: string | null, monto: string) => ({ monto_cop: monto, linea: { rubro: { codigo } } });
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

describe("loadEjecutadoPorRubro", () => {
  it("sums the VALIDADO expenses per rubro code and skips legacy rubros without a code", async () => {
    const total = await loadEjecutadoPorRubro(cliente([gasto("R12", "1000.50"), gasto("R12", "2000"), gasto("R01", "5"), gasto(null, "9")]), "pry-1");
    expect(Object.fromEntries(total)).toEqual({ R12: BigInt(300050), R01: BigInt(500) });
  });
});

describe("evaluarSolicitud", () => {
  const traslado = [
    { elemento: "presupuesto" as const, clave: "R12", campo: "asignado", antes: "24000000", despues: "23000000" },
    { elemento: "presupuesto" as const, clave: "R13", campo: "asignado", antes: "12800000", despues: "13800000" },
    { elemento: "programacion" as const, clave: "R12|2027-01", campo: "valor", antes: "6000000", despues: "5000000" },
    { elemento: "programacion" as const, clave: "R13|2027-01", campo: "valor", antes: "3200000", despues: "4200000" },
  ];

  it("runs the rules with the validated E and the parameter of the settings", async () => {
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
