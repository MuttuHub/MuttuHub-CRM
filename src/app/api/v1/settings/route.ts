// GET/PUT /api/v1/settings — catálogos configurables (PRD §3.3, Hito 7).
// Solo ADMINISTRADOR. GET lee el snapshot garantizando los defaults;
// PUT valida y actualiza solo las claves enviadas:
//   { task_tags?: string[], doc_categories?: { nombre, restringida }[] }
// Respuesta siempre el snapshot fresco: { task_tags, doc_categories }.
// La UI sin permisos de admin lee el mismo snapshot vía GET
// /api/v1/catalogs/settings (ver README, Hito 7).

import { NextResponse } from "next/server";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { TASK_TAGS, UMBRALES_SEMAFORO_DEFAULT } from "@/lib/catalogs";
import type { UmbralesSemaforo } from "@/lib/semaforo";
import { requireApiRole } from "@/lib/supabase/server";
import {
  defaultDocCategories,
  DocCategoriaSetting,
  ensureDefaultSettings,
  getSetting,
  SETTING_DOC_CATEGORIES,
  SETTING_SEMAFORO_UMBRALES,
  SETTING_TASK_TAGS,
  setSetting,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 40;
const MAX_CATEGORIES = 30;
const MAX_CATEGORY_LENGTH = 80;

function isDocCategoryItem(value: unknown): value is DocCategoriaSetting {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.nombre === "string" && typeof v.restringida === "boolean";
}

// admin-umbrales-semaforo-ui: type-guard manual (mismo estilo que
// isDocCategoryItem arriba, este repo no usa zod en esta ruta) — NO
// reutiliza UMBRALES_OVERRIDE_SCHEMA de semaforo.ts (ese es `.partial()`
// para el merge de override por proyecto, un propósito distinto); acá el
// setting de organización siempre exige la forma completa.
function isUmbralesSemaforo(value: unknown): value is UmbralesSemaforo {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.confirmado !== "boolean") return false;

  const tecnico = v.tecnico;
  if (typeof tecnico !== "object" || tecnico === null) return false;
  const t = tecnico as Record<string, unknown>;
  if (typeof t.verde !== "number" || typeof t.rojo !== "number") return false;

  const financiero = v.financiero;
  if (typeof financiero !== "object" || financiero === null) return false;
  const f = financiero as Record<string, unknown>;
  return (
    typeof f.verde_min === "number" &&
    typeof f.verde_max === "number" &&
    typeof f.amarillo_min === "number" &&
    typeof f.amarillo_max === "number"
  );
}

async function readSnapshot() {
  const [task_tags, doc_categories, semaforo_umbrales] = await Promise.all([
    getSetting<string[]>(SETTING_TASK_TAGS, [...TASK_TAGS]),
    getSetting<DocCategoriaSetting[]>(SETTING_DOC_CATEGORIES, defaultDocCategories()),
    getSetting<UmbralesSemaforo>(SETTING_SEMAFORO_UMBRALES, UMBRALES_SEMAFORO_DEFAULT),
  ]);
  return { task_tags, doc_categories, semaforo_umbrales };
}

export const GET = withApiErrorHandling(
  "settings",
  "No pudimos cargar los catálogos. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    await ensureDefaultSettings();
    return NextResponse.json(await readSnapshot());
  },
);

