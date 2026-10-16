// OpenAPI registrations of the S9 KPI endpoints: the portfolio dashboard (E-28) and the per-project
// KPI block. Registered from the real route files: same filters, status codes and field names.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const SEMAFORO = z.enum(["verde", "amarillo", "rojo"]);
const CORTE = z.string().openapi({ example: "2026-03-15", description: "Fecha calendario AAAA-MM-DD (por defecto hoy en Bogotá)." });
const PCT = z.number().nullable().openapi({ description: "Porcentaje 0..100 con un decimal; null = no medible (nunca 0)." });

const KpisProyectoSchema = registry.register(
  "KpisProyecto",
  z.object({
    corte: CORTE,
    estado: z.string(),
    medible: z.boolean().openapi({ description: "false para BORRADOR, PLANIFICACION o CANCELADO: todos los bloques son null." }),
    confirmado: z.boolean().openapi({ description: "true solo si el PO confirmó los umbrales, la tolerancia y el retraso del semáforo." }),
    tecnico: z
      .object({ corte: CORTE, avance_real: z.number(), avance_programado: z.number(), desviacion_pp: z.number(), color: SEMAFORO })
      .nullable(),
    cronograma: z
      .object({
        corte: CORTE,
        vencidas: z.number().int(),
        a_tiempo: z.number().int(),
        atrasadas: z.number().int().openapi({ description: "Vencidas (fin <= corte) con progreso < 100 %; las terminadas con retraso no cuentan." }),
        valor: PCT,
      })
      .nullable(),
    entregables: z.object({ corte: CORTE, programados: z.number().int(), logrados: z.number().int(), valor: PCT }).nullable(),
    indicadores: z
      .object({ corte: CORTE, valor: PCT, medidos: z.number().int(), en_meta: z.number().int().openapi({ description: "Medidos cuya última medición al corte alcanza la meta (último >= meta)." }), sin_medir: z.number().int(), sin_medir_ids: z.array(z.string()) })
      .nullable(),
    beneficiarios: z.object({ corte: CORTE, total: z.number().int(), meta: z.number().int().nullable(), valor: PCT }).nullable(),
    financiero: z
      .object({
        corte: CORTE,
        asignado: z.string().openapi({ example: "2000000.50" }),
        programado: z.string(),
        ejecutado: z.string(),
        ea: PCT,
        ep: PCT,
        color: SEMAFORO,
        alerta_retraso: z.boolean(),
      })
      .nullable(),
  }),
);

