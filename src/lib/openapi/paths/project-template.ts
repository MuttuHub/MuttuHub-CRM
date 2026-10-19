// OpenAPI path registrations for the S7 Excel template of a project (RF-03, RF-04):
// the prefilled download and the atomic import. Registered from the actual route
// files — same status codes, same field names, same auth rules. No route here
// changes the project estado.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const ProjectParams = z.object({ id: z.string().uuid() });

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const WRITE_NOTE =
  "Solo `ADMINISTRADOR`/`GERENCIA` y solo mientras el proyecto está en `BORRADOR` (404 -> 403 -> 409 INVALID_STATE -> 400).";

const HallazgoSchema = registry.register(
  "HallazgoPlantilla",
  z.object({
    regla: z.string().openapi({ example: "V-12", description: "Regla de validación (V-01..V-14, V-H1, V-H2) o advertencia (W-01)." }),
    hoja: z.string().openapi({ example: "7. Presupuesto" }),
    fila: z.number().int().nullable().openapi({ description: "Fila de Excel (base 1); nula si el hallazgo es de la hoja." }),
    columna: z.string().nullable(),
    valor: z.string().nullable().openapi({ description: "Valor leído de la celda." }),
    mensaje: z.string(),
  }),
);

const ResumenImportacionSchema = registry.register(
  "ResumenImportacionPlantilla",
  z.object({
    objetivos: z.number().int(),
    actividades: z.number().int(),
    entregables: z.number().int(),
    indicadores: z.number().int(),
    rubros: z.number().int().openapi({ description: "Rubros con presupuesto mayor que $0." }),
    celdas_programacion: z.number().int(),
  }),
);

const ReporteSchema = registry.register(
  "ReporteImportacionPlantilla",
  z.object({
    errores: z.array(HallazgoSchema).openapi({ description: "Ordenados por hoja y fila; como máximo 500." }),
    advertencias: z.array(HallazgoSchema),
    resumen: z.record(z.string(), z.number().int()).openapi({ description: "Conteo por regla, calculado antes del tope." }),
    truncado: z.boolean().openapi({ description: "Verdadero cuando había más de 500 errores." }),
  }),
);

const ImportResultSchema = registry.register(
  "ResultadoImportacionPlantilla",
  z.discriminatedUnion("importado", [
    z.object({
      importado: z.literal(false),
      valido: z.literal(true),
      resumen: ResumenImportacionSchema,
      reemplaza: z.object({
        objetivos: z.number().int(),
        actividades: z.number().int(),
        entregables: z.number().int(),
        indicadores: z.number().int(),
      }).openapi({ description: "Filas vivas que la importación reemplazaría (borrado lógico)." }),
      advertencias: z.array(HallazgoSchema),
    }),
    z.object({
      importado: z.literal(true),
      lote_id: z.string().uuid().openapi({ description: "Lote de auditoría de toda la importación." }),
      resumen: ResumenImportacionSchema,
      advertencias: z.array(HallazgoSchema),
    }),
  ]),
);

const ImportBadRequestSchema = z.object({
  error: z.string(),
  code: z.literal("VALIDATION_ERROR"),
  reporte: ReporteSchema.optional().openapi({
    description: "Presente cuando la plantilla fue leída y falló la validación; ausente en un archivo ilegible o mal formado.",
  }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/template",
  tags: ["Projects"],
  summary: "Descarga la plantilla Excel precargada de un proyecto en Borrador",
  description:
    `${WRITE_NOTE} Requiere fecha de inicio y fin (409 INVALID_STATE si falta alguna): la hoja de programación tiene una columna ` +
    "por mes. El libro trae nueve hojas y se precarga con la estructura, el presupuesto y la programación actuales, de modo " +
    "que descargar, editar e importar es el ciclo de edición. Registra una auditoría `EXPORTAR` (best-effort).",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: {
      description: "Libro de Excel como adjunto `<codigo>-plantilla.xlsx`.",
      content: { [XLSX_MIME]: { schema: z.string().openapi({ format: "binary" }) } },
    },
    ...standardErrorResponses([401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/import",
  tags: ["Projects"],
  summary: "Importa la plantilla Excel y reemplaza el borrador de forma atómica",
  description:
    `${WRITE_NOTE} Multipart con el archivo en \`archivo\` (se acepta \`file\`), máximo 4 MB; el archivo no se almacena. Con ` +
    "`modo=validar` (o `?dry_run=1`) solo valida y devuelve el resumen y lo que se reemplazaría, sin escribir nada. Aplicar " +
    "ejecuta el escritor una sola vez en una sola transacción, todo o nada, con un único lote de auditoría `IMPORTAR`: " +
    "reemplaza estructura (borrado lógico), presupuesto, programación, fechas, líneas y municipios. Orden de errores: " +
    "404 -> 403 -> 409 -> 413 -> 400. Un proyecto con avances, mediciones o beneficiarios registrados responde 409.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            archivo: z.string().openapi({ format: "binary", description: "Plantilla .xlsx diligenciada." }),
            modo: z.literal("validar").optional().openapi({ description: "Solo valida; no escribe." }),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Validación o importación aplicada.", content: { "application/json": { schema: ImportResultSchema } } },
    400: {
      description: "Archivo ilegible, tipo no válido o plantilla con errores (VALIDATION_ERROR, con `reporte` cuando aplica).",
      content: { "application/json": { schema: ImportBadRequestSchema } },
    },
    ...standardErrorResponses([401, 403, 404, 409, 413, 500]),
  },
});
