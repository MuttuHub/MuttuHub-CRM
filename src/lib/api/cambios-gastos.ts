/**
 * T7 (S2, AJ-08 «Propuesto»): the period's expense changes for the Gerente — «un resumen de cambios del periodo
 * (gastos editados y anulados) con acceso al detalle y los motivos». Reads the append-only ledger, never the gasto
 * history columns:
 *
 * - A correction (PATCH) writes one EDITAR row per changed field plus a `motivo_correccion` row, all in one lote,
 *   so one lote is one change, its field rows the detail and the motive row the motive.
 * - An annulment writes one ANULAR row (`campo: "estado"`, `valor_nuevo: { estado, motivo }`) without a lote.
 *
 * «Del periodo» means made during that calendar month in Bogotá (UTC-5, no daylight saving), the month the
 * Gerente reviews; the gasto's own `periodo` can be any earlier month.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const PERIODO_CAMBIOS_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
export const PERIODO_CAMBIOS_INVALIDO = "Indica el periodo como AAAA-MM.";

/** Bounded read: a period of one project never needs more, and the ledger must never be read unbounded. */
const LIMITE_FILAS = 1000;
const BOGOTA_OFFSET_HORAS = 5;

type DetalleCambioGasto = { campo: string; antes: unknown; despues: unknown };

export type CambioGastoView = {
  /** The lote of a correction, or the row id of an annulment. */
  id: string;
  accion: "EDITAR" | "ANULAR";
  fecha: string;
  usuario_nombre: string | null;
  motivo: string | null;
  gasto: { id: string; numero_documento: string; tercero_nombre: string; estado: string } | null;
  detalle: DetalleCambioGasto[];
};

/** [start, end) of a «AAAA-MM» month in Bogotá, as UTC instants. */
function rangoDelPeriodo(periodo: string): { gte: Date; lt: Date } {
  const [anio, mes] = periodo.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(anio, mes - 1, 1, BOGOTA_OFFSET_HORAS)),
    lt: new Date(Date.UTC(anio, mes, 1, BOGOTA_OFFSET_HORAS)),
  };
}

type FilaAuditoria = Prisma.AuditoriaCambioGetPayload<{
  select: {
    id: true;
    created_at: true;
    usuario_id: true;
    accion: true;
    entidad_id: true;
    campo: true;
    valor_anterior: true;
    valor_nuevo: true;
    lote_id: true;
  };
}>;

function motivoDeAnulacion(valor: unknown): string | null {
  if (valor && typeof valor === "object" && "motivo" in valor && typeof valor.motivo === "string") return valor.motivo;
  return null;
}

export async function listCambiosGastos(proyectoId: string, periodo: string): Promise<CambioGastoView[]> {
  const filas: FilaAuditoria[] = await db.auditoriaCambio.findMany({
    where: {
      proyecto_id: proyectoId,
      entidad: "gasto",
      accion: { in: ["EDITAR", "ANULAR"] },
      created_at: rangoDelPeriodo(periodo),
    },
    select: {
      id: true,
      created_at: true,
      usuario_id: true,
      accion: true,
      entidad_id: true,
      campo: true,
      valor_anterior: true,
      valor_nuevo: true,
      lote_id: true,
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    take: LIMITE_FILAS,
  });
  if (filas.length === 0) return [];

  // One change per correction lote, one per annulment row, in the order they happened.
  const grupos = new Map<string, FilaAuditoria[]>();
  for (const fila of filas) {
    const clave = fila.accion === "EDITAR" && fila.lote_id ? fila.lote_id : fila.id;
    grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
  }

  const gastoIds = [...new Set(filas.map((fila) => fila.entidad_id))];
  const usuarioIds = [...new Set(filas.map((fila) => fila.usuario_id))];
  const [gastos, usuarios] = await Promise.all([
    db.gasto.findMany({
      where: { id: { in: gastoIds }, proyecto_id: proyectoId },
      select: { id: true, numero_documento: true, tercero_nombre: true, estado: true },
    }),
    db.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, nombre: true } }),
  ]);
  const gastoPorId = new Map(gastos.map((gasto) => [gasto.id, gasto]));
  // `usuario_id` has no FK on purpose: a deleted actor reads as null, never a fabricated name.
  const nombrePorId = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));

  return [...grupos].map(([id, grupo]) => {
    const primera = grupo[0];
    const anulacion = primera.accion === "ANULAR";
    const motivoFila = grupo.find((fila) => fila.campo === "motivo_correccion");
    const gasto = gastoPorId.get(primera.entidad_id);
    return {
      id,
      accion: anulacion ? "ANULAR" : "EDITAR",
      fecha: primera.created_at.toISOString(),
      usuario_nombre: nombrePorId.get(primera.usuario_id) ?? null,
      motivo: anulacion
        ? motivoDeAnulacion(primera.valor_nuevo)
        : typeof motivoFila?.valor_nuevo === "string"
          ? motivoFila.valor_nuevo
          : null,
      gasto: gasto
        ? {
            id: gasto.id,
            numero_documento: gasto.numero_documento,
            tercero_nombre: gasto.tercero_nombre,
            estado: gasto.estado,
          }
        : null,
      detalle: anulacion
        ? [{ campo: "estado", antes: primera.valor_anterior, despues: "ANULADO" }]
        : grupo
            .filter((fila) => fila.campo !== null && fila.campo !== "motivo_correccion")
            .map((fila) => ({ campo: fila.campo as string, antes: fila.valor_anterior, despues: fila.valor_nuevo })),
    } satisfies CambioGastoView;
  });
}
