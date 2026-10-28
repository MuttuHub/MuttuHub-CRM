// GET/PATCH /api/v1/projects/:id/expenses/:expenseId (S6 U3).
//
// GET: anyone who can read the project; the third-party number and supports follow the
// financial-support predicate (RNF-03). An expense is only addressable through its own project.
//
// PATCH: ONLY the registrant, on an EN_EJECUCION project (404 -> 403 -> 409 -> 400), while the
// expense is REGISTRADO or RECHAZADO; a VALIDADO (or ANULADO) one is immutable. Editing a RECHAZADO
// expense returns it to REGISTRADO and clears the rejection (the registrant may correct it). The
// line, norms and early-overspend flag are recomputed; the write is guarded on the editable estados
// so a racing validation cannot be overwritten. Audit: one EDITAR row per changed field, the
// identification number only masked (RNF-04).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { diffFields, logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { NOTHING_TO_UPDATE, conflict, parseEstructuraBody } from "@/lib/api/estructura";
import { gateEjecucionWrite } from "@/lib/api/ejecucion";
import { RespuestaAbortada, decimalFromCents } from "@/lib/api/presupuesto";
import { normalizeProjectDate } from "@/lib/api/projects";
import {
  CAMPOS_AUDITABLES_GASTO,
  ESTADOS_EDITABLES,
  GASTO_ANULADO_MESSAGE,
  GASTO_FORBIDDEN_MESSAGE,
  GASTO_INCLUDE,
  GASTO_NO_EXISTE,
  GASTO_PATCH_SCHEMA,
  GASTO_VALIDADO_MESSAGE,
  SOBREGASTO_ADVERTENCIA,
  buscarDuplicados,
  clavesNormalizadas,
  gastoAuditable,
  gateGastoRead,
  parseMontosGasto,
  resolverLinea,
  resolverPeriodo,
  superaAsignado,
  toGastoView,
  type AlertaGasto,
} from "@/lib/api/gastos";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { fromCents, toCents } from "@/lib/proyectos/money";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; expenseId: string }> };

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el gasto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const gasto = await db.gasto.findFirst({
      where: { id: expenseId, proyecto_id: id },
      include: GASTO_INCLUDE,
    });
    if (!gasto) return apiError(GASTO_NO_EXISTE, 404, "NOT_FOUND");
    return NextResponse.json({ gasto: toGastoView(gasto, { puedeVerSoportes: gate.value.puedeVerSoportes }) });
  },
);

