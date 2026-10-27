// OpenAPI path registrations for the S6 expenses of a project (RF-20, RF-21, RNF-03, RNF-04).
// Registered from the real schemas (`lib/api/gastos.ts`, `lib/api/soportes.ts`): same status codes,
// same field names, same auth rules. No route here changes the project estado.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { GASTO_CREATE_SCHEMA, GASTO_PATCH_SCHEMA } from "@/lib/api/gastos";
import { MOTIVO_GASTO_SCHEMA } from "@/lib/api/validacion-gastos";
import { MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA, MEDIO_SIGN_SCHEMA } from "@/lib/api/soportes";

const ProjectParams = z.object({ id: z.string().uuid() });
const ExpenseParams = z.object({ id: z.string().uuid(), expenseId: z.string().uuid() });

const READ_NOTE =
  "Lee quien puede leer la ficha del proyecto (404 antes del 403), en cualquier estado. El número de identificación del " +
  "tercero y los soportes solo se devuelven a quien puede ver soportes financieros (ADMINISTRADOR/GERENCIA o COORDINADOR " +
  "integrante); la bandera gerencial no los otorga.";

const WRITE_NOTE =
  "ADMINISTRADOR/GERENCIA o COORDINADOR integrante activo, solo con el proyecto `EN_EJECUCION` " +
  "(404 -> 403 -> 409 INVALID_STATE -> 400). Ninguna ruta cambia el estado del proyecto.";

const SoporteGastoSchema = registry.register(
  "SoporteGasto",
  z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    tipo: z.enum(["archivo", "enlace"]),
    url_externa: z.string().nullable(),
    tipo_mime: z.string().nullable(),
    tamano_bytes: z.number().int().nullable(),
    subido_por_id: z.string(),
    created_at: z.string(),
  }),
);

const EstadoGastoSchema = z.enum(["REGISTRADO", "VALIDADO", "RECHAZADO", "ANULADO"]);

export const GastoSchema = registry.register(
  "Gasto",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    rubro: z.object({ id: z.string().uuid(), codigo: z.string().nullable(), nombre: z.string() }),
    fecha_documento: z.string().openapi({ example: "2026-10-15" }),
    periodo: z.string().openapi({ example: "2026-10" }),
    tipo_soporte: z.enum(["FACTURA_PROVEEDOR", "CUENTA_COBRO_PERSONA_NATURAL", "OTRO"]),
    tercero_nombre: z.string(),
    tercero_tipo_id: z.enum(["NIT", "CC", "CE"]).nullable(),
    tercero_numero_id: z.string().nullable().optional().openapi({ description: "Omitido sin acceso a soportes financieros (RNF-03)." }),
    numero_documento: z.string(),
    descripcion: z.string(),
    valor: z.string().openapi({ example: "1500000.50", description: "Decimal(15,2) como string." }),
    estado: EstadoGastoSchema,
    alerta_sobregasto: z.boolean(),
    datos_incompletos: z.boolean().openapi({ description: "Derivado: falta el tipo o el número de identificación del tercero." }),
    registrado_por_id: z.string(),
    created_at: z.string(),
    validado_por_id: z.string().nullable(),
    validado_at: z.string().nullable(),
    rechazado_por_id: z.string().nullable(),
    rechazado_at: z.string().nullable(),
    motivo_rechazo: z.string().nullable(),
    anulado_por_id: z.string().nullable(),
    anulado_at: z.string().nullable(),
    motivo_anulacion: z.string().nullable(),
    soportes: z.array(SoporteGastoSchema).optional().openapi({ description: "Omitido sin acceso a soportes financieros (RNF-03)." }),
    soportes_count: z
      .number()
      .int()
      .optional()
      .openapi({ description: "Soportes vigentes del gasto. Omitido sin acceso a soportes financieros (RNF-03)." }),
  }),
);

