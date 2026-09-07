// POST /api/v1/auth/change-password — pedido #2 del jefe: un usuario ya
// logueado puede cambiar su propia contraseña desde el panel (antes solo
// existía "olvidé mi contraseña" por email, ver reset-password/confirm).
//
// A diferencia de ese flujo (link de recuperación para alguien SIN sesión),
// acá reautenticamos con la contraseña ACTUAL antes de aplicar la nueva: sin
// este paso, cualquiera con la sesión abierta (ej. una laptop desatendida)
// podría cambiarla sin saberla.
//
// Code review finding: verificar con supabase.auth.signInWithPassword() en el
// cliente normal (createServerSupabase, atado a las cookies de sesión) emite
// una sesión NUEVA en el éxito y la persiste, pisando en silencio la sesión
// que requireApiUser() ya había validado — con rotación de refresh tokens
// activada, eso puede cerrar sesión en otra pestaña/dispositivo sin aviso.
// En su lugar: verificamos con el cliente de service-role (sin
// persistSession/autoRefreshToken, no toca cookies) y aplicamos el cambio vía
// Admin API (updateUserById), que tampoco depende de la sesión del usuario.
// Esto también evita crear un segundo cliente atado a cookies (requireApiUser
// ya usó uno) — un solo cliente admin cubre ambos pasos.
import { NextResponse } from "next/server";
import { apiError, isValidPassword, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const POST = withApiErrorHandling(
  "auth/change-password",
  "No pudimos actualizar tu contraseña. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody<{
      currentPassword?: string;
      newPassword?: string;
    }>(request);

    const currentPassword = body?.currentPassword ?? "";
    const newPassword = body?.newPassword ?? "";

    if (!currentPassword) {
      return apiError("Ingresa tu contraseña actual.", 400, "VALIDATION_ERROR");
    }
    if (!isValidPassword(newPassword)) {
      return apiError(
        "La contraseña debe tener al menos 8 caracteres, con letras y números.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const email = auth.supabaseUser.email;
    if (!email) {
      return apiError(
        "No pudimos verificar tu contraseña actual. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      // Code review finding: alguien que solo inició sesión con Google (ver
      // acceso-page.tsx / auth/callback/route.ts) nunca tuvo una contraseña
      // que verificar acá — el mensaje genérico los mandaría a un callejón
      // sin salida, así que les señalamos la salida real.
      return apiError(
        "La contraseña actual no es correcta. Si iniciaste sesión con Google o nunca definiste una contraseña, usa \"¿Olvidaste tu contraseña?\" en la pantalla de inicio de sesión.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      auth.supabaseUser.id,
      { password: newPassword },
    );
    if (updateError) {
      console.error("[auth/change-password] updateUserById failed:", updateError);
      return apiError(
        "No pudimos actualizar tu contraseña. Inténtalo de nuevo.",
        500,
        "INTERNAL_ERROR",
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Contraseña actualizada correctamente.",
    });
  },
);
