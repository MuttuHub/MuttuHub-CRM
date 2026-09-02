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
//
// PR 6 (close-phase-1): `exportar` joins the accion union so the export
// endpoints can record who exported what, when, how many rows and which
// filters were applied (PRD §"El tope de 100", global-task-board spec).
// Exports have no single row to point at, so `entidad_id` is `null` and
// gets persisted as the empty-string sentinel — the auditoria schema is
// non-nullable on `entidad_id` (PR 6 must NOT touch the schema; sentinel
// keeps the audit reader's `where: { entidad_id }` predicate honest).

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditEntidad = "cliente" | "tarea" | "documento";
export type AuditAccion = "crear" | "editar" | "eliminar" | "exportar";

export async function logAudit(params: {
  entidad: AuditEntidad;
  entidad_id: string | null;
  accion: AuditAccion;
  usuario_id: string;
  cambios?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.auditoria.create({
      data: {
        entidad: params.entidad,
        // Sentinel for non-row events (exports): the schema column is
        // non-nullable, but `null` here means "this audit entry is for a
        // query, not a single row". The auditoria reader filters on
        // real ids, so empty-string never collides with a real one.
        entidad_id: params.entidad_id ?? "",
        accion: params.accion,
        usuario_id: params.usuario_id,
        cambios: (params.cambios ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to log entry:", err);
  }
}
