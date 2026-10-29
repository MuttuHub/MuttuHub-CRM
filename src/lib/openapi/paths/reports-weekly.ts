// OpenAPI registration of the weekly report (S5): `GET /api/v1/reports/weekly` and its Excel export.
// Registered from the real route files: same query, status codes and field names.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const FECHA = z.string().openapi({ example: "2026-10-19", description: "Fecha calendario AAAA-MM-DD." });
const SEMANA_QUERY = z.string().optional().openapi({
  example: "2026-10-21",
  description: "Cualquier día de la semana pedida (AAAA-MM-DD); por defecto, la semana en curso en Bogotá.",
});
const SEMAFORO = z.enum(["verde", "amarillo", "rojo"]).nullable().openapi({ description: "null = proyecto no medible." });
const PCT = z.number().nullable();
const MONTO = z.string().openapi({ example: "1234.50", description: "Monto en COP como decimal." });
const CONTEO_COLOR = z.object({ verde: z.number().int(), amarillo: z.number().int(), rojo: z.number().int() });
const PROYECTO_REF = z.object({ id: z.string(), codigo: z.string(), nombre: z.string() });
const SEMANA = z.object({ desde: FECHA, hasta: FECHA });
const RESUMEN = {
  tecnico: z.object({ proyectos: z.number().int(), avance_real: PCT, avance_programado: PCT }),
  financiero: z.object({
    proyectos: z.number().int(),
    asignado: MONTO,
    programado: MONTO,
    ejecutado: MONTO,
    ea: PCT,
    ep: PCT,
  }),
  atrasadas: z.number().int(),
  por_color_tecnico: CONTEO_COLOR,
  por_color_financiero: CONTEO_COLOR,
};
const CONTEO_TAREAS = z.object({ cerradas: z.number().int(), vencidas: z.number().int() });

const ReporteSemanalSchema = registry.register(
  "ReporteSemanal",
  z.object({
    semana: SEMANA.openapi({ description: "Lunes a domingo en el calendario de Bogotá." }),
    semana_anterior: SEMANA,
    corte: FECHA.openapi({ description: "Corte de los indicadores: el domingo de la semana, o hoy si la semana está en curso." }),
    confirmado: z.boolean().openapi({ description: "false mientras los umbrales del semáforo no estén confirmados." }),
    portafolio: z.object({
      proyectos: z.array(
        z.object({
          id: z.string(),
          codigo: z.string(),
          nombre: z.string(),
          estado: z.string(),
          cliente: z.object({ id: z.string(), nombre: z.string() }),
          responsable: z.object({ id: z.string(), nombre: z.string() }).nullable(),
          semaforo_tecnico: SEMAFORO,
          semaforo_financiero: SEMAFORO,
          alerta_retraso: z.boolean().nullable(),
          avance_real: PCT,
          avance_programado: PCT,
          asignado: MONTO.nullable(),
          programado: MONTO.nullable(),
          ejecutado: MONTO.nullable(),
          atrasadas: z.number().int().nullable(),
        }),
      ),
      total: z.object(RESUMEN),
      por_cliente: z.array(
        z.object({ cliente: z.object({ id: z.string(), nombre: z.string() }), proyectos: z.number().int(), ...RESUMEN }),
      ),
    }),
    actividades_atrasadas: z.array(z.object({ proyecto: PROYECTO_REF, actividad_id: z.string().nullable(), detalle: z.string() })),
    tareas: z.object({ semana: CONTEO_TAREAS, semana_anterior: CONTEO_TAREAS }).openapi({
      description:
        "Cerradas: COMPLETADA con cierre real en la semana (Bogotá). Vencidas: entrega en la semana, ya pasada, y sin cerrar a tiempo " +
        "(abierta o completada un día posterior). Las canceladas no cuentan. Alcance global, como la cara «Gestión de tareas».",
    }),
    atencion: z
      .array(
        z.object({
          proyecto: PROYECTO_REF,
          items: z.array(z.object({ tipo: z.string(), titulo: z.string(), detalle: z.string() })),
        }),
      )
      .openapi({
        description:
          "«Requiere atención» de cada proyecto medible, sin las actividades atrasadas (van aparte). Los gastos observados se " +
          "resumen en un conteo: nunca se expone el detalle de un gasto.",
      }),
    gastos_por_validar: z
      .object({
        cantidad: z.number().int(),
        monto: MONTO,
        por_proyecto: z.array(
          z.object({ proyecto: PROYECTO_REF, cantidad: z.number().int(), monto: MONTO, mas_antiguo: FECHA }),
        ),
      })
      .nullable()
      .openapi({ description: "Solo para ADMINISTRADOR y GERENCIA (null para el resto). Agregados por proyecto." }),
  }),
);

const ACCESO =
  "Mismo acceso y alcance que `GET /api/v1/dashboard/portfolio` (403 para quien no lo ve). 400 si la semana no es una fecha " +
  "AAAA-MM-DD o todavía no empieza.";

registry.registerPath({
  method: "get",
  path: "/api/v1/reports/weekly",
  tags: ["Projects"],
  summary: "Reporte semanal: portafolio, actividades atrasadas, tareas, «Requiere atención» y gastos por validar",
  description: `${ACCESO} Solo agregados: sin gastos individuales, terceros ni soportes (P04).`,
  security: [{ sessionCookie: [] }],
  request: { query: z.object({ semana: SEMANA_QUERY }) },
  responses: {
    200: { description: "El reporte de la semana.", content: { "application/json": { schema: ReporteSemanalSchema } } },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/reports/weekly/export",
  tags: ["Projects"],
  summary: "Exporta a Excel el reporte semanal",
  description:
    `${ACCESO} El 403 va antes que el 400 de \`formato\`. Hojas: Resumen, Proyectos, Por cliente, Actividades atrasadas, ` +
    "Requiere atención y, solo para ADMINISTRADOR y GERENCIA, Gastos por validar. Solo agregados (P04). Cada descarga escribe " +
    "una fila de auditoría `EXPORTAR` (si la auditoría falla, la descarga no falla).",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      semana: SEMANA_QUERY,
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
