// OpenAPI path registrations for /api/v1/contacts (v7 alignment C4a
// Relaciones). Read-only cross-client feed over the Contacto rows: creation
// and editing stay on the per-client contacts routes, so only GET is
// registered here.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { ContactoSchema } from "@/lib/openapi/paths/clients";

const SCOPE_NOTE =
  "Alcance: lectura global — cualquier usuario autenticado ve los contactos de todos los clientes, igual que la lista de clientes (PR 3). Solo se ocultan contactos y clientes con borrado lógico.";

const ContactoFeedItemSchema = registry.register(
  "ContactoFeedItem",
  ContactoSchema.omit({ deleted_at: true }).extend({
    cliente_nombre: z.string().openapi({ description: "Nombre del cliente al que pertenece el contacto." }),
    owner_nombre: z
      .string()
      .nullable()
      .openapi({ description: "Nombre del propietario interno cuando owner_id está definido; null si no." }),
  }),
);

// ── GET /api/v1/contacts — cross-client feed ─────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/contacts",
  tags: ["Relaciones"],
  summary: "Lista transversal de contactos con contexto de cliente y propietario",
  description:
    `${SCOPE_NOTE} Filtra por cliente y, opcionalmente, por el cuadrante poder × interés: ` +
    "`con_quadrante=true` devuelve solo los contactos con ambos ejes definidos; `poder` e `interes` " +
    "filtran por el valor exacto (1..5). Orden por fecha de creación ascendente, igual que la lista por cliente. " +
    "Solo lectura: la creación y edición viven en POST/PATCH /api/v1/clients/{id}/contacts.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      cliente_id: z.string().uuid().optional().openapi({ description: "Filtra por cliente." }),
      con_quadrante: z
        .enum(["true", "false"])
        .optional()
        .openapi({ description: "true ⇒ solo contactos con poder e interés definidos." }),
      poder: z.coerce.number().int().min(1).max(5).optional().openapi({ description: "Filtra por poder exacto (1..5)." }),
      interes: z.coerce.number().int().min(1).max(5).optional().openapi({ description: "Filtra por interés exacto (1..5)." }),
    }),
  },
  responses: {
    200: {
      description: "Contactos visibles para el usuario actual, con su cliente y propietario.",
      content: {
        "application/json": {
          schema: z.object({ contactos: z.array(ContactoFeedItemSchema) }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 500]),
  },
});
