// OpenAPI path registration for /api/v1/departamentos (V5, S3). Read the route first, register
// exactly what it does.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const DepartamentoSchema = registry.register(
  "Departamento",
  z.object({
    departamento: z.string(),
    codigo: z.string().nullable().openapi({
      description: "Código DANE de 2 dígitos, tomado de los códigos de sus municipios cuando todos coinciden.",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/departamentos",
  tags: ["Municipalities"],
  summary: "Departamentos oficiales",
  description:
    "Un elemento por departamento distinto del catálogo de municipios (incluye municipios suspendidos), ordenado por nombre. " +
    "Es la lista que acepta `Cliente.departamento`. Cualquier usuario autenticado.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Lista de departamentos.",
      content: { "application/json": { schema: z.object({ departamentos: z.array(DepartamentoSchema) }) } },
    },
    ...standardErrorResponses([401, 500]),
  },
});
