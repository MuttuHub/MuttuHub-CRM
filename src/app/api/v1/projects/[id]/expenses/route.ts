// GET /api/v1/projects/:id/expenses — expenses of a project with totals by estado (S6 U3, RF-20).
// POST — register an expense against the budget line of a rubro, with 1..5 supports.
//
// Register: ADMINISTRADOR/GERENCIA or an active-member COORDINADOR on an EN_EJECUCION project
// (404 -> 403 -> 409 -> 400). The body may name the exact line (`linea_id`, the activity + rubro the form
// chose, S9/T14.1) or only the rubro (older callers); the rubro must have an assigned amount above zero and a
// `linea_id` has to be one of that rubro's lines in the project. S9/T14.2-B1: with `repartos` the invoice is
// distributed across lines — one row per activity + rubro, the header carrying neither `rubro_id` nor
// `linea_id` — every line must be a line of this project with an assigned amount and the rows must add up to
// exactly the invoice total (subtotal + IVA); `gastos.linea_id` is the line of the first row. Without `repartos`
// the invoice gets a single row with its whole total, so the rows always add up. The period must be a month of
// the project (default: the month of the document date); the estado is always REGISTRADO.
// Supports follow the confirm-mode flow (sign -> direct upload -> confirm) and are created in the same
// transaction as the expense. Alerts never block: SOBREGASTO (critical, over the assigned amount, with
// the «Solicita un traslado al Gerente» message and the Gerencia notification), SOBREGASTO_PROGRAMADO
// (warning, over the amount programmed up to the expense's period, suppressed by the critical one) and
// DUPLICADO (same normalized identification and document number, any project).
//
// Read: anyone who can read the project, in any estado. The third-party number and the supports are
// returned only to actors who can view financial supports (RNF-03).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
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
  alertaSobregasto,
  buscarDuplicados,
  clavesNormalizadas,
  evaluarRepartos,
  gastoAuditable,
  gateGastoRead,
  nivelSobregastoDeFactura,
  parseMontosGasto,
  repartosDeLineas,
  resolverLinea,
  resolverRepartos,
  resumenGastos,
  resolverPeriodo,
  superaAsignado,
  toGastoView,
  totalesPorEstado,
  type AlertaGasto,
  type RepartoFactura,
} from "@/lib/api/gastos";
import { notificarSobregasto } from "@/lib/api/notificaciones-proyecto";
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
      resumen: resumenGastos(rows, { puedeVerSoportes }),
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

    const montos = parseMontosGasto(input.subtotal, input.iva);
    if (!montos.ok) return montos.response;

    // S9/T14.2-B1: with `repartos` the invoice is distributed and the header carries no rubro or line; without
    // them the legacy shape is untouched and the invoice gets one row with its whole total.
    let repartos: RepartoFactura[];
    if (input.repartos) {
      const evaluados = evaluarRepartos(input.repartos, montos.total);
      if (!evaluados.ok) return apiError(evaluados.message, 400, "VALIDATION_ERROR");
      const resueltos = await resolverRepartos(id, evaluados.value);
      if (!resueltos.ok) return resueltos.response;
      repartos = resueltos.value;
    } else {
      // The schema already guarantees the rubro without `repartos`; this narrows it for the resolver.
      if (input.rubro_id === undefined) return apiError("El rubro es obligatorio.", 400, "VALIDATION_ERROR");
      const linea = await resolverLinea(id, input.rubro_id, input.linea_id);
      if (!linea.ok) return linea.response;
      repartos = [{ linea: linea.value, valor: montos.total }];
    }
    // `gastos.linea_id` keeps its NOT NULL and means «the line of the first distribution row».
    const cabecera = repartos[0].linea;
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
      const { gasto, soportesCreados, nivel } = await db.$transaction(async (tx) => {
        // The overspend is checked against each row's own line and assigned amount, never the header's.
        const criticos: boolean[] = [];
        for (const reparto of repartos) criticos.push(await superaAsignado(tx, reparto.linea, reparto.valor));
        const sobregasto = criticos.some(Boolean);
        const created = await tx.gasto.create({
          data: {
            proyecto_id: id,
            linea_id: cabecera.id,
            fecha_documento: normalizeProjectDate(input.fecha_documento),
            periodo: periodo.value,
            tipo_soporte: input.tipo_soporte,
            tercero_nombre: input.tercero_nombre,
            ...tercero,
            ...claves,
            numero_documento: input.numero_documento,
            descripcion: input.descripcion,
            subtotal_cop: decimalFromCents(montos.subtotal),
            iva_cop: decimalFromCents(montos.iva),
            monto_cop: decimalFromCents(montos.total),
            alerta_sobregasto: sobregasto,
            registrado_por_id: auth.usuario.id,
          },
        });

        // The header and its distribution land in the same transaction: a failure leaves nothing written.
        await tx.gastoReparto.createMany({
          data: repartos.map((reparto) => ({
            proyecto_id: id,
            gasto_id: created.id,
            linea_id: reparto.linea.id,
            valor: decimalFromCents(reparto.valor),
          })),
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
            ...gastoAuditable({
              ...created,
              rubro_id: cabecera.rubro.id,
              repartos: repartos.map((reparto) => ({ linea_id: reparto.linea.id, valor: reparto.valor })),
            }),
            estado: created.estado,
            soportes: soportesCreados.length,
          },
        });

        // S2/L16: after saving, each line tells its level; the critical one also rings the Gerencia bell.
        const nivel = await nivelSobregastoDeFactura(
          tx,
          repartos.map((reparto, indice) => ({ ...reparto, critico: criticos[indice] })),
          periodo.value,
        );
        if (sobregasto) await notificarSobregasto(tx, { gastoId: created.id, proyectoId: id });
        return { gasto: created, soportesCreados, nivel };
      });

      const alertas: AlertaGasto[] = [];
      const alerta = alertaSobregasto(nivel);
      if (alerta) alertas.push(alerta);
      alertas.push(...(await buscarDuplicados(auth.usuario, gasto)));

      const view = toGastoView(
        {
          ...gasto,
          linea: { rubro: cabecera.rubro },
          repartos: repartosDeLineas(repartos),
          soportes: soportesCreados,
        },
        { puedeVerSoportes: true },
      );
      return NextResponse.json({ gasto: view, alertas }, { status: 201 });
    } catch (err) {
      if (isUniqueViolation(err, STORAGE_PATH_INDEX)) return conflict(MEDIO_DUPLICADO_MESSAGE);
      throw err;
    }
  },
);
