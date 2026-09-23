// GET /api/v1/dashboard/pipeline/export — xlsx export of the "Pipeline
// Comercial" dashboard face (PRD §7.1) with the same filters and
// commercial-access gate as GET /api/v1/dashboard/pipeline (reuses
// parseDashboardFilters + clienteScopeWhere + rangoDeFechas from
// src/lib/dashboard.ts, and hasCommercialAccess from src/lib/permissions.ts).
//
// dashboard-export-excel: the widget only shows the TOP 5 clients by active
// potential value (PRD §7.1 preview). The export is intentionally NOT capped
// at 5 — it ranks and exports every client with active opportunities, capped
// at EXPORT_MAX_ROWS (same cap/rationale as clients/export and tasks/export,
// PRD §8.4), so the download is a useful standalone report instead of a copy
// of the 5-row widget.
//
// Every export writes an `auditoria` row with `accion: "exportar"` and
// `entidad: "dashboard"` (best-effort, PR 6 pattern — logAudit swallows its
// own errors, and the call is also wrapped here for defense in depth).

import ExcelJS from "exceljs";
import type { EstadoOportunidad } from "@prisma/client";
import { db } from "@/lib/db";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { clienteScopeWhere, parseDashboardFilters, rangoDeFechas } from "@/lib/dashboard";
import { hasCommercialAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 500; // PRD §8.4 cap para exportaciones.

/** Mismo embudo (estados no finalizados) que GET /api/v1/dashboard/pipeline. */
const OFFER_STATES: readonly EstadoOportunidad[] = [
  "DISENANDO_PROPUESTA",
  "PRESENTADA",
  "EN_REVISION",
  "EN_NEGOCIACION",
  "STANDBY",
];

export const GET = withApiErrorHandling(
  "dashboard/pipeline/export",
  "No pudimos generar el archivo. Inténtalo de nuevo.",
  async (request: Request) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const parsed = parseDashboardFilters(url);
    if (!parsed.ok) return parsed.response;
    const filters = parsed.filters;

    const scope = "all" as const;

    let top_clientes: { cliente_id: string; nombre: string; valor_potencial: number }[] = [];

    // Phase 2 (opportunity-access-control, D3): same commercial gate as the
    // dashboard endpoint — a COLABORADOR without the flag exports an empty
    // sheet instead of getting the numbers RNF-C02 requires hidden.
    if (
      hasCommercialAccess({
        id: auth.usuario.id,
        rol: auth.usuario.rol,
        gestiona_oportunidades: auth.usuario.gestiona_oportunidades,
      })
    ) {
      const clienteWhere = clienteScopeWhere(scope, auth.usuario, filters);
      const rango = rangoDeFechas(filters);

      const oportunidades = await db.oportunidad.findMany({
        where: {
          deleted_at: null,
          cliente: clienteWhere,
          ...(rango && { created_at: rango }),
        },
        select: {
          id: true,
          estado: true,
          valor_estimado_cop: true,
          cliente: { select: { id: true, nombre: true } },
        },
      });

      const activas = oportunidades.filter((o) => OFFER_STATES.includes(o.estado));
      const porCliente = new Map<string, { nombre: string; valor: number }>();
      for (const o of activas) {
        const actual = porCliente.get(o.cliente.id) ?? { nombre: o.cliente.nombre, valor: 0 };
        actual.valor += Number(o.valor_estimado_cop ?? 0);
        porCliente.set(o.cliente.id, actual);
      }
      top_clientes = [...porCliente.entries()]
        .sort((a, b) => b[1].valor - a[1].valor)
        .slice(0, EXPORT_MAX_ROWS)
        .map(([cliente_id, { nombre, valor }]) => ({
          cliente_id,
          nombre,
          valor_potencial: Math.round(valor * 100) / 100,
        }));
    }

    try {
      await logAudit({
        entidad: "dashboard",
        entidad_id: null,
        accion: "exportar",
        usuario_id: auth.usuario.id,
        cambios: {
          rows: top_clientes.length,
          cara: "pipeline",
          filters: filters as unknown as Record<string, unknown>,
        },
      });
    } catch (err) {
      console.error("[dashboard/pipeline] export audit failed:", err);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pipeline");
    sheet.columns = [
      { header: "Cliente", key: "nombre", width: 32 },
      { header: "Valor potencial", key: "valor_potencial", width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: "A1", to: "B1" };

    for (const c of top_clientes) {
      sheet.addRow({ nombre: c.nombre, valor_potencial: c.valor_potencial });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="pipeline.xlsx"',
      },
    });
  },
);
