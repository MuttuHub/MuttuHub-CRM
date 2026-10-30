// GET   /api/v1/settings/semaforo-v2 — parámetros del semáforo v2. Cualquier
//   usuario autenticado los lee (misma convención que /catalogs/settings); sin
//   fila o con datos mal formados responde los defaults, todos sin confirmar.
// PATCH /api/v1/settings/semaforo-v2 — solo ADMINISTRADOR. Actualización
//   parcial: `{ <parametro>: { valor?, confirmado? } }`. `confirmado` solo
//   cambia cuando se envía explícitamente. Cada campo que cambia deja una fila
//   `CAMBIAR_PARAMETRO` en `auditoria_cambios` (entidad `parametro`) en la MISMA
//   transacción que el guardado (ADR-05).
// El PUT de /settings tiene un cuerpo fijo de dos claves y no audita: no se toca.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { getSemaforoParametrosV2, SETTING_SEMAFORO_PARAMETROS_V2 } from "@/lib/settings";
import {
  PARAMETRO_KEYS,
  parametrosV2Issue,
  type ParametroKey,
  type ParametrosV2,
} from "@/lib/proyectos/semaforo-v2";

export const dynamic = "force-dynamic";

const porcentaje = z
  .number("Debe ser un número.")
  .min(0, "Debe estar entre 0 y 100.")
  .max(100, "Debe estar entre 0 y 100.");

function patchItem(valor: z.ZodType) {
  return z
    .object({ valor: valor.optional(), confirmado: z.boolean().optional() })
    .strict()
    .refine((item) => item.valor !== undefined || item.confirmado !== undefined, {
      message: "Envía 'valor' o 'confirmado'.",
    });
}

export const SEMAFORO_V2_PATCH_SCHEMA = z
  .object({
    umbral1: patchItem(porcentaje),
    umbral2: patchItem(porcentaje),
    tolerancia: patchItem(porcentaje),
    retraso: patchItem(porcentaje),
    avance_requiere_medio: patchItem(z.boolean()),
    modificacion_bloquea_periodos_pasados: patchItem(z.boolean()),
    tope_en_curso: patchItem(porcentaje),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "Envía al menos un parámetro." });

export const GET = withApiErrorHandling(
  "settings/semaforo-v2",
  "No pudimos cargar los parámetros del semáforo. Inténtalo de nuevo.",
  async () => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    return NextResponse.json({ parametros: await getSemaforoParametrosV2() });
  },
);

export const PATCH = withApiErrorHandling(
  "settings/semaforo-v2",
  "No pudimos guardar los parámetros del semáforo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = SEMAFORO_V2_PATCH_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }

    const current = await getSemaforoParametrosV2();
    const next = structuredClone(current) as Record<ParametroKey, { valor: unknown; confirmado: boolean }>;
    const cambios: CambioInput[] = [];

    for (const key of PARAMETRO_KEYS) {
      const patch = parsed.data[key];
      if (!patch) continue;
      for (const campo of ["valor", "confirmado"] as const) {
        const nuevo = patch[campo];
        if (nuevo === undefined || nuevo === next[key][campo]) continue;
        cambios.push({
          usuario_id: auth.usuario.id,
          accion: "CAMBIAR_PARAMETRO",
          entidad: "parametro",
          entidad_id: SETTING_SEMAFORO_PARAMETROS_V2,
          campo: `${key}.${campo}`,
          valor_anterior: next[key][campo],
          valor_nuevo: nuevo,
        });
        next[key][campo] = nuevo as never;
      }
    }

    const issue = parametrosV2Issue(next as unknown as ParametrosV2);
    if (issue) return apiError(issue, 400, "VALIDATION_ERROR");

    if (cambios.length > 0) {
      await db.$transaction(async (tx) => {
        await tx.setting.upsert({
          where: { key: SETTING_SEMAFORO_PARAMETROS_V2 },
          create: { key: SETTING_SEMAFORO_PARAMETROS_V2, value: next as never, updated_by: auth.usuario.id },
          update: { value: next as never, updated_by: auth.usuario.id },
        });
        await logChanges(tx, cambios);
      });
    }

    return NextResponse.json({ parametros: next });
  },
);
