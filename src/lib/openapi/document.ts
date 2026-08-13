// Assembles the final OpenAPI 3.1 document. Every `paths/*.ts` file is a
// side-effect import: importing it runs its `registry.registerPath(...)`
// calls against the shared registry from `./registry`. Add a new domain
// file's import here when it's created — nothing else needs to change.

import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi/registry";

import "@/lib/openapi/paths/notifications";
import "@/lib/openapi/paths/auth";
import "@/lib/openapi/paths/clients";
import "@/lib/openapi/paths/tasks";
import "@/lib/openapi/paths/documents";
import "@/lib/openapi/paths/dashboard-admin";

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Muttu Hub API",
      version: "1.0.0",
      description:
        "API interna de Muttu Hub (CRM + Kanban + Documentos + Notificaciones + Administración). " +
        "Todas las rutas viven bajo /api/v1 salvo el cron (/api/cron/daily). " +
        "Envelope de error uniforme: { error: string, code: ApiErrorCode } (ver PRD §8.2). " +
        "Autenticación por cookie de sesión de Supabase (login vía POST /api/v1/auth/login); " +
        "los roles con alcance limitado (COLABORADOR) están documentados por ruta.",
    },
    servers: [{ url: "/", description: "Mismo origen que la app (rutas relativas)." }],
  });
}
