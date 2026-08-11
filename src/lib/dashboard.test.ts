import { describe, expect, it } from "vitest"
import {
  clienteScopeWhere,
  parseDashboardFilters,
  rangoDeFechas,
  rangoDeFechasNullable,
  resolveScope,
  tareaScopeWhere,
} from "./dashboard"

const url = (query: string) => new URL(`http://localhost/api/dashboard?${query}`)

describe("resolveScope", () => {
  it("maps COLABORADOR to own", () => {
    expect(resolveScope({ rol: "COLABORADOR" })).toBe("own")
  })

  it.each(["ADMINISTRADOR", "GERENCIA", "COORDINADOR"] as const)(
    "maps %s to all",
    (rol) => {
      expect(resolveScope({ rol })).toBe("all")
    },
  )
})

describe("parseDashboardFilters", () => {
  it("returns empty filters when no params are present", () => {
    const res = parseDashboardFilters(url(""))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.filters).toEqual({
        desde: undefined,
        hasta: undefined,
        responsable_id: undefined,
        tipo_cliente: undefined,
      })
    }
  })

  it("passes through valid filters", () => {
    const res = parseDashboardFilters(
      url("desde=2026-01-01&hasta=2026-03-31&responsable_id=uu-1&tipo_cliente=FUNDACION"),
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.filters).toEqual({
        desde: "2026-01-01",
        hasta: "2026-03-31",
        responsable_id: "uu-1",
        tipo_cliente: "FUNDACION",
      })
    }
  })

  it("normalizes only absent params, passing empty strings through (current behavior)", () => {
    const res = parseDashboardFilters(url("desde=&tipo_cliente=&responsable_id="))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.filters).toEqual({
        desde: "",
        hasta: undefined,
        responsable_id: "",
        tipo_cliente: "",
      })
    }
  })

  it.each(["desde", "hasta"])(
    "rejects a malformed %s date with 400 VALIDATION_ERROR",
    async (param) => {
      const res = parseDashboardFilters(url(`${param}=01-01-2026`))
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.response.status).toBe(400)
        const body = await res.response.json()
        expect(body).toMatchObject({ code: "VALIDATION_ERROR" })
        expect(String(body.error)).toContain("YYYY-MM-DD")
      }
    },
  )

  it("rejects an inverted range (desde > hasta)", async () => {
    const res = parseDashboardFilters(url("desde=2026-03-31&hasta=2026-01-01"))
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      expect(await res.response.json()).toMatchObject({ code: "VALIDATION_ERROR" })
    }
  })

  it("accepts a same-day range", () => {
    const res = parseDashboardFilters(url("desde=2026-01-15&hasta=2026-01-15"))
    expect(res.ok).toBe(true)
  })

  it("rejects an unknown tipo_cliente", async () => {
    const res = parseDashboardFilters(url("tipo_cliente=ONG_DESCONOCIDA"))
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      expect(await res.response.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        error: "Tipo de cliente no válido.",
      })
    }
  })

  it("accepts any non-empty responsable_id without validation (current behavior)", () => {
    const res = parseDashboardFilters(url("responsable_id=no-es-un-uuid"))
    expect(res.ok).toBe(true)
  })
})

