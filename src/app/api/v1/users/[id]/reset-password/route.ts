// POST /api/v1/users/:id/reset-password — generate a password-recovery link
// for a user (ADMINISTRADOR), to hand over manually instead of relying on
// SMTP delivery (see "Correos automáticos" in docs/guia-uso-proyectos-v2.md).
// Mirrors generateLink({ type: "invite" }) from resend-invite, with
// type: "recovery" instead.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiRole } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiErrorHandling(
  "users",
  "No pudimos generar el enlace de restablecimiento. Inténtalo de nuevo.",
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
        type: "recovery",
        email: existing.email,
      });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[users/reset-password] generateLink failed:", linkError);
      return apiError(
        "No pudimos generar el enlace de restablecimiento. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }

    return NextResponse.json({ resetUrl: linkData.properties.action_link });
  },
);
