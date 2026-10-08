// GET /api/v1/projects/:id/programming — monthly programming (P) per rubro (S5 U3, E-17).
// PUT — replace the programming of a BORRADOR project.
//
// Needs the project dates (the periods are every month from start to end, 409
// INVALID_STATE otherwise). PUT is a full replacement written by diff: cells with
// a value above $0 are created or updated, every other existing cell is deleted
// (a cell at $0 is "no programming"). A rubro needs a budget line first. The
// control per rubro (Σ cells − A) is informational in Borrador; the baseline
// (S8.2) turns a non-zero control into a precondition.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/api/handler";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges, type CambioInput } from "@/lib/api/audit-cambios";
import { parseEstructuraBody } from "@/lib/api/estructura";
import {
  RespuestaAbortada,
  decimalFromCents,
  gatePresupuestoRead,
  gatePresupuestoWrite,
  loadProgrammingView,
  lockProyectoBorrador,
  parseMonto,
} from "@/lib/api/presupuesto";
import { isoDate } from "@/lib/proyectos/proyecto-general";
import { fromCents, toCents } from "@/lib/proyectos/money";
import { projectPeriods } from "@/lib/proyectos/weeks";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const SIN_FECHAS_MESSAGE = "Define las fechas de inicio y fin del proyecto antes de programar.";

export const PROGRAMMING_PUT_SCHEMA = z
  .object({
    filas: z.array(
      z
        .object({
          rubro_id: z.string({ error: "El rubro es obligatorio." }).min(1, "El rubro es obligatorio."),
          periodo: z.string({ error: "El periodo es obligatorio." }),
          valor: z.union([z.string(), z.number()], { error: "Ingresa un monto válido." }),
        })
        .strict(),
      { error: "Envía la lista de filas." },
    ),
  })
  .strict();

/** The project's periods, or null while a date is missing (or the range is inverted). */
function periodosDelProyecto(inicio: Date | null, fin: Date | null): string[] | null {
  if (!inicio || !fin) return null;
  try {
    return projectPeriods(isoDate(inicio), isoDate(fin));
  } catch {
    return null;
  }
}

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos cargar la programación. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const periodos = periodosDelProyecto(gate.value.fecha_inicio, gate.value.fecha_fin);
    if (!periodos) return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");

    return NextResponse.json(await loadProgrammingView(db, id, gate.value.estado, periodos));
  },
);

function invalid(message: string): never {
  throw new RespuestaAbortada(apiError(message, 400, "VALIDATION_ERROR"));
}

export const PUT = withApiErrorHandling(
  "projects",
  "No pudimos guardar la programación. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoWrite(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const periodos = periodosDelProyecto(gate.value.fecha_inicio, gate.value.fecha_fin);
    if (!periodos) return apiError(SIN_FECHAS_MESSAGE, 409, "INVALID_STATE");

    const body = await parseEstructuraBody(request, PROGRAMMING_PUT_SCHEMA);
    if (!body.ok) return body.response;

    // rubro_id -> periodo -> cents, validated before touching the database.
    const deseado = new Map<string, Map<string, bigint>>();
    for (const fila of body.value.filas) {
      if (!periodos.includes(fila.periodo)) {
        return apiError(`El periodo ${fila.periodo} está fuera del rango del proyecto.`, 400, "VALIDATION_ERROR");
      }
      const monto = parseMonto(fila.valor);
      if (!monto.ok) return apiError(monto.message, 400, "VALIDATION_ERROR");
      const porPeriodo = deseado.get(fila.rubro_id) ?? new Map<string, bigint>();
      if (porPeriodo.has(fila.periodo)) {
        return apiError(`El periodo ${fila.periodo} se repite para un mismo rubro.`, 400, "VALIDATION_ERROR");
      }
      porPeriodo.set(fila.periodo, monto.cents);
      deseado.set(fila.rubro_id, porPeriodo);
    }

    try {
      const view = await db.$transaction(async (tx) => {
        await lockProyectoBorrador(tx, id);

        const lineas = await tx.lineaPresupuestal.findMany({
          where: { proyecto_id: id },
          select: { id: true, rubro_id: true },
        });
        const lineaPorRubro = new Map(lineas.map((l) => [l.rubro_id, l.id]));
        for (const rubroId of deseado.keys()) {
          if (!lineaPorRubro.has(rubroId)) invalid("El rubro no tiene presupuesto asignado: asígnale un monto primero.");
        }

        const existentes = await tx.programacionPeriodo.findMany({
          where: { proyecto_id: id },
          select: { id: true, linea_id: true, periodo: true, valor: true },
        });

        const zero = toCents("0");
        const cambios: CambioInput[] = [];
        const base = { usuario_id: auth.usuario.id, entidad: "programacion", proyecto_id: id } as const;
        const vistas = new Set<string>();

        for (const [rubroId, porPeriodo] of deseado) {
          const lineaId = lineaPorRubro.get(rubroId) as string;
          for (const [periodo, cents] of porPeriodo) {
            if (cents === zero) continue;
            const existente = existentes.find((c) => c.linea_id === lineaId && c.periodo === periodo);
            if (existente) {
              vistas.add(existente.id);
              const anterior = toCents(existente.valor);
              if (anterior === cents) continue;
              await tx.programacionPeriodo.update({ where: { id: existente.id }, data: { valor: decimalFromCents(cents) } });
              cambios.push({ ...base, accion: "EDITAR", entidad_id: existente.id, campo: periodo, valor_anterior: fromCents(anterior), valor_nuevo: fromCents(cents) });
            } else {
              const creada = await tx.programacionPeriodo.create({
                data: { proyecto_id: id, linea_id: lineaId, periodo, valor: decimalFromCents(cents) },
                select: { id: true },
              });
              cambios.push({ ...base, accion: "CREAR", entidad_id: creada.id, campo: periodo, valor_anterior: null, valor_nuevo: fromCents(cents) });
            }
          }
        }

        // Anything not kept above became $0 or was omitted: the cell goes away.
        for (const existente of existentes) {
          if (vistas.has(existente.id)) continue;
          await tx.programacionPeriodo.delete({ where: { id: existente.id } });
          cambios.push({
            ...base,
            accion: "EDITAR",
            entidad_id: existente.id,
            campo: existente.periodo,
            valor_anterior: fromCents(toCents(existente.valor)),
            valor_nuevo: fromCents(zero),
          });
        }

        if (cambios.length > 0) await logChanges(tx, cambios);
        return loadProgrammingView(tx, id, "BORRADOR", periodos);
      });

      return NextResponse.json(view);
    } catch (error) {
      if (error instanceof RespuestaAbortada) return error.response;
      throw error;
    }
  },
);
