// OpenAPI path registration for B3: import the structure from the PO's workbook.
// Registered from the actual route file: same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";

const ProjectParams = z.object({ id: z.string().uuid() });

const Conteo = {
  objetivos: z.number().int(),
  actividades: z.number().int(),
  entregables: z.number().int(),
  indicadores: z.number().int(),
};

const ErrorEstructuraPOSchema = registry.register(
  "ErrorEstructuraPO",
  z.object({
    hoja: z.string().nullable().openapi({ description: "Hoja del archivo; nula para un error del archivo entero." }),
    fila: z.number().int().nullable().openapi({ description: "Fila de Excel (1-based); nula para un error de la hoja." }),
    columna: z.string().nullable().openapi({ description: "Letra de la columna; nula para un error de la hoja." }),
    mensaje: z.string(),
  }),
);

const PlanEstructuraPOSchema = registry.register(
  "PlanEstructuraPO",
  z.object({
    objetivos: z.array(z.object({ codigo: z.string().openapi({ example: "O1" }), descripcion: z.string() })),
    indicadores: z.array(
      z.object({ codigo: z.string().openapi({ example: "IND-01" }), objetivoCodigo: z.string(), nombre: z.string(), meta: z.string() }),
    ),
    actividades: z.array(
      z.object({
        codigo: z.string().openapi({ example: "A1.1" }),
        objetivoCodigo: z.string(),
        nombre: z.string(),
        semanaInicio: z.number().int(),
        semanaFin: z.number().int(),
      }),
    ),
    entregables: z.array(
      z.object({
        codigo: z.string().openapi({ example: "E1.1.1" }),
        actividadCodigo: z.string(),
        descripcion: z.string(),
        cantidadMeta: z.string().openapi({ example: "2.00" }),
        unidad: z.string(),
      }),
    ),
  }),
);

const StructureImportPreviewSchema = registry.register(
  "StructureImportPreview",
  z.object({
    importado: z.literal(false),
    valido: z.literal(true),
    resumen: z.object({ ...Conteo, errores: z.number().int() }),
    plan: PlanEstructuraPOSchema,
    reemplaza: z.object(Conteo).openapi({ description: "Filas vivas que la importación reemplazaría." }),
  }),
);

const StructureImportAppliedSchema = registry.register(
  "StructureImportApplied",
  z.object({ importado: z.literal(true), lote_id: z.string().uuid(), resumen: z.object(Conteo) }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/structure/import",
  tags: ["Projects"],
  summary: "Importa la estructura desde el Excel de la PO, con códigos generados y sin tocar el presupuesto",
  description:
    "Mismos roles que la importación de plantilla (`ADMINISTRADOR`/`GERENCIA` o un integrante activo que edita datos) y solo " +
    "con el proyecto en `BORRADOR`. Multipart con el archivo en `archivo` (.xlsx, máximo 4 MB; no se almacena). Lee una hoja " +
    "de indicadores (`Objetivo especifico | Resultados (indicador) | Resultados (meta)`) y una de actividades con una fila por " +
    "entregable (`Objetivo especifico | Actividad | Entregables | Inicio (semana) | Fin (semana) | Cantidad | Unidad`), " +
    "reconocidas por sus encabezados; solo una hoja de cada tipo puede tener datos y la de actividades es obligatoria. " +
    "Objetivos y actividades se agrupan por texto normalizado y los códigos los genera el sistema (O1, A1.1, E1.1.1, IND-01). " +
    "La cantidad nunca se lee del texto del entregable. El medio de verificación y la unidad del indicador quedan vacíos. " +
    "Con `modo=validar` devuelve el plan y lo que reemplazaría, sin escribir. Aplicar reemplaza en una transacción la " +
    "estructura viva (borrado lógico) con una auditoría `IMPORTAR` por fila creada y una fila `reemplazo` en el mismo lote; " +
    "nunca toca el presupuesto, la programación ni los campos del proyecto. Orden de errores: 404 -> 403 -> 409 -> 413 -> 400.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            archivo: z.string().openapi({ format: "binary", description: "Excel de la PO (.xlsx)." }),
            modo: z.literal("validar").optional().openapi({ description: "Solo valida y devuelve la vista previa; no escribe." }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Vista previa o importación aplicada.",
      content: {
        "application/json": { schema: z.union([StructureImportPreviewSchema, StructureImportAppliedSchema]) },
      },
    },
    400: {
      description: "Archivo ilegible, tipo no válido o con errores (VALIDATION_ERROR, con `reporte` cuando se leyó).",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            code: z.literal("VALIDATION_ERROR"),
            reporte: z
              .object({
                errores: z.array(ErrorEstructuraPOSchema),
                resumen: z.object({ ...Conteo, errores: z.number().int() }),
                truncado: z.boolean(),
              })
              .optional(),
          }),
        },
      },
    },
    409: { description: "El proyecto no está en Borrador (`INVALID_STATE`) o ya tiene avances, mediciones o beneficiarios." },
    413: { description: "El archivo supera 4 MB (`FILE_TOO_LARGE`)." },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});
