// OpenAPI registration of the tag report (T2, S2–S5): `GET /api/v1/reports/tag`, and its Excel export (T3, S6).
// Registered from the real route file: same query, status codes and field names.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const FECHA = z.string().openapi({ example: "2026-10-19", description: "Fecha calendario AAAA-MM-DD." });
const MONTO = z.string().openapi({ example: "1234.50", description: "Monto en COP como decimal." });
const REF = z.object({ id: z.string(), nombre: z.string() });

const ReporteEtiquetaSchema = registry.register(
  "ReporteEtiqueta",
  z.object({
    etiqueta: z.string(),
    periodo: z.object({ desde: FECHA.nullable(), hasta: FECHA.nullable() }),
    corte: FECHA.openapi({ description: "Corte de proyectos y oportunidades: `hasta`, o hoy si `hasta` es posterior o falta." }),
    confirmado: z.boolean().openapi({ description: "false mientras los umbrales del semáforo no estén confirmados." }),
    resumen: z.object({
      clientes: z.number().int(),
      proyectos: z.number().int(),
      valor_total: MONTO.openapi({ description: "Suma de `valor_total` de los proyectos con la etiqueta." }),
      financiero: z.object({ programado: MONTO, ejecutado: MONTO }),
      pipeline: z
        .object({ oportunidades: z.number().int(), valor: MONTO })
        .nullable()
        .openapi({ description: "null sin acceso comercial." }),
      tareas: z.object({ total: z.number().int(), completadas: z.number().int(), vencidas: z.number().int() }),
    }),
    proyectos: z
      .array(z.object({}).passthrough())
      .openapi({ description: "Filas del portafolio (`GET /api/v1/dashboard/portfolio`) con la etiqueta, más `valor_total`." }),
    clientes: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
        proyectos: z.number().int(),
        oportunidades_abiertas: z.number().int().optional().openapi({ description: "Solo con acceso comercial." }),
        ultima_interaccion: FECHA.nullable(),
        dias_sin_interaccion: z.number().int().nullable(),
        sin_interaccion_reciente: z.boolean().openapi({ description: "Más de 15 días sin interacciones, o ninguna." }),
      }),
    ),
    oportunidades: z
      .array(z.object({ id: z.string(), nombre: z.string(), estado: z.string(), valor_estimado_cop: MONTO.nullable(), cliente: REF }))
      .nullable()
      .openapi({ description: "Oportunidades abiertas de los clientes con la etiqueta; null sin acceso comercial." }),
    bitacora: z.array(
      z.object({
        id: z.string(),
        fecha: FECHA,
        tipo: z.string(),
        texto: z.string(),
        proximo_paso: z.string().nullable(),
        cliente: REF,
        autor: REF,
      }),
    ),
    tareas: z.array(
      z.object({
        id: z.string(),
        titulo: z.string(),
        estado: z.string(),
        fecha_entrega: FECHA.nullable(),
        vencida: z.boolean(),
        responsable: REF,
        cliente: REF.nullable(),
      }),
    ),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/reports/tag",
  tags: ["Projects"],
  summary: "Reporte por etiqueta: proyectos, clientes, oportunidades, bitácora y tareas",
  description:
    "Proyectos con la etiqueta (alcance del portafolio), clientes con la etiqueta y sus oportunidades abiertas y " +
    "bitácora, y tareas con la etiqueta (vencidas primero). Cada sección conserva el acceso de su fuente; " +
    "oportunidades y pipeline son null sin acceso comercial. Un cliente con dos etiquetas aparece en ambos " +
    "reportes: los totales de etiquetas distintas no se suman. 400 sin etiqueta o con un período no válido.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      etiqueta: z.string().openapi({ example: "Fábrica Milagro", description: "Etiqueta del catálogo `task_tags`." }),
      desde: FECHA.optional().openapi({ description: "Inicio del período (bitácora por fecha, tareas por entrega)." }),
      hasta: FECHA.optional().openapi({ description: "Fin del período; también fija el corte." }),
    }),
  },
  responses: {
    200: { description: "El reporte de la etiqueta.", content: { "application/json": { schema: ReporteEtiquetaSchema } } },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/reports/tag/export",
  tags: ["Projects"],
  summary: "Exporta a Excel el reporte por etiqueta",
  description:
    "Mismo acceso, alcance y números que `GET /api/v1/reports/tag`. El 403 va antes que el 400 de `formato`. Hojas: " +
    "Resumen, Proyectos, Clientes, Oportunidades (solo con acceso comercial), Bitácora y Tareas; montos como números, " +
    "fechas como fechas y filas de totales en Proyectos, Clientes y Oportunidades. Archivo " +
    "`reporte-etiqueta-<etiqueta>-<corte>.xlsx`. Cada descarga escribe una fila de auditoría `EXPORTAR` (si la auditoría " +
    "falla, la descarga no falla).",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      etiqueta: z.string().openapi({ example: "Fábrica Milagro", description: "Etiqueta del catálogo `task_tags`." }),
      desde: FECHA.optional().openapi({ description: "Inicio del período (bitácora por fecha, tareas por entrega)." }),
      hasta: FECHA.optional().openapi({ description: "Fin del período; también fija el corte." }),
      formato: z.enum(["xlsx"]).optional().openapi({ description: "Solo `xlsx`; `pdf` (u otro) responde 400." }),
    }),
  },
  responses: {
    200: {
      description: "Libro de Excel (.xlsx).",
      content: {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
          schema: { type: "string" as const, format: "binary" as const },
        },
      },
    },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});
