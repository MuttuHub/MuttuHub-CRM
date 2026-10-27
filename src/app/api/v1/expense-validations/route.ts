// GET /api/v1/expense-validations?estado=REGISTRADO&limit=50 (S6 U4, RF-22).
//
// Cross-project validation queue for ADMINISTRADOR/GERENCIA only (403 otherwise), oldest first,
// excluding soft-deleted projects. The third-party identification number never leaves this route
// (RNF-04); `propio` marks the actor's own expenses, which they cannot validate.

import { NextResponse } from "next/server";
import type { EstadoProyecto } from "@prisma/client";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { canManageProjects } from "@/lib/permissions";
import { GASTO_FORBIDDEN_MESSAGE } from "@/lib/api/gastos";
import { ESTADOS_PROYECTO_VALIDACION } from "@/lib/api/validacion-gastos";
import { datosIncompletos } from "@/lib/proyectos/gastos";
import { fromCents, toCents } from "@/lib/proyectos/money";
import { isoDate } from "@/lib/proyectos/proyecto-general";

export const dynamic = "force-dynamic";

const ESTADOS = ["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"] as const;
type EstadoCola = (typeof ESTADOS)[number];
const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 200;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar la cola de validación. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!canManageProjects(auth.usuario)) return apiError(GASTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");

    const params = new URL(request.url).searchParams;
    const estado = (params.get("estado") ?? "REGISTRADO") as EstadoCola;
    if (!ESTADOS.includes(estado)) return apiError("El estado no es válido.", 400, "VALIDATION_ERROR");

    const limitText = params.get("limit");
    let limit = LIMITE_DEFECTO;
    if (limitText !== null) {
      limit = Number(limitText);
      if (!Number.isInteger(limit) || limit < 1 || limit > LIMITE_MAXIMO) {
        return apiError("El límite no es válido.", 400, "VALIDATION_ERROR");
      }
    }

    const rows = await db.gasto.findMany({
      where: { estado, proyecto: { deleted_at: null, estado: { in: [...ESTADOS_PROYECTO_VALIDACION] as EstadoProyecto[] } } },
      select: {
        id: true,
        proyecto_id: true,
        proyecto: { select: { codigo: true, nombre: true } },
        linea: { select: { rubro: { select: { id: true, codigo: true, nombre: true } } } },
        fecha_documento: true,
        periodo: true,
        tercero_nombre: true,
        tercero_tipo_id: true,
        tercero_numero_id: true,
        numero_documento: true,
        descripcion: true,
        monto_cop: true,
        estado: true,
        alerta_sobregasto: true,
        registrado_por_id: true,
        created_at: true,
        // B8: an imported expense has no support until one is attached; it cannot be validated yet.
        _count: { select: { soportes: { where: { deleted_at: null } } } },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      take: limit,
    });

    const registradores = await db.usuario.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.registrado_por_id))] } },
      select: { id: true, nombre: true },
    });
    const nombres = new Map(registradores.map((usuario) => [usuario.id, usuario.nombre]));

    return NextResponse.json({
      gastos: rows.map((row) => ({
        id: row.id,
        proyecto_id: row.proyecto_id,
        proyecto_codigo: row.proyecto.codigo,
        proyecto_nombre: row.proyecto.nombre,
        rubro: row.linea.rubro,
        fecha_documento: isoDate(row.fecha_documento),
        periodo: row.periodo,
        tercero_nombre: row.tercero_nombre,
        tercero_tipo_id: row.tercero_tipo_id,
        numero_documento: row.numero_documento,
        descripcion: row.descripcion,
        valor: fromCents(toCents(row.monto_cop)),
        estado: row.estado,
        alerta_sobregasto: row.alerta_sobregasto,
        datos_incompletos: datosIncompletos(row),
        sin_soporte: row._count.soportes === 0,
        registrado_por_id: row.registrado_por_id,
        registrado_por_nombre: nombres.get(row.registrado_por_id) ?? null,
        propio: row.registrado_por_id === auth.usuario.id,
        created_at: row.created_at.toISOString(),
      })),
    });
  },
);
