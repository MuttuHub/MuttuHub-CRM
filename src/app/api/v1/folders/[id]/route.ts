// PATCH /api/v1/folders/:id — renombra { nombre } y/o mueve { parent_id } la
// carpeta. Mover un subárbol es 1 UPDATE (lista de adyacencia). Valida ciclos
// (walk sobre la cadena de padres) y profundidad <= 8. parent_id null mueve a
// la raíz; omiter el campo no cambia la posición.
// DELETE /api/v1/folders/:id — soft-delete SOLO si está vacía. Con subcarpetas
// o documentos devuelve 409 (la app no tiene papelera: ni cascada que borre en
// silencio ni huérfanos que se esparzan por la raíz).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, parseJsonBody } from "@/lib/api/errors";
import { withApiErrorHandling } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/supabase/server";
import { FOLDER_MAX_DEPTH, validateFolderParent } from "@/lib/api/folders";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function loadParentMap(): Promise<Map<string, string | null>> {
  const rows = await db.carpeta.findMany({
    where: { deleted_at: null },
    select: { id: true, parent_id: true },
  });
  return new Map(rows.map((r) => [r.id, r.parent_id]));
}

export const PATCH = withApiErrorHandling(
  "folders",
  "No pudimos actualizar la carpeta. Inténtalo de nuevo.",
  async (request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const carpeta = await db.carpeta.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, parent_id: true },
    });
    if (!carpeta) {
      return apiError("La carpeta no existe.", 404, "NOT_FOUND");
    }

    const body = await parseJsonBody<{ nombre?: string; parent_id?: string | null }>(request);
    if (body === null) {
      return apiError("Cuerpo inválido.", 400, "VALIDATION_ERROR");
    }

    const data: { nombre?: string; parent_id?: string | null } = {};

    if (body.nombre !== undefined) {
      const nombre = body.nombre.trim();
      if (!nombre) {
        return apiError("El nombre de la carpeta es obligatorio.", 400, "VALIDATION_ERROR");
      }
      if (nombre.length > 120) {
        return apiError("El nombre no puede superar los 120 caracteres.", 400, "VALIDATION_ERROR");
      }
      data.nombre = nombre;
    }

    if (body.parent_id !== undefined) {
      const newParentId = body.parent_id;
      if (newParentId !== null) {
        const parent = await db.carpeta.findFirst({
          where: { id: newParentId, deleted_at: null },
          select: { id: true },
        });
        if (!parent) {
          return apiError("La carpeta padre no existe.", 404, "NOT_FOUND");
        }
      }
      const tree = await loadParentMap();
      const check = validateFolderParent(tree, id, newParentId);
      if (!check.ok) {
        if (check.code === "CYCLE") {
          return apiError("Una carpeta no puede moverse dentro de su propio árbol.", 400, "VALIDATION_ERROR");
        }
        return apiError(`La profundidad máxima es de ${FOLDER_MAX_DEPTH} niveles.`, 400, "VALIDATION_ERROR");
      }
      data.parent_id = newParentId;
    }

    if (Object.keys(data).length === 0) {
      return apiError("No hay campos para actualizar.", 400, "VALIDATION_ERROR");
    }

    const updated = await db.carpeta.update({
      where: { id },
      data,
      select: { id: true, nombre: true, parent_id: true, created_at: true },
    });

    return NextResponse.json({ carpeta: updated });
  },
);

export const DELETE = withApiErrorHandling(
  "folders",
  "No pudimos eliminar la carpeta. Inténtalo de nuevo.",
  async (_request: Request, ctx: RouteContext) => {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;

    const carpeta = await db.carpeta.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!carpeta) {
      return apiError("La carpeta no existe.", 404, "NOT_FOUND");
    }

    const [subcarpetas, documentos] = await Promise.all([
      db.carpeta.count({ where: { parent_id: id, deleted_at: null } }),
      db.documento.count({ where: { carpeta_id: id, deleted_at: null } }),
    ]);

    if (subcarpetas > 0 || documentos > 0) {
      const partes: string[] = [];
      if (subcarpetas > 0) {
        partes.push(`${subcarpetas} ${subcarpetas === 1 ? "subcarpeta" : "subcarpetas"}`);
      }
      if (documentos > 0) {
        partes.push(`${documentos} ${documentos === 1 ? "documento" : "documentos"}`);
      }
      return apiError(`La carpeta tiene ${partes.join(" y ")}. Muévelos o elimínalos primero.`, 409, "CONFLICT");
    }

    await db.carpeta.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return new NextResponse(null, { status: 204 });
  },
);