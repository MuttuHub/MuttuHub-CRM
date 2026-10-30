// OpenAPI path registrations for the Document Repository folders
// (/api/v1/folders/*) and the client-folder shortcut
// (/api/v1/clients/{id}/folder, S4 / A5). Read the route.ts files first; this
// only documents what they do. Folders are an ORGANIZATION axis, never a
// permission one: any authenticated user may create and use them.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const CarpetaSchema = registry.register(
  "Carpeta",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    parent_id: z.string().uuid().nullable(),
    cliente_id: z.string().uuid().nullable().openapi({
      description: "Cliente dueño de la carpeta (una por cliente, A5); null en carpetas sin cliente.",
    }),
    created_at: z.string().datetime(),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/folders",
  tags: ["Documentos"],
  summary: "Árbol completo de carpetas activas con el conteo de documentos directos",
  description:
    "Cada nodo trae `hijos` y `documentos_count` (hijos directos, no recursivo); para un COLABORADOR el conteo " +
    "excluye las categorías restringidas.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Árbol de carpetas (raíces en `carpetas`).",
      content: {
        "application/json": {
          schema: z.object({
            carpetas: z.array(
              CarpetaSchema.extend({
                documentos_count: z.number().int(),
                hijos: z.array(z.unknown()).openapi({ description: "Nodos hijos con la misma forma." }),
              }),
            ),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/folders",
  tags: ["Documentos"],
  summary: "Crea una carpeta (opcionalmente la carpeta de un cliente)",
  description:
    "`parent_id` debe existir (404), sin ciclos y con profundidad máxima 8 (400). `cliente_id` la vuelve la carpeta " +
    "de ese cliente: el cliente debe existir y no estar eliminado (404 «El cliente no existe.»); un cliente que ya " +
    "tiene carpeta → 409 CONFLICT «Este cliente ya tiene una carpeta. Usa la carpeta existente.». Para abrir o crear " +
    "la carpeta de un cliente en un solo paso, usa POST /api/v1/clients/{id}/folder.",
  security: [{ sessionCookie: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            nombre: z.string().max(120),
            parent_id: z.string().uuid().nullable().optional(),
            cliente_id: z.string().uuid().nullable().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Carpeta creada.",
      content: { "application/json": { schema: z.object({ carpeta: CarpetaSchema }) } },
    },
    ...standardErrorResponses([400, 401, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/clients/{id}/folder",
  tags: ["Documentos"],
  summary: "Abre o crea la carpeta de un cliente (idempotente)",
  description:
    "Devuelve la carpeta del cliente (200, `creada: false`) o la crea en la raíz con el nombre del cliente (201, " +
    "`creada: true`). Idempotente aun con llamadas concurrentes: nunca crea dos carpetas para el mismo cliente. " +
    "Cliente inexistente o eliminado → 404 «El cliente no existe.».",
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: "La carpeta ya existía.",
      content: { "application/json": { schema: z.object({ carpeta: CarpetaSchema, creada: z.literal(false) }) } },
    },
    201: {
      description: "Carpeta creada por esta llamada.",
      content: { "application/json": { schema: z.object({ carpeta: CarpetaSchema, creada: z.literal(true) }) } },
    },
    ...standardErrorResponses([401, 404, 500]),
  },
});
