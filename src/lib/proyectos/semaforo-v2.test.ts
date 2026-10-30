import { describe, expect, it } from "vitest";
import { toCents } from "./money";
import {
  alertaRetraso,
  colorFinancieroV2,
  toleranciaBp,
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
      tope_en_curso: { valor: 90, confirmado: false },
    });
    expect(PARAMETRO_KEYS).toHaveLength(7);
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

  it("round-trips a stored tope_en_curso", () => {
    const parsed = parseParametrosV2({ tope_en_curso: { valor: 95, confirmado: true } });
    expect(parsed.tope_en_curso).toEqual({ valor: 95, confirmado: true });
  });

  it("falls back per parameter on malformed or out-of-range data", () => {
    const parsed = parseParametrosV2({
      tolerancia: { valor: "diez", confirmado: true },
      retraso: { valor: 150, confirmado: true },
      avance_requiere_medio: { valor: "si", confirmado: "yes" },
      modificacion_bloquea_periodos_pasados: { valor: false, confirmado: true },
      tope_en_curso: { valor: 150, confirmado: true },
    });
    expect(parsed.tolerancia).toEqual({ valor: 10, confirmado: false });
    expect(parsed.retraso).toEqual({ valor: 70, confirmado: false });
    expect(parsed.avance_requiere_medio).toEqual({ valor: true, confirmado: false });
    expect(parsed.modificacion_bloquea_periodos_pasados).toEqual({ valor: false, confirmado: true });
    expect(parsed.tope_en_curso).toEqual({ valor: 90, confirmado: false });
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

describe("colorFinancieroV2", () => {
  const tol = BigInt(1000);
  const c = (a: string, p: string, e: string) => ({ A: toCents(a), P: toCents(p), E: toCents(e) });

  it("E <= P is verde, boundary included", () => {
    expect(colorFinancieroV2(c("100", "50", "50"), tol)).toBe("verde");
    expect(colorFinancieroV2(c("100", "50", "10"), tol)).toBe("verde");
  });
  it("amarillo up to P*1.1 and rojo one cent above", () => {
    expect(colorFinancieroV2(c("24000000", "12000000", "13200000.00"), tol)).toBe("amarillo");
    expect(colorFinancieroV2(c("24000000", "12000000", "13200000.01"), tol)).toBe("rojo");
  });
  it("E > A is rojo even when E <= P (unbalanced draft)", () => {
    expect(colorFinancieroV2(c("40", "100", "50"), tol)).toBe("rojo");
  });
  it("P = 0 with E > 0 is rojo; 0/0 is verde", () => {
    expect(colorFinancieroV2(c("100", "0", "1"), tol)).toBe("rojo");
    expect(colorFinancieroV2(c("100", "0", "0"), tol)).toBe("verde");
  });
});

describe("toleranciaBp", () => {
  it("converts percent to integer basis points without float noise", () => {
    expect(toleranciaBp({ valor: 10, confirmado: false })).toBe(BigInt(1000));
    expect(toleranciaBp({ valor: 7.35, confirmado: true })).toBe(BigInt(735));
  });
});

describe("alertaRetraso", () => {
  it("needs ep < 70% and a non-verde technical color; null ep never", () => {
    expect(alertaRetraso({ epTenths: BigInt(600), colorTecnico: "rojo" }, 70)).toBe(true);
    expect(alertaRetraso({ epTenths: BigInt(600), colorTecnico: "amarillo" }, 70)).toBe(true);
    expect(alertaRetraso({ epTenths: BigInt(600), colorTecnico: "verde" }, 70)).toBe(false);
    expect(alertaRetraso({ epTenths: BigInt(700), colorTecnico: "rojo" }, 70)).toBe(false);
    expect(alertaRetraso({ epTenths: null, colorTecnico: "rojo" }, 70)).toBe(false);
  });
  it("90,8 % with technical rojo raises no alert", () => {
    expect(alertaRetraso({ epTenths: BigInt(908), colorTecnico: "rojo" }, 70)).toBe(false);
  });
});
