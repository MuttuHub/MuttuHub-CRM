// Read-only selector for the v3 ficha summary (plan section 6, B0.3): the header and the KPI strip of one
// project, taken from the payloads the app already fetches. No rules, no fetch and no wording: every
// number comes from the server, and a missing payload stays null instead of becoming a zero.

import type { ProjectKpis, ProjectListRow } from "@/hooks/projects"
import type { UiTone } from "@/lib/catalogs"
import type { ColorSemaforo } from "@/lib/proyectos/semaforo-v2"
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display"

export type ResumenFicha = {
  id: string
  codigo: string
  nombre: string
  cliente: string
  responsable: string | null
  estado: { etiqueta: string; tono: UiTone }
  /** Fechas de calendario tal como las manda la API (`YYYY-MM-DD`); las formatea la pantalla. */
  fechas: { inicio: string | null; fin: string | null; semanas: number | null }
  /** false para BORRADOR / PLANIFICACION / CANCELADO, o mientras no lleguen los KPI. */
  medible: boolean
  avance: { real: number; programado: number; desviacion: number; color: ColorSemaforo } | null
  atrasadas: number | null
  financiero: {
    delAsignado: number | null
    deLoProgramado: number | null
    color: ColorSemaforo
    alertaRetraso: boolean
  } | null
  beneficiarios: { total: number; meta: number | null } | null
}

export function resumenFicha({
  proyecto,
  kpis,
}: {
  proyecto: ProjectListRow
  kpis: ProjectKpis | null
}): ResumenFicha {
  const estado = ESTADO_PROYECTO_META[proyecto.estado]
  return {
    id: proyecto.id,
    codigo: proyecto.codigo,
    nombre: proyecto.nombre,
    cliente: proyecto.cliente.nombre,
    responsable: proyecto.responsable?.nombre ?? null,
    estado: { etiqueta: estado.label, tono: estado.tone },
    fechas: {
      inicio: proyecto.fecha_inicio,
      fin: proyecto.fecha_fin,
      semanas: proyecto.duracion_semanas,
    },
    medible: kpis?.medible ?? false,
    avance: kpis?.tecnico
      ? {
          real: kpis.tecnico.avance_real,
          programado: kpis.tecnico.avance_programado,
          desviacion: kpis.tecnico.desviacion_pp,
          color: kpis.tecnico.color,
        }
      : null,
    atrasadas: kpis?.cronograma?.atrasadas ?? null,
    financiero: kpis?.financiero
      ? {
          delAsignado: kpis.financiero.ea,
          deLoProgramado: kpis.financiero.ep,
          color: kpis.financiero.color,
          alertaRetraso: kpis.financiero.alerta_retraso,
        }
      : null,
    beneficiarios: kpis?.beneficiarios ? { total: kpis.beneficiarios.total, meta: kpis.beneficiarios.meta } : null,
  }
}
