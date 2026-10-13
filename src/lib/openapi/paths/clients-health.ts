// OpenAPI path registration for /api/v1/clients/health (v7 alignment C5a
// "Salud"). Read the route first, register exactly what it does — same status
// codes, same field names, same global read scope as GET /clients.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const SaludBucketSchema = z
  .enum(["SANA", "ATENCION", "RIESGO", "SIN_DATOS"])
  .openapi("SaludBucket");

const SaludSubscoresSchema = registry.register(
  "SaludSubscores",
  z.object({
    contacto: z.number().nullable().openapi({
      description:
        "Días desde la última entrada de bitácora: 100 hasta el día 15, 0 desde el 90, lineal en medio; 0 si no hay entradas.",
    }),
    compromisos: z.number().nullable().openapi({
      description:
        "100 − 20·vencidos − 10·hoy − 5·próximos (suelo 0) desde los buckets de alertas. null = sin compromisos abiertos con fecha.",
    }),
    proyectos: z.number().nullable().openapi({
      description:
        "Media del semáforo de los proyectos vivos (VERDE 100 / AMARILLO 60 / ROJO 20). null = sin proyecto vivo derivable.",
    }),
  }),
);

const SaludClienteSchema = registry.register(
  "SaludCliente",
  z.object({
    cliente_id: z.string().uuid(),
    cliente_nombre: z.string(),
    score: z.number().nullable().openapi({
      description:
        "Σ(peso·subscore) / Σ(peso) sobre los componentes disponibles, redondeado a un decimal. null = sin datos.",
    }),
    bucket: SaludBucketSchema,
    subscores: SaludSubscoresSchema,
    motivo: z.string().openapi({ example: "3 compromisos vencidos" }),
  }),
);

const SaludCarteraSchema = registry.register(
  "SaludCartera",
  z.object({
    sana: z.number().int(),
    atencion: z.number().int(),
    riesgo: z.number().int(),
    sin_datos: z.number().int(),
    total: z.number().int(),
    promedio: z.number().nullable().openapi({
      description: "Media de los scores no nulos, redondeada a un decimal; null si no hay ninguno.",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/clients/health",
  tags: ["Clientes"],
  summary: "Salud de la cartera de clientes (score por aliado)",
  description:
    "Lectura global, igual que GET /api/v1/clients (PR 3): cualquier rol autenticado ve la cartera completa, sin filtro por responsable. " +
    "El score se calcula en el servidor: Contacto (última bitácora) 40, Compromisos (buckets de alertas) 35, Proyectos (semáforo de los proyectos vivos) 25; " +
    "un componente sin datos se descarta y los pesos restantes se renormalizan. Buckets: ≥75 SANA, 45-74.99 ATENCION, <45 RIESGO, null SIN_DATOS. " +
    "Ordenado de peor a mejor (SIN_DATOS al final). Solo lectura: no escribe en la base de datos.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Score por cliente y resumen de la cartera.",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              clientes: z.array(SaludClienteSchema),
              cartera: SaludCarteraSchema,
            }),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 500]),
  },
});
