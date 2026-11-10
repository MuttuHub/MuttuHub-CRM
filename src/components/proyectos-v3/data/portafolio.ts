// Read-only selectors for the v3 portfolio rows (plan section 6, B0.3). They only pick fields the server
// already computed — semáforo, avance, ejecución — and label the state with the shared presentation
// module. No rules, no fetch and no wording: the v3 screens decide how to show this.

import type { PortfolioProject, ProjectsPortfolio } from "@/hooks/projects"
import type { UiTone } from "@/lib/catalogs"
import type { ColorSemaforo } from "@/lib/proyectos/semaforo-v2"
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display"

export type FilaPortafolio = {
  id: string
  codigo: string
  nombre: string
  cliente: string
  responsable: string | null
  estado: { etiqueta: string; tono: UiTone }
  /** Semáforo que calculó el servidor; null cuando el proyecto no es medible. */
  semaforoTecnico: ColorSemaforo | null
  avance: { real: number; programado: number; desviacion: number } | null
  financiero: {
    /** % ejecutado sobre lo asignado (`ea`). */
    delAsignado: number | null
    /** % ejecutado sobre lo programado a la fecha (`ep`). */
    deLoProgramado: number | null
    color: ColorSemaforo
    alertaRetraso: boolean
  } | null
  atrasadas: number | null
}

function filaDe(proyecto: PortfolioProject): FilaPortafolio {
  const { kpis } = proyecto
  const estado = ESTADO_PROYECTO_META[proyecto.estado]
  return {
    id: proyecto.id,
    codigo: proyecto.codigo,
    nombre: proyecto.nombre,
    cliente: proyecto.cliente.nombre,
    responsable: proyecto.responsable?.nombre ?? null,
    estado: { etiqueta: estado.label, tono: estado.tone },
    semaforoTecnico: proyecto.semaforo_tecnico,
    avance: kpis.tecnico
      ? {
          real: kpis.tecnico.avance_real,
          programado: kpis.tecnico.avance_programado,
          desviacion: kpis.tecnico.desviacion_pp,
        }
      : null,
    financiero: kpis.financiero
      ? {
          delAsignado: kpis.financiero.ea,
          deLoProgramado: kpis.financiero.ep,
          color: kpis.financiero.color,
          alertaRetraso: kpis.financiero.alerta_retraso,
        }
      : null,
    atrasadas: kpis.cronograma?.atrasadas ?? null,
  }
}

/** Una fila por proyecto, en el orden que mandó el servidor. */
export function filasPortafolio(portafolio: ProjectsPortfolio): FilaPortafolio[] {
  return portafolio.proyectos.map(filaDe)
}
