// GET /api/v1/clients/export — xlsx export (PRD §8.4) with the exact same
// filters and role scoping as GET /clients (reuses parseClientListFilters +
// buildClientWhere + enrichClients from clients/route.ts). Value-range
// filters still apply in JS after enrichment, and the export is capped at the
// first 500 rows of the filtered set.

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import {
  ENUM_VALUES,
  ESTADO_CLIENTE_LABELS,
  PRIORIDAD_CLIENTE_LABELS,
  TIPO_CLIENTE_LABELS,
} from "@/lib/catalogs";
import {
  CLIENT_BASE_SELECT,
  parseClientListFilters,
} from "@/lib/api/crm";
import { buildClientWhere, enrichClients } from "@/app/api/v1/clients/route";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 500; // PRD §8.4 cap for exports.

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const filters = parseClientListFilters(
    url,
    ENUM_VALUES.TipoCliente,
    ENUM_VALUES.EstadoCliente,
    ENUM_VALUES.PrioridadCliente,
  );
  if (!filters.ok) return filters.response;

  try {
    const where = buildClientWhere(filters.filters, auth.usuario);
    // Fetch base fields without a cap (same trade-off as GET /clients): the
    // valor range filter runs in JS after enrichment, so the 500-row cap must
    // apply over the FILTERED set, not the raw query.
    const rows = await db.cliente.findMany({
      where,
      select: CLIENT_BASE_SELECT,
      orderBy: { updated_at: "desc" },
    });

    const enriched = await enrichClients(rows.map((r) => r.id), rows);
    const filtered = enriched.filter(
      (e) =>
        (filters.filters.valor_min === undefined || e.valor_potencial >= filters.filters.valor_min) &&
        (filters.filters.valor_max === undefined || e.valor_potencial <= filters.filters.valor_max),
    );
    const inExport = new Set(filtered.slice(0, EXPORT_MAX_ROWS).map((e) => e.id));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Clientes");
    sheet.columns = [
      { header: "Nombre", key: "nombre", width: 28 },
      { header: "Empresa", key: "empresa", width: 28 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Estado", key: "estado", width: 18 },
      { header: "Prioridad", key: "prioridad", width: 12 },
      { header: "Ubicación", key: "ubicacion", width: 22 },
      { header: "Responsable", key: "responsable", width: 22 },
      { header: "Valor potencial", key: "valor_potencial", width: 16 },
      { header: "Compromisos abiertos", key: "compromisos_abiertos", width: 12 },
      { header: "Próximo compromiso", key: "next_compromiso", width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: "A1", to: "J1" };

    for (const r of rows) {
      if (!inExport.has(r.id)) continue;
      const e = enriched.find((x) => x.id === r.id)!;
      sheet.addRow({
        nombre: r.nombre,
        empresa: r.empresa ?? "",
        tipo: TIPO_CLIENTE_LABELS[r.tipo_cliente].label,
        estado: ESTADO_CLIENTE_LABELS[r.estado].label,
        prioridad: r.prioridad ? PRIORIDAD_CLIENTE_LABELS[r.prioridad].label : "",
        ubicacion: r.ubicacion ?? "",
        responsable: r.responsable.nombre,
        valor_potencial: e.valor_potencial,
        compromisos_abiertos: e.compromisos_abiertos,
        next_compromiso: e.next_compromiso
          ? e.next_compromiso.fecha_entrega.toISOString().slice(0, 10)
          : "—",
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="clientes.xlsx"',
      },
    });
  } catch (err) {
    console.error("[clients] export failed:", err);
    return apiError("No pudimos generar el archivo. Inténtalo de nuevo.", 500, "INTERNAL_ERROR");
  }
}