const AlertaSchema = z.union([
  z.object({ tipo: z.literal("SOBREGASTO"), mensaje: z.string() }),
  z.object({
    tipo: z.literal("DUPLICADO"),
    gasto_id: z.string().nullable(),
    proyecto_codigo: z.string().nullable().openapi({ description: "Nulo si quien registra no puede leer ese proyecto." }),
    mensaje: z.string(),
  }),
]);

const ResumenSchema = z.object({
  vigentes: z.number().int().openapi({ description: "Gastos REGISTRADO y VALIDADO." }),
  con_soporte: z
    .number()
    .int()
    .optional()
    .openapi({ description: "Vigentes con al menos un soporte vigente. Omitido sin acceso a soportes financieros (RNF-03)." }),
  observados: z.object({ cantidad: z.number().int(), valor: z.string() }).openapi({
    description: "Gastos REGISTRADO con alerta de sobregasto o con datos incompletos (no es un estado).",
  }),
});

const TotalesSchema = z.record(z.string(), z.object({ cantidad: z.number().int(), valor: z.string() }));

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/expenses",
  tags: ["Projects"],
  summary: "Gastos de un proyecto con totales por estado",
  description: `Más recientes primero. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: {
      description: "Gastos y totales por estado.",
      content: { "application/json": { schema: z.object({ gastos: z.array(GastoSchema), totales: TotalesSchema, resumen: ResumenSchema }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/expenses",
  tags: ["Projects"],
  summary: "Registra un gasto contra un rubro del proyecto",
  description:
    `${WRITE_NOTE} El rubro debe tener valor asignado mayor que cero y el periodo (por defecto el mes de la fecha del ` +
    "documento) debe ser un mes del proyecto. El valor es un string decimal positivo con máximo dos decimales. Exige de 1 a 5 " +
    "soportes en modo confirmación (firma en `/expenses/sign`, subida directa, y aquí `storage_path` o `url_externa`). El " +
    "estado siempre es REGISTRADO. Las alertas no bloquean: `SOBREGASTO` (aviso temprano contra lo validado) y `DUPLICADO` " +
    "(mismo tercero y número de documento normalizados en cualquier proyecto; el código solo se revela si se puede leer ese proyecto).",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: {
      content: {
        "application/json": {
          schema: GASTO_CREATE_SCHEMA.extend({
            soportes: z.array(z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA])).min(1).max(5),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Gasto registrado.",
      content: { "application/json": { schema: z.object({ gasto: GastoSchema, alertas: z.array(AlertaSchema) }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/expenses/sign",
  tags: ["Projects"],
  summary: "Firma la subida directa de un soporte de gasto (ADR-13)",
  description:
    `${WRITE_NOTE} Existe antes que el gasto: el navegador firma, sube el archivo y confirma dentro de \`POST /expenses\`. ` +
    "Misma política de archivo que los medios de avance (413 FILE_TOO_LARGE); el servidor elige la clave bajo " +
    "`proyectos/{id}/soportes/`.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams, body: { content: { "application/json": { schema: MEDIO_SIGN_SCHEMA } } } },
  responses: {
    200: {
      description: "URL firmada de subida y límites de la política.",
      content: {
        "application/json": {
          schema: z.object({
            storage_path: z.string(),
            token: z.string(),
            signed_url: z.string(),
            max_bytes: z.number().int(),
            allowed_extensions: z.array(z.string()),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 413, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/expenses/{expenseId}",
  tags: ["Projects"],
  summary: "Detalle de un gasto",
  description: READ_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: ExpenseParams },
  responses: {
    200: { description: "Gasto.", content: { "application/json": { schema: z.object({ gasto: GastoSchema }) } } },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/projects/{id}/expenses/{expenseId}",
  tags: ["Projects"],
  summary: "Edita un gasto registrado o rechazado",
  description:
    `${WRITE_NOTE} Solo quien lo registró (403 para cualquiera más, incluidos los administradores). Solo en REGISTRADO o ` +
    "RECHAZADO; un gasto validado o anulado responde 409. Editar un RECHAZADO lo devuelve a REGISTRADO y limpia el rechazo. " +
    "Audita un registro EDITAR por campo cambiado; el número de identificación solo se audita enmascarado.",
  security: [{ sessionCookie: [] }],
  request: { params: ExpenseParams, body: { content: { "application/json": { schema: GASTO_PATCH_SCHEMA } } } },
  responses: {
    200: {
      description: "Gasto actualizado.",
      content: { "application/json": { schema: z.object({ gasto: GastoSchema, alertas: z.array(AlertaSchema) }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

const GestionNote =
  "Solo ADMINISTRADOR/GERENCIA, en cualquier estado del proyecto (404 -> 403 -> 404 del gasto). Ninguna ruta cambia el " +
  "estado del proyecto.";
const GastoResponse = z.object({ gasto: GastoSchema });

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/expenses/{expenseId}/validate",
  tags: ["Projects"],
  summary: "Valida un gasto registrado",
  description:
    `${GestionNote} Quien registró el gasto no puede validarlo (403; también lo impide una restricción de la base de datos). ` +
    "409 INVALID_STATE si no está REGISTRADO; 409 CONFLICT si el tercero no tiene tipo y número de identificación o si el gasto " +
    "no tiene ningún soporte vigente (los gastos importados desde Excel nacen sin soporte). Si el total validado " +
    "del rubro más este gasto superaría el valor asignado (estricto), se bloquea: responde 409 `OVERSPEND_BLOCKED`, el gasto " +
    "sigue REGISTRADO con `alerta_sobregasto` en true y se notifica una sola vez a cada usuario GERENCIA activo. Tras " +
    "aumentar el asignado, la misma llamada valida y limpia la bandera.",
  security: [{ sessionCookie: [] }],
  request: { params: ExpenseParams },
  responses: {
    200: { description: "Gasto validado.", content: { "application/json": { schema: GastoResponse } } },
    ...standardErrorResponses([401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/expenses/{expenseId}/reject",
  tags: ["Projects"],
  summary: "Rechaza un gasto registrado con motivo",
  description:
    `${GestionNote} El motivo es obligatorio (400). Quien registró el gasto no puede rechazarlo (403). Solo desde REGISTRADO ` +
    "(409). Quien lo registró puede corregirlo con PATCH y vuelve a REGISTRADO.",
  security: [{ sessionCookie: [] }],
  request: { params: ExpenseParams, body: { content: { "application/json": { schema: MOTIVO_GASTO_SCHEMA } } } },
  responses: {
    200: { description: "Gasto rechazado.", content: { "application/json": { schema: GastoResponse } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/expenses/{expenseId}/void",
  tags: ["Projects"],
  summary: "Anula un gasto validado con motivo",
  description:
    `${GestionNote} Solo desde VALIDADO (409). La fila se conserva con estado ANULADO y las columnas anulado_*; deja de ` +
    "contar en la ejecución (E) de la ficha financiera.",
  security: [{ sessionCookie: [] }],
  request: { params: ExpenseParams, body: { content: { "application/json": { schema: MOTIVO_GASTO_SCHEMA } } } },
  responses: {
    200: { description: "Gasto anulado.", content: { "application/json": { schema: GastoResponse } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/expense-validations",
  tags: ["Projects"],
  summary: "Cola de validación de gastos entre proyectos",
  description:
    "Solo ADMINISTRADOR/GERENCIA (403 para el resto). Más antiguos primero, sin proyectos eliminados. `estado` (por defecto " +
    "REGISTRADO) y `limit` (1..200, por defecto 50) se validan (400). `propio` marca los gastos que registró quien consulta. " +
    "Nunca devuelve el número de identificación del tercero.",
  security: [{ sessionCookie: [] }],
  request: {
    query: z.object({
      estado: EstadoGastoSchema.optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  },
  responses: {
    200: {
      description: "Gastos pendientes de validación.",
      content: {
        "application/json": {
          schema: z.object({
            gastos: z.array(
              z.object({
                id: z.string().uuid(),
                proyecto_id: z.string().uuid(),
                proyecto_codigo: z.string(),
                proyecto_nombre: z.string(),
                rubro: z.object({ id: z.string().uuid(), codigo: z.string().nullable(), nombre: z.string() }),
                fecha_documento: z.string(),
                periodo: z.string(),
                tercero_nombre: z.string(),
                tercero_tipo_id: z.enum(["NIT", "CC", "CE"]).nullable(),
                numero_documento: z.string(),
                descripcion: z.string(),
                valor: z.string(),
                estado: EstadoGastoSchema,
                alerta_sobregasto: z.boolean(),
                datos_incompletos: z.boolean(),
                sin_soporte: z.boolean().openapi({ description: "Sin soportes vivos (gasto importado): no se puede validar todavía." }),
                registrado_por_id: z.string(),
                registrado_por_nombre: z.string().nullable(),
                propio: z.boolean(),
                created_at: z.string(),
              }),
            ),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 403, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/expenses/{expenseId}/attachments/{attachmentId}/download",
  tags: ["Projects"],
  summary: "Descarga un soporte de gasto (URL firmada de 60 s o enlace)",
  description:
    "Solo quien puede ver soportes financieros (ADMINISTRADOR/GERENCIA o COORDINADOR integrante activo; la bandera gerencial " +
    "no lo otorga): 404 del proyecto -> 403 -> 404 del soporte. Cada emisión se registra en `acceso_soportes` (solo escritura) " +
    "después de firmar; si el registro falla responde 500 y no entrega la URL. Los enlaces externos también se registran.",
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), expenseId: z.string().uuid(), attachmentId: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "URL de descarga.",
      content: {
        "application/json": {
          schema: z.object({
            tipo: z.enum(["archivo", "enlace"]),
            url: z.string().nullable(),
            expires_in: z.number().int().nullable().openapi({ description: "Segundos de validez (60) para un archivo; nulo para un enlace." }),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// Expenses import from Excel and supports attached later (feature importar-gastos, B8)
// ---------------------------------------------------------------------------

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ExpensesImportErrorSchema = registry.register(
  "ErrorImportacionGastos",
  z.object({
    fila: z.number().int().nullable().openapi({ description: "Fila de Excel (base 1); nula si el error es del archivo." }),
    rubro: z.string().nullable().openapi({ description: "El rubro tal como está escrito en el archivo." }),
    mensaje: z.string(),
  }),
);

const ExpensesImportPreviewSchema = registry.register(
  "VistaPreviaImportacionGastos",
  z.object({
    importado: z.literal(false),
    resumen: z.object({
      total: z.number().int(),
      validas: z.number().int(),
      invalidas: z.number().int(),
      valor_validas: z.string().openapi({ description: "Suma de las filas válidas (decimal como string)." }),
    }),
    filas: z.array(
      z.object({
        fila: z.number().int().openapi({ description: "Fila de Excel (base 1)." }),
        rubro: z.string().nullable(),
        tercero: z.string().nullable(),
        numero_documento: z.string().nullable(),
        valor: z.string().nullable(),
        periodo: z.string().nullable(),
        valida: z.boolean(),
        mensaje: z.string().nullable().openapi({ description: "Motivo cuando la fila no es válida." }),
        alertas: z.array(AlertaSchema),
      }),
    ),
  }),
);

const ExpensesImportAppliedSchema = registry.register(
  "ImportacionGastosAplicada",
  z.object({
    importado: z.literal(true),
    creados: z.number().int(),
    lote_id: z.string().uuid().openapi({ description: "Lote de auditoría compartido por todos los gastos importados." }),
    valor_total: z.string(),
    gastos: z.array(z.object({ fila: z.number().int(), id: z.string().uuid() })),
    rechazadas: z.array(ExpensesImportErrorSchema),
    alertas: z.array(z.object({ fila: z.number().int(), alertas: z.array(AlertaSchema) })),
  }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/expenses/import",
  tags: ["Projects"],
  summary: "Importa gastos desde un Excel (una fila por gasto, sin soportes)",
  description:
    `${WRITE_NOTE} Multipart con el archivo en \`archivo\` (.xlsx, máximo 4 MB, máximo 200 filas con datos; no se almacena). ` +
    "Columnas: `Rubro`, `Fecha del documento`, `Tipo de soporte`, `Tercero`, `Tipo de identificación` (opcional), " +
    "`Número de identificación` (opcional), `Número de documento`, `Descripción`, `Valor (COP)` y `Periodo` (opcional, AAAA-MM). " +
    "Cada fila pasa por las mismas reglas que un gasto individual (rubro con valor asignado, valor positivo con máximo dos " +
    "decimales, periodo dentro del proyecto, límites de texto). El archivo no lleva soportes: los gastos se crean REGISTRADO " +
    "sin soportes y se adjuntan después (`POST /expenses/{expenseId}/attachments`); sin soporte no se pueden validar. Dos filas " +
    "con el mismo tercero y número de documento normalizados: la segunda es inválida. Con `modo=validar` devuelve cada fila como " +
    "válida o inválida con su motivo, más las alertas no bloqueantes, sin escribir. Aplicar crea solo las filas válidas en una " +
    "transacción, con un único `lote_id` de auditoría, y devuelve las rechazadas; no notifica. Errores del archivo completo " +
    "(no es Excel, faltan encabezados, sin filas, más de 200) y la ausencia de filas válidas al aplicar responden 400 con " +
    "`reporte`. Orden de errores: 404 -> 403 -> 409 -> 413 -> 400.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            archivo: z.string().openapi({ format: "binary", description: "Gastos .xlsx con las columnas de la plantilla." }),
            modo: z.literal("validar").optional().openapi({ description: "Solo valida y devuelve la vista previa; no escribe." }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Vista previa o importación aplicada.",
      content: { "application/json": { schema: z.union([ExpensesImportPreviewSchema, ExpensesImportAppliedSchema]) } },
    },
    400: {
      description: "Archivo ilegible, tipo no válido, errores del archivo o ninguna fila válida (VALIDATION_ERROR, con `reporte` cuando se leyó).",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            code: z.literal("VALIDATION_ERROR"),
            reporte: z.object({ errores: z.array(ExpensesImportErrorSchema) }).optional(),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 409, 413, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/expenses/template",
  tags: ["Projects"],
  summary: "Descarga la plantilla vacía de gastos",
  description:
    "Una hoja `Gastos` con los encabezados de la importación y una hoja `Rubros` con los rubros del proyecto que admiten gastos " +
    `(valor asignado mayor que cero). ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: {
      description: "Libro de Excel como adjunto `plantilla-gastos.xlsx`.",
      content: { [XLSX_MIME]: { schema: z.string().openapi({ format: "binary" }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/expenses/{expenseId}/attachments",
  tags: ["Projects"],
  summary: "Adjunta un soporte a un gasto existente",
  description:
    `${WRITE_NOTE} Solo quien registró el gasto (403 para otro), mientras esté REGISTRADO o RECHAZADO (409 INVALID_STATE si ` +
    "está VALIDADO o ANULADO). El cuerpo es un elemento de `soportes` de `POST /expenses`: archivo confirmado tras la firma en " +
    "`/expenses/sign` y la subida directa, o un enlace https. Máximo 5 soportes vigentes por gasto (400). Auditoría: una fila " +
    "`EDITAR` sobre el campo `soportes`.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ExpenseParams,
    body: { content: { "application/json": { schema: z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA]) } } },
  },
  responses: {
    201: { description: "Soporte adjuntado; devuelve el gasto con sus soportes.", content: { "application/json": { schema: GastoResponse } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});
