// GET/PUT /api/v1/settings/automatizaciones — v7 alignment C7a (seguimiento
// automático). GET lo lee cualquier usuario autenticado (la sección vive bajo
// /clientes y se muestra en solo lectura); PUT es solo ADMINISTRADOR. Sigue el
// patrón de /api/v1/settings/semaforo-v2 (withApiErrorHandling + parseJsonBody + zod).
//
// GET: sin fila guardada o con datos mal formados responde los defaults.
// PUT: actualización parcial; cualquier subconjunto de `resumen_diario`,
//   `dias_por_vencer`, `categorias` y las reglas V8 `recordar_compromisos` /
//   `alertar_sin_contacto` (cada una `{ activo?, dias? }`) se fusiona sobre el
//   valor vigente y se guarda con `updated_by`.
//
// El cron diario (/api/cron/daily) es el único consumidor: `resumen_diario`
// apaga el envío, `dias_por_vencer` ajusta la ventana del bucket "próximos" y
// `categorias` decide qué categorías entran al resumen; las reglas V8 encienden
// el recordatorio de compromisos y la alerta de aliados sin contacto.

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import {
  DIAS_POR_VENCER_MAX,
  DIAS_POR_VENCER_MIN,
  getAutomatizaciones,
  RECORDAR_COMPROMISOS_DIAS_MAX,
  RECORDAR_COMPROMISOS_DIAS_MIN,
  SETTING_AUTOMATIZACIONES,
  setSetting,
  SIN_CONTACTO_DIAS_MAX,
  SIN_CONTACTO_DIAS_MIN,
  type ReglaAutomatizacion,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

const categoriasPatch = z
  .object({
    vencidos: z.boolean().optional(),
    hoy: z.boolean().optional(),
    proximos: z.boolean().optional(),
  })
  .strict()
  .refine((categorias) => Object.keys(categorias).length > 0, {
    message: "Envía al menos una categoría.",
  });

/** Partial patch of a V8 rule: its switch and/or its day threshold within [min, max]. */
function reglaPatch(min: number, max: number) {
  const rango = `Debe estar entre ${min} y ${max}.`;
  return z
    .object({
      activo: z.boolean().optional(),
      dias: z.number("Debe ser un número.").int("Debe ser un entero.").min(min, rango).max(max, rango).optional(),
    })
    .strict()
    .refine((regla) => Object.keys(regla).length > 0, { message: "Envía al menos un campo de la regla." });
}

function mergeRegla(
  current: ReglaAutomatizacion,
  patch: { activo?: boolean; dias?: number } | undefined,
): ReglaAutomatizacion {
  if (!patch) return current;
  return {
    activo: patch.activo ?? current.activo,
    dias: patch.dias ?? current.dias,
  };
}

export const AUTOMATIZACIONES_PUT_SCHEMA = z
  .object({
    resumen_diario: z.boolean().optional(),
    dias_por_vencer: z
      .number("Debe ser un número.")
      .int("Debe ser un entero.")
      .min(DIAS_POR_VENCER_MIN, `Debe estar entre ${DIAS_POR_VENCER_MIN} y ${DIAS_POR_VENCER_MAX}.`)
      .max(DIAS_POR_VENCER_MAX, `Debe estar entre ${DIAS_POR_VENCER_MIN} y ${DIAS_POR_VENCER_MAX}.`)
      .optional(),
    categorias: categoriasPatch.optional(),
    recordar_compromisos: reglaPatch(RECORDAR_COMPROMISOS_DIAS_MIN, RECORDAR_COMPROMISOS_DIAS_MAX).optional(),
    alertar_sin_contacto: reglaPatch(SIN_CONTACTO_DIAS_MIN, SIN_CONTACTO_DIAS_MAX).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "Envía al menos un campo." });

export const GET = withApiErrorHandling(
  "settings/automatizaciones",
  "No pudimos cargar las automatizaciones. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    return NextResponse.json({ automatizaciones: await getAutomatizaciones() });
  },
);

export const PUT = withApiErrorHandling(
  "settings/automatizaciones",
  "No pudimos guardar las automatizaciones. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = AUTOMATIZACIONES_PUT_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }

    const next = structuredClone(await getAutomatizaciones());
    if (parsed.data.resumen_diario !== undefined) {
      next.resumen_diario = parsed.data.resumen_diario;
    }
    if (parsed.data.dias_por_vencer !== undefined) {
      next.dias_por_vencer = parsed.data.dias_por_vencer;
    }
    const categorias = parsed.data.categorias;
    if (categorias) {
      if (categorias.vencidos !== undefined) next.categorias.vencidos = categorias.vencidos;
      if (categorias.hoy !== undefined) next.categorias.hoy = categorias.hoy;
      if (categorias.proximos !== undefined) next.categorias.proximos = categorias.proximos;
    }
    next.recordar_compromisos = mergeRegla(next.recordar_compromisos, parsed.data.recordar_compromisos);
    next.alertar_sin_contacto = mergeRegla(next.alertar_sin_contacto, parsed.data.alertar_sin_contacto);

    await setSetting(SETTING_AUTOMATIZACIONES, next, auth.usuario.id);
    return NextResponse.json({ automatizaciones: next });
  },
);
