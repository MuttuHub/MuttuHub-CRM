// La semana del reporte semanal (S5): lunes a domingo en el calendario de America/Bogotá. Puro y sin
// dependencias del servidor, así que la pantalla lo usa para moverse de semana sin preguntarle al API.
// Las semanas de `weeks.ts` son relativas al inicio de cada proyecto; esta es la semana calendario.

import { fromDayNumber, todayInBogota, toDayNumber, type IsoDate } from "@/lib/proyectos/weeks"

export type Semana = { desde: IsoDate; hasta: IsoDate }

/** Bogotá no tiene horario de verano: su día empieza siempre a las 05:00 UTC. */
const OFFSET_BOGOTA = "-05:00"

/** Lunes a domingo de la semana que contiene `fecha`. */
export function semanaDe(fecha: IsoDate): Semana {
  const dia = toDayNumber(fecha)
  // El día 0 de la época (1970-01-01) fue jueves: (dia + 3) % 7 es 0 los lunes.
  const lunes = dia - ((dia + 3) % 7)
  return { desde: fromDayNumber(lunes), hasta: fromDayNumber(lunes + 6) }
}

/** La semana `n` semanas antes (negativo) o después (positivo). */
export function desplazarSemana(semana: Semana, n: number): Semana {
  return semanaDe(fromDayNumber(toDayNumber(semana.desde) + 7 * n))
}

/** La semana en curso en Bogotá. */
export function semanaActual(now: Date = new Date()): Semana {
  return semanaDe(todayInBogota(now))
}

/** Instante en que empieza el día `fecha` en Bogotá. */
export function inicioDiaBogota(fecha: IsoDate): Date {
  return new Date(`${fecha}T00:00:00.000${OFFSET_BOGOTA}`)
}

/** Día calendario de Bogotá de un instante (p. ej. el cierre real de una tarea). */
export function fechaEnBogota(instante: Date): IsoDate {
  return todayInBogota(instante)
}

/** El día siguiente, para cerrar rangos semiabiertos [desde, hasta + 1). */
export function diaSiguiente(fecha: IsoDate): IsoDate {
  return fromDayNumber(toDayNumber(fecha) + 1)
}

export function enSemana(fecha: IsoDate, semana: Semana): boolean {
  return fecha >= semana.desde && fecha <= semana.hasta
}
