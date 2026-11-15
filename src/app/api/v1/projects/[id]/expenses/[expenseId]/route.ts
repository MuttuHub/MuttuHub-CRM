// GET/PATCH /api/v1/projects/:id/expenses/:expenseId (S6 U3).
//
// GET: anyone who can read the project; the third-party number and supports follow the
// financial-support predicate (RNF-03). An expense is only addressable through its own project.
//
// PATCH: the registrant on their own expense, or anybody who passes the managers-only gate
// (`gateGastoGestion`, the same the void route uses) on somebody else's, on an EN_EJECUCION project
// (404 -> 403 -> 409 -> 400), while the expense is REGISTRADO or RECHAZADO; a VALIDADO (or ANULADO) one
// is immutable. Correcting somebody else's expense requires `motivo`, audited as `motivo_correccion`;
// the registrant's own edit does not require one, and a motive they send anyway is recorded too. Editing
// a RECHAZADO expense returns it to REGISTRADO and clears the rejection. The line, norms and
// early-overspend flag are recomputed; the write is guarded on the editable estados so a racing
// validation cannot be overwritten. S9/T14.2-B1: `repartos` rewrites the whole distribution of the
// invoice inside the same transaction (header + rows), with the same sum rule as the create; the audit
// keeps recording the header fields it always recorded. Audit: one EDITAR row per changed field, the
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
  CORRECCION_SIN_MOTIVO_MESSAGE,
  ESTADOS_EDITABLES,
  GASTO_CAMBIO_MESSAGE,
  GASTO_INCLUDE,
  GASTO_NO_EXISTE,
  GASTO_PATCH_SCHEMA,
  GASTO_VALIDADO_MESSAGE,
  REPARTO_REQUERIDO_MESSAGE,
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
  resolverPeriodo,
  superaAsignado,
  toGastoView,
  type AlertaGasto,
  type RepartoFactura,
} from "@/lib/api/gastos";
import { notificarSobregasto } from "@/lib/api/notificaciones-proyecto";
import { gateGastoGestion } from "@/lib/api/validacion-gastos";
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
    // S2/T6: the registrant keeps editing their own expense; anybody else has to be the project's Gestor,
    // and a Gestor correcting somebody else's expense has to write down why.
    const esAutor = actual.registrado_por_id === auth.usuario.id;
    const anulado = actual.estado === "ANULADO";
    // S2/T6 + D2: an annulled expense stays annulled but a manager may still fix its data, so it also
    // goes through the managers-only gate — the registrant cannot reopen their own annulled row.
    if (!esAutor || anulado) {
      const gestion = await gateGastoGestion(auth.usuario, id, expenseId);
      if (!gestion.ok) return gestion.response;
    }
    if (!anulado && !ESTADOS_EDITABLES.includes(actual.estado)) {
      return apiError(GASTO_VALIDADO_MESSAGE, 409, "INVALID_STATE");
    }

    const body = await parseEstructuraBody(request, GASTO_PATCH_SCHEMA);
    if (!body.ok) return body.response;
    const { motivo, updated_at: visto, repartos: repartosPedidos, ...cambios } = body.value;
    if (Object.keys(cambios).length === 0 && repartosPedidos === undefined) {
      return apiError(NOTHING_TO_UPDATE, 400, "VALIDATION_ERROR");
    }
    if ((!esAutor || anulado) && motivo === undefined) return apiError(CORRECCION_SIN_MOTIVO_MESSAGE, 400, "VALIDATION_ERROR");
    const input = cambios;

    // The Total is never typed: it is always the new Subtotal plus the new IVA (each defaults to the stored one).
    const montos = parseMontosGasto(
      input.subtotal ?? fromCents(toCents(actual.subtotal_cop)),
      input.iva ?? fromCents(toCents(actual.iva_cop)),
    );
    if (!montos.ok) return montos.response;
    const valor = montos.total;

    const rubroActual = actual.linea.rubro.id;
    const repartosActuales: RepartoFactura[] = actual.repartos.map((fila) => ({
      linea: {
        id: fila.linea.id,
        actividad_id: fila.linea.actividad_id,
        asignado: toCents(fila.linea.monto_proyectado_cop),
        rubro: fila.linea.rubro,
      },
      valor: toCents(fila.valor),
    }));

    // S9/T14.2-B1: a new distribution is validated as a whole; a legacy invoice keeps its single row in step
    // with its header, and a split invoice is only re-split with its full distribution (its rows would stop
    // adding up otherwise).
    let repartos: RepartoFactura[] | null;
    if (repartosPedidos) {
      const evaluados = evaluarRepartos(repartosPedidos, valor);
      if (!evaluados.ok) return apiError(evaluados.message, 400, "VALIDATION_ERROR");
      const resueltos = await resolverRepartos(id, evaluados.value);
      if (!resueltos.ok) return resueltos.response;
      repartos = resueltos.value;
    } else if (repartosActuales.length <= 1) {
      // S9/T14.1: a correction that keeps the rubro keeps the expense on its own line, even when that rubro is
      // budgeted in several activities; only a rubro change re-resolves the line by rubro.
      const rubroDestino = input.rubro_id ?? rubroActual;
      const resuelta = await resolverLinea(
        id,
        rubroDestino,
        rubroDestino === rubroActual ? actual.linea_id : undefined,
      );
      if (!resuelta.ok) return resuelta.response;
      repartos = [{ linea: resuelta.value, valor }];
    } else {
      if (valor !== toCents(actual.monto_cop) || (input.rubro_id !== undefined && input.rubro_id !== rubroActual)) {
        return apiError(REPARTO_REQUERIDO_MESSAGE, 400, "VALIDATION_ERROR");
      }
      repartos = null;
    }
    // The distribution in force after the write: the new rows, or the stored ones when nothing is re-split.
    const efectivos = repartos ?? repartosActuales;
    // `gastos.linea_id` means «the line of the first distribution row»; without a new distribution it is the
    // stored pointer, which the rows keep describing.
    const lineaCabecera = repartos ? repartos[0].linea.id : actual.linea_id;
    const rubroCabecera = repartos ? repartos[0].linea.rubro.id : rubroActual;

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
      linea_id: lineaCabecera,
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
      const { gasto, nivel } = await db.$transaction(async (tx) => {
        // AJ-08: REGISTRADO already counts as executed, so the row being edited is left out of the sum. The
        // overspend is checked against each row's own line and assigned amount, never the header's.
        const criticos: boolean[] = [];
        for (const reparto of efectivos) {
          criticos.push(await superaAsignado(tx, reparto.linea, reparto.valor, expenseId));
        }
        const sobregasto = criticos.some(Boolean);
        const corrige = actual.estado === "RECHAZADO";
        const { count } = await tx.gasto.updateMany({
          // Pin the state and, when the client sent it, the `updated_at` it read: two corrections of the
          // same row can no longer silently overwrite each other.
          where: {
            id: expenseId,
            proyecto_id: id,
            estado: actual.estado,
            ...(visto ? { updated_at: new Date(visto) } : {}),
          },
          data: {
            ...data,
            // Explicit, not left to `@updatedAt`: the pin above only protects the next correction if this
            // write really advances the stamp.
            updated_at: new Date(),
            alerta_sobregasto: sobregasto,
            ...(corrige
              ? { estado: "REGISTRADO" as const, motivo_rechazo: null, rechazado_por_id: null, rechazado_at: null }
              : {}),
          },
        });
        if (count === 0) {
          throw new RespuestaAbortada(conflict(visto ? GASTO_CAMBIO_MESSAGE : GASTO_VALIDADO_MESSAGE));
        }

        // S9/T14.2-B1: the distribution is rewritten with the header, in this same transaction, so a failure
        // leaves both the header and the previous rows as they were.
        if (repartos) {
          await tx.gastoReparto.deleteMany({ where: { gasto_id: expenseId } });
          await tx.gastoReparto.createMany({
            data: repartos.map((reparto) => ({
              proyecto_id: id,
              gasto_id: expenseId,
              linea_id: reparto.linea.id,
              valor: decimalFromCents(reparto.valor),
            })),
          });
        }

        const gasto = await tx.gasto.findFirstOrThrow({ where: { id: expenseId }, include: GASTO_INCLUDE });

        // A legacy invoice without rows reads as its single implicit row, so its first edit audits no phantom move.
        const repartosAntes =
          actual.repartos.length > 0 ? actual.repartos : [{ linea_id: actual.linea_id, valor: actual.monto_cop }];
        const antes = gastoAuditable({ ...actual, rubro_id: rubroActual, repartos: repartosAntes });
        const despues = gastoAuditable({
          ...gasto,
          rubro_id: rubroCabecera,
          repartos: efectivos.map((reparto) => ({ linea_id: reparto.linea.id, valor: reparto.valor })),
        });
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
        if (motivo !== undefined) {
          filas.push({
            usuario_id: auth.usuario.id,
            accion: "EDITAR",
            entidad: "gasto",
            entidad_id: expenseId,
            proyecto_id: id,
            campo: "motivo_correccion",
            valor_anterior: null,
            valor_nuevo: motivo,
          });
        }
        await logChanges(tx, filas);

        // S2/L16: after saving, each line tells its level; the critical one also rings the Gerencia bell.
        const nivel = await nivelSobregastoDeFactura(
          tx,
          efectivos.map((reparto, indice) => ({ ...reparto, critico: criticos[indice] })),
          periodo.value,
        );
        if (sobregasto) await notificarSobregasto(tx, { gastoId: gasto.id, proyectoId: id });
        return { gasto, nivel };
      });

      const alertas: AlertaGasto[] = [];
      const alerta = alertaSobregasto(nivel);
      if (alerta) alertas.push(alerta);
      alertas.push(...(await buscarDuplicados(auth.usuario, gasto)));
      return NextResponse.json({
        gasto: toGastoView({ ...gasto, repartos: repartosDeLineas(efectivos) }, { puedeVerSoportes: true }),
        alertas,
      });
    } catch (err) {
      if (err instanceof RespuestaAbortada) return err.response;
      throw err;
    }
  },
);
