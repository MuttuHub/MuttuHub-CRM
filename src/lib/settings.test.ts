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
    const defaults = {
      resumen_diario: true,
      dias_por_vencer: 3,
      categorias: { vencidos: true, hoy: true, proximos: true },
      recordar_compromisos: { activo: true, dias: 2 },
      alertar_sin_contacto: { activo: true, dias: 30 },
    }
    expect(parseAutomatizaciones(null)).toEqual(defaults)
    expect(AUTOMATIZACIONES_DEFAULT).toEqual(defaults)
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
      recordar_compromisos: { activo: false, dias: 5 },
      alertar_sin_contacto: { activo: false, dias: 90 },
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
      ...AUTOMATIZACIONES_DEFAULT,
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

describe("parseAutomatizaciones — V8 rules", () => {
  it("defaults both rules on, 2 days before a commitment and 30 days without contact", () => {
    const parsed = parseAutomatizaciones({})
    expect(parsed.recordar_compromisos).toEqual({ activo: true, dias: 2 })
    expect(parsed.alertar_sin_contacto).toEqual({ activo: true, dias: 30 })
  })

  it("keeps a stored switch and threshold, filling the missing half with its default", () => {
    const parsed = parseAutomatizaciones({
      recordar_compromisos: { activo: false },
      alertar_sin_contacto: { dias: 45 },
    })
    expect(parsed.recordar_compromisos).toEqual({ activo: false, dias: 2 })
    expect(parsed.alertar_sin_contacto).toEqual({ activo: true, dias: 45 })
  })

  it.each([0, -1, 1.5, 31, "2", NaN])(
    "rejects an out-of-range recordar_compromisos.dias (%s) and keeps 2",
    (dias) => {
      expect(parseAutomatizaciones({ recordar_compromisos: { dias } }).recordar_compromisos.dias).toBe(2)
    },
  )

  it.each([0, -3, 2.5, 366, "30", Infinity])(
    "rejects an out-of-range alertar_sin_contacto.dias (%s) and keeps 30",
    (dias) => {
      expect(parseAutomatizaciones({ alertar_sin_contacto: { dias } }).alertar_sin_contacto.dias).toBe(30)
    },
  )

  it("accepts the thresholds at their bounds", () => {
    const low = parseAutomatizaciones({ recordar_compromisos: { dias: 1 }, alertar_sin_contacto: { dias: 1 } })
    const high = parseAutomatizaciones({ recordar_compromisos: { dias: 30 }, alertar_sin_contacto: { dias: 365 } })
    expect([low.recordar_compromisos.dias, low.alertar_sin_contacto.dias]).toEqual([1, 1])
    expect([high.recordar_compromisos.dias, high.alertar_sin_contacto.dias]).toEqual([30, 365])
  })

  it("falls back to the rule defaults when a rule is not an object", () => {
    const parsed = parseAutomatizaciones({ recordar_compromisos: true, alertar_sin_contacto: [] })
    expect(parsed.recordar_compromisos).toEqual({ activo: true, dias: 2 })
    expect(parsed.alertar_sin_contacto).toEqual({ activo: true, dias: 30 })
  })
})
