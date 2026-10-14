// Pure rules of the "Nuevo proyecto" stepper: which step is shown for a given URL, which steps can be
// opened, what each step looks like (done / active / pending) and the URLs the page navigates to.

import { describe, expect, it } from "vitest"
import {
  PASOS,
  datosDePaso,
  estadoDePaso,
  esProyectoAprobado,
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

describe("estadoDePaso once the baseline is approved", () => {
  it("marks the Revisión step done even while it is the active one", () => {
    expect(estadoDePaso(5, 5, true, true)).toBe("hecho")
    expect(estadoDePaso(5, 3, true, true)).toBe("hecho")
  })

  it("leaves the other steps as they were", () => {
    expect([1, 2, 3, 4].map((n) => estadoDePaso(n, 5, true, true))).toEqual(["hecho", "hecho", "hecho", "hecho"])
    expect([1, 2, 3, 4, 5].map((n) => estadoDePaso(n, 3, true, true))).toEqual(["hecho", "hecho", "activo", "pendiente", "hecho"])
  })
})

describe("esProyectoAprobado", () => {
  it("is true for any state past BORRADOR and false while still a draft", () => {
    expect(esProyectoAprobado("BORRADOR")).toBe(false)
    expect(esProyectoAprobado("EN_EJECUCION")).toBe(true)
  })
})

describe("datosDePaso", () => {
  it("returns the v7 copy of every step, Revisión included, before approval", () => {
    expect(datosDePaso(5, false)).toBe(PASOS[4])
    expect(datosDePaso(2, true)).toBe(PASOS[1])
  })

  it("swaps the Revisión copy for an approved state after approval", () => {
    const aprobado = datosDePaso(5, true)
    expect(aprobado.titulo).toBe("Línea base aprobada")
    expect(aprobado.descripcion).not.toMatch(/Confirma lo capturado/)
  })
})