describe("rangoDeFechas", () => {
  it("builds an inclusive range from gte (UTC parse of desde) to local end of hasta day", () => {
    const r = rangoDeFechas({ desde: "2026-01-15", hasta: "2026-03-31" })
    expect(r).toBeDefined()
    // date-only ISO strings parse as UTC (ECMA-262), TZ-independent
    expect(new Date(r!.gte!).toISOString()).toBe("2026-01-15T00:00:00.000Z")
    // lte = endOfDay of the UTC-parsed hasta instant: the local wall clock is
    // always set to 23:59:59.999 (checked via local getters, valid in any TZ)
    const lte = r!.lte as Date
    const expectedLte = new Date("2026-03-31")
    expectedLte.setHours(23, 59, 59, 999)
    expect(lte.getTime()).toBe(expectedLte.getTime())
    expect(lte.getHours()).toBe(23)
    expect(lte.getMinutes()).toBe(59)
    expect(lte.getSeconds()).toBe(59)
    expect(lte.getMilliseconds()).toBe(999)
  })

  it("uses only gte when hasta is missing", () => {
    const r = rangoDeFechas({ desde: "2026-06-01" })
    expect(r).toEqual({ gte: new Date("2026-06-01") })
    expect(r).not.toHaveProperty("lte")
  })

  it("uses only lte when desde is missing", () => {
    const r = rangoDeFechas({ hasta: "2026-06-30" })
    expect(r).toBeDefined()
    expect(r).not.toHaveProperty("gte")
    expect(r!.lte).toBeInstanceOf(Date)
  })

  it("returns undefined when no dates are given", () => {
    expect(rangoDeFechas({})).toBeUndefined()
    expect(rangoDeFechas({ responsable_id: "x" })).toBeUndefined()
  })

  it("spans the year-boundary day inclusively (local wall clock untouched by TZ)", () => {
    const r = rangoDeFechas({ desde: "2026-12-31", hasta: "2026-12-31" })
    expect(r).toBeDefined()
    expect(new Date(r!.gte!).toISOString()).toBe("2026-12-31T00:00:00.000Z")
    const lte = r!.lte as Date
    const expectedLte = new Date("2026-12-31")
    expectedLte.setHours(23, 59, 59, 999)
    expect(lte.getTime()).toBe(expectedLte.getTime())
    expect(lte.getHours()).toBe(23)
  })

  it("rangoDeFechasNullable delegates and returns the same range", () => {
    const filters = { desde: "2026-02-01", hasta: "2026-02-28" }
    expect(rangoDeFechasNullable(filters)).toEqual(rangoDeFechas(filters))
    expect(rangoDeFechasNullable({})).toBeUndefined()
  })
})

describe("clienteScopeWhere", () => {
  const usuario = { id: "usuario-1" }

  it("forces responsable_id = self in scope own, ignoring the filter", () => {
    const where = clienteScopeWhere("own", usuario, { responsable_id: "otro" })
    expect(where).toEqual({
      deleted_at: null,
      responsable_id: "usuario-1",
    })
  })

  it("honors the responsable_id filter in scope all", () => {
    const where = clienteScopeWhere("all", usuario, { responsable_id: "otro" })
    expect(where).toEqual({
      deleted_at: null,
      responsable_id: "otro",
    })
  })

  it("omits responsable_id in scope all without the filter", () => {
    const where = clienteScopeWhere("all", usuario, {})
    expect(where).toEqual({ deleted_at: null })
    expect(where).not.toHaveProperty("responsable_id")
  })

  it("applies tipo_cliente in both scopes", () => {
    expect(clienteScopeWhere("own", usuario, { tipo_cliente: "FUNDACION" })).toEqual({
      deleted_at: null,
      responsable_id: "usuario-1",
      tipo_cliente: "FUNDACION",
    })
    expect(clienteScopeWhere("all", usuario, { tipo_cliente: "FUNDACION" })).toEqual({
      deleted_at: null,
      tipo_cliente: "FUNDACION",
    })
  })
})

describe("tareaScopeWhere", () => {
  const usuario = { id: "usuario-1" }

  it("forces responsable_id = self in scope own, ignoring the filter", () => {
    const where = tareaScopeWhere("own", usuario, { responsable_id: "otro" })
    expect(where.responsable_id).toBe("usuario-1")
    expect(where).not.toHaveProperty("cliente")
  })

  it("honors the responsable_id filter in scope all", () => {
    const where = tareaScopeWhere("all", usuario, { responsable_id: "otro" })
    expect(where.responsable_id).toBe("otro")
  })

  it("omits responsable_id in scope all without the filter", () => {
    const where = tareaScopeWhere("all", usuario, {})
    expect(where).toEqual({ deleted_at: null })
    expect(where).not.toHaveProperty("responsable_id")
  })

  it("filters tipo_cliente through the linked client", () => {
    const where = tareaScopeWhere("all", usuario, { tipo_cliente: "EMPRESA_PRIVADA" })
    expect(where.cliente).toEqual({ is: { tipo_cliente: "EMPRESA_PRIVADA" } })
  })

  it("merges extra and lets it override base keys (spread last)", () => {
    const where = tareaScopeWhere("own", usuario, {}, {
      estado: "POR_HACER",
      deleted_at: { not: null },
    })
    expect(where.estado).toBe("POR_HACER")
    expect(where.deleted_at).toEqual({ not: null })
  })
})