export const PATCH = withApiErrorHandling(
  "projects",
  "No pudimos actualizar el gasto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id, expenseId } = await ctx.params;

    const gate = await gateEjecucionWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const actual = await db.gasto.findFirst({
      where: { id: expenseId, proyecto_id: id },
      include: GASTO_INCLUDE,
    });
    if (!actual) return apiError(GASTO_NO_EXISTE, 404, "NOT_FOUND");
    if (actual.registrado_por_id !== auth.usuario.id) {
      return apiError(GASTO_FORBIDDEN_MESSAGE, 403, "FORBIDDEN");
    }
    if (!ESTADOS_EDITABLES.includes(actual.estado)) {
      const message = actual.estado === "ANULADO" ? GASTO_ANULADO_MESSAGE : GASTO_VALIDADO_MESSAGE;
      return apiError(message, 409, "INVALID_STATE");
    }

    const body = await parseEstructuraBody(request, GASTO_PATCH_SCHEMA);
    if (!body.ok) return body.response;
    const input = body.value;
    if (Object.keys(input).length === 0) return apiError(NOTHING_TO_UPDATE, 400, "VALIDATION_ERROR");

    // The Total is never typed: it is always the new Subtotal plus the new IVA (each defaults to the stored one).
    const montos = parseMontosGasto(
      input.subtotal ?? fromCents(toCents(actual.subtotal_cop)),
      input.iva ?? fromCents(toCents(actual.iva_cop)),
    );
    if (!montos.ok) return montos.response;
    const valor = montos.total;

    const rubroActual = actual.linea.rubro.id;
    const resuelta = await resolverLinea(id, input.rubro_id ?? rubroActual);
    if (!resuelta.ok) return resuelta.response;
    const linea = resuelta.value;

    const fechaDocumento = input.fecha_documento ?? isoDate(actual.fecha_documento);
    const periodoPedido =
      input.periodo ?? (input.fecha_documento !== undefined ? undefined : actual.periodo);
    const periodo = resolverPeriodo(gate.value, fechaDocumento, periodoPedido);
    if (!periodo.ok) return periodo.response;

    const tercero = {
      tercero_tipo_id: input.tercero_tipo_id !== undefined ? input.tercero_tipo_id : actual.tercero_tipo_id,
      tercero_numero_id:
        input.tercero_numero_id !== undefined ? input.tercero_numero_id || null : actual.tercero_numero_id,
    };
    const numeroDocumento = input.numero_documento ?? actual.numero_documento;
    const claves = clavesNormalizadas({ ...tercero, numero_documento: numeroDocumento });

    const data = {
      linea_id: linea.id,
      fecha_documento: normalizeProjectDate(fechaDocumento),
      periodo: periodo.value,
      tipo_soporte: input.tipo_soporte ?? actual.tipo_soporte,
      tercero_nombre: input.tercero_nombre ?? actual.tercero_nombre,
      ...tercero,
      ...claves,
      numero_documento: numeroDocumento,
      descripcion: input.descripcion ?? actual.descripcion,
      subtotal_cop: decimalFromCents(montos.subtotal),
      iva_cop: decimalFromCents(montos.iva),
      monto_cop: decimalFromCents(valor),
    };

    try {
      const { gasto, sobregasto } = await db.$transaction(async (tx) => {
        const sobregasto = await superaAsignado(tx, linea, valor);
        const corrige = actual.estado === "RECHAZADO";
        const { count } = await tx.gasto.updateMany({
          where: { id: expenseId, proyecto_id: id, estado: { in: ESTADOS_EDITABLES } },
          data: {
            ...data,
            alerta_sobregasto: sobregasto,
            ...(corrige
              ? { estado: "REGISTRADO" as const, motivo_rechazo: null, rechazado_por_id: null, rechazado_at: null }
              : {}),
          },
        });
        if (count === 0) throw new RespuestaAbortada(conflict(GASTO_VALIDADO_MESSAGE));

        const gasto = await tx.gasto.findFirstOrThrow({ where: { id: expenseId }, include: GASTO_INCLUDE });

        const antes = gastoAuditable({ ...actual, rubro_id: rubroActual });
        const despues = gastoAuditable({ ...gasto, rubro_id: linea.rubro.id });
        const cambios = diffFields(antes, despues, CAMPOS_AUDITABLES_GASTO);
        const filas: CambioInput[] = cambios.map((cambio) => ({
          usuario_id: auth.usuario.id,
          accion: "EDITAR",
          entidad: "gasto",
          entidad_id: expenseId,
          proyecto_id: id,
          ...cambio,
        }));
        if (corrige) {
          filas.push({
            usuario_id: auth.usuario.id,
            accion: "EDITAR",
            entidad: "gasto",
            entidad_id: expenseId,
            proyecto_id: id,
            campo: "estado",
            valor_anterior: "RECHAZADO",
            valor_nuevo: "REGISTRADO",
          });
        }
        await logChanges(tx, filas);
        return { gasto, sobregasto };
      });

      const alertas: AlertaGasto[] = [];
      if (sobregasto) alertas.push({ tipo: "SOBREGASTO", mensaje: SOBREGASTO_ADVERTENCIA });
      alertas.push(...(await buscarDuplicados(auth.usuario, gasto)));
      return NextResponse.json({ gasto: toGastoView(gasto, { puedeVerSoportes: true }), alertas });
    } catch (err) {
      if (err instanceof RespuestaAbortada) return err.response;
      throw err;
    }
  },
);
