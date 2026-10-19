import { describe, expect, it } from "vitest"
import { DOC_CATEGORIES, RESTRICTED_DOC_CATEGORIES } from "./catalogs"
import {
  AUTOMATIZACIONES_DEFAULT,
  defaultDocCategories,
  flattenDocCategories,
  parseAutomatizaciones,
  SETTING_AUTOMATIZACIONES,
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
    expect(SETTING_AUTOMATIZACIONES).toBe("automatizaciones")
  })
})

describe("parseAutomatizaciones", () => {
  it("returns the documented defaults when nothing is stored", () => {
    expect(parseAutomatizaciones(null)).toEqual({
      resumen_diario: true,
      dias_por_vencer: 3,
      categorias: { vencidos: true, hoy: true, proximos: true },
    })
    expect(AUTOMATIZACIONES_DEFAULT).toEqual({
      resumen_diario: true,
      dias_por_vencer: 3,
      categorias: { vencidos: true, hoy: true, proximos: true },
    })
  })

  it.each([undefined, "garbage", 42, true, []])(
    "falls back to the defaults for a non-object value (%s)",
    (raw) => {
      expect(parseAutomatizaciones(raw)).toEqual(AUTOMATIZACIONES_DEFAULT)
    },
  )

  it("keeps a fully valid stored value", () => {
    const stored = {
      resumen_diario: false,
      dias_por_vencer: 7,
      categorias: { vencidos: false, hoy: true, proximos: false },
    }
    expect(parseAutomatizaciones(stored)).toEqual(stored)
  })

  it("falls back per field when a single field is malformed", () => {
    expect(
      parseAutomatizaciones({
        resumen_diario: "si",
        dias_por_vencer: "7",
        categorias: "nope",
      }),
    ).toEqual(AUTOMATIZACIONES_DEFAULT)
  })

  it("fills only the missing categorias flags with their defaults", () => {
    expect(parseAutomatizaciones({ categorias: { hoy: false } })).toEqual({
      resumen_diario: true,
      dias_por_vencer: 3,
      categorias: { vencidos: true, hoy: false, proximos: true },
    })
  })

  it.each([0, -1, 1.5, 31, NaN, Infinity])(
    "rejects an out-of-range dias_por_vencer (%s) and keeps the default",
    (dias) => {
      expect(parseAutomatizaciones({ dias_por_vencer: dias }).dias_por_vencer).toBe(3)
    },
  )

  it("accepts a valid dias_por_vencer at the window bounds", () => {
    expect(parseAutomatizaciones({ dias_por_vencer: 1 }).dias_por_vencer).toBe(1)
    expect(parseAutomatizaciones({ dias_por_vencer: 30 }).dias_por_vencer).toBe(30)
  })

  it("does not mutate the shared default object and returns a fresh copy", () => {
    const parsed = parseAutomatizaciones({ resumen_diario: false })
    parsed.categorias.hoy = false
    expect(AUTOMATIZACIONES_DEFAULT.resumen_diario).toBe(true)
    expect(AUTOMATIZACIONES_DEFAULT.categorias.hoy).toBe(true)
  })
})