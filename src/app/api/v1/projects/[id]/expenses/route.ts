// GET /api/v1/projects/:id/expenses — expenses of a project with totals by estado (S6 U3, RF-20).
// POST — register an expense against the budget line of a rubro, with 1..5 supports.
//
// Register: ADMINISTRADOR/GERENCIA or an active-member COORDINADOR on an EN_EJECUCION project
// (404 -> 403 -> 409 -> 400). The rubro must have an assigned amount above zero; the period must be
// a month of the project (default: the month of the document date); the estado is always REGISTRADO.
// Supports follow the confirm-mode flow (sign -> direct upload -> confirm) and are created in the same
// transaction as the expense. Alerts never block: SOBREGASTO (early warning against the current validated
// total, no notification) and DUPLICADO (same normalized identification and document number, any project).
//
// Read: anyone who can read the project, in any estado. The third-party number and the supports are
// returned only to actors who can view financial supports (RNF-03).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { conflict, isUniqueViolation, parseEstructuraBody } from "@/lib/api/estructura";
import { gateEjecucionWrite } from "@/lib/api/ejecucion";
import { decimalFromCents } from "@/lib/api/presupuesto";
import { MEDIO_DUPLICADO_MESSAGE, STORAGE_PATH_INDEX, validarSoporte, type SoporteDatos } from "@/lib/api/soportes";
import {
  GASTO_CREATE_SCHEMA,
  GASTO_INCLUDE,
  SOBREGASTO_ADVERTENCIA,
  buscarDuplicados,
  clavesNormalizadas,
  gastoAuditable,
  gateGastoRead,
  parseValorGasto,
  resolverLinea,
  resolverPeriodo,
  superaAsignado,
  toGastoView,
  totalesPorEstado,
  type AlertaGasto,
} from "@/lib/api/gastos";
import { normalizeProjectDate } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar los gastos. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const { puedeVerSoportes } = gate.value;

    const rows = await db.gasto.findMany({
      where: { proyecto_id: id },
      include: GASTO_INCLUDE,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
    return NextResponse.json({
      gastos: rows.map((row) => toGastoView(row, { puedeVerSoportes })),
      totales: totalesPorEstado(rows),
    });
  },
);

export const POST = withApiErrorHandling(
  "projects",
  "No pudimos registrar el gasto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;
    const proyecto = gate.value;

    const body = await parseEstructuraBody(request, GASTO_CREATE_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;

    const valor = parseValorGasto(input.valor);
    if (!valor.ok) return valor.response;
    const linea = await resolverLinea(id, input.rubro_id);
    if (!linea.ok) return linea.response;
    const periodo = resolverPeriodo(proyecto, input.fecha_documento, input.periodo);
    if (!periodo.ok) return periodo.response;

    const soportes: SoporteDatos[] = [];
    for (const raw of input.soportes) {
      const validado = await validarSoporte(id, raw);
      if (!validado.ok) return validado.response;
      soportes.push(validado.value);
    }
    const rutas = soportes.map((soporte) => soporte.storage_path).filter((ruta): ruta is string => ruta !== null);
    if (new Set(rutas).size !== rutas.length) return conflict(MEDIO_DUPLICADO_MESSAGE);

    const tercero = {
      tercero_tipo_id: input.tercero_tipo_id ?? null,
      tercero_numero_id: input.tercero_numero_id || null,
    };
    const claves = clavesNormalizadas({ ...tercero, numero_documento: input.numero_documento });

    try {
      const { gasto, soportesCreados, sobregasto } = await db.$transaction(async (tx) => {
        const sobregasto = await superaAsignado(tx, linea.value, valor.cents);
        const created = await tx.gasto.create({
          data: {
            proyecto_id: id,
            linea_id: linea.value.id,
            fecha_documento: normalizeProjectDate(input.fecha_documento),
            periodo: periodo.value,
            tipo_soporte: input.tipo_soporte,
            tercero_nombre: input.tercero_nombre,
            ...tercero,
            ...claves,
            numero_documento: input.numero_documento,
            descripcion: input.descripcion,
            monto_cop: decimalFromCents(valor.cents),
            alerta_sobregasto: sobregasto,
            registrado_por_id: auth.usuario.id,
          },
        });

        const soportesCreados = [];
        for (const soporte of soportes) {
          soportesCreados.push(
            await tx.soporteProyecto.create({
              data: { proyecto_id: id, gasto_id: created.id, subido_por_id: auth.usuario.id, ...soporte },
            }),
          );
        }

        await logChange(tx, {
          usuario_id: auth.usuario.id,
          accion: "CREAR",
          entidad: "gasto",
          entidad_id: created.id,
          proyecto_id: id,
          valor_nuevo: {
            ...gastoAuditable({ ...created, rubro_id: linea.value.rubro.id }),
            estado: created.estado,
            soportes: soportesCreados.length,
          },
        });
        return { gasto: created, soportesCreados, sobregasto };
      });

      const alertas: AlertaGasto[] = [];
      if (sobregasto) alertas.push({ tipo: "SOBREGASTO", mensaje: SOBREGASTO_ADVERTENCIA });
      alertas.push(...(await buscarDuplicados(auth.usuario, gasto)));

      const view = toGastoView(
        { ...gasto, linea: { rubro: linea.value.rubro }, soportes: soportesCreados },
        { puedeVerSoportes: true },
      );
      return NextResponse.json({ gasto: view, alertas }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, STORAGE_PATH_INDEX)) return conflict(MEDIO_DUPLICADO_MESSAGE);
      throw err;
    }
  },
);
