// GET /api/v1/projects/:id/budget — assigned amount (A) per rubro (S5 U3, E-16).
// PUT — replace the budget of a BORRADOR project.
//
// GET lists every ACTIVE rubro (a $0 virtual row when the project has no line
// yet) plus any suspended rubro that still carries a line (`heredado_pendiente`).
// PUT must cover every active rubro exactly once; it never rejects a sum that
// differs from `valor_total` (REQ-BUD-02 allows it in Borrador; the baseline
// checks it later) and never overwrites `valor_total` — except when it is null,
// where it takes the sum (N-17) and the opportunity difference is recomputed.
// Lines are created only for amounts above $0 and are never deleted.

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
    rubros: z.array(
      z
        .object({
          rubro_id: z.string({ error: "El rubro es obligatorio." }).min(1, "El rubro es obligatorio."),
          asignado: z.union([z.string(), z.number()], { error: "Ingresa un monto válido." }),
        })
        .strict(),
      { error: "Envía la lista de rubros." },
    ),
  })
  .strict();

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

    // Amounts first: a malformed one is a 400 without touching the database.
    const montos = new Map<string, bigint>();
    for (const item of body.value.rubros) {
      if (montos.has(item.rubro_id)) return apiError("Un rubro no puede repetirse en el presupuesto.", 400, "VALIDATION_ERROR");
      const parsed = parseMonto(item.asignado);
      if (!parsed.ok) return apiError(parsed.message, 400, "VALIDATION_ERROR");
      montos.set(item.rubro_id, parsed.cents);
    }

    try {
      const view = await db.$transaction(async (tx) => {
        const locked = await lockProyectoBorrador(tx, id);

        const [rubros, lineas] = await Promise.all([
          tx.rubro.findMany({
            where: { OR: [{ activo: true }, { lineas: { some: { proyecto_id: id } } }] },
            select: { id: true, codigo: true, nombre: true, activo: true, orden: true },
          }),
          tx.lineaPresupuestal.findMany({
            where: { proyecto_id: id },
            select: { id: true, rubro_id: true, monto_proyectado_cop: true },
          }),
        ]);
        const porRubro = new Map(rubros.map((r) => [r.id, r]));
        const lineaPorRubro = new Map(lineas.map((l) => [l.rubro_id, l]));

        for (const rubroId of montos.keys()) {
          const rubro = porRubro.get(rubroId);
          if (!rubro) invalid("El presupuesto incluye un rubro que no existe.");
          if (!rubro.activo && !lineaPorRubro.has(rubroId)) {
            invalid(`El rubro ${rubro.nombre} está suspendido: no se le puede asignar presupuesto.`);
          }
        }
        for (const rubro of rubros) {
          if (rubro.activo && !montos.has(rubro.id)) {
            invalid(`Falta el rubro ${rubro.nombre}: el presupuesto debe incluir todos los rubros activos.`);
          }
        }

        const cambios: CambioInput[] = [];
        const base = { usuario_id: auth.usuario.id, entidad: "presupuesto", proyecto_id: id, campo: "asignado" } as const;

        for (const [rubroId, cents] of montos) {
          const existente = lineaPorRubro.get(rubroId);
          if (existente) {
            const anterior = toCents(existente.monto_proyectado_cop);
            if (anterior === cents) continue;
            await tx.lineaPresupuestal.update({
              where: { id: existente.id },
              data: { monto_proyectado_cop: decimalFromCents(cents) },
            });
            cambios.push({
              ...base,
              accion: "EDITAR",
              entidad_id: existente.id,
              valor_anterior: fromCents(anterior),
              valor_nuevo: fromCents(cents),
            });
          } else if (cents > toCents("0")) {
            const creada = await tx.lineaPresupuestal.create({
              data: { proyecto_id: id, rubro_id: rubroId, monto_proyectado_cop: decimalFromCents(cents) },
              select: { id: true },
            });
            cambios.push({ ...base, accion: "CREAR", entidad_id: creada.id, valor_anterior: null, valor_nuevo: fromCents(cents) });
          }
        }

        // The sum of ALL lines after the write (a suspended line keeps counting).
        const finales = new Map<string, bigint>(lineas.map((l) => [l.rubro_id, toCents(l.monto_proyectado_cop)]));
        for (const [rubroId, cents] of montos) if (finales.has(rubroId) || cents > toCents("0")) finales.set(rubroId, cents);
        const suma = sumCents([...finales.values()]);

        let valorTotal: string | null = locked.valor_total;
        if (locked.valor_total === null && suma > toCents("0") && suma <= MONTO_MAXIMO_CENTS) {
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
            valor_anterior: null,
            valor_nuevo: fromCents(suma),
          });
          valorTotal = fromCents(suma);
        }

        if (cambios.length > 0) await logChanges(tx, cambios);

        return loadBudgetView(tx, id, "BORRADOR", valorTotal);
      });

      return NextResponse.json(view);
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
