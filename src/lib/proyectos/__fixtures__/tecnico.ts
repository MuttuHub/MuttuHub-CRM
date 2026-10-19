/**
 * Golden fixture F-T1 for the technical semáforo (S4). Project start 2026-10-05,
 * corte 2026-10-25. Plain data, no DB; `counted` avances carry a medio.
 *
 *  1.1  w1    peso 1   E1 meta 2 counted 2, E2 meta 1 counted 1   -> progress 1
 *  1.2  w2    peso 1   E1 meta 2 counted 1                        -> progress 0.5
 *  1.3  w3    peso 1   E1 meta 2, E2 meta 2, nothing counted      -> progress 0
 *  1.4  w3-6  peso 4   E1..E3 meta 2, nothing counted             -> progress 0
 *
 * real = 1.5/7, programmed = (1+1+1+4*0.25)/7 = 4/7, deviation 35.7 pp -> rojo.
 */
import type { ActividadTecnicaInput, AvanceInput } from "../avance"

export const F_T1_INICIO = "2026-10-05"
export const F_T1_CORTE = "2026-10-25"

function avance(fecha: string, cantidad: number, tieneMedio = true): AvanceInput {
  return { fecha, cantidad, anulado: false, tieneMedio, createdAt: `${fecha}T12:00:00Z` }
}

export function fixtureF_T1(): ActividadTecnicaInput[] {
  return [
    {
      id: "a11",
      codigo: "1.1",
      peso: 1,
      inicio: "2026-10-05",
      fin: "2026-10-11",
      entregables: [
        { id: "a11-e1", meta: 2, avances: [avance("2026-10-06", 1), avance("2026-10-08", 1)] },
        { id: "a11-e2", meta: 1, avances: [avance("2026-10-09", 1)] },
      ],
    },
    {
      id: "a12",
      codigo: "1.2",
      peso: 1,
      inicio: "2026-10-12",
      fin: "2026-10-18",
      entregables: [{ id: "a12-e1", meta: 2, avances: [avance("2026-10-14", 1)] }],
    },
    {
      id: "a13",
      codigo: "1.3",
      peso: 1,
      inicio: "2026-10-19",
      fin: "2026-10-25",
      entregables: [
        { id: "a13-e1", meta: 2, avances: [] },
        { id: "a13-e2", meta: 2, avances: [] },
      ],
    },
    {
      id: "a14",
      codigo: "1.4",
      peso: 4,
      inicio: "2026-10-19",
      fin: "2026-11-15",
      entregables: [
        { id: "a14-e1", meta: 2, avances: [] },
        { id: "a14-e2", meta: 2, avances: [] },
        { id: "a14-e3", meta: 2, avances: [] },
      ],
    },
  ]
}

/** F-T1b: an avance of 1 on 1.3-E1 that has no medio (uncounted when a medio is required). */
export function fixtureF_T1b(): ActividadTecnicaInput[] {
  const actividades = fixtureF_T1()
  actividades[2].entregables[0].avances = [avance("2026-10-20", 1, false)]
  return actividades
}
