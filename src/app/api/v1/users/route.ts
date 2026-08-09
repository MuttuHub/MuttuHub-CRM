// Users admin API (PRD §3.3, §8.2). ADMINISTRADOR only — every handler goes
// through requireApiRole which answers 401/403 JSON instead of redirects.
//
// KEY DESIGN DECISION: the app-level Usuario row gets `id = Supabase auth
// user uuid`. An admin creating a user calls supabase.admin.createUser first
// (service role key), then prisma.usuario.create with that same id — a 1:1
// mapping that keeps FK integrity between Supabase Auth and the usuarios
// table (documented in the README).

import { NextResponse } from "next/server";
import type { RolUsuario } from "@prisma/client";
import { db } from "@/lib/db";
import {
  apiError,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  parseJsonBody,
} from "@/lib/api/errors";
import { ROLE_LABELS } from "@/lib/auth/types";
import {
  requireApiRole,
} from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const USER_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  created_at: true,
} as const;

export async function GET() {
  const auth = await requireApiRole(["ADMINISTRADOR"]);
  if (!auth.ok) return auth.response;

  try {
    const usuarios = await db.usuario.findMany({
      select: USER_SELECT,
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ usuarios });
  } catch (err) {
    console.error("[users] list failed:", err);
    return apiError(
      "No pudimos cargar los usuarios. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["ADMINISTRADOR"]);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<{
    nombre?: string;
    email?: string;
    rol?: RolUsuario;
    password?: string;
  }>(request);

  const nombre = body?.nombre?.trim() ?? "";
  const email = normalizeEmail(body?.email ?? "");
  const rol = body?.rol;
  const password = body?.password ?? "";

  if (!nombre || !email || !rol) {
    return apiError(
      "Nombre, correo y rol son obligatorios.",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (!isValidEmail(email)) {
    return apiError("Ingresa un correo válido.", 400, "VALIDATION_ERROR");
  }
  if (!(rol in ROLE_LABELS)) {
    return apiError("Rol no válido.", 400, "VALIDATION_ERROR");
  }
  if (!isValidPassword(password)) {
    return apiError(
      "La contraseña debe tener al menos 8 caracteres, con letras y números.",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Early conflict check (best-effort; Supabase is the final authority).
  try {
    const existing = await db.usuario.findUnique({ where: { email } });
    if (existing) {
      return apiError("El correo ya está registrado.", 409, "CONFLICT");
    }
  } catch (err) {
    console.error("[users] email conflict check failed:", err);
  }

  // Service-role client: auth.admin.* (createUser/deleteUser) requires the
  // service role key, the anon-key client cannot perform admin operations.
  const supabaseAdmin = createSupabaseAdmin();

  const { data: created, error: supabaseError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (supabaseError || !created.user) {
    // Never leak the raw Supabase error message.
    console.error("[users] createUser failed:", supabaseError);
    const isDuplicate = String(supabaseError?.message ?? "").toLowerCase().includes("already registered");
    return apiError(
      isDuplicate
        ? "El correo ya está registrado."
        : "No pudimos crear el usuario. Inténtalo de nuevo.",
      isDuplicate ? 409 : 500,
      isDuplicate ? "CONFLICT" : "INTERNAL_ERROR",
    );
  }

  try {
    // Usuario.id = Supabase auth user uuid (1:1 mapping, FK integrity).
    const usuario = await db.usuario.create({
      data: {
        id: created.user.id,
        nombre,
        email,
        rol,
      },
      select: USER_SELECT,
    });
    return NextResponse.json({ usuario }, { status: 201 });
  } catch (err) {
    console.error("[users] prisma create failed:", err);
    // Roll back the Supabase side so no orphan auth user is left behind.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return apiError(
      "No pudimos guardar el usuario. Inténtalo de nuevo.",
      500,
      "INTERNAL_ERROR",
    );
  }
}