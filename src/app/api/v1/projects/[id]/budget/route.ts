// GET /api/v1/projects/:id/budget — the budget of a project: one line per activity + rubro (S5,
// T11) and, per rubro, the sum of its lines (S2).
// PUT — replace the budget of a BORRADOR project.
//
// GET lists every ACTIVE rubro (a $0 row when it has no line) plus any suspended rubro that still
// carries a line (`heredado_pendiente`), and every line with its activity; legacy lines (D9) have none.
// PUT receives the WHOLE budget as `lineas`: a line is matched by activity + rubro, created when new
// and above $0, updated when its value changed, and deleted (with its programming) when it is left
// out — unless it already has expenses. `valor_total` is always the sum of the lines after the write
// (S2: «se calculan sumando las líneas; no se digitan»), and the opportunity difference follows it.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { parseEstructuraBody } from "@/lib/api/estructura";
import {
  MONTO_MAXIMO_CENTS,
  RespuestaAbortada,
  decimalFromCents,
  gatePresupuestoRead,
  gatePresupuestoWrite,
  loadBudgetView,
  lockProyectoBorrador,
  parseMonto,
} from "@/lib/api/presupuesto";
import { diferenciaValor } from "@/lib/proyectos/proyecto-general";
import { fromCents, sumCents, toCents } from "@/lib/proyectos/money";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const BUDGET_PUT_SCHEMA = z
  .object({
    lineas: z.array(
      z
        .object({
          actividad_id: z.string().min(1).nullable().optional(),
          rubro_id: z.string({ error: "El rubro es obligatorio." }).min(1, "El rubro es obligatorio."),
          valor: z.union([z.string(), z.number()], { error: "Ingresa un monto válido." }),
        })
        .strict(),
      { error: "Envía la lista de líneas del presupuesto." },
    ),
  })
  .strict();

/** The identity of a line inside one project: activity + rubro, or the rubro alone for a legacy line. */
const claveDe = (actividadId: string | null, rubroId: string) => `${actividadId ?? ""}|${rubroId}`;

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar el presupuesto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    return NextResponse.json(await loadBudgetView(db, id, gate.value.estado, gate.value.valor_total));
  },
);

function invalid(message: string): never {
  throw new RespuestaAbortada(apiError(message, 400, "VALIDATION_ERROR"));
}

