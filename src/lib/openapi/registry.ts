// Shared OpenAPI registry (PRD §8.2 envelope) — one instance, populated by
// every `src/app/api/**/*.openapi.ts` registration file via side-effect
// import (see `document.ts`). Domain files register their own paths against
// this same registry so the final spec is one document, not one per domain.
//
// zod-to-openapi needs `.openapi()` available on every zod schema BEFORE any
// registration runs — `extendZodWithOpenApi(z)` must execute exactly once,
// which is why it lives here (this module is the first thing every domain
// registration file imports).

import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Matches src/lib/api/errors.ts's ApiErrorCode + apiError() envelope exactly
// — every non-2xx response in the API uses this shape, so it's registered
// once and referenced everywhere instead of repeated per route.
export const ErrorEnvelopeSchema = registry.register(
  "ErrorEnvelope",
  z.object({
    error: z.string().openapi({ example: "Descripción del error para el usuario." }),
    code: z
      .enum([
        "VALIDATION_ERROR",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "INACTIVE",
        "NOT_FOUND",
        "CONFLICT",
        "FILE_TOO_LARGE",
        "INTERNAL_ERROR",
      ])
      .openapi({ example: "VALIDATION_ERROR" }),
  }),
);

// Session cookie set by POST /api/v1/auth/login (src/lib/supabase/server.ts,
// createServerClient) — every /api/v1/* route except the public auth ones
// requires it. Registered once, referenced via `security` on each path.
registry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "sb-access-token",
  description:
    "Supabase session cookie set by POST /api/v1/auth/login. Browsers send it automatically; API clients must capture it from the Set-Cookie header.",
});

/**
 * The standard error responses nearly every authenticated route can return.
 * Pass `extra` for route-specific additions (e.g. 413 FILE_TOO_LARGE, 409
 * CONFLICT) or omit codes that don't apply (e.g. a public route has no 401).
 */
export function standardErrorResponses(
  codes: Array<400 | 401 | 403 | 404 | 409 | 413 | 500> = [400, 401, 500],
): Record<number, { description: string; content: { "application/json": { schema: typeof ErrorEnvelopeSchema } } }> {
  const DESCRIPTIONS: Record<number, string> = {
    400: "Validación fallida (VALIDATION_ERROR).",
    401: "Sesión no válida o expirada (UNAUTHORIZED).",
    403: "No tienes permisos para esta acción (FORBIDDEN).",
    404: "El recurso no existe (NOT_FOUND).",
    409: "Conflicto con el estado actual del recurso (CONFLICT).",
    413: "Archivo demasiado grande (FILE_TOO_LARGE).",
    500: "Error inesperado del servidor (INTERNAL_ERROR).",
  };
  const responses: ReturnType<typeof standardErrorResponses> = {};
  for (const code of codes) {
    responses[code] = {
      description: DESCRIPTIONS[code],
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    };
  }
  return responses;
}
