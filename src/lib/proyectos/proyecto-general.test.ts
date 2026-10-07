/**
 * Pure rules for a project's general data (S2.1b, REQ-CAT-03 / REQ-ORG-07).
 *
 * `validarLineas` owns the "1..n lines, exactly one principal" rule; the
 * 400 copy of the missing-principal case is pinned because REQ-CAT-03 quotes
 * it verbatim. `duracionProyecto` must stay a thin adapter over `durationWeeks`
 * (S0.5), so the delegation itself is asserted, not only the numbers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weeks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./weeks")>();
  return { ...actual, durationWeeks: vi.fn(actual.durationWeeks) };
});

import { duracionProyecto, isoDate, miembrosInicialesProyecto, validarLineas } from "./proyecto-general";
import { durationWeeks } from "./weeks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validarLineas", () => {
  it("accepts a single line already marked as principal", () => {
    expect(validarLineas([{ id: "linea-1", principal: true }])).toEqual({ ok: true });
  });

  it("accepts several lines when exactly one is principal", () => {
    expect(
      validarLineas([
        { id: "linea-1", principal: false },
        { id: "linea-2", principal: true },
        { id: "linea-3" },
      ]),
    ).toEqual({ ok: true });
  });

  it("rejects an empty selection with a clear Spanish message", () => {
    const result = validarLineas([]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Selecciona al menos una línea estratégica.");
    }
  });

  it("rejects two lines with none principal with the exact REQ-CAT-03 copy", () => {
    expect(validarLineas([{ id: "linea-1" }, { id: "linea-2" }])).toEqual({
      ok: false,
      message: "Marca una línea estratégica como principal.",
    });
  });

  it("rejects more than one principal", () => {
    const result = validarLineas([
      { id: "linea-1", principal: true },
      { id: "linea-2", principal: true },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Solo una línea estratégica puede ser la principal.");
    }
  });

  it("rejects the same line twice, which the composite primary key would refuse", () => {
    const result = validarLineas([{ id: "linea-1", principal: true }, { id: "linea-1" }]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("No repitas la misma línea estratégica.");
    }
  });
});

describe("miembrosInicialesProyecto", () => {
  it("always includes the responsable as the first member", () => {
    expect(miembrosInicialesProyecto("user-2", [])).toEqual(["user-2"]);
  });

  it("keeps the requested members in order after the responsable", () => {
    expect(miembrosInicialesProyecto("user-2", ["coord-9", "coord-10"])).toEqual([
      "user-2",
      "coord-9",
      "coord-10",
    ]);
  });

  it("collapses a miembro_ids entry that names the responsable (ADR-09)", () => {
    expect(miembrosInicialesProyecto("user-2", ["user-2", "coord-9", "user-2"])).toEqual([
      "user-2",
      "coord-9",
    ]);
  });
});

describe("duracionProyecto", () => {
  it("returns null when either date is absent", () => {
    expect(duracionProyecto(null, "2027-01-29")).toBeNull();
    expect(duracionProyecto("2026-10-05", null)).toBeNull();
    expect(duracionProyecto(undefined, undefined)).toBeNull();
  });

  it("returns the RF-07 week count", () => {
    expect(duracionProyecto("2026-10-05", "2027-01-29")).toBe(17);
    expect(duracionProyecto("2026-10-05", "2026-11-01")).toBe(4);
  });

  it("accepts the Date objects Prisma returns for @db.Date columns", () => {
    expect(
      duracionProyecto(new Date("2026-10-05T00:00:00.000Z"), new Date("2027-01-29T00:00:00.000Z")),
    ).toBe(17);
  });

  it("delegates the arithmetic to durationWeeks instead of reimplementing it", () => {
    duracionProyecto("2026-10-05", "2027-01-29");

    expect(vi.mocked(durationWeeks)).toHaveBeenCalledWith("2026-10-05", "2027-01-29");
  });
});

describe("isoDate", () => {
  it("renders a Date as the calendar date it stores", () => {
    expect(isoDate(new Date("2026-10-05T00:00:00.000Z"))).toBe("2026-10-05");
  });

  it("keeps only the date part of an ISO string", () => {
    expect(isoDate("2026-10-05T13:45:00.000Z")).toBe("2026-10-05");
  });
});
