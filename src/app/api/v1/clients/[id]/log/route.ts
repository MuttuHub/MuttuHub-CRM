// GET/POST /api/v1/clients/:id/log — bitácora de gestión (PRD §4.2 tab
// "Bitácora de gestión"). Entries are IMMUTABLE by design: once saved they
// can never be edited or deleted — only appended (PRD §4.2, schema has no
// updated_at nor deleted_at on BitacoraEntrada). There are intentionally NO
// PATCH/DELETE routes for this resource.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ETIQUETAS_SCHEMA } from "@/lib/api/etiquetas";
import { checkOportunidadClienteConsistency, getClientForWrite, loadClientScoped, zodError } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// v7 alignment C3a (Interacciones): the catalog of interaction kinds, mirrored
// from the Prisma `TipoInteraccion` enum. Kept local to the route because the
// shared ENUM_VALUES catalog lives outside this unit's edit surface.
const TIPOS_INTERACCION = ["REUNION", "CORREO", "LLAMADA", "VISITA", "OTRO"] as const;

export const LOG_ENTRY_SCHEMA = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "El texto de la nota es obligatorio.")
    .max(4000, "La nota no puede superar los 4000 caracteres."),
  // RF-C03 (commercial-opportunities spec): optional link to the client's
  // commercial cycle — same client-consistency invariant as Tarea (D1/D2).
  oportunidad_id: z.string().nullable().optional(),
  // v7 C3a: the kind of interaction; OTRO when omitted.
  tipo: z.enum(TIPOS_INTERACCION, { error: "Tipo de interacción no válido." }).optional(),
  // v7 C3a: optional next step agreed in the interaction.
  proximo_paso: z
    .string()
    .trim()
    .max(2000, "El próximo paso no puede superar los 2000 caracteres.")
    .nullable()
    .optional(),
  // T8 (S16): optional project the interaction was about; only a project where this client is an ally.
  proyecto_id: z.string().min(1, "El proyecto no es válido.").nullable().optional(),
  // S18: optional tags from the `task_tags` catalog; never required.
  etiquetas: ETIQUETAS_SCHEMA.optional(),
});

const ENTRADA_SELECT = {
  id: true,
  autor_id: true,
  autor: { select: { nombre: true } },
  texto: true,
  oportunidad_id: true,
  proyecto_id: true,
  tipo: true,
  proximo_paso: true,
  etiquetas: true,
  created_at: true,
} as const;

export const GET = withApiErrorHandling(
  "log",
  "No pudimos cargar la bitácora. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const cliente = await loadClientScoped(id);
    if (!cliente) {
      return apiError("El cliente no existe.", 404, "NOT_FOUND");
    }
    const entradas = await db.bitacoraEntrada.findMany({
      where: { cliente_id: id },
      orderBy: { created_at: "asc" },
      select: ENTRADA_SELECT,
    });
    return NextResponse.json({
      entradas: entradas.map(({ autor, ...entrada }) => ({
        ...entrada,
        autor_nombre: autor.nombre,
      })),
    });
  },
);

export const POST = withApiErrorHandling(
  "log",
  "No pudimos guardar la nota. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const body = await parseJsonBody<unknown>(request);
    if (body === null) {
      return apiError("Cuerpo de la solicitud no válido.", 400, "VALIDATION_ERROR");
    }
    const parsed = LOG_ENTRY_SCHEMA.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const access = await getClientForWrite(id, auth.usuario);
    if (!access.ok) {
      return apiError(
        access.code === "NOT_FOUND" ? "El cliente no existe." : "No tienes permisos sobre este cliente.",
        access.code === "NOT_FOUND" ? 404 : 403,
        access.code,
      );
    }

    if (parsed.data.oportunidad_id) {
      const invariantError = await checkOportunidadClienteConsistency(parsed.data.oportunidad_id, id);
      if (invariantError) return invariantError;
    }

    if (parsed.data.proyecto_id) {
      const aliado = await db.proyectoCliente.findFirst({
        where: { proyecto_id: parsed.data.proyecto_id, cliente_id: id, proyecto: { deleted_at: null } },
        select: { id: true },
      });
      if (!aliado) {
        return apiError("Este cliente no es aliado del proyecto.", 400, "VALIDATION_ERROR");
      }
    }

    // autor is always the session user — never a client-providable field.
    const entrada = await db.bitacoraEntrada.create({
      data: {
        cliente_id: id,
        autor_id: auth.usuario.id,
        texto: parsed.data.texto,
        oportunidad_id: parsed.data.oportunidad_id ?? undefined,
        proyecto_id: parsed.data.proyecto_id ?? undefined,
        tipo: parsed.data.tipo ?? "OTRO",
        proximo_paso: parsed.data.proximo_paso?.trim() || undefined,
        etiquetas: parsed.data.etiquetas ?? [],
      },
      select: ENTRADA_SELECT,
    });
    return NextResponse.json(
      { entrada: { ...entrada, autor_nombre: entrada.autor.nombre } },
      { status: 201 },
    );
  },
);
