// Assembles the final OpenAPI 3.1 document. Every `paths/*.ts` file is a
// side-effect import: importing it runs its `registry.registerPath(...)`
// calls against the shared registry from `./registry`. Add a new domain
// file's import here when it's created — nothing else needs to change.

import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi/registry";

import "@/lib/openapi/paths/notifications";
import "@/lib/openapi/paths/auth";
import "@/lib/openapi/paths/clients";
import "@/lib/openapi/paths/clients-health";
import "@/lib/openapi/paths/contacts";
import "@/lib/openapi/paths/interactions";
import "@/lib/openapi/paths/tasks";
import "@/lib/openapi/paths/documents";
import "@/lib/openapi/paths/dashboard-admin";
import "@/lib/openapi/paths/rubros";
import "@/lib/openapi/paths/strategic-lines";
import "@/lib/openapi/paths/municipalities";
import "@/lib/openapi/paths/projects";
import "@/lib/openapi/paths/project-structure";
import "@/lib/openapi/paths/project-execution";
import "@/lib/openapi/paths/project-documents";
import "@/lib/openapi/paths/project-budget";
import "@/lib/openapi/paths/project-template";
import "@/lib/openapi/paths/project-baseline";
import "@/lib/openapi/paths/project-modifications";
import "@/lib/openapi/paths/project-versions";
import "@/lib/openapi/paths/project-expenses";
import "@/lib/openapi/paths/project-kpis";
import "@/lib/openapi/paths/project-attention";
import "@/lib/openapi/paths/project-curve";
import "@/lib/openapi/paths/settings-semaforo-v2";
import "@/lib/openapi/paths/settings-automatizaciones";

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
