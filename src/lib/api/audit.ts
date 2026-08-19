// Bitácora de auditoría de negocio (QA audit finding #9): registra
// creación/edición/eliminación de Cliente, Tarea y Documento. Antes de esto
// el único registro de auditoría era `Acceso` (solo inicios de sesión).
//
// `cambios` es un snapshot liviano de los campos enviados en la operación
// (los mismos que ya validó el zod schema del endpoint), no un diff
// antes/después completo — eso hubiera exigido leer el estado previo del
// recurso en cada PATCH solo para poder auditar, encareciendo cada escritura
// de negocio por una funcionalidad que es secundaria a esa escritura.
//
// Best-effort a propósito (mismo criterio que el log de accesos en el
// login): un fallo acá nunca debe tumbar la operación de negocio que lo
// originó, así que el error se traga y se loguea en el server.

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditEntidad = "cliente" | "tarea" | "documento";
export type AuditAccion = "crear" | "editar" | "eliminar";

export async function logAudit(params: {
  entidad: AuditEntidad;
  entidad_id: string;
  accion: AuditAccion;
  usuario_id: string;
  cambios?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.auditoria.create({
      data: {
        entidad: params.entidad,
        entidad_id: params.entidad_id,
        accion: params.accion,
        usuario_id: params.usuario_id,
        cambios: (params.cambios ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to log entry:", err);
  }
}
