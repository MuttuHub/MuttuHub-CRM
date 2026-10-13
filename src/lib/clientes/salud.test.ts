import { describe, expect, it } from "vitest"
import {
  CONTACTO_DIAS_LIMITE,
  CONTACTO_DIAS_OPTIMO,
  MOTIVO_SIN_DATOS,
  MOTIVO_SIN_RIESGO,
  PESO_COMPROMISOS,
  PESO_CONTACTO,
  PESO_PROYECTOS,
  UMBRAL_ATENCION,
  UMBRAL_SANA,
  calcularSalud,
  clasificarBucket,
  motivoSalud,
  puntajeSalud,
  subscoreCompromisos,
  subscoreContacto,
  subscoreProyectos,
  type SaludSubscores,
} from "./salud"

describe("salud — score constants", () => {
  it("pins the prototype weights (40/35/25) and their sum", () => {
    expect([PESO_CONTACTO, PESO_COMPROMISOS, PESO_PROYECTOS]).toEqual([40, 35, 25])
    expect(PESO_CONTACTO + PESO_COMPROMISOS + PESO_PROYECTOS).toBe(100)
  })

  it("pins the buckets and the contact window", () => {
    expect(UMBRAL_SANA).toBe(75)
    expect(UMBRAL_ATENCION).toBe(45)
    expect(CONTACTO_DIAS_OPTIMO).toBe(15)
    expect(CONTACTO_DIAS_LIMITE).toBe(90)
  })
})

describe("subscoreContacto", () => {
  it("is 100 up to day 15 and 0 from day 90 on", () => {
    expect(subscoreContacto(0)).toBe(100)
    expect(subscoreContacto(CONTACTO_DIAS_OPTIMO)).toBe(100)
    expect(subscoreContacto(CONTACTO_DIAS_LIMITE)).toBe(0)
    expect(subscoreContacto(200)).toBe(0)
  })

  it("interpolates linearly between 15 and 90 and rounds to one decimal", () => {
    // 100 * (90 - 52.5) / 75 = 50
    expect(subscoreContacto(52.5)).toBe(50)
    // 100 * (90 - 74) / 75 = 21.333... -> 21.3
    expect(subscoreContacto(74)).toBe(21.3)
  })

  it("is unavailable (null) when the client has no entries at all", () => {
    expect(subscoreContacto(null)).toBeNull()
  })
})

describe("subscoreCompromisos", () => {
  it("treats a client with no open dated task (null) as unavailable", () => {
    expect(subscoreCompromisos(null)).toBeNull()
  })

  it("is 100 - 20·vencidos - 10·hoy - 5·proximos3", () => {
    expect(subscoreCompromisos({ vencidos: 0, hoy: 0, proximos3: 0 })).toBe(100)
    expect(subscoreCompromisos({ vencidos: 1, hoy: 0, proximos3: 0 })).toBe(80)
    expect(subscoreCompromisos({ vencidos: 0, hoy: 1, proximos3: 0 })).toBe(90)
    expect(subscoreCompromisos({ vencidos: 0, hoy: 0, proximos3: 1 })).toBe(95)
    expect(subscoreCompromisos({ vencidos: 3, hoy: 2, proximos3: 1 })).toBe(15)
  })

  it("never drops below 0", () => {
    expect(subscoreCompromisos({ vencidos: 3, hoy: 0, proximos3: 0 })).toBe(40)
    expect(subscoreCompromisos({ vencidos: 5, hoy: 0, proximos3: 0 })).toBe(0)
    expect(subscoreCompromisos({ vencidos: 10, hoy: 4, proximos3: 3 })).toBe(0)
  })
})

describe("subscoreProyectos", () => {
  it("is unavailable with no live project (or no derivable semaforo)", () => {
    expect(subscoreProyectos([])).toBeNull()
  })

  it("maps VERDE 100 / AMARILLO 60 / ROJO 20 and averages", () => {
    expect(subscoreProyectos(["verde"])).toBe(100)
    expect(subscoreProyectos(["amarillo"])).toBe(60)
    expect(subscoreProyectos(["rojo"])).toBe(20)
    expect(subscoreProyectos(["verde", "rojo"])).toBe(60)
    // (100 + 60 + 20) / 3 = 60
    expect(subscoreProyectos(["verde", "amarillo", "rojo"])).toBe(60)
    // (100 + 100 + 20) / 3 = 73.333... -> 73.3
    expect(subscoreProyectos(["verde", "verde", "rojo"])).toBe(73.3)
  })
})

describe("puntajeSalud — renormalisation over the available components", () => {
  const subs = (p: Partial<SaludSubscores>): SaludSubscores => ({
    contacto: null,
    compromisos: null,
    proyectos: null,
    ...p,
  })

  it("is null (never 0) when no component is available", () => {
    expect(puntajeSalud(subs({}))).toBeNull()
  })

  it("equals the single available component (its weight renormalised to 1)", () => {
    expect(puntajeSalud(subs({ contacto: 100 }))).toBe(100)
    expect(puntajeSalud(subs({ contacto: 0 }))).toBe(0)
  })

  it("renormalises the weights: (Σ w·s) / Σ w", () => {
    // (40·100 + 35·80) / 75 = 6800 / 75 = 90.666... -> 90.7
    expect(puntajeSalud(subs({ contacto: 100, compromisos: 80 }))).toBe(90.7)
    // (40·100) / 100 = 40
    expect(puntajeSalud(subs({ contacto: 100, compromisos: 0, proyectos: 0 }))).toBe(40)
    // (40·50 + 35·100 + 25·20) / 100 = (2000 + 3500 + 500) / 100 = 60
    expect(puntajeSalud(subs({ contacto: 50, compromisos: 100, proyectos: 20 }))).toBe(60)
  })
})

