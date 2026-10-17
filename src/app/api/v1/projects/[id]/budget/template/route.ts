// GET /api/v1/projects/:id/budget/template — the blank budget template in the
// PO's format (`Rubro | Valor (COP)`, one row per active rubro, values empty),
// feature `importar-presupuesto-po`. Gated like the budget read (404 -> 403):
// it carries no project data, only the catalog.

import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { gatePresupuestoRead } from "@/lib/api/presupuesto";
import { generarPlantillaPresupuestoPO } from "@/lib/proyectos/presupuesto-po/template";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos generar la plantilla del presupuesto. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gatePresupuestoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const rubros = await db.rubro.findMany({
      where: { activo: true },
      select: { nombre: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    const buffer = await generarPlantillaPresupuestoPO(rubros.map((r) => r.nombre));

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": 'attachment; filename="plantilla-presupuesto.xlsx"',
      },
    });
  },
);