const PortafolioSchema = registry.register(
  "PortafolioProyectos",
  z.object({
    base: z.literal("vigente"),
    corte: CORTE,
    confirmado: z.boolean(),
    proyectos: z.array(
      z.object({
        id: z.string().uuid(),
        codigo: z.string(),
        nombre: z.string(),
        estado: z.string(),
        cliente: z.object({ id: z.string(), nombre: z.string() }),
        responsable: z.object({ id: z.string(), nombre: z.string() }).nullable(),
        linea_principal: z.object({ id: z.string(), codigo: z.string(), nombre: z.string() }).nullable(),
        fecha_inicio: z.string().nullable(),
        fecha_fin: z.string().nullable(),
        semaforo_tecnico: SEMAFORO.nullable(),
        semaforo_financiero: SEMAFORO.nullable(),
        alerta_retraso: z.boolean().nullable(),
        atrasadas: z.number().int().nullable().openapi({ description: "Actividades atrasadas (D3); null si el proyecto no es medible." }),
        kpis: KpisProyectoSchema,
      }),
    ),
    agregado: z.object({
      corte: CORTE,
      tecnico: z.object({ proyectos: z.number().int(), avance_real: PCT, avance_programado: PCT }),
      financiero: z.object({
        proyectos: z.number().int(),
        asignado: z.string(),
        programado: z.string(),
        ejecutado: z.string(),
        ea: PCT.openapi({ description: "ΣE / ΣA, ponderado por monto." }),
        ep: PCT.openapi({ description: "ΣE / ΣP, ponderado por monto." }),
      }),
      atrasadas: z.number().int().openapi({ description: "Suma de actividades atrasadas de los proyectos medibles." }),
      beneficiarios: z.object({ total: z.number().int() }).openapi({
        description: "Suma del número «Beneficiarios» de los proyectos medibles (los sin número cuentan 0).",
      }),
      por_linea: z
        .array(
          z.object({
            linea: z.object({ id: z.string(), codigo: z.string(), nombre: z.string() }).nullable().openapi({
              description: "Línea estratégica principal del grupo; null para los proyectos sin línea principal (\"Sin línea\").",
            }),
            proyectos: z.number().int(),
            tecnico: z.object({ avance_real: PCT, avance_programado: PCT }).openapi({
              description: "Media simple del avance técnico de los proyectos medibles de la línea; null si ninguno es medible.",
            }),
            indicadores: z.object({ valor: PCT, medidos: z.number().int(), en_meta: z.number().int() }).openapi({
              description: "Cumplimiento medio de indicadores (0..100) y las sumas de medidos y en meta; valor null si nada se midió.",
            }),
          }),
        )
        .openapi({ description: "Agregado por línea estratégica principal (D7: el radar del Tablero gerencial). Orden de primera aparición." }),
      por_color_tecnico: z.record(z.string(), z.number().int()),
      por_color_financiero: z.record(z.string(), z.number().int()),
    }),
    por_estado: z.record(z.string(), z.number().int()),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/dashboard/portfolio",
  tags: ["Projects"],
  summary: "Tablero de proyectos: KPIs del portafolio visible",
  description:
    "ADMINISTRADOR, GERENCIA y un COLABORADOR con `puede_ver_tablero_gerencial` ven todos los proyectos; un COORDINADOR solo " +
    "aquellos de los que es integrante activo; el resto recibe 403. Siempre base vigente. Solo agregados (totales A/P/E): " +
    "sin gastos individuales, terceros ni soportes. No hay desglose por territorio: el municipio es solo un filtro. " +
    "Los parámetros del semáforo siguen sin confirmar mientras `confirmado` sea false. 400 si el corte o el estado no son válidos. " +
    "Reemplaza a `dashboard/projects` del SDD (ruta ya usada en las ramas v6).",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      corte: CORTE.optional(),
      linea_id: z.string().optional(),
      cliente_id: z.string().optional(),
      responsable_id: z.string().optional(),
      estado: z.string().optional().openapi({ description: "Estado del proyecto (BORRADOR, EN_EJECUCION, ...)." }),
      municipio_id: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "KPIs por proyecto y agregado ponderado.", content: { "application/json": { schema: PortafolioSchema } } },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/kpis",
  tags: ["Projects"],
  summary: "Indicadores (KPIs) de un proyecto a un corte",
  description:
    "Lee quien puede leer la ficha del proyecto, en cualquier estado (404 -> 403 -> 409 sin fechas -> 400 corte o base inválidos). " +
    "Un proyecto fuera de BORRADOR/PLANIFICACION/CANCELADO responde sus bloques; los demás responden `medible: false`. " +
    "`base=original` usa la estructura, A y P de la versión 0 congelada (avances, mediciones y E siguen vigentes) y responde 409 mientras no exista.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      corte: CORTE.optional(),
      base: z.enum(["vigente", "original"]).optional().openapi({ description: "Por defecto vigente; `original` usa la versión 0." }),
    }),
  },
  responses: {
    200: {
      description: "Bloques de KPIs del proyecto.",
      content: { "application/json": { schema: KpisProyectoSchema.extend({ base: z.enum(["vigente", "original"]) }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSX_RESPONSE = { type: "string" as const, format: "binary" as const };
const FORMATO = z.enum(["xlsx"]).optional().openapi({ description: "Solo `xlsx`. `pdf` (u otro) responde 400: aún no está disponible." });
const EXPORT_NOTE =
  "Solo agregados: ninguna hoja trae gastos individuales, terceros ni soportes, para ningún rol (P04). " +
  "Cada descarga escribe una fila de auditoría `EXPORTAR` (si la auditoría falla, la descarga no falla).";

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/export",
  tags: ["Projects"],
  summary: "Exporta a Excel la ficha del proyecto o la ficha financiera",
  description:
    `Lee quien puede leer la ficha del proyecto (404 -> 403 -> 409 sin fechas -> 400). \`ficha=proyecto\` (por defecto) trae datos ` +
    `generales, conteos de estructura y KPIs; \`ficha=financiera\` trae las filas por rubro y la fila de total de la ficha financiera ` +
    `(\`corte\` AAAA-MM). \`base=original\` usa la versión 0 congelada. ${EXPORT_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      formato: FORMATO,
      ficha: z.enum(["proyecto", "financiera"]).optional(),
      corte: z.string().optional().openapi({ description: "AAAA-MM-DD para `proyecto`; AAAA-MM para `financiera`." }),
      base: z.enum(["vigente", "original"]).optional(),
    }),
  },
  responses: {
    200: { description: "Libro de Excel (.xlsx).", content: { [XLSX]: { schema: XLSX_RESPONSE } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/dashboard/portfolio/export",
  tags: ["Projects"],
  summary: "Exporta a Excel el tablero de proyectos",
  description:
    "Mismo alcance, filtros y números que `GET /api/v1/dashboard/portfolio` (403 para quien no lo ve; el 403 va antes que el 400 de " +
    `\`formato\`). Máximo 500 proyectos; si se corta, el resumen lo indica. ${EXPORT_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      formato: FORMATO,
      corte: CORTE.optional(),
      linea_id: z.string().optional(),
      cliente_id: z.string().optional(),
      responsable_id: z.string().optional(),
      estado: z.string().optional(),
      municipio_id: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "Libro de Excel (.xlsx).", content: { [XLSX]: { schema: XLSX_RESPONSE } } },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});
