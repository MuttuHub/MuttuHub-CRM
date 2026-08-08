// GET /api/v1/dashboard/pipeline — cara "Pipeline Comercial" (PRD §7.1).
//
// Filtros comunes (PRD §7.2): `desde`/`hasta` (YYYY-MM-DD inclusivos; aplican
// sobre Oportunidad.created_at y por defecto cubren todo el histórico),
// `responsable_id` (en scope "all" filtra clientes; en scope "own" se ignora
// en silencio) y `tipo_cliente` (enum TipoCliente — los valores reales son
// los del schema, no los del brief). El alcance se documenta en
// src/lib/dashboard.ts y se devuelve como `scope: "own" | "all"`.
//
// Embudo = todos los estados NO finalizados del schema (GANADA y PERDIDA
// quedan fuera): DISENANDO_PROPUESTA, PRESENTADA, EN_REVISION, EN_NEGOCIACION,
// STANDBY. `comparativo.ratio` = ganado_historico / potencial_activo (0 cuando
// no hay potencial).
//
// Volumen pequeño (SMALL, PRD §8.4): findMany + agregación en JS (sin
// groupBy — patrón fijado del repo en Prisma 7).

import { NextResponse } from "next/server";
import type { EstadoOportunidad } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import {
  clienteScopeWhere,
  parseDashboardFilters,
  rangoDeFechas,
  resolveScope,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

/** Orden del embudo: estados no finalizados del schema (PRD §7.1). */
const OFFER_STATES: readonly EstadoOportunidad[] = [
  "DISENANDO_PROPUESTA",
  "PRESENTADA",
  "EN_REVISION",
  "EN_NEGOCIACION",
  "STANDBY",
];

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = parseDashboardFilters(url);
  if (!parsed.ok) return parsed.response;
  const filters = parsed.filters;

  const scope = resolveScope(auth.usuario);

  try {
    const clienteWhere = clienteScopeWhere(scope, auth.usuario, filters);
    const rango = rangoDeFechas(filters);

    const oportunidades = await db.oportunidad.findMany({
      where: {
        deleted_at: null,
        cliente: clienteWhere,
        ...(rango && { created_at: rango }),
      },
      select: {
        id: true,
        estado: true,
        valor_estimado_cop: true,
        cliente: { select: { id: true, nombre: true } },
      },
    });

    const activas = oportunidades.filter((o) => OFFER_STATES.includes(o.estado));
    const valorActivo =
      Math.round(
        activas.reduce((acc, o) => acc + Number(o.valor_estimado_cop ?? 0), 0) * 100,
      ) / 100;

    const embudo = OFFER_STATES.map((estado) => ({
      estado,
      count: activas.filter((o) => o.estado === estado).length,
    }));

    const porCliente = new Map<string, { nombre: string; valor: number }>();
    for (const o of activas) {
      const actual = porCliente.get(o.cliente.id) ?? {
        nombre: o.cliente.nombre,
        valor: 0,
      };
      actual.valor += Number(o.valor_estimado_cop ?? 0);
      porCliente.set(o.cliente.id, actual);
    }
    const top_clientes = [...porCliente.entries()]
      .sort((a, b) => b[1].valor - a[1].valor)
      .slice(0, 5)
      .map(([cliente_id, { nombre, valor }]) => ({
        cliente_id,
        nombre,
        valor_potencial: Math.round(valor * 100) / 100,
      }));

    const ganadoHistorico =
      Math.round(
        oportunidades
          .filter((o) => o.estado === "GANADA")
          .reduce((acc, o) => acc + Number(o.valor_estimado_cop ?? 0), 0) * 100,
      ) / 100;
    const ratio =
      valorActivo > 0 ? Math.round((ganadoHistorico / valorActivo) * 100) / 100 : 0;

    return NextResponse.json({
      scope,
      total_activas: activas.length,
      valor_activo: valorActivo,
      embudo,
      top_clientes,
      comparativo: {
        potencial_activo: valorActivo,
        ganado_historico: ganadoHistorico,
        ratio,
      },
    });
  } catch (err) {
    console.error("[dashboard/pipeline] failed:", err);
    return apiError("No pudimos cargar el pipeline. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}