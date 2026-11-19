// «Días sin gestión» (PR-11 / N6): the one definition of how long a client has gone without
// contact. Shared by the clients list (GET /api/v1/clients) and the V8 «alertar N días sin
// contacto» automation rule, so the list filter and the alert always agree.
//
//   último contacto  = the latest bitácora entry of the client (no other filter; same as the
//                      health panel /clients/health)
//   días sin gestión = calendar days in Bogotá between that entry and today, never negative;
//                      null when the client has no entry at all
//
// `sinGestionDesde` (src/lib/api/crm.ts) then treats null as «without management».

import { db } from "@/lib/db";
import { toDayNumber, todayInBogota, type IsoDate } from "@/lib/proyectos/weeks";

/** Latest bitácora entry per client id; a client without entries maps to null. */
export async function ultimoContactoPorCliente(ids: string[]): Promise<Map<string, Date | null>> {
  if (ids.length === 0) return new Map();
  const rows = await db.bitacoraEntrada.groupBy({
    by: ["cliente_id"],
    where: { cliente_id: { in: ids } },
    _max: { created_at: true },
  });
  const byClient = new Map(rows.map((r) => [r.cliente_id, r._max.created_at ?? null]));
  return new Map(ids.map((id) => [id, byClient.get(id) ?? null]));
}

/** Bogotá calendar days since `ultimoContacto`, or null when there was never a contact. */
export function diasSinGestion(ultimoContacto: Date | null, hoy: IsoDate = todayInBogota()): number | null {
  if (ultimoContacto === null) return null;
  return Math.max(0, toDayNumber(hoy) - toDayNumber(todayInBogota(ultimoContacto)));
}
