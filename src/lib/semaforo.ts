// Semáforos parametrizados (RF-03, RF-07, D10, design.md "Semáforos
// parametrizados"). Pure module — no `@/lib/db`, no `next/server` — same
// discipline as `permissions.ts`: this file is the comparison logic only.
// Thresholds are ALWAYS read from a parameter (`Setting` row + optional
// per-project override), never inlined as a constant here (spec.md's
// project-schedule "Semaforización técnica con umbral parametrizado").

import { z } from "zod";

export type UmbralesSemaforo = {
  /** T6: false hasta que el negocio firme los cortes. */
  confirmado: boolean;
  /** Razón avance_real / avance_planificado. */
  tecnico: { verde: number; rojo: number };
  /** Razón ejecutado / proyectado a la fecha de corte. Bidireccional. */
  financiero: { verde_min: number; verde_max: number; amarillo_min: number; amarillo_max: number };
};

export type ColorSemaforo = "verde" | "amarillo" | "rojo";

/**
 * RF-03 / spec.md "Semaforización técnica con umbral parametrizado": razón
 * ≥ `tecnico.verde` -> verde; razón < `tecnico.rojo` -> rojo; en cualquier
 * otro caso, amarillo. Ambos cortes llegan por parámetro, nunca inline.
 */
export function colorTecnico(razon: number, u: UmbralesSemaforo): ColorSemaforo {
  if (razon >= u.tecnico.verde) return "verde";
  if (razon < u.tecnico.rojo) return "rojo";
  return "amarillo";
}

/**
 * RF-07 / D10: bidireccional a propósito — la sobre-ejecución también es un
 * hallazgo, no solo el atraso. `amarillo_min`/`amarillo_max` son los límites
 * externos de la banda verde+amarillo combinada: como la comprobación verde
 * se evalúa primero, cualquier razón dentro de la banda verde nunca llega a
 * evaluarse contra la banda amarilla.
 */
export function colorFinanciero(razon: number, u: UmbralesSemaforo): ColorSemaforo {
  const f = u.financiero;
  if (razon >= f.verde_min && razon <= f.verde_max) return "verde";
  if (razon >= f.amarillo_min && razon <= f.amarillo_max) return "amarillo";
  return "rojo";
}

/**
 * RF-03 / spec.md "Cálculo del Avance Técnico": promedio ponderado de
 * `porcentaje_avance` usando `peso` como ponderador sobre todas las
 * actividades no eliminadas del proyecto. Un proyecto sin actividades
 * devuelve 0%, nunca una división por cero.
 */
export function avanceTecnico(actividades: { porcentaje_avance: number; peso: number }[]): number {
  const pesoTotal = actividades.reduce((total, a) => total + a.peso, 0);
  if (pesoTotal === 0) return 0;
  const ponderado = actividades.reduce((total, a) => total + a.porcentaje_avance * a.peso, 0);
  return ponderado / pesoTotal;
}

const UMBRALES_OVERRIDE_SCHEMA = z
  .object({
    confirmado: z.boolean(),
    tecnico: z.object({ verde: z.number(), rojo: z.number() }),
    financiero: z.object({
      verde_min: z.number(),
      verde_max: z.number(),
      amarillo_min: z.number(),
      amarillo_max: z.number(),
    }),
  })
  .partial();

/**
 * T5: override del proyecto (`Proyecto.umbrales_override`, JSON opcional)
 * sobre el default de organización (`Setting["semaforo_umbrales"]`). El
 * merge es superficial (por bloque `tecnico`/`financiero`, no por campo
 * individual) y validado con zod — un override con forma inválida cae al
 * valor de organización completo, nunca deja el semáforo sin umbrales.
 */
export function resolverUmbrales(organizacion: UmbralesSemaforo, override: unknown): UmbralesSemaforo {
  const parsed = UMBRALES_OVERRIDE_SCHEMA.safeParse(override);
  if (!parsed.success) return organizacion;
  return {
    confirmado: parsed.data.confirmado ?? organizacion.confirmado,
    tecnico: parsed.data.tecnico ?? organizacion.tecnico,
    financiero: parsed.data.financiero ?? organizacion.financiero,
  };
}
