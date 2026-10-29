// POST /api/v1/users/:id/resend-invite — regenerate an invite link for an
// existing user (ADMINISTRADOR). Reuses the same generateLink({ type:
// "invite" }) call already used in POST /api/v1/users for the duplicate-email
// fallback, now reachable on demand from the admin panel instead of only on a
// creation conflict.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "users",
  "No pudimos generar el enlace de invitación. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiRole(["ADMINISTRADOR"]);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const existing = await db.usuario.findUnique({ where: { id } });
    if (!existing) {
      return apiError("El usuario no existe.", 404, "NOT_FOUND");
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: existing.email,
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[users/resend-invite] generateLink failed:", linkError);
      return apiError(
        "No pudimos generar el enlace de invitación. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }

    return NextResponse.json({ inviteUrl: linkData.properties.action_link });
  },
);
