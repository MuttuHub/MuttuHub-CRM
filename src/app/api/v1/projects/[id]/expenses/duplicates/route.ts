// GET /api/v1/projects/:id/expenses/duplicates?tercero_tipo_id=&tercero_numero_id=&numero_documento=
//
// S2/L16 (b): the read-only check the expense form runs before saving. It answers with the same
// `DUPLICADO` alert (same normalized keys — `clavesNormalizadas` — and same wording/project
// redaction) as the post-save alert of `buscarDuplicados` (RF-21), behind the same project-readability
// gate as the expense list. It never blocks and never writes; a third party without an identification
// number cannot be checked (a live rule of RF-21).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import {
  GASTO_DUPLICADO_QUERY_SCHEMA,
  buscarDuplicados,
  clavesNormalizadas,
  gateGastoRead,
} from "@/lib/api/gastos";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos verificar los duplicados. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const params = new URL(request.url).searchParams;
    const parsed = GASTO_DUPLICADO_QUERY_SCHEMA.safeParse({
      tercero_tipo_id: params.get("tercero_tipo_id") ?? undefined,
      tercero_numero_id: params.get("tercero_numero_id") ?? undefined,
      numero_documento: params.get("numero_documento") ?? undefined,
    });
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Datos no válidos.", 400, "VALIDATION_ERROR");
    }

    const claves = clavesNormalizadas({
      tercero_tipo_id: parsed.data.tercero_tipo_id ?? null,
      tercero_numero_id: parsed.data.tercero_numero_id ?? null,
      numero_documento: parsed.data.numero_documento,
    });
    const alertas =
      claves.tercero_id_norm === null
        ? []
        : await buscarDuplicados(auth.usuario, {
            id: "",
            proyecto_id: id,
            estado: "REGISTRADO",
            ...claves,
          });
    return NextResponse.json({ alertas });
  },
);