describe("clasificarBucket", () => {
  it("maps null to SIN_DATOS (never RIESGO)", () => {
    expect(clasificarBucket(null)).toBe("SIN_DATOS")
  })

  it("is >= 75 SANA, 45..74.99 ATENCION, < 45 RIESGO", () => {
    expect(clasificarBucket(100)).toBe("SANA")
    expect(clasificarBucket(UMBRAL_SANA)).toBe("SANA")
    expect(clasificarBucket(74.9)).toBe("ATENCION")
    expect(clasificarBucket(UMBRAL_ATENCION)).toBe("ATENCION")
    expect(clasificarBucket(44.9)).toBe("RIESGO")
    expect(clasificarBucket(0)).toBe("RIESGO")
  })
})

describe("calcularSalud — composition and motivo", () => {
  it("names the cold contact when it is the weakest signal", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: 74,
      compromisos: null,
      proyectosColores: [],
    })
    expect(result.subscores).toEqual({ contacto: 21.3, compromisos: null, proyectos: null })
    expect(result.score).toBe(21.3)
    expect(result.bucket).toBe("RIESGO")
    expect(result.motivo).toBe("Sin interacciones hace 74 días")
  })

  it("names overdue commitments and singularises a count of 1", () => {
    const tres = calcularSalud({
      diasUltimaInteraccion: 5,
      compromisos: { vencidos: 3, hoy: 0, proximos3: 0 },
      proyectosColores: [],
    })
    // (40·100 + 35·40) / 75 = 5400 / 75 = 72 -> ATENCION
    expect(tres.score).toBe(72)
    expect(tres.bucket).toBe("ATENCION")
    expect(tres.motivo).toBe("3 compromisos vencidos")

    const uno = calcularSalud({
      diasUltimaInteraccion: 5,
      compromisos: { vencidos: 1, hoy: 0, proximos3: 0 },
      proyectosColores: [],
    })
    expect(uno.motivo).toBe("1 compromiso vencido")
  })

  it("names red projects when that is the weakest signal", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: 5,
      compromisos: null,
      proyectosColores: ["rojo"],
    })
    // (40·100 + 25·20) / 65 = 4500 / 65 = 69.23... -> 69.2
    expect(result.score).toBe(69.2)
    expect(result.bucket).toBe("ATENCION")
    expect(result.motivo).toBe("Proyectos en rojo")
  })

  it("names yellow projects when no worse signal exists", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: 5,
      compromisos: null,
      proyectosColores: ["amarillo"],
    })
    expect(result.motivo).toBe("Proyectos en amarillo")
  })

  it("names today's commitments when the component falls below the SANA threshold", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: 5,
      compromisos: { vencidos: 0, hoy: 8, proximos3: 0 },
      proyectosColores: [],
    })
    // 100 - 10·8 = 20 < 75
    expect(result.motivo).toBe("8 compromisos para hoy")
  })

  it("reports no risk when everything available is healthy", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: 5,
      compromisos: { vencidos: 0, hoy: 0, proximos3: 0 },
      proyectosColores: ["verde"],
    })
    expect(result.score).toBe(100)
    expect(result.bucket).toBe("SANA")
    expect(result.motivo).toBe(MOTIVO_SIN_RIESGO)
  })

  it("puts a client with no entries at all and nothing else in SIN_DATOS, not RIESGO", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: null,
      compromisos: null,
      proyectosColores: [],
    })
    expect(result.subscores.contacto).toBeNull()
    expect(result.score).toBeNull()
    expect(result.bucket).toBe("SIN_DATOS")
    expect(result.motivo).toBe(MOTIVO_SIN_DATOS)
  })

  it("keeps contacto 0 (a real RIESGO) when the last entry is older than 90 days", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: 200,
      compromisos: null,
      proyectosColores: [],
    })
    // An entry exists, so contacto is available and floored at 0 — not SIN_DATOS.
    expect(result.subscores.contacto).toBe(0)
    expect(result.score).toBe(0)
    expect(result.bucket).toBe("RIESGO")
    expect(result.motivo).toBe("Sin interacciones hace 200 días")
  })

  it("judges a client with no entries by its measurable project", () => {
    const result = calcularSalud({
      diasUltimaInteraccion: null,
      compromisos: null,
      proyectosColores: ["rojo"],
    })
    expect(result.subscores).toEqual({ contacto: null, compromisos: null, proyectos: 20 })
    expect(result.score).toBe(20)
    expect(result.bucket).toBe("RIESGO")
    expect(result.motivo).toBe("Proyectos en rojo")
  })
})

describe("motivoSalud — the no-data case", () => {
  it("maps a null score to 'Sin datos suficientes'", () => {
    expect(
      motivoSalud(
        { diasUltimaInteraccion: null, compromisos: null, proyectosColores: [] },
        { contacto: null, compromisos: null, proyectos: null },
        null,
      ),
    ).toBe(MOTIVO_SIN_DATOS)
  })
})
