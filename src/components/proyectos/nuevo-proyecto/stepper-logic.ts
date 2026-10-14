// Pure rules of the "Nuevo proyecto" stepper (v7 `PASOS`): the five steps, which one the URL selects,
// which ones can be opened and the URLs the page navigates to. No React here so it is trivially testable.

export const PASOS = [
  { numero: 1, etiqueta: "General", titulo: "Información general", descripcion: "Datos base del proyecto. El código se asigna solo." },
  { numero: 2, etiqueta: "Metas", titulo: "Metas e indicadores", descripcion: "Cada meta tiene indicadores de resultado con línea base y meta." },
  { numero: 3, etiqueta: "Cronograma", titulo: "Cronograma de actividades", descripcion: "Toda actividad declara su meta asociada y su entregable." },
  { numero: 4, etiqueta: "Presupuesto", titulo: "Presupuesto proyectado por rubros", descripcion: "Reparte el valor total por rubro y programa los desembolsos por mes." },
  { numero: 5, etiqueta: "Revisión", titulo: "Revisar y aprobar", descripcion: "Confirma lo capturado. Puedes guardar el borrador o aprobar la línea base." },
] as const

export type NumeroPaso = (typeof PASOS)[number]["numero"]
export type EstadoPaso = "hecho" | "activo" | "pendiente"

export const TOTAL_PASOS = PASOS.length
const PRIMER_PASO_CON_PROYECTO = 2

/**
 * Step shown for a URL. Without a project only step 1 exists. With one, `?paso=` selects 1..5; a missing or
 * invalid value falls back to step 2 (step 1, the creation, is already done).
 */
export function resolverPaso(raw: string | null, hayProyecto: boolean): number {
  if (!hayProyecto) return 1
  if (raw === null || !/^\d+$/.test(raw)) return PRIMER_PASO_CON_PROYECTO
  const paso = Number(raw)
  return paso >= 1 && paso <= TOTAL_PASOS ? paso : PRIMER_PASO_CON_PROYECTO
}

/** Steps 2-5 edit an existing project, so they stay closed until step 1 created it. */
export function pasoHabilitado(numero: number, hayProyecto: boolean): boolean {
  return numero === 1 || hayProyecto
}

/** The baseline is approved once the project left BORRADOR. */
export function esProyectoAprobado(estado: string): boolean {
  return estado !== "BORRADOR"
}

/** Copy of a step; Revisión turns into an approved state once the baseline is approved. */
export function datosDePaso(numero: number, aprobado: boolean): (typeof PASOS)[number] | typeof REVISION_APROBADA {
  if (aprobado && numero === TOTAL_PASOS) return REVISION_APROBADA
  return PASOS[numero - 1]
}

const REVISION_APROBADA = {
  numero: TOTAL_PASOS,
  etiqueta: "Revisión",
  titulo: "Línea base aprobada",
  descripcion: "La estructura y el presupuesto quedaron congelados. Abre el proyecto para darle seguimiento.",
} as const

/** `aprobado` marks the Revisión step done even while it is the active one. */
export function estadoDePaso(numero: number, actual: number, hayProyecto: boolean, aprobado = false): EstadoPaso {
  if (aprobado && numero === TOTAL_PASOS) return "hecho"
  if (numero === actual) return "activo"
  return hayProyecto && numero < actual ? "hecho" : "pendiente"
}

export function pasoSiguiente(actual: number): number | null {
  return actual < TOTAL_PASOS ? actual + 1 : null
}

export function pasoAnterior(actual: number): number | null {
  return actual > 1 ? actual - 1 : null
}

export const RUTA_NUEVO_PROYECTO = "/proyectos/nuevo"

/** URL of the page. `proyecto`/`paso` make a refresh or the back button keep the created project. */
export function hrefNuevoProyecto({
  proyecto,
  paso,
  oportunidad,
}: {
  proyecto?: string
  paso?: number
  oportunidad?: string
}): string {
  const params: string[] = []
  if (proyecto) params.push(`proyecto=${encodeURIComponent(proyecto)}`)
  if (paso !== undefined) params.push(`paso=${paso}`)
  if (oportunidad) params.push(`oportunidad=${encodeURIComponent(oportunidad)}`)
  return params.length > 0 ? `${RUTA_NUEVO_PROYECTO}?${params.join("&")}` : RUTA_NUEVO_PROYECTO
}
