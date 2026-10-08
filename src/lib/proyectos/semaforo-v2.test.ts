import { describe, expect, it } from "vitest";
import {
  PARAMETRO_KEYS,
  PARAMETROS_V2_DEFAULT,
  parametrosV2Issue,
  parseParametrosV2,
} from "./semaforo-v2";

describe("PARAMETROS_V2_DEFAULT", () => {
  it("carries the placeholder values, all unconfirmed", () => {
    expect(PARAMETROS_V2_DEFAULT).toEqual({
      umbral1: { valor: 10, confirmado: false },
      umbral2: { valor: 20, confirmado: false },
      tolerancia: { valor: 10, confirmado: false },
      retraso: { valor: 70, confirmado: false },
      avance_requiere_medio: { valor: true, confirmado: false },
      modificacion_bloquea_periodos_pasados: { valor: true, confirmado: false },
    });
    expect(PARAMETRO_KEYS).toHaveLength(6);
  });
});

describe("parseParametrosV2", () => {
  it("returns the defaults for null, non-objects and arrays", () => {
    for (const raw of [null, undefined, "x", 42, []]) {
      expect(parseParametrosV2(raw)).toEqual(PARAMETROS_V2_DEFAULT);
    }
  });

  it("keeps well-formed stored parameters", () => {
    const parsed = parseParametrosV2({
      umbral1: { valor: 5, confirmado: true },
      umbral2: { valor: 15, confirmado: false },
    });
    expect(parsed.umbral1).toEqual({ valor: 5, confirmado: true });
    expect(parsed.umbral2).toEqual({ valor: 15, confirmado: false });
    expect(parsed.retraso).toEqual(PARAMETROS_V2_DEFAULT.retraso);
  });

  it("falls back per parameter on malformed or out-of-range data", () => {
    const parsed = parseParametrosV2({
      tolerancia: { valor: "diez", confirmado: true },
      retraso: { valor: 150, confirmado: true },
      avance_requiere_medio: { valor: "si", confirmado: "yes" },
      modificacion_bloquea_periodos_pasados: { valor: false, confirmado: true },
    });
    expect(parsed.tolerancia).toEqual({ valor: 10, confirmado: false });
    expect(parsed.retraso).toEqual({ valor: 70, confirmado: false });
    expect(parsed.avance_requiere_medio).toEqual({ valor: true, confirmado: false });
    expect(parsed.modificacion_bloquea_periodos_pasados).toEqual({ valor: false, confirmado: true });
  });

  it("restores both thresholds when umbral1 is not below umbral2", () => {
    const parsed = parseParametrosV2({
      umbral1: { valor: 30, confirmado: true },
      umbral2: { valor: 20, confirmado: true },
    });
    expect(parsed.umbral1).toEqual(PARAMETROS_V2_DEFAULT.umbral1);
    expect(parsed.umbral2).toEqual(PARAMETROS_V2_DEFAULT.umbral2);
  });
});

describe("parametrosV2Issue", () => {
  it("is null for the defaults", () => {
    expect(parametrosV2Issue(PARAMETROS_V2_DEFAULT)).toBeNull();
  });

  it("flags umbral1 >= umbral2", () => {
    const bad = { ...PARAMETROS_V2_DEFAULT, umbral1: { valor: 25, confirmado: false } };
    expect(parametrosV2Issue(bad)).toMatch(/umbral/i);
  });
});
