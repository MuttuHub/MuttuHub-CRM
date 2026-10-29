// B7 (S3): the project estado transitions, as pure data shared by the API and the ficha.

import { describe, expect, it } from "vitest";
import { ACCIONES_ESTADO, accionesDisponibles, destinoDeAccion, estaCongelado } from "./transiciones-estado";

describe("destinoDeAccion", () => {
  it.each([
    ["SUSPENDER", "EN_EJECUCION", "SUSPENDIDO"],
    ["REACTIVAR", "SUSPENDIDO", "EN_EJECUCION"],
    ["CERRAR", "EN_EJECUCION", "CERRADO"],
    ["REABRIR", "CERRADO", "EN_EJECUCION"],
    ["CANCELAR", "BORRADOR", "CANCELADO"],
    ["CANCELAR", "EN_EJECUCION", "CANCELADO"],
    ["CANCELAR", "SUSPENDIDO", "CANCELADO"],
  ] as const)("%s from %s goes to %s", (accion, desde, hacia) => {
    expect(destinoDeAccion(accion, desde)).toBe(hacia);
  });

  it("answers null for every other pair, so CANCELADO is terminal", () => {
    const validos = new Set([
      "SUSPENDER:EN_EJECUCION",
      "REACTIVAR:SUSPENDIDO",
      "CERRAR:EN_EJECUCION",
      "REABRIR:CERRADO",
      "CANCELAR:BORRADOR",
      "CANCELAR:EN_EJECUCION",
      "CANCELAR:SUSPENDIDO",
    ]);
    const estados = ["PLANIFICACION", "BORRADOR", "EN_EJECUCION", "SUSPENDIDO", "CERRADO", "CANCELADO"] as const;
    for (const accion of ACCIONES_ESTADO) {
      for (const estado of estados) {
        if (validos.has(`${accion}:${estado}`)) continue;
        expect(destinoDeAccion(accion, estado), `${accion} from ${estado}`).toBeNull();
      }
    }
  });
});

describe("estaCongelado", () => {
  it("is true only for SUSPENDIDO, CERRADO and CANCELADO (S5)", () => {
    expect(["SUSPENDIDO", "CERRADO", "CANCELADO"].every((e) => estaCongelado(e))).toBe(true);
    expect(["PLANIFICACION", "BORRADOR", "EN_EJECUCION"].some((e) => estaCongelado(e))).toBe(false);
  });
});

describe("accionesDisponibles", () => {
  it("lists the actions valid for each estado", () => {
    expect(accionesDisponibles("BORRADOR")).toEqual(["CANCELAR"]);
    expect(accionesDisponibles("EN_EJECUCION")).toEqual(["SUSPENDER", "CERRAR", "CANCELAR"]);
    expect(accionesDisponibles("SUSPENDIDO")).toEqual(["REACTIVAR", "CANCELAR"]);
    expect(accionesDisponibles("CERRADO")).toEqual(["REABRIR"]);
    expect(accionesDisponibles("CANCELADO")).toEqual([]);
    expect(accionesDisponibles("PLANIFICACION")).toEqual([]);
  });
});
