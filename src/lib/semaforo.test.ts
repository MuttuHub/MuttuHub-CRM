import { describe, expect, it } from "vitest";
import {
  avanceTecnico,
  colorFinanciero,
  colorIndicador,
  colorTecnico,
  resolverUmbrales,
  type UmbralesSemaforo,
} from "./semaforo";

// D10 confirmed values (2026-09-18) — used here purely as TEST DATA to prove
// the comparison reads its cut values from a parameter, never from a
// hardcoded constant in semaforo.ts (spec.md's "Cambio de parámetro sin
// despliegue" scenario, exercised below).
//
// proyecto-metas-tab (D4, corrected 2026-09-28): `indicador` is the KPI 3
// band (verde >= 90%, amarillo >= 60%), same ratio convention as
// tecnico/financiero.
const UMBRALES: UmbralesSemaforo = {
  confirmado: true,
  tecnico: { verde: 0.85, rojo: 0.6 },
  financiero: { verde_min: 0.85, verde_max: 1.15, amarillo_min: 0.6, amarillo_max: 1.4 },
  indicador: { verde: 0.9, amarillo: 0.6 },
};

describe("colorTecnico", () => {
  it("returns verde at exactly the configured green threshold (spec.md: razon >= T_verde)", () => {
    expect(colorTecnico(0.85, UMBRALES)).toBe("verde");
  });

  it("returns verde above the configured green threshold", () => {
    expect(colorTecnico(0.95, UMBRALES)).toBe("verde");
  });

  it("returns amarillo between the configured thresholds, inclusive of the red boundary", () => {
    expect(colorTecnico(0.6, UMBRALES)).toBe("amarillo");
    expect(colorTecnico(0.7, UMBRALES)).toBe("amarillo");
    expect(colorTecnico(0.8499, UMBRALES)).toBe("amarillo");
  });

  it("returns rojo strictly below the configured red threshold", () => {
    expect(colorTecnico(0.5999, UMBRALES)).toBe("rojo");
  });

  it("changes color for identical data when only the configured parameter changes — proves it is not hardcoded", () => {
    const razon = 0.7;
    expect(colorTecnico(razon, UMBRALES)).toBe("amarillo");

    const umbralesEstrictos: UmbralesSemaforo = {
      ...UMBRALES,
      tecnico: { verde: 0.5, rojo: 0.3 },
    };
    expect(colorTecnico(razon, umbralesEstrictos)).toBe("verde");
  });
});

describe("colorFinanciero (bidirectional, D10)", () => {
  it("returns verde within the balanced execution band", () => {
    expect(colorFinanciero(1.0, UMBRALES)).toBe("verde");
    expect(colorFinanciero(0.85, UMBRALES)).toBe("verde");
    expect(colorFinanciero(1.15, UMBRALES)).toBe("verde");
  });

  it("returns amarillo for a mild delay (below verde_min, above amarillo_min)", () => {
    expect(colorFinanciero(0.7, UMBRALES)).toBe("amarillo");
  });

  it("returns amarillo for a mild over-execution (above verde_max, below amarillo_max) — bidirectional", () => {
    expect(colorFinanciero(1.3, UMBRALES)).toBe("amarillo");
  });

  it("returns rojo for a severe delay", () => {
    expect(colorFinanciero(0.5, UMBRALES)).toBe("rojo");
  });

  it("returns rojo for severe over-execution — bidirectional, not only delay", () => {
    expect(colorFinanciero(1.5, UMBRALES)).toBe("rojo");
  });

  it("changes color for identical data when only the configured parameter changes", () => {
    const razon = 1.3;
    expect(colorFinanciero(razon, UMBRALES)).toBe("amarillo");

    const umbralesAmplios: UmbralesSemaforo = {
      ...UMBRALES,
      financiero: { ...UMBRALES.financiero, amarillo_max: 1.6 },
    };
    expect(colorFinanciero(razon, { ...UMBRALES, financiero: umbralesAmplios.financiero })).toBe("amarillo");

    const umbralesEstrictos: UmbralesSemaforo = {
      ...UMBRALES,
      financiero: { ...UMBRALES.financiero, amarillo_max: 1.2 },
    };
    expect(colorFinanciero(razon, umbralesEstrictos)).toBe("rojo");
  });
});

