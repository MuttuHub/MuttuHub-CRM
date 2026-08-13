// GET /api/v1/catalogs/settings — snapshot de los catálogos configurables
// (PRD §3.3, Hito 7) para la UI. DECISIÓN DE DISEÑO: el GET de /api/v1/settings
// es solo ADMINISTRADOR porque además hace ensure de los defaults; aquí
// CUALQUIER usuario autenticado lee el mismo snapshot { task_tags,
// doc_categories } (sin escrituras) para alimentar los selects del tablero y
// del repositorio sin privilegios de admin. Sin fila en `settings` cada clave
// cae al default de src/lib/catalogs.ts.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { TASK_TAGS } from "@/lib/catalogs";
import { requireApiUser } from "@/lib/supabase/server";
import {
  defaultDocCategories,
  DocCategoriaSetting,
  getSetting,
  SETTING_DOC_CATEGORIES,
  SETTING_TASK_TAGS,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "catalogs/settings",
  "No pudimos cargar los catálogos. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const [task_tags, doc_categories] = await Promise.all([
      getSetting<string[]>(SETTING_TASK_TAGS, [...TASK_TAGS]),
      getSetting<DocCategoriaSetting[]>(SETTING_DOC_CATEGORIES, defaultDocCategories()),
    ]);
    return NextResponse.json({ task_tags, doc_categories });
  },
);