export const PUT = withApiErrorHandling(
  "settings",
  "No pudimos guardar los catálogos. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<{
      task_tags?: unknown;
      doc_categories?: unknown;
      semaforo_umbrales?: unknown;
    }>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }

    const hasTags = body.task_tags !== undefined;
    const hasCategories = body.doc_categories !== undefined;
    const hasUmbrales = body.semaforo_umbrales !== undefined;
    if (!hasTags && !hasCategories && !hasUmbrales) {
      return apiError(
        "Envía 'task_tags', 'doc_categories' o 'semaforo_umbrales'.",
        400,
        "VALIDATION_ERROR",
      );
    }

    let tags: string[] | undefined;
    if (hasTags) {
      if (!Array.isArray(body.task_tags) || body.task_tags.some((t) => typeof t !== "string")) {
        return apiError("Las etiquetas deben ser un arreglo de strings.", 400, "VALIDATION_ERROR");
      }
      tags = body.task_tags.map((t) => t.trim()).filter((t) => t.length > 0);
      if (tags.length < 1) {
        return apiError("Debe mantener al menos una etiqueta.", 400, "VALIDATION_ERROR");
      }
      if (tags.length > MAX_TAGS) {
        return apiError(`Máximo ${MAX_TAGS} etiquetas.`, 400, "VALIDATION_ERROR");
      }
      if (tags.some((t) => t.length > MAX_TAG_LENGTH)) {
        return apiError(`Cada etiqueta debe tener máximo ${MAX_TAG_LENGTH} caracteres.`, 400, "VALIDATION_ERROR");
      }
      if (new Set(tags).size !== tags.length) {
        return apiError("Las etiquetas no pueden repetirse.", 400, "VALIDATION_ERROR");
      }
    }

    let categories: DocCategoriaSetting[] | undefined;
    if (hasCategories) {
      if (!Array.isArray(body.doc_categories) || !body.doc_categories.every(isDocCategoryItem)) {
        return apiError("Las categorías deben ser [{ nombre, restringida }].", 400, "VALIDATION_ERROR");
      }
      categories = body.doc_categories.map((c) => ({ nombre: c.nombre.trim(), restringida: c.restringida }));
      if (categories.length < 1 || categories.some((c) => c.nombre.length === 0)) {
        return apiError("Debe mantener al menos una categoría.", 400, "VALIDATION_ERROR");
      }
      if (categories.length > MAX_CATEGORIES) {
        return apiError(`Máximo ${MAX_CATEGORIES} categorías.`, 400, "VALIDATION_ERROR");
      }
      if (categories.some((c) => c.nombre.length > MAX_CATEGORY_LENGTH)) {
        return apiError(`Cada categoría debe tener máximo ${MAX_CATEGORY_LENGTH} caracteres.`, 400, "VALIDATION_ERROR");
      }
      const lower = categories.map((c) => c.nombre.toLowerCase());
      if (new Set(lower).size !== lower.length) {
        return apiError("Las categorías no pueden repetirse (sin distinguir mayúsculas).", 400, "VALIDATION_ERROR");
      }
    }

    let umbrales: UmbralesSemaforo | undefined;
    if (hasUmbrales) {
      if (!isUmbralesSemaforo(body.semaforo_umbrales)) {
        return apiError(
          "Los umbrales de semáforo deben incluir 'confirmado' (boolean), 'tecnico' ({ verde, rojo }) y 'financiero' ({ verde_min, verde_max, amarillo_min, amarillo_max }), todos numéricos.",
          400,
          "VALIDATION_ERROR",
        );
      }
      umbrales = body.semaforo_umbrales;
      if (umbrales.tecnico.rojo > umbrales.tecnico.verde) {
        return apiError(
          "El umbral técnico 'rojo' no puede ser mayor que 'verde'.",
          400,
          "VALIDATION_ERROR",
        );
      }
      if (umbrales.financiero.verde_min > umbrales.financiero.verde_max) {
        return apiError(
          "El umbral financiero 'verde_min' no puede ser mayor que 'verde_max'.",
          400,
          "VALIDATION_ERROR",
        );
      }
      if (umbrales.financiero.amarillo_min > umbrales.financiero.amarillo_max) {
        return apiError(
          "El umbral financiero 'amarillo_min' no puede ser mayor que 'amarillo_max'.",
          400,
          "VALIDATION_ERROR",
        );
      }
    }

    await ensureDefaultSettings();
    if (tags) await setSetting(SETTING_TASK_TAGS, tags, auth.usuario.id);
    if (categories) await setSetting(SETTING_DOC_CATEGORIES, categories, auth.usuario.id);
    if (umbrales) await setSetting(SETTING_SEMAFORO_UMBRALES, umbrales, auth.usuario.id);
    return NextResponse.json(await readSnapshot());
  },
);
