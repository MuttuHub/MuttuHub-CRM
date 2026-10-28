// OpenAPI path registration for B7: suspend, reactivate, close, reopen or cancel a project (PO decision D-C).
// Registered from the actual route file: same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { ACCIONES_ESTADO } from "@/lib/proyectos/transiciones-estado";

const ProjectParams = z.object({ id: z.string().uuid() });

const CambioEstadoBody = registry.register(
  "CambioEstadoProyecto",
  z.object({
    accion: z.enum(ACCIONES_ESTADO).openapi({
      description:
        "SUSPENDER (EN_EJECUCION -> SUSPENDIDO), REACTIVAR (SUSPENDIDO -> EN_EJECUCION), CERRAR (EN_EJECUCION -> " +
        "CERRADO), REABRIR (CERRADO -> EN_EJECUCION), CANCELAR (BORRADOR, EN_EJECUCION o SUSPENDIDO -> CANCELADO; " +
        "CANCELADO es terminal).",
    }),
    motivo: z.string().min(1).max(1000).openapi({ description: "Obligatorio; se recorta y queda en el historial." }),
  }),
);

const CambioEstadoResult = registry.register(
  "CambioEstadoProyectoResultado",
  z.object({
    proyecto: z.object({
      id: z.string().uuid(),
      estado: z.enum(["EN_EJECUCION", "SUSPENDIDO", "CERRADO", "CANCELADO"]),
    }),
  }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/estado",
  tags: ["Projects"],
  summary: "Suspende, reactiva, cierra, reabre o cancela un proyecto, con motivo",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA` (404 -> 403 -> 400 -> 409). En una sola transacción, con el proyecto bloqueado, " +
    "vuelve a verificar la transición, cambia el estado y registra dos filas de auditoría `EDITAR proyecto` en un mismo " +
    "lote (`estado` y `motivo`). Un proyecto `SUSPENDIDO`, `CERRADO` o `CANCELADO` queda congelado: sus escrituras " +
    "responden 409 `INVALID_STATE`, salvo las anulaciones de gerencia, que siguen disponibles en cualquier estado.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: { required: true, content: { "application/json": { schema: CambioEstadoBody } } },
  },
  responses: {
    200: { description: "Estado cambiado.", content: { "application/json": { schema: CambioEstadoResult } } },
    409: { description: "La acción no aplica al estado actual del proyecto (`INVALID_STATE`)." },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});
