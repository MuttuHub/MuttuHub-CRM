// Caracterización de `loadLiveProyecto` (T10): fija lo que el lector de la base hace HOY, antes de
// cambiar la clave del presupuesto de rubro a línea. No prueba la regla, prueba la forma exacta con la
// que el presupuesto vivo alimenta las versiones: si el refactor la mueve sin querer, esto se pone rojo.
//
// El lector recibe su cliente por parámetro (`Reader`), así que el doble es un objeto a mano y no hace
// falta mockear `@/lib/db`.
import { describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

import { loadLiveProyecto } from "./versiones"

const dinero = (valor: string) => new Prisma.Decimal(valor)

type Linea = {
  id: string
  rubro_id: string
  monto_proyectado_cop: Prisma.Decimal
  rubro: { codigo: string | null; nombre: string; activo: boolean }
  /** T10: null en las líneas heredadas; `{ codigo }` cuando la línea pertenece a una actividad. */
  actividad: { codigo: string } | null
}
type Celda = { linea_id: string; periodo: string; valor: Prisma.Decimal }

const proyecto = (over: Record<string, unknown> = {}) => ({
  valor_total: dinero("24000000.00"),
  fecha_inicio: new Date("2026-08-01T00:00:00.000Z"),
  fecha_fin: new Date("2027-03-31T00:00:00.000Z"),
  beneficiarios_meta: 120,
  ...over,
})

const linea = (id: string, rubroId: string, codigo: string | null, monto: string, actividad: string | null = null): Linea => ({
  id,
  rubro_id: rubroId,
  monto_proyectado_cop: dinero(monto),
  rubro: { codigo, nombre: `Rubro ${codigo ?? "sin código"}`, activo: true },
  actividad: actividad === null ? null : { codigo: actividad },
})

const celda = (lineaId: string, periodo: string, valor: string): Celda => ({
  linea_id: lineaId,
  periodo,
  valor: dinero(valor),
})

/** Cliente mínimo: sólo los siete delegados que el lector toca. */
const cliente = (input: { proyecto?: unknown; lineas?: Linea[]; celdas?: Celda[]; actividades?: unknown[] }) => ({
  proyecto: { findUniqueOrThrow: vi.fn(async () => input.proyecto ?? proyecto()) },
  lineaPresupuestal: { findMany: vi.fn(async () => input.lineas ?? []) },
  programacionPeriodo: { findMany: vi.fn(async () => input.celdas ?? []) },
  objetivo: { findMany: vi.fn(async () => [{ id: "o1", codigo: "1" }]) },
  actividad: {
    findMany: vi.fn(async () =>
      input.actividades ?? [
        { id: "a1", codigo: "1.1", objetivo_id: "o1", nombre: "Capacitación", semana_inicio: 1, semana_fin: 4 },
      ],
    ),
  },
  entregable: { findMany: vi.fn(async () => []) },
  indicador: { findMany: vi.fn(async () => []) },
})

describe("loadLiveProyecto — presupuesto vivo (T10)", () => {
  it("mapea una entrada por línea con su código de rubro y su asignado", async () => {
    const { live } = await loadLiveProyecto(
      cliente({ lineas: [linea("l1", "r12", "R12", "15000000.00")] }) as never,
      "pry-1",
    )
    expect(live?.presupuesto).toEqual([
      { rubro_codigo: "R12", codigo_linea: "R12", rubro_nombre: "Rubro R12", asignado: "15000000" },
    ])
  })

  it("deja fuera la línea sin asignado y sin programación, y conserva la que programa aunque valga cero (D6)", async () => {
    const { live } = await loadLiveProyecto(
      cliente({
        lineas: [linea("l1", "r12", "R12", "0.00"), linea("l2", "r13", "R13", "0.00"), linea("l3", "r14", "R14", "5000000.00")],
        celdas: [celda("l1", "2026-09", "1000000.00")],
      }) as never,
      "pry-1",
    )
    // l1 vale 0 pero programa: entra. l2 ni una cosa ni la otra: sale. l3 entra por su asignado.
    expect(live?.presupuesto.map((p) => p.rubro_codigo)).toEqual(["R12", "R14"])
  })

  it("ata cada celda de programación al código de rubro de su línea y descarta las de líneas ajenas", async () => {
    const { live } = await loadLiveProyecto(
      cliente({
        lineas: [linea("l1", "r12", "R12", "10000000.00")],
        celdas: [celda("l1", "2026-09", "2500000.00"), celda("ajena", "2026-09", "999.00")],
      }) as never,
      "pry-1",
    )
    expect(live?.programacion).toEqual([
      { rubro_codigo: "R12", codigo_linea: "R12", periodo: "2026-09", valor: "2500000" },
    ])
  })

  it("deriva la clave de la línea: ACT|RUBRO cuando tiene actividad, RUBRO cuando es heredada", async () => {
    // Dos líneas del mismo rubro (S5, D6), distinguibles por su actividad. Esto es lo que la migración
    // de T10 vuelve legal en la base y lo que el lector tiene que exponer para que no colapsen.
    const { live } = await loadLiveProyecto(
      cliente({
        lineas: [
          linea("l1", "r12", "R12", "15000000.00", "1.1"),
          linea("l2", "r12", "R12", "8000000.00", "1.2"),
          linea("l3", "r13", "R13", "5000000.00"),
        ],
      }) as never,
      "pry-1",
    )
    expect(live?.presupuesto.map((p) => p.codigo_linea)).toEqual(["1.1|R12", "1.2|R12", "R13"])
    // El código de rubro se conserva: es lo que leen las versiones guardadas antes de la Parte 2.
    expect(live?.presupuesto.map((p) => p.rubro_codigo)).toEqual(["R12", "R12", "R13"])
  })

  it("devuelve live nulo mientras la cabecera está incompleta, pero la entrada ya sirve", async () => {
    const { live, entrada } = await loadLiveProyecto(
      cliente({ proyecto: proyecto({ valor_total: null }), lineas: [linea("l1", "r12", "R12", "1000000.00")] }) as never,
      "pry-1",
    )
    expect(live).toBeNull()
    expect(entrada.lineas).toHaveLength(1)
    expect(entrada.valorTotal).toBeNull()
  })

  it("normaliza las celdas a centavos en la entrada, que es lo que valida la línea base", async () => {
    const { entrada } = await loadLiveProyecto(
      cliente({
        lineas: [linea("l1", "r12", "R12", "1000000.50")],
        celdas: [celda("l1", "2026-09", "1000000.50")],
      }) as never,
      "pry-1",
    )
    expect(entrada.programacion).toEqual([{ lineaId: "l1", rubroId: "r12", periodo: "2026-09", valor: BigInt(100000050) }])
    expect(entrada.lineas[0]?.asignado).toBe(BigInt(100000050))
  })
})