describe("colorIndicador — KPI 3, proyecto-metas-tab (D4)", () => {
  it("returns verde at exactly the configured green threshold", () => {
    expect(colorIndicador(0.9, UMBRALES)).toBe("verde");
  });

  it("returns verde above the configured green threshold", () => {
    expect(colorIndicador(1.0, UMBRALES)).toBe("verde");
  });

  it("returns amarillo between the configured thresholds, inclusive of the lower boundary", () => {
    expect(colorIndicador(0.6, UMBRALES)).toBe("amarillo");
    expect(colorIndicador(0.75, UMBRALES)).toBe("amarillo");
    expect(colorIndicador(0.8999, UMBRALES)).toBe("amarillo");
  });

  it("returns rojo strictly below the configured amarillo threshold", () => {
    expect(colorIndicador(0.5999, UMBRALES)).toBe("rojo");
  });

  it("returns rojo for an unmeasured indicator (razon 0)", () => {
    expect(colorIndicador(0, UMBRALES)).toBe("rojo");
  });

  it("changes color for identical data when only the configured parameter changes — proves it is not hardcoded", () => {
    const razon = 0.7;
    expect(colorIndicador(razon, UMBRALES)).toBe("amarillo");

    const umbralesEstrictos: UmbralesSemaforo = {
      ...UMBRALES,
      indicador: { verde: 0.5, amarillo: 0.3 },
    };
    expect(colorIndicador(razon, umbralesEstrictos)).toBe("verde");
  });
});

describe("avanceTecnico — Cálculo del Avance Técnico (RF-03)", () => {
  it("computes the weighted average: (100x2 + 40x1)/3 = 80", () => {
    const actividades = [
      { porcentaje_avance: 100, peso: 2 },
      { porcentaje_avance: 40, peso: 1 },
    ];
    expect(avanceTecnico(actividades)).toBeCloseTo(80);
  });

  it("returns 0 for a project without activities, never a division by zero", () => {
    expect(avanceTecnico([])).toBe(0);
    expect(Number.isNaN(avanceTecnico([]))).toBe(false);
  });

  it("ignores nothing and weighs every activity supplied", () => {
    const actividades = [
      { porcentaje_avance: 100, peso: 1 },
      { porcentaje_avance: 0, peso: 1 },
    ];
    expect(avanceTecnico(actividades)).toBeCloseTo(50);
  });
});

describe("resolverUmbrales — override del proyecto > setting de organización", () => {
  it("returns the organization defaults when there is no override", () => {
    expect(resolverUmbrales(UMBRALES, null)).toEqual(UMBRALES);
    expect(resolverUmbrales(UMBRALES, undefined)).toEqual(UMBRALES);
  });

  it("falls back to the organization defaults on an invalid override shape", () => {
    expect(resolverUmbrales(UMBRALES, { tecnico: "not-an-object" })).toEqual(UMBRALES);
    expect(resolverUmbrales(UMBRALES, "not-an-object-at-all")).toEqual(UMBRALES);
  });

  it("shallow-merges a valid partial override over the organization defaults", () => {
    const resultado = resolverUmbrales(UMBRALES, { tecnico: { verde: 0.9, rojo: 0.65 } });
    expect(resultado.tecnico).toEqual({ verde: 0.9, rojo: 0.65 });
    expect(resultado.financiero).toEqual(UMBRALES.financiero);
    expect(resultado.confirmado).toBe(UMBRALES.confirmado);
  });

  it("merges a project override for the indicador band (D4), same as tecnico/financiero", () => {
    const resultado = resolverUmbrales(UMBRALES, { indicador: { verde: 0.95, amarillo: 0.7 } });
    expect(resultado.indicador).toEqual({ verde: 0.95, amarillo: 0.7 });
    expect(resultado.tecnico).toEqual(UMBRALES.tecnico);
  });

  it("falls back to the organization's indicador band when the override omits it", () => {
    const resultado = resolverUmbrales(UMBRALES, { tecnico: { verde: 0.9, rojo: 0.65 } });
    expect(resultado.indicador).toEqual(UMBRALES.indicador);
  });
});
