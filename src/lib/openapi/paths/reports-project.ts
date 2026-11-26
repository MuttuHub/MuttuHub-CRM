// OpenAPI registration of the project report (T9a, S15–S17): `GET /api/v1/reports/project`.
// Registered from the real route file: same query, status codes and field names.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const FECHA = z.string().openapi({ example: "2026-10-19", description: "Fecha calendario AAAA-MM-DD." });
const MONTO = z.string().openapi({ example: "1234.50", description: "Monto en COP como decimal." });
const REF = z.object({ id: z.string(), nombre: z.string() });
const TAREA = z.object({
  id: z.string(),
  titulo: z.string(),
  estado: z.string(),
  fecha_entrega: FECHA.nullable(),
  responsable: REF,
});

const ReporteProyectoSchema = registry.register(
  "ReporteProyecto",
  z.object({
    corte: FECHA.openapi({ description: "Hoy (Bogotá): corte de los indicadores y de las tareas vencidas." }),
    resumen: z.object({
      proyecto: z.object({
        id: z.string(),
        codigo: z.string(),
        nombre: z.string(),
        estado: z.string(),
        origen: z.string().nullable(),
      }),
      cliente: z.string().openapi({ description: "Cliente del proyecto, o «Posición propia · N aliados»." }),
      responsable: REF.nullable(),
      valor_total: MONTO.nullable(),
      financiero: z
        .object({ programado: MONTO, ejecutado: MONTO })
        .nullable()
        .openapi({ description: "Mismo bloque del portafolio (`base=vigente`) al corte; null si el proyecto aún no es medible." }),
      financiacion: z
        .object({ meta: MONTO.nullable(), comprometido: MONTO, en_gestion: MONTO, sin_cubrir: MONTO.nullable() })
        .nullable()
        .openapi({
          description:
            "Meta frente a lo comprometido (solo posición propia; null en otro origen). Meta = `valor_total`; comprometido y " +
            "en gestión suman el aporte de los aliados en ese estado; sin cubrir = meta − comprometido − en gestión, nunca negativo.",
        }),
    }),
    aliados: z
      .array(
        z.object({
          id: z.string(),
          cliente: REF,
          rol: z.enum(["FINANCIADOR", "ALIADO", "PROSPECTO"]),
          estado: z.enum(["EN_GESTION", "COMPROMETIDO", "DESCARTADO"]),
          aporte_cop: z.number().nullable(),
          ultima_interaccion: FECHA.nullable().openapi({ description: "Última interacción con el aliado sobre este proyecto." }),
        }),
      )
      .openapi({ description: "Todos los aliados (incluidos los descartados): comprometidos, en gestión y descartados, por nombre. Vacío si no es posición propia." }),
    oportunidades: z
      .array(
        z.object({
          id: z.string(),
          nombre: z.string(),
          estado: z.string(),
          fase: z.string(),
          valor_estimado_cop: MONTO.nullable(),
          cliente: REF,
          vinculo: z.enum(["PROYECTO", "ALIADO"]),
        }),
      )
      .nullable()
      .openapi({ description: "La oportunidad del proyecto y las abiertas de sus aliados no descartados; null sin acceso comercial." }),
    bitacora: z
      .array(
        z.object({
          id: z.string(),
          fecha: FECHA,
          tipo: z.string(),
          texto: z.string(),
          proximo_paso: z.string().nullable(),
          cliente: REF,
          autor: REF,
        }),
      )
      .openapi({ description: "Las últimas 50 interacciones registradas sobre este proyecto, de la más reciente a la más antigua." }),
    tareas: z.object({
      resumen: z.object({
        total: z.number().int(),
        completadas: z.number().int(),
        canceladas: z.number().int(),
        avance_pct: z.number().nullable().openapi({ description: "Completadas / (todas − canceladas); null si no hay base." }),
      }),
      vencidas: z.array(TAREA).openapi({ description: "Abiertas con entrega antes de hoy, la más antigua primero." }),
      proximas: z.array(TAREA).openapi({ description: "Abiertas con entrega hoy o después, la más cercana primero; sin fecha al final." }),
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/reports/project",
  tags: ["Projects"],
  summary: "Reporte del proyecto: resumen, aliados, oportunidades, bitácora y tareas",
  description:
    "Mismo acceso que la ficha del proyecto: 404 si no existe, 403 si no lo puedes ver. Resumen con valor, presupuesto " +
    "programado y ejecutado, estado y meta frente a lo comprometido; aliados con su rol, estado, aporte y última " +
    "interacción; oportunidades vinculadas (null sin acceso comercial); bitácora del proyecto y avance de tareas. " +
    "400 sin proyecto.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      proyecto_id: z.string().openapi({ description: "Id del proyecto." }),
    }),
  },
  responses: {
    200: { description: "El reporte del proyecto.", content: { "application/json": { schema: ReporteProyectoSchema } } },
    ...standardErrorResponses([400, 401, 403, 404, 500]),
  },
});
