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

export const SETTING_TASK_TAGS = "task_tags";
export const SETTING_DOC_CATEGORIES = "doc_categories";

export type DocCategoriaSetting = { nombre: string; restringida: boolean };

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