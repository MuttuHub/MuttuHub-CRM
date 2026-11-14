// Caracterización de las dos vistas que agregan dinero por rubro (T10, S5): `loadBudgetView` y
// `loadProgrammingView`. Fija lo que hacen HOY, antes de que el presupuesto pase de agrupar por
// rubro a agrupar por línea: si el refactor mueve una suma sin querer, esto se pone rojo.
//
// Las dos funciones reciben su `client` por parámetro (`BudgetReader` / `ProgrammingReader`), así
// que el doble es un objeto a mano con sólo los delegados que cada una lee; no hace falta mockear
// `@/lib/db`.
import { describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"

import { loadBudgetView, loadProgrammingView } from "./presupuesto"

const PERIODOS = ["2026-10", "2026-11", "2026-12", "2027-01"]

const dinero = (valor: string) => new Prisma.Decimal(valor)

type Rubro = { id: string; codigo: string | null; nombre: string; activo: boolean; orden: number }
type Linea = { id: string; rubro_id: string; monto_proyectado_cop: Prisma.Decimal }
type Celda = { id: string; linea_id: string; periodo: string; valor: Prisma.Decimal }
type LineaConRubro = Linea & { rubro: { codigo: string | null; nombre: string; orden: number; activo: boolean } }

const rubro = (id: string, codigo: string | null, nombre: string, orden: number, activo = true): Rubro => ({
  id,
  codigo,
  nombre,
  orden,
  activo,
})

const linea = (id: string, rubroId: string, monto: string): Linea => ({
  id,
  rubro_id: rubroId,
  monto_proyectado_cop: dinero(monto),
})

/** La línea tal como la devuelve `loadProgrammingView`: con su rubro embebido. */
const lineaConRubro = (fila: Linea, catalogo: Rubro): LineaConRubro => ({
  ...fila,
  rubro: { codigo: catalogo.codigo, nombre: catalogo.nombre, orden: catalogo.orden, activo: catalogo.activo },
})

const celda = (lineaId: string, periodo: string, valor: string): Celda => ({
  id: `${lineaId}-${periodo}`,
  linea_id: lineaId,
  periodo,
  valor: dinero(valor),
})

/** Cliente mínimo de `loadBudgetView`: el catálogo de rubros y las líneas del proyecto. */
const clientePresupuesto = (rubros: Rubro[], lineas: Linea[]) => ({
  rubro: { findMany: async () => rubros },
  lineaPresupuestal: { findMany: async () => lineas },
})

/** Cliente mínimo de `loadProgrammingView`: las líneas con su rubro y las celdas del proyecto. */
const clienteProgramacion = (lineas: LineaConRubro[], celdas: Celda[]) => ({
  lineaPresupuestal: { findMany: async () => lineas },
  programacionPeriodo: { findMany: async () => celdas },
})

// Las funciones se llaman sin tipo por el `as never`: `BudgetReader` y `ProgrammingReader` son
// `Pick<Prisma.TransactionClient, …>` y el doble sólo implementa los delegados que se usan.
describe("presupuesto — el dinero por rubro (T10)", () => {
  it("loadBudgetView suma una línea por rubro y deja la diferencia contra el valor total", async () => {
    const view = await loadBudgetView(
      // El catálogo llega desordenado a propósito: la vista ordena por `orden`, no por el input.
      clientePresupuesto(
        [rubro("r12", "R12", "Transporte", 12), rubro("r01", "R01", "Personal", 1)],
        [linea("l12", "r12", "24000000.00"), linea("l01", "r01", "59500000.00")],
      ) as never,
      "pry-1",
      "BORRADOR",
      "83500000.00",
    )
    expect(view.rubros).toEqual([
      {
        rubro_id: "r01",
        codigo: "R01",
        nombre: "Personal",
        activo: true,
        linea_id: "l01",
        asignado: "59500000.00",
        heredado_pendiente: false,
      },
      {
        rubro_id: "r12",
        codigo: "R12",
        nombre: "Transporte",
        activo: true,
        linea_id: "l12",
        asignado: "24000000.00",
        heredado_pendiente: false,
      },
    ])
    expect(view.suma).toBe("83500000.00")
    expect(view.diferencia).toBe("0.00")
  })

  it("loadBudgetView suma las dos líneas de un mismo rubro en vez de quedarse con una", async () => {
    // T10: con una línea por actividad, un rubro puede tener varias. Antes el mapa por rubro se
    // quedaba con la última y 15.000.000 desaparecían de `suma` (falseando `diferencia`, que alimenta la
    // precondición de la línea base). Ahora el renglón del rubro es su suma y no apunta a una línea.
    const view = await loadBudgetView(
      clientePresupuesto(
        [rubro("r12", "R12", "Transporte", 12)],
        [linea("l1", "r12", "15000000.00"), linea("l2", "r12", "8000000.00")],
      ) as never,
      "pry-1",
      "BORRADOR",
      "23000000.00",
    )
    expect(view.rubros).toHaveLength(1)
    expect(view.rubros[0]).toMatchObject({ rubro_id: "r12", linea_id: null, asignado: "23000000.00" })
    expect(view.suma).toBe("23000000.00")
    expect(view.diferencia).toBe("0.00")
  })

  it("loadBudgetView deja linea_id cuando el rubro tiene una sola línea, como hasta hoy", async () => {
    const view = await loadBudgetView(
      clientePresupuesto([rubro("r12", "R12", "Transporte", 12)], [linea("l1", "r12", "15000000.00")]) as never,
      "pry-1",
      "BORRADOR",
      "15000000.00",
    )
    expect(view.rubros[0]).toMatchObject({ linea_id: "l1", asignado: "15000000.00" })
  })

  it("loadBudgetView conserva el rubro inactivo que todavía tiene línea y deja sin línea al activo que no la tiene", async () => {
    const view = await loadBudgetView(
      clientePresupuesto(
        [
          rubro("r01", "R01", "Personal", 1),
          rubro("r98", "R98", "Retirado sin línea", 98, false),
          rubro("r99", "R99", "Suspendido", 99, false),
          rubro("r30", "R30", "Suministros", 30),
        ],
        [linea("l01", "r01", "1000000.00"), linea("l99", "r99", "250000.00")],
      ) as never,
      "pry-1",
      "BORRADOR",
      "1250000.00",
    )
    // r98 (inactivo y sin línea) sale; r99 (inactivo pero con línea) entra para no perder su asignado.
    expect(view.rubros.map((fila) => fila.codigo)).toEqual(["R01", "R30", "R99"])
    expect(view.rubros[1]).toMatchObject({ linea_id: null, asignado: "0.00", heredado_pendiente: false })
    expect(view.rubros[2]).toMatchObject({ activo: false, asignado: "250000.00", heredado_pendiente: true })
    expect(view.suma).toBe("1250000.00")
  })

  it("loadProgrammingView deja una fila de control por línea con Σ celdas − A", async () => {
    const r01 = rubro("r01", "R01", "Personal", 1)
    const r12 = rubro("r12", "R12", "Transporte", 12)
    const view = await loadProgrammingView(
      clienteProgramacion(
        [lineaConRubro(linea("l12", "r12", "24000000.00"), r12), lineaConRubro(linea("l01", "r01", "59500000.00"), r01)],
        PERIODOS.flatMap((periodo) => [celda("l01", periodo, "14875000.00"), celda("l12", periodo, "6000000.00")]),
      ) as never,
      "pry-1",
      "BORRADOR",
      PERIODOS,
    )
    expect(view.control_por_rubro).toEqual([
      {
        rubro_id: "r01",
        codigo: "R01",
        nombre: "Personal",
        asignado: "59500000.00",
        programado: "59500000.00",
        control: "0.00",
      },
      {
        rubro_id: "r12",
        codigo: "R12",
        nombre: "Transporte",
        asignado: "24000000.00",
        programado: "24000000.00",
        control: "0.00",
      },
    ])
    expect(view.filas).toHaveLength(8)
    expect(view.filas[0]).toEqual({ linea_id: "l01", rubro_id: "r01", periodo: "2026-10", valor: "14875000.00" })
  })

  it("loadProgrammingView, con dos líneas del mismo rubro, da dos filas de control por línea y una por rubro", async () => {
    // T11 S8: la programación se controla por línea (`control_por_linea`); `control_por_rubro` suma
    // las líneas del rubro, como el asignado de `loadBudgetView`.
    const r12 = rubro("r12", "R12", "Transporte", 12)
    const view = await loadProgrammingView(
      clienteProgramacion(
        [lineaConRubro(linea("l1", "r12", "15000000.00"), r12), lineaConRubro(linea("l2", "r12", "8000000.00"), r12)],
        [celda("l1", "2026-10", "15000000.00"), celda("l2", "2026-11", "8000000.00")],
      ) as never,
      "pry-1",
      "BORRADOR",
      PERIODOS,
    )
    const transporte = { rubro_id: "r12", codigo: "R12", nombre: "Transporte" }
    expect(view.control_por_linea).toEqual([
      { linea_id: "l1", actividad: null, ...transporte, asignado: "15000000.00", programado: "15000000.00", control: "0.00" },
      { linea_id: "l2", actividad: null, ...transporte, asignado: "8000000.00", programado: "8000000.00", control: "0.00" },
    ])
    expect(view.control_por_rubro).toEqual([
      { ...transporte, asignado: "23000000.00", programado: "23000000.00", control: "0.00" },
    ])
    // Cada celda nombra su línea.
    expect(view.filas).toEqual([
      { linea_id: "l1", rubro_id: "r12", periodo: "2026-10", valor: "15000000.00" },
      { linea_id: "l2", rubro_id: "r12", periodo: "2026-11", valor: "8000000.00" },
    ])
  })

  it("loadProgrammingView deja una línea sin celdas con programado 0 y control negativo por todo su asignado", async () => {
    const r12 = rubro("r12", "R12", "Transporte", 12)
    const view = await loadProgrammingView(
      clienteProgramacion([lineaConRubro(linea("l12", "r12", "5000000.00"), r12)], []) as never,
      "pry-1",
      "BORRADOR",
      PERIODOS,
    )
    expect(view.control_por_rubro).toEqual([
      {
        rubro_id: "r12",
        codigo: "R12",
        nombre: "Transporte",
        asignado: "5000000.00",
        programado: "0.00",
        control: "-5000000.00",
      },
    ])
    expect(view.filas).toEqual([])
  })

  it("loadProgrammingView descarta las celdas de líneas que no son de la vista", async () => {
    const r12 = rubro("r12", "R12", "Transporte", 12)
    const view = await loadProgrammingView(
      clienteProgramacion(
        [lineaConRubro(linea("l12", "r12", "6000000.00"), r12)],
        [celda("l12", "2026-10", "6000000.00"), celda("ajena", "2026-10", "999.00")],
      ) as never,
      "pry-1",
      "BORRADOR",
      PERIODOS,
    )
    expect(view.filas).toEqual([{ linea_id: "l12", rubro_id: "r12", periodo: "2026-10", valor: "6000000.00" }])
    expect(view.control_por_rubro[0]?.programado).toBe("6000000.00")
  })
})
