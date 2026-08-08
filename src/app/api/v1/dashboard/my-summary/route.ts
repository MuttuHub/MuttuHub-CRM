// GET /api/v1/dashboard/my-summary — cara "Mi resumen" (PRD §7.1): SIEMPRE
// scope "own" (los datos de quien llama), sea cual sea su rol.
//
// Filtros comunes (PRD §7.2): `desde`/`hasta` aplican sobre
// Tarea.fecha_entrega; `tipo_cliente` vía cliente. `responsable_id` no aplica:
// el scope es "own" por definición.
//
// Buckets (definiciones documentadas):
// - activas: tareas propias abiertas (OPEN_TASK_STATES, sin borrar).
// - vencidas: activas con fecha_entrega < inicio del día actual (misma regla
//   del motor de alertas src/lib/alerts.ts).
// - hoy: bucket pequeño del motor de alertas (fecha_entrega en [hoy, mañana))
//   para enlazar la campana de notificaciones (PRD §4.4).
// - compromisos_pendientes: tareas propias abiertas con origen CRM o AMBOS
//   (schema OrigenTarea); `vencidos` = su subconjunto vencido.
// - clientes_asignados: clientes sin borrar donde yo soy el responsable.

import { NextResponse } from "next/server";
import type { OrigenTarea } from "@prisma/client";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { OPEN_TASK_STATES } from "@/lib/api/crm";
import { addLocalDays, startOfLocalDay } from "@/lib/alerts";
import {
  parseDashboardFilters,
  rangoDeFechasNullable,
  tareaScopeWhere,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

/** Orígenes que definen un compromiso del CRM (schema OrigenTarea). */
const ORIGENES_COMPROMISO: readonly OrigenTarea[] = ["CRM", "AMBOS"];

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = parseDashboardFilters(url);
  if (!parsed.ok) return parsed.response;
  const filters = parsed.filters;

  const inicioHoy = startOfLocalDay();
  const inicioManana = addLocalDays(inicioHoy, 1);

  try {
    const rango = rangoDeFechasNullable(filters);
    const where = tareaScopeWhere("own", auth.usuario, filters, {
      estado: OPEN_TASK_STATES,
      ...(rango && { fecha_entrega: rango }),
    });

    const [tareas, clientes] = await Promise.all([
      db.tarea.findMany({
        where,
        select: { id: true, titulo: true, estado: true, fecha_entrega: true, origen: true },
        orderBy: { fecha_entrega: "asc" },
      }),
      db.cliente.findMany({
        where: { deleted_at: null, responsable_id: auth.usuario.id },
        select: { id: true, nombre: true, estado: true, prioridad: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    const itemCon = (t: (typeof tareas)[number]) => ({
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      fecha_entrega: t.fecha_entrega,
      origen: t.origen,
    });
    const vencida = (t: (typeof tareas)[number]) =>
      t.fecha_entrega !== null && t.fecha_entrega.getTime() < inicioHoy.getTime();
    const deHoy = (t: (typeof tareas)[number]) =>
      t.fecha_entrega !== null &&
      t.fecha_entrega.getTime() >= inicioHoy.getTime() &&
      t.fecha_entrega.getTime() < inicioManana.getTime();

    const activas = tareas.map(itemCon);
    const vencidas = tareas.filter(vencida).map(itemCon);
    const compromisos = tareas.filter((t) =>
      ORIGENES_COMPROMISO.includes(t.origen),
    );
    const clientes_asignados = clientes.map((c) => ({
      cliente_id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      prioridad: c.prioridad,
    }));

    return NextResponse.json({
      scope: "own",
      activas: { count: activas.length, items: activas },
      vencidas: { count: vencidas.length, items: vencidas },
      hoy: { count: tareas.filter(deHoy).length },
      compromisos_pendientes: {
        count: compromisos.length,
        vencidos: compromisos.filter(vencida).length,
      },
      clientes_asignados: { count: clientes_asignados.length, items: clientes_asignados },
    });
  } catch (err) {
    console.error("[dashboard/my-summary] failed:", err);
    return apiError("No pudimos cargar tu resumen. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}