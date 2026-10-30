// OpenAPI registration of the S14 per-project S-curve endpoint. Registered from the real
// route file: same query, status codes and field names.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const CurvaPuntoSchema = registry.register(
  "CurvaPunto",
  z.object({
    periodo: z.string().openapi({ example: "2026-10", description: "Periodo AAAA-MM." }),
    tecnico: z.object({
      planeado: z.number().openapi({ description: "Avance técnico planeado, 0..100 con un decimal: al fin de mes (D1), salvo el mes de corte, que se evalúa en la fecha de corte (D13)." }),
      ejecutado: z.number().nullable().openapi({ description: "Avance técnico real; null después del corte." }),
    }),
    financiero: z.object({
      planeado: z.number().openapi({ description: "Programado acumulado sobre lo asignado, 0..100 con un decimal." }),
      ejecutado: z.number().nullable().openapi({ description: "Validado acumulado sobre lo asignado; null después del corte." }),
    }),
  }),
);

const CurvaSchema = registry.register(
  "CurvaProyecto",
  z.object({
    base: z.enum(["vigente", "original"]).openapi({ description: "Tablas vivas o la versión 0 congelada (S8)." }),
    corte: z.string().openapi({ example: "2026-11", description: "Mes de corte: hoy (Bogotá) acotado al rango del proyecto." }),
    periodos: z.array(CurvaPuntoSchema).openapi({
      description:
        "Una fila por periodo del proyecto: la curva técnica (avance programado vs real) y la financiera " +
        "(programado vs validado sobre lo asignado), siempre separadas.",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/curve",
  tags: ["Projects"],
  summary: "Curva S del proyecto (técnica y financiera)",
  description:
    "Dos curvas separadas que nunca se mezclan: la técnica (planeado lineal por días al fin de mes, D1, y en la fecha de corte para el mes de corte, D13; " +
    "cada actividad aporta como máximo el tope `tope_en_curso`, así que la línea planeada termina en el tope, AJ-03; " +
    "ejecutado = avance real por periodo) y la financiera (planeado = programado acumulado / asignado; ejecutado = validado " +
    "acumulado / asignado). `ejecutado` es null en los periodos posteriores al corte. `base=vigente` (por defecto) lee " +
    "la estructura y el presupuesto vivos; `base=original` las semanas, pesos y A/P congelados en la versión 0 con los " +
    "mismos avances y gastos vivos. Lee quien puede leer la ficha del proyecto, en cualquier estado " +
    "(404 -> 403 -> 409 sin fechas -> 400 base inválida).",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ base: z.enum(["vigente", "original"]).optional() }),
  },
  responses: {
    200: { description: "Curva S del proyecto.", content: { "application/json": { schema: CurvaSchema } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});