export const PUT = withApiErrorHandling(
  "projects",
  "No pudimos guardar el presupuesto. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const body = await parseEstructuraBody(request, BUDGET_PUT_SCHEMA);
    if (!body.ok) return body.response;

    // Amounts and combinations first: a malformed body is a 400 without touching the database.
    const pedidas = new Map<string, { actividadId: string | null; rubroId: string; cents: bigint }>();
    for (const item of body.value.lineas) {
      const actividadId = item.actividad_id ?? null;
      const clave = claveDe(actividadId, item.rubro_id);
      // S5: «no se repite la misma combinación actividad + rubro».
      if (pedidas.has(clave)) return apiError("La combinación de actividad y rubro se repite en el presupuesto.", 400, "VALIDATION_ERROR");
      const parsed = parseMonto(item.valor);
      if (!parsed.ok) return apiError(parsed.message, 400, "VALIDATION_ERROR");
      pedidas.set(clave, { actividadId, rubroId: item.rubro_id, cents: parsed.cents });
    }
    const suma = sumCents([...pedidas.values()].map((p) => p.cents));
    if (suma > MONTO_MAXIMO_CENTS) return apiError("El total del presupuesto supera el monto máximo permitido.", 400, "VALIDATION_ERROR");

    try {
      const view = await db.$transaction(async (tx) => {
        const locked = await lockProyectoBorrador(tx, id);

        const actividadIds = [...new Set([...pedidas.values()].flatMap((p) => (p.actividadId ? [p.actividadId] : [])))];
        const [rubros, lineas, actividades] = await Promise.all([
          tx.rubro.findMany({
            where: { OR: [{ activo: true }, { lineas: { some: { proyecto_id: id } } }] },
            select: { id: true, codigo: true, nombre: true, activo: true, orden: true },
          }),
          tx.lineaPresupuestal.findMany({
            where: { proyecto_id: id },
            select: { id: true, rubro_id: true, actividad_id: true, monto_proyectado_cop: true },
          }),
          tx.actividad.findMany({
            where: { proyecto_id: id, deleted_at: null, id: { in: actividadIds } },
            select: { id: true },
          }),
        ]);
        const porRubro = new Map(rubros.map((r) => [r.id, r]));
        const vivas = new Set(actividades.map((a) => a.id));
        const existentes = new Map(lineas.map((l) => [claveDe(l.actividad_id, l.rubro_id), l]));

        for (const [clave, pedida] of pedidas) {
          if (existentes.has(clave)) continue; // a stored line may always be kept or edited
          const rubro = porRubro.get(pedida.rubroId);
          if (!rubro) invalid("El presupuesto incluye un rubro que no existe.");
          // S1: «Cada línea del presupuesto es una combinación actividad + rubro + valor.»
          if (pedida.actividadId === null) invalid("Cada línea nueva del presupuesto necesita una actividad.");
          if (!vivas.has(pedida.actividadId)) invalid("El presupuesto incluye una actividad que no existe en este proyecto.");
          if (!rubro.activo) invalid(`El rubro ${rubro.nombre} está suspendido: no se le puede asignar presupuesto.`);
        }

        const quitadas = lineas.filter((l) => !pedidas.has(claveDe(l.actividad_id, l.rubro_id)));
        if (quitadas.length > 0) {
          const conGastos = await tx.gasto.count({ where: { proyecto_id: id, linea_id: { in: quitadas.map((l) => l.id) } } });
          if (conGastos > 0) invalid("No se puede quitar del presupuesto una línea que ya tiene gastos registrados.");
        }

        const cambios: CambioInput[] = [];
        const base = { usuario_id: auth.usuario.id, entidad: "presupuesto", proyecto_id: id, campo: "asignado" } as const;
        const cero = toCents("0");

        for (const [clave, pedida] of pedidas) {
          const existente = existentes.get(clave);
          if (existente) {
            const anterior = toCents(existente.monto_proyectado_cop);
            if (anterior === pedida.cents) continue;
            await tx.lineaPresupuestal.update({
              where: { id: existente.id },
              data: { monto_proyectado_cop: decimalFromCents(pedida.cents) },
            });
            cambios.push({ ...base, accion: "EDITAR", entidad_id: existente.id, valor_anterior: fromCents(anterior), valor_nuevo: fromCents(pedida.cents) });
          } else if (pedida.cents > cero) {
            const creada = await tx.lineaPresupuestal.create({
              data: {
                proyecto_id: id,
                actividad_id: pedida.actividadId,
                rubro_id: pedida.rubroId,
                monto_proyectado_cop: decimalFromCents(pedida.cents),
              },
              select: { id: true },
            });
            cambios.push({ ...base, accion: "CREAR", entidad_id: creada.id, valor_anterior: null, valor_nuevo: fromCents(pedida.cents) });
          }
        }

        // A3: a line left out goes away with its programming (the cells point at it). AccionAuditoria
        // has no delete action, so it is audited like a deleted programming cell: EDITAR down to $0.
        for (const linea of quitadas) {
          await tx.programacionPeriodo.deleteMany({ where: { linea_id: linea.id, proyecto_id: id } });
          await tx.lineaPresupuestal.delete({ where: { id: linea.id } });
          cambios.push({
            ...base,
            accion: "EDITAR",
            entidad_id: linea.id,
            valor_anterior: fromCents(toCents(linea.monto_proyectado_cop)),
            valor_nuevo: fromCents(cero),
          });
        }

        // S2: valor_total is the sum of the lines, never typed.
        const anterior = locked.valor_total === null ? null : toCents(locked.valor_total);
        if (anterior !== suma) {
          const diferencia = gate.value.oportunidad
            ? diferenciaValor(fromCents(suma), gate.value.oportunidad.valor_estimado_cop)
            : null;
          await tx.proyecto.update({
            where: { id },
            data: {
              valor_total: decimalFromCents(suma),
              ...(gate.value.oportunidad
                ? { diferencia_valor_oportunidad: diferencia === null ? null : new Prisma.Decimal(diferencia) }
                : {}),
            },
          });
          cambios.push({
            usuario_id: auth.usuario.id,
            accion: "EDITAR",
            entidad: "proyecto",
            entidad_id: id,
            proyecto_id: id,
            campo: "valor_total",
            valor_anterior: anterior === null ? null : fromCents(anterior),
            valor_nuevo: fromCents(suma),
          });
        }

        if (cambios.length > 0) await logChanges(tx, cambios);

        return loadBudgetView(tx, id, "BORRADOR", fromCents(suma));
      });

      return NextResponse.json(view);
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
