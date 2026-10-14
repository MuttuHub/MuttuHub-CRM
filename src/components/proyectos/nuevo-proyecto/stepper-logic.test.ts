// Pure rules of the "Nuevo proyecto" stepper: which step is shown for a given URL, which steps can be
// opened, what each step looks like (done / active / pending) and the URLs the page navigates to.

import { describe, expect, it } from "vitest"
import {
  PASOS,
  estadoDePaso,
  hrefNuevoProyecto,
  pasoAnterior,
  pasoHabilitado,
  pasoSiguiente,
  resolverPaso,
} from "./stepper-logic"

describe("PASOS", () => {
  it("lists the five v7 steps in order", () => {
    expect(PASOS.map((p) => p.etiqueta)).toEqual(["General", "Metas", "Cronograma", "Presupuesto", "Revisión"])
    expect(PASOS.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5])
  })
})

describe("resolverPaso", () => {
  it("is always step 1 while no project exists, whatever the URL asks", () => {
    expect(resolverPaso(null, false)).toBe(1)
    expect(resolverPaso("3", false)).toBe(1)
    expect(resolverPaso("5", false)).toBe(1)
  })

  it("honours ?paso when a project exists", () => {
    expect(resolverPaso("2", true)).toBe(2)
    expect(resolverPaso("5", true)).toBe(5)
    expect(resolverPaso("1", true)).toBe(1)
  })

  it("lands on step 2 when a project exists and ?paso is missing or invalid", () => {
    expect(resolverPaso(null, true)).toBe(2)
    expect(resolverPaso("", true)).toBe(2)
    expect(resolverPaso("abc", true)).toBe(2)
    expect(resolverPaso("0", true)).toBe(2)
    expect(resolverPaso("6", true)).toBe(2)
    expect(resolverPaso("2.5", true)).toBe(2)
  })
})

describe("pasoHabilitado", () => {
  it("only step 1 is open without a project", () => {
    expect([1, 2, 3, 4, 5].map((n) => pasoHabilitado(n, false))).toEqual([true, false, false, false, false])
  })

  it("every step is open once the project exists", () => {
    expect([1, 2, 3, 4, 5].map((n) => pasoHabilitado(n, true))).toEqual([true, true, true, true, true])
  })
})

describe("estadoDePaso", () => {
  it("marks earlier steps as done, the current one as active and the rest as pending", () => {
    expect([1, 2, 3, 4, 5].map((n) => estadoDePaso(n, 3, true))).toEqual(["hecho", "hecho", "activo", "pendiente", "pendiente"])
  })

  it("step 1 is the only active step before the project exists", () => {
    expect([1, 2, 3, 4, 5].map((n) => estadoDePaso(n, 1, false))).toEqual(["activo", "pendiente", "pendiente", "pendiente", "pendiente"])
  })
})

describe("pasoSiguiente / pasoAnterior", () => {
  it("moves one step and stops at the ends", () => {
    expect(pasoSiguiente(2)).toBe(3)
    expect(pasoSiguiente(5)).toBeNull()
    expect(pasoAnterior(3)).toBe(2)
    expect(pasoAnterior(1)).toBeNull()
  })
})

describe("hrefNuevoProyecto", () => {
  it("builds the bare page URL", () => {
    expect(hrefNuevoProyecto({})).toBe("/proyectos/nuevo")
  })

  it("keeps the created project and the step so refresh/back land on the same place", () => {
    expect(hrefNuevoProyecto({ proyecto: "p-1", paso: 2 })).toBe("/proyectos/nuevo?proyecto=p-1&paso=2")
  })

  it("carries the preselected opportunity on the entry URL", () => {
    expect(hrefNuevoProyecto({ oportunidad: "op-1" })).toBe("/proyectos/nuevo?oportunidad=op-1")
  })

  it("encodes the ids", () => {
    expect(hrefNuevoProyecto({ proyecto: "a b" })).toBe("/proyectos/nuevo?proyecto=a%20b")
  })
})
