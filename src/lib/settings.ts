// Catálogos configurables desde el admin (PRD §3.3, Hito 7). Las constantes de
// src/lib/catalogs.ts son los defaults de fábrica; el valor "live" vive en la
// tabla `settings` (migración 0003_settings, pendiente de db:migrate). Leer
// SIEMPRE con getSetting + fallback: sin la migración aplicada el sistema se
// comporta exactamente como v1.

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DOC_CATEGORIES,
  RESTRICTED_DOC_CATEGORIES,
  TASK_TAGS,
} from "@/lib/catalogs";
import { parseParametrosV2, type ParametrosV2 } from "@/lib/proyectos/semaforo-v2";

export const SETTING_TASK_TAGS = "task_tags";
export const SETTING_DOC_CATEGORIES = "doc_categories";

export const SETTING_SEMAFORO_PARAMETROS_V2 = "semaforo_parametros_v2";
export const SETTING_AUTOMATIZACIONES = "automatizaciones";

export type DocCategoriaSetting = { nombre: string; restringida: boolean };

/** Categorías del resumen diario que el admin puede activar o desactivar. */
export type AutomatizacionesCategorias = {
  vencidos: boolean;
  hoy: boolean;
  proximos: boolean;
};

/** Setting `automatizaciones`: qué manda el cron diario y con qué ventana. */
export type Automatizaciones = {
  /** Si es false, el cron diario omite el envío por completo. */
  resumen_diario: boolean;
  /** Días hacia adelante del bucket "próximos" (antes fijo en 3). */
  dias_por_vencer: number;
  /** Categorías del resumen que se incluyen. */
  categorias: AutomatizacionesCategorias;
};

/** Defaults de fábrica del setting `automatizaciones`. */
export const AUTOMATIZACIONES_DEFAULT: Automatizaciones = {
  resumen_diario: true,
  dias_por_vencer: 3,
  categorias: { vencidos: true, hoy: true, proximos: true },
};

export const DIAS_POR_VENCER_MIN = 1;
export const DIAS_POR_VENCER_MAX = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDiasPorVencer(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= DIAS_POR_VENCER_MIN &&
    value <= DIAS_POR_VENCER_MAX
  );
}

/**
 * Default del setting `doc_categories`: las DOC_CATEGORIES con las
 * RESTRICTED_DOC_CATEGORIES marcadas como restringidas (sin duplicar — el
 * modelo v1 guarda una sola lista con flag, ver PRD §6.2).
 */
export function defaultDocCategories(): DocCategoriaSetting[] {
  return DOC_CATEGORIES.map((nombre) => ({
    nombre,
    restringida: RESTRICTED_DOC_CATEGORIES.includes(nombre),
  }));
}

/** Lectura del setting; row ausente -> fallback (las constantes). */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

/** Parámetros del semáforo v2; sin fila o con datos mal formados, los defaults. */
export async function getSemaforoParametrosV2(): Promise<ParametrosV2> {
  return parseParametrosV2(await getSetting<unknown>(SETTING_SEMAFORO_PARAMETROS_V2, null));
}

/**
 * Lee el setting `automatizaciones` con fallback seguro: un valor no-objeto
 * vuelve a los defaults completos y cada campo ausente o mal formado conserva
 * su default (mismo criterio que parseParametrosV2).
 */
export function parseAutomatizaciones(raw: unknown): Automatizaciones {
  const result = structuredClone(AUTOMATIZACIONES_DEFAULT);
  if (!isRecord(raw)) return result;

  if (typeof raw.resumen_diario === "boolean") {
    result.resumen_diario = raw.resumen_diario;
  }
  if (isDiasPorVencer(raw.dias_por_vencer)) {
    result.dias_por_vencer = raw.dias_por_vencer;
  }
  if (isRecord(raw.categorias)) {
    const categorias = raw.categorias;
    if (typeof categorias.vencidos === "boolean") result.categorias.vencidos = categorias.vencidos;
    if (typeof categorias.hoy === "boolean") result.categorias.hoy = categorias.hoy;
    if (typeof categorias.proximos === "boolean") result.categorias.proximos = categorias.proximos;
  }
  return result;
}

/** Automatizaciones vigentes; sin fila o con datos mal formados, los defaults. */
export async function getAutomatizaciones(): Promise<Automatizaciones> {
  return parseAutomatizaciones(await getSetting<unknown>(SETTING_AUTOMATIZACIONES, null));
}

/** Crea los settings por defecto cuando no existen (idempotente, upsert por key). */
export async function ensureDefaultSettings(): Promise<void> {
  await db.setting.upsert({
    where: { key: SETTING_TASK_TAGS },
    create: { key: SETTING_TASK_TAGS, value: [...TASK_TAGS] },
    update: {},
  });
  await db.setting.upsert({
    where: { key: SETTING_DOC_CATEGORIES },
    create: { key: SETTING_DOC_CATEGORIES, value: defaultDocCategories() },
    update: {},
  });
  await db.setting.upsert({
    where: { key: SETTING_AUTOMATIZACIONES },
    create: { key: SETTING_AUTOMATIZACIONES, value: AUTOMATIZACIONES_DEFAULT },
    update: {},
  });
}

/** Upsert del valor con registro de quién lo editó (gates del admin). */
export async function setSetting(
  key: string,
  value: Prisma.InputJsonValue,
  userId: string,
): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value, updated_by: userId },
    update: { value, updated_by: userId },
  });
}

/** { categorias, restringidas } para el enforcement de documentos (PRD §6.2). */
export function flattenDocCategories(
  setting: DocCategoriaSetting[],
): { categorias: string[]; restringidas: string[] } {
  return {
    categorias: setting.map((c) => c.nombre),
    restringidas: setting.filter((c) => c.restringida).map((c) => c.nombre),
  };
}