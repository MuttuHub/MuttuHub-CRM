// GET /api/v1/dashboard/clients-activity — cara "Actividad de Clientes"
// (PRD §7.1): clientes sin gestión reciente, distribución y actividad por
// responsable.
//
// Filtros comunes (PRD §7.2): `desde`/`hasta` aplican a las GESTIONES
// (created_at de BitacoraEntrada) y a las tareas contadas en
// actividad_por_responsable (también created_at); no alteran la distribución
// estructural. `responsable_id` (scope "all" filtra; "own" se ignora) y
// `tipo_cliente` filtran el conjunto de clientes (ver src/lib/dashboard.ts).
//
// - `sin_gestion`: clientes SIN entrada de bitácora dentro de los últimos
//   `dias_sin_gestion` días (1-90, default 14; inválido → 400
//   VALIDATION_ERROR). Un cliente sin NINGUNA entrada también califica.
//   `ultima_gestion` = fecha de la última BitacoraEntrada (modelo inmutable,
//   sin deleted_at) o null. Lista hasta 25, ordenada de la gestión más
//   antigua a la más reciente (sin gestión = más urgente).
// - `distribucion`: conteos sobre TODO el alcance (no solo sin_gestion).
// - `actividad_por_responsable`: gestiones (bitácora en rango) y
//   tareas_count (Tarea no borrada, en rango) por responsable de los clientes
//   en alcance.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { ENUM_VALUES } from "@/lib/catalogs";
import {
  clienteScopeWhere,
  parseDashboardFilters,
  rangoDeFechas,
  resolveScope,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

const DIAS_DEFAULT = 14;
const DIAS_MIN = 1;
const DIAS_MAX = 90;
/** Límite de la lista de sin_gestion (previsualización, PRD §7.1). */
const MAX_SIN_GESTION = 25;

/** Milisegundos por día para el corte "sin gestión en los últimos X días". */
const MS_DIA = 24 * 60 * 60 * 1000;

export const GET = withApiErrorHandling(
  "dashboard/clients-activity",
  "No pudimos cargar la actividad de clientes. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    const sp = url.searchParams;
    const diasRaw = sp.get("dias_sin_gestion");
    const dias = diasRaw === null ? DIAS_DEFAULT : Number(diasRaw);
    if (diasRaw !== null && (!Number.isInteger(dias) || dias < DIAS_MIN || dias > DIAS_MAX)) {
      return apiError(`dias_sin_gestion no válido (${DIAS_MIN}-${DIAS_MAX}).`, 400, "VALIDATION_ERROR");
    }

    const scope = resolveScope(auth.usuario);

    const clienteWhere = clienteScopeWhere(scope, auth.usuario, filters);
    const rango = rangoDeFechas(filters);
    const corte = new Date(Date.now() - dias * MS_DIA);

    const [clientes, gestiones, tareas] = await Promise.all([
      db.cliente.findMany({
        where: clienteWhere,
        select: {
          id: true,
          nombre: true,
          tipo_cliente: true,
          estado: true,
          prioridad: true,
          responsable_id: true,
          responsable: { select: { nombre: true } },
          bitacora: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { created_at: true },
          },
        },
      }),
      db.bitacoraEntrada.findMany({
        where: { cliente: clienteWhere, ...(rango && { created_at: rango }) },
        select: { cliente_id: true },
      }),
      db.tarea.findMany({
        where: {
          deleted_at: null,
          cliente: clienteWhere,
          ...(rango && { created_at: rango }),
        },
        select: { cliente_id: true },
      }),
    ]);

    // ClientWithUltima: cliente + última gestión (null = nunca gestionado).
    type ClienteGestion = {
      cliente_id: string;
      nombre: string;
      tipo: (typeof clientes)[number]["tipo_cliente"];
      estado: (typeof clientes)[number]["estado"];
      prioridad: (typeof clientes)[number]["prioridad"];
      responsable_nombre: string;
      ultima_gestion: Date | null;
    };
    const conUltima: ClienteGestion[] = clientes.map((c) => ({
      cliente_id: c.id,
      nombre: c.nombre,
      tipo: c.tipo_cliente,
      estado: c.estado,
      prioridad: c.prioridad,
      responsable_nombre: c.responsable.nombre,
      ultima_gestion: c.bitacora[0]?.created_at ?? null,
    }));

    // ── Sin gestión (sin bitácora en los últimos `dias` días, o ninguna) ──
    const sinGestion = conUltima
      .filter(
        (c) => c.ultima_gestion === null || c.ultima_gestion.getTime() < corte.getTime(),
      )
      .sort((a, b) => (a.ultima_gestion?.getTime() ?? 0) - (b.ultima_gestion?.getTime() ?? 0))
      .slice(0, MAX_SIN_GESTION);

    // ── Distribución (sobre TODO el alcance, no solo sin gestión) ──
    const por_tipo = (ENUM_VALUES.TipoCliente as readonly string[]).map((tipo) => ({
      tipo,
      count: clientes.filter((c) => c.tipo_cliente === tipo).length,
    }));
    const por_estado = (ENUM_VALUES.EstadoCliente as readonly string[]).map((estado) => ({
      estado,
      count: clientes.filter((c) => c.estado === estado).length,
    }));
    const por_prioridad = (ENUM_VALUES.PrioridadCliente as readonly string[]).map((prioridad) => ({
      prioridad,
      count: clientes.filter((c) => c.prioridad === prioridad).length,
    }));

    // ── Actividad por responsable ────────────────────────────────
    const responsableDelCliente = new Map(clientes.map((c) => [c.id, c.responsable_id]));
    const nombreDelResponsable = new Map(
      clientes.map((c) => [c.responsable_id, c.responsable.nombre]),
    );
    const actividad = new Map<
      string,
      { responsable_id: string; nombre: string; gestiones: number; tareas_count: number }
    >();
    // El mapa de calor incluye a todos los responsables en alcance, aunque
    // tengan cero gestiónes/tareas en el rango.
    for (const [id, nombre] of nombreDelResponsable) {
      actividad.set(id, { responsable_id: id, nombre, gestiones: 0, tareas_count: 0 });
    }
    const agregar = (cliente_id: string, campo: "gestiones" | "tareas_count") => {
      const responsable_id = responsableDelCliente.get(cliente_id);
      if (!responsable_id) return;
      const row = actividad.get(responsable_id) ?? {
        responsable_id,
        nombre: nombreDelResponsable.get(responsable_id) ?? "Sin responsable",
        gestiones: 0,
        tareas_count: 0,
      };
      row[campo] += 1;
      actividad.set(responsable_id, row);
    };
    for (const g of gestiones) agregar(g.cliente_id, "gestiones");
    for (const t of tareas) if (t.cliente_id) agregar(t.cliente_id, "tareas_count");
    const actividad_por_responsable = [...actividad.values()].sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    );

    return NextResponse.json({
      scope,
      sin_gestion: { dias, clientes: sinGestion },
      distribucion: { por_tipo, por_estado, por_prioridad },
      actividad_por_responsable,
    });
  },
);
