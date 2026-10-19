// Shared error-handling wrapper for API route handlers (PRD §8.2 envelope).
//
// Before this: every route.ts repeated the same block —
//   try { ...business logic... }
//   catch (err) { console.error("[label] X failed:", err); return apiError(msg, 500, "INTERNAL_ERROR"); }
// — duplicated ~50 times, so any future change to the error envelope,
// logging shape, or observability (request IDs, Sentry, etc.) meant touching
// every file. withApiErrorHandling replaces just that boilerplate; the
// per-route auth gates, validation, and business logic are untouched — this
// only ever catches an UNEXPECTED throw, same as before.
//
// `label` and `message` stay per-route (the Spanish user-facing message
// differs by endpoint on purpose) so no route silently changes its copy.

import { apiError } from "@/lib/api/errors";

// Route handlers take varying (request, ctx?) shapes — `unknown[]` (not
// `any[]`) keeps this fully typed while forwarding whatever args the
// wrapped handler declares.
type RouteHandler<Args extends unknown[]> = (...args: Args) => Promise<Response>;

export function withApiErrorHandling<Args extends unknown[]>(
  label: string,
  message: string,
  handler: RouteHandler<Args>,
): RouteHandler<Args> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error(`[${label}] failed:`, err);
      return apiError(message, 500, "INTERNAL_ERROR");
    }
  };
}
