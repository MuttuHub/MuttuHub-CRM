// GET /api/v1/cron/daily — daily email digest per user (PRD §4.4.1).
//
// REGRESSION SENTINEL (PR 3 / close-phase-1): unlike tasks / clients /
// dashboard reads (which became global in this PR), the daily digest is
// PERSONAL. COLABORADOR receives a digest listing only their own tasks;
// full-access roles (COORDINADOR, GERENCIA, ADMINISTRADOR) receive the
// platform-wide digest. This mirrors notifications/route.ts:90 — the
// matrix is `scope = "own"` for COLABORADOR, `"all"` for the rest.
//
// The handler stays behind `requireApiUser` so a per-user session can drive
// it (and so the test can pin the scope matrix with role mocks). The
// production cron trigger runs the same `getAlertBuckets(usuario, scope)`
// out of process against this same endpoint.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { getAlertBuckets } from "@/lib/alerts";
import { sendDailySummary } from "@/lib/email";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(
  "cron/daily",
  "No pudimos generar el resumen diario. Inténtalo de nuevo.",
  async (_request: Request) => { // eslint-disable-line @typescript-eslint/no-unused-vars -- Next.js handler signature; request body unused
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    // PR 3 sentinels: COLABORADOR → "own"; full-access roles → "all". Same
    // matrix as notifications/route.ts:90 — do not change without re-reading
    // the daily-email privacy contract.
    const scope = auth.usuario.rol === "COLABORADOR" ? "own" : "all";
    const buckets = await getAlertBuckets(scope, { id: auth.usuario.id });

    // Best-effort send: a transport failure must not fail the response (the
    // snapshot is the source of truth and is returned to the caller too).
    try {
      const result = await sendDailySummary(
        { nombre: auth.usuario.nombre, email: auth.usuario.email },
        buckets,
      );
      if (!result.ok) {
        console.error("[cron/daily] digest email failed (best-effort):", result.error);
      }
    } catch (err) {
      console.error("[cron/daily] digest email threw (best-effort):", err);
    }

    return NextResponse.json({
      scope,
      total: buckets.vencidos.length + buckets.hoy.length + buckets.proximos3.length,
      vencidos: buckets.vencidos.length,
      hoy: buckets.hoy.length,
      proximos3: buckets.proximos3.length,
    });
  },
);