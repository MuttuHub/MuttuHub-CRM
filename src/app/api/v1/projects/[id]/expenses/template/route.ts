// GET /api/v1/projects/:id/expenses/template — the blank expenses workbook (one row per expense,
// feature `importar-gastos`): the headers the import reads and a list of the project's rubros that take
// expenses (assigned value above zero). Gated like the expenses read (404 -> 403): it carries no
// expense data, only rubro names.

import { withApiErrorHandling } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { gateGastoRead, tieneAsignado } from "@/lib/api/gastos";
import { generarPlantillaGastos } from "@/lib/proyectos/gastos-import/template";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const GET = withApiErrorHandling(
  "projects",
  "No pudimos generar la plantilla de gastos. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const gate = await gateGastoRead(auth.usuario, id);
    if (!gate.ok) return gate.response;

    const lineas = await db.lineaPresupuestal.findMany({
      where: { proyecto_id: id },
      select: { monto_proyectado_cop: true, rubro: { select: { nombre: true } } },
      orderBy: [{ rubro: { orden: "asc" } }, { rubro: { nombre: "asc" } }],
    });
    const nombres = lineas.filter((l) => tieneAsignado(l.monto_proyectado_cop)).map((l) => l.rubro.nombre);
    const buffer = await generarPlantillaGastos(nombres);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": 'attachment; filename="plantilla-gastos.xlsx"',
      },
    });
  },
);
