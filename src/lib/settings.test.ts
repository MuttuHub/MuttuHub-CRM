import { describe, expect, it, vi } from "vitest"
import { DOC_CATEGORIES, RESTRICTED_DOC_CATEGORIES, UMBRALES_SEMAFORO_DEFAULT } from "./catalogs"
import {
  defaultDocCategories,
  flattenDocCategories,
  getUmbralesSemaforo,
  SETTING_DOC_CATEGORIES,
  SETTING_SEMAFORO_UMBRALES,
  SETTING_TASK_TAGS,
} from "./settings"

vi.mock("@/lib/db", () => ({
  db: { setting: { findUnique: vi.fn() } },
}))

import { db } from "@/lib/db"

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

describe("getUmbralesSemaforo — backward-compat fill (proyecto-metas-tab, D4)", () => {
  it("returns the org default (including indicador) when no row is stored", async () => {
    vi.mocked(db.setting.findUnique).mockResolvedValue(null)
    const resultado = await getUmbralesSemaforo()
    expect(resultado).toEqual(UMBRALES_SEMAFORO_DEFAULT)
  })

  it("returns the stored value verbatim when it already has an indicador band", async () => {
    const stored = {
      ...UMBRALES_SEMAFORO_DEFAULT,
      indicador: { verde: 0.95, amarillo: 0.7 },
    }
    vi.mocked(db.setting.findUnique).mockResolvedValue({ value: stored } as never)
    const resultado = await getUmbralesSemaforo()
    expect(resultado.indicador).toEqual({ verde: 0.95, amarillo: 0.7 })
  })

  it("backfills indicador from the default when the stored row predates this change", async () => {
    const legacy: Record<string, unknown> = { ...UMBRALES_SEMAFORO_DEFAULT }
    delete legacy.indicador
    vi.mocked(db.setting.findUnique).mockResolvedValue({ value: legacy } as never)
    const resultado = await getUmbralesSemaforo()
    expect(resultado.indicador).toEqual(UMBRALES_SEMAFORO_DEFAULT.indicador)
    expect(resultado.tecnico).toEqual(legacy.tecnico)
  })
})

describe("setting keys", () => {
  it("exposes the documented setting keys", () => {
    expect(SETTING_TASK_TAGS).toBe("task_tags")
    expect(SETTING_DOC_CATEGORIES).toBe("doc_categories")
    // tablero-seguimiento-social (D10/T5, Fase 3a.7): matches the literal key
    // seeded by Unit 1's migration row ('semaforo_umbrales').
    expect(SETTING_SEMAFORO_UMBRALES).toBe("semaforo_umbrales")
  })
})