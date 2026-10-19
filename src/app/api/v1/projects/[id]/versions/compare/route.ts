// GET /api/v1/projects/:id/versions/compare?from=0&to=vigente — differences between two versions
// (S8 U5, E-27). `from` and `to` are a version number or `vigente` (built from the live tables);
// the defaults compare the original baseline against the vigente. Declared as its own static route
// so the dynamic `[numero]` segment never shadows it.
// Whoever can read the project (404 -> 403 -> 400 token -> 404 version).

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { gatePresupuestoRead } from "@/lib/api/presupuesto";
import {
  VERSION_INVALIDA,
  VERSION_NO_EXISTE,
  loadSnapshotVersion,
  loadSnapshotVigente,
  parseTokenVersion,
  type TokenVersion,
} from "@/lib/api/versiones";
import { diffSnapshots, type SnapshotV1 } from "@/lib/proyectos/versiones";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function resolver(proyectoId: string, token: TokenVersion): Promise<SnapshotV1 | null> {
  return token.tipo === "vigente" ? loadSnapshotVigente(proyectoId) : loadSnapshotVersion(proyectoId, token.numero);
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos comparar las versiones. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const params = new URL(request.url).searchParams;
    const desde = params.get("from") ?? "0";
    const hasta = params.get("to") ?? "vigente";
    const tokenDesde = parseTokenVersion(desde, true);
    const tokenHasta = parseTokenVersion(hasta, true);
    if (!tokenDesde || !tokenHasta) return apiError(VERSION_INVALIDA, 400, "VALIDATION_ERROR");

    const [a, b] = await Promise.all([resolver(id, tokenDesde), resolver(id, tokenHasta)]);
    if (!a || !b) return apiError(VERSION_NO_EXISTE, 404, "NOT_FOUND");

    return NextResponse.json({ desde, hasta, diferencias: diffSnapshots(a, b) });
  },
);
