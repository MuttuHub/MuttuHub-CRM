import { describe, expect, it } from "vitest"
import { DOC_CATEGORIES, RESTRICTED_DOC_CATEGORIES } from "./catalogs"
import {
  defaultDocCategories,
  flattenDocCategories,
  SETTING_DOC_CATEGORIES,
  SETTING_TASK_TAGS,
} from "./settings"

describe("defaultDocCategories", () => {
  it("mirrors DOC_CATEGORIES in order, one entry each, without duplicates", () => {
    const result = defaultDocCategories()
    expect(result.map((c) => c.nombre)).toEqual([...DOC_CATEGORIES])
    expect(new Set(result.map((c) => c.nombre)).size).toBe(result.length)
  })

  it("marks exactly the RESTRICTED_DOC_CATEGORIES as restricted", () => {
    const result = defaultDocCategories()
    const restringidas = result.filter((c) => c.restringida).map((c) => c.nombre)
    expect(restringidas).toEqual([...RESTRICTED_DOC_CATEGORIES])
    for (const c of result) {
      expect(typeof c.restringida).toBe("boolean")
    }
  })
})

describe("flattenDocCategories", () => {
  it("splits a setting into categorias and restringidas keeping the order", () => {
    const setting = [
      { nombre: "Legal", restringida: true },
      { nombre: "Comercial", restringida: false },
      { nombre: "Informes", restringida: true },
    ]
    expect(flattenDocCategories(setting)).toEqual({
      categorias: ["Legal", "Comercial", "Informes"],
      restringidas: ["Legal", "Informes"],
    })
  })

  it("returns empty arrays for an empty setting", () => {
    expect(flattenDocCategories([])).toEqual({ categorias: [], restringidas: [] })
  })

  it("returns no restringidas when none are flagged", () => {
    const setting = [
      { nombre: "Comercial", restringida: false },
      { nombre: "Otro", restringida: false },
    ]
    expect(flattenDocCategories(setting)).toEqual({
      categorias: ["Comercial", "Otro"],
      restringidas: [],
    })
  })

  it("preserves duplicates from the setting (no dedup, current behavior)", () => {
    const setting = [
      { nombre: "Legal", restringida: true },
      { nombre: "Legal", restringida: false },
    ]
    expect(flattenDocCategories(setting)).toEqual({
      categorias: ["Legal", "Legal"],
      restringidas: ["Legal"],
    })
  })

  it("round-trips with defaultDocCategories", () => {
    const { categorias, restringidas } = flattenDocCategories(defaultDocCategories())
    expect(categorias).toEqual([...DOC_CATEGORIES])
    expect(restringidas).toEqual([...RESTRICTED_DOC_CATEGORIES])
  })
})

describe("setting keys", () => {
  it("exposes the documented setting keys", () => {
    expect(SETTING_TASK_TAGS).toBe("task_tags")
    expect(SETTING_DOC_CATEGORIES).toBe("doc_categories")
  })
})