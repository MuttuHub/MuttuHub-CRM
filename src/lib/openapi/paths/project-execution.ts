// OpenAPI path registrations for the S4 technical execution of a project:
// avances of a deliverable (and, in later units, medios, measurements,
// beneficiaries and the technical status). Registered from the actual route.ts
// files — same status codes, same field names, same auth rules.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { AVANCE_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/route";
import { MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA, MEDIO_SIGN_SCHEMA } from "@/lib/api/soportes";
import { MEDICION_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/indicators/[indicatorId]/measurements/route";
import { BENEFICIARIOS_CREATE_SCHEMA } from "@/app/api/v1/projects/[id]/beneficiaries/route";
import { MOTIVO_ANULACION_SCHEMA } from "@/app/api/v1/projects/[id]/deliverables/[deliverableId]/progress/[progressId]/void/route";

const WRITE_NOTE =
  "Solo `ADMINISTRADOR`/`GERENCIA` o un `COORDINADOR` integrante activo del proyecto, y solo mientras el proyecto " +
  "está `EN_EJECUCION` (ninguna ruta lo pasa a ese estado en S4). Orden: 404 -> 403 -> 409 INVALID_STATE -> 400.";

const READ_NOTE =
  "Lee quien puede leer la ficha del proyecto (ADMINISTRADOR/GERENCIA o un COORDINADOR integrante activo); " +
  "un proyecto desconocido responde 404 antes del 403. Se puede leer en cualquier estado.";

const ProjectDeliverableParams = z.object({ id: z.string().uuid(), deliverableId: z.string().uuid() });

// Shared shape of a medio/soporte (file or link) attached to an avance or a medición — moved above
// AvanceSchema so the latter can reference it directly in its additive `soportes` field (AJ-06).
export const MedioSchema = registry.register(
  "MedioProyecto",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    avance_id: z.string().uuid().nullable(),
    nombre: z.string(),
    tipo: z.enum(["archivo", "enlace"]),
    url_externa: z.string().nullable().openapi({ description: "Solo para `tipo: enlace`; siempre https." }),
    tipo_mime: z.string().nullable(),
    tamano_bytes: z.number().int().nullable().openapi({ description: "Tamaño real leído de storage." }),
    subido_por_id: z.string().uuid(),
    created_at: z.string(),
  }),
);

export const AvanceSchema = registry.register(
  "Avance",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    entregable_id: z.string().uuid(),
    fecha: z.string().openapi({ example: "2026-10-06", description: "Fecha calendario; nunca posterior a hoy (Bogotá)." }),
    cantidad: z.string().openapi({ description: "Decimal(15,2) como string; siempre > 0.", example: "2" }),
    observacion: z.string().nullable(),
    justificacion_exceso: z.string().nullable(),
    registrado_por_id: z.string().uuid(),
    created_at: z.string(),
    anulado_at: z.string().nullable(),
    anulado_por_id: z.string().uuid().nullable(),
    motivo_anulacion: z.string().nullable(),
    medios: z.number().int().openapi({ description: "Medios vivos adjuntos al avance." }),
    cuenta: z.boolean().openapi({
      description:
        "true cuando el avance suma al entregable: no está anulado y, si el parámetro `avance_requiere_medio` lo exige, tiene al menos un medio vivo.",
    }),
    soportes: z.array(MedioSchema).openapi({
      description:
        "Medios vivos en detalle, del más antiguo al más reciente (AJ-06, S3: \"3 archivos y 1 enlace muestra los 4\").",
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/deliverables/{deliverableId}/progress",
  tags: ["Projects"],
  summary: "Lista los avances de un entregable",
  description: `Incluye los avances anulados (se listan, nunca se cuentan), del más antiguo al más reciente. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectDeliverableParams },
  responses: {
    200: {
      description: "Avances del entregable, su meta y el estado del proyecto.",
      content: {
        "application/json": {
          schema: z.object({ estado: z.string(), meta: z.string(), avances: z.array(AvanceSchema) }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/deliverables/{deliverableId}/progress",
  tags: ["Projects"],
  summary: "Registra un avance de un entregable",
  description:
    `${WRITE_NOTE} La fecha no puede ser posterior a hoy (400). La suma de avances no anulados no puede superar la ` +
    "meta sin `justificacion_exceso` (400); la verificación y el insert comparten una transacción con bloqueo de fila " +
    "sobre el entregable. Audita `CREAR avance` en la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectDeliverableParams,
    body: { content: { "application/json": { schema: AVANCE_CREATE_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Avance registrado.",
      content: { "application/json": { schema: z.object({ avance: AvanceSchema, cuenta: z.boolean() }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/deliverables/{deliverableId}/progress/{progressId}/void",
  tags: ["Projects"],
  summary: "Anula un avance (solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA`, en cualquier estado del proyecto. Exige `motivo` (1..500). La fila se conserva, " +
    "queda fuera de todo cálculo y se audita con `ANULAR`. Un avance ya anulado responde 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectDeliverableParams.extend({ progressId: z.string().uuid() }),
    body: { content: { "application/json": { schema: MOTIVO_ANULACION_SCHEMA } } },
  },
  responses: {
    200: { description: "Avance anulado.", content: { "application/json": { schema: z.object({ avance: AvanceSchema }) } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

// ---------------------------------------------------------------------------
// Medios de verificación of an avance (S4 U3). `MedioSchema` itself is
// registered above, next to `AvanceSchema`.
// ---------------------------------------------------------------------------

const AvanceMedioParams = z.object({ id: z.string().uuid(), progressId: z.string().uuid() });

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments",
  tags: ["Projects"],
  summary: "Lista los medios vivos de un avance",
  description: `Nunca expone la clave de storage: la descarga va por su ruta firmada. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: AvanceMedioParams },
  responses: {
    200: {
      description: "Medios vivos del avance.",
      content: { "application/json": { schema: z.object({ medios: z.array(MedioSchema) }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments/sign",
  tags: ["Projects"],
  summary: "Firma la subida directa de un archivo de soporte (ADR-13)",
  description:
    `${WRITE_NOTE} El avance no puede estar anulado (409). La política de archivo es la única de la app (PDF, DOCX, XLSX, ` +
    "PPTX, JPG/JPEG, PNG; 413 FILE_TOO_LARGE sobre el máximo). El servidor elige la clave " +
    "`proyectos/{id}/soportes/{uuid}_{nombre}`; el cliente nunca envía una. Después de subir, confirma con POST " +
    ".../attachments. Los objetos nunca se eliminan de storage.",
  security: [{ sessionCookie: [] }],
  request: {
    params: AvanceMedioParams,
    body: { content: { "application/json": { schema: MEDIO_SIGN_SCHEMA } } },
  },
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
  method: "post",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments",
  tags: ["Projects"],
  summary: "Adjunta un medio a un avance (archivo confirmado o enlace https)",
  description:
    `${WRITE_NOTE} Dos formas de cuerpo: confirmar un archivo ya subido (\`storage_path\`, \`nombre\`, \`tamano_bytes\`, ` +
    "`tipo_mime?`; la clave debe estar bajo `proyectos/{id}/soportes/`, el objeto debe existir y no superar lo " +
    "declarado ni el máximo de la app; se guarda el tamaño real) o enlazar una URL externa (`url_externa` https de " +
    "hasta 2000 caracteres, `nombre`). Un avance anulado responde 409; el mismo objeto no puede respaldar dos medios " +
    "(409). Con un medio vivo el avance `cuenta`.",
  security: [{ sessionCookie: [] }],
  request: {
    params: AvanceMedioParams,
    body: {
      content: {
        "application/json": { schema: z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA]) },
      },
    },
  },
  responses: {
    201: {
      description: "Medio adjunto.",
      content: { "application/json": { schema: z.object({ medio: MedioSchema, cuenta: z.boolean() }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/progress/{progressId}/attachments/{attachmentId}/download",
  tags: ["Projects"],
  summary: "Descarga de un medio (URL firmada de 60 s o enlace https)",
  description: READ_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: AvanceMedioParams.extend({ attachmentId: z.string().uuid() }) },
  responses: {
    200: {
      description: "URL de descarga.",
      content: {
        "application/json": {
          schema: z.object({
            tipo: z.enum(["archivo", "enlace"]),
            url: z.string(),
            expires_in: z.number().int().nullable().openapi({ description: "60 para un archivo; null para un enlace." }),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

// ---------------------------------------------------------------------------
// Measurements of an indicator and beneficiary records (S4 U4)
// ---------------------------------------------------------------------------

const VOID_FIELDS = {
  registrado_por_id: z.string().uuid(),
  created_at: z.string(),
  anulado_at: z.string().nullable(),
  anulado_por_id: z.string().uuid().nullable(),
  motivo_anulacion: z.string().nullable(),
};

export const MedicionSchema = registry.register(
  "MedicionIndicador",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    indicador_id: z.string().uuid(),
    fecha: z.string().openapi({ example: "2026-10-06", description: "Fecha calendario; nunca posterior a hoy (Bogotá)." }),
    valor: z.string().openapi({ description: "Decimal(15,2) como string; siempre >= 0.", example: "12" }),
    observacion: z.string().nullable(),
    ...VOID_FIELDS,
  }),
);

export const RegistroBeneficiarioSchema = registry.register(
  "RegistroBeneficiario",
  z.object({
    id: z.string().uuid(),
    proyecto_id: z.string().uuid(),
    actividad_id: z.string().uuid().nullable(),
    fecha: z.string(),
    cantidad: z.number().int().openapi({ description: "Entero > 0." }),
    observacion: z.string().nullable(),
    ...VOID_FIELDS,
  }),
);

const TendenciaSchema = z.enum(["sube", "baja", "igual"]).nullable().openapi({
  description: "Última medición viva frente a la anterior viva; null sin dos mediciones vivas.",
});

const IndicadorMedicionParams = z.object({ id: z.string().uuid(), indicatorId: z.string().uuid() });
const MEDICIONES_PATH = "/api/v1/projects/{id}/indicators/{indicatorId}/measurements";

registry.registerPath({
  method: "get",
  path: MEDICIONES_PATH,
  tags: ["Projects"],
  summary: "Lista las mediciones de un indicador",
  description:
    `Incluye las anuladas (se listan, nunca cuentan). \`ultima\` y \`tendencia\` salen solo de las vivas. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: IndicadorMedicionParams },
  responses: {
    200: {
      description: "Mediciones, última medición viva y tendencia.",
      content: {
        "application/json": {
          schema: z.object({
            estado: z.string(),
            indicador: z.object({
              id: z.string().uuid(),
              codigo: z.string(),
              nombre: z.string(),
              meta: z.string(),
              unidad: z.string(),
            }),
            // AJ-06 T3, S3: additive per medición (spread in the route handler, oldest first);
            // `ultima` is computed before that enrichment and never carries `soportes`.
            mediciones: z.array(MedicionSchema.extend({ soportes: z.array(MedioSchema) })),
            ultima: MedicionSchema.nullable(),
            tendencia: TendenciaSchema,
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: MEDICIONES_PATH,
  tags: ["Projects"],
  summary: "Registra una medición de un indicador",
  description:
    `${WRITE_NOTE} \`valor >= 0\`; la fecha no puede ser posterior a hoy (400). Audita \`CREAR medicion\` en la misma transacción.`,
  security: [{ sessionCookie: [] }],
  request: {
    params: IndicadorMedicionParams,
    body: { content: { "application/json": { schema: MEDICION_CREATE_SCHEMA } } },
  },
  responses: {
    201: {
      description: "Medición registrada.",
      content: {
        "application/json": {
          schema: z.object({ medicion: MedicionSchema, ultima: MedicionSchema.nullable(), tendencia: TendenciaSchema }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: `${MEDICIONES_PATH}/{measurementId}/void`,
  tags: ["Projects"],
  summary: "Anula una medición (solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA`, en cualquier estado del proyecto. Exige `motivo` (1..500). La fila se conserva, " +
    "queda fuera de `ultima`/`tendencia` y se audita con `ANULAR`. Ya anulada responde 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: {
    params: IndicadorMedicionParams.extend({ measurementId: z.string().uuid() }),
    body: { content: { "application/json": { schema: MOTIVO_ANULACION_SCHEMA } } },
  },
  responses: {
    200: { description: "Medición anulada.", content: { "application/json": { schema: z.object({ medicion: MedicionSchema }) } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

// ---------------------------------------------------------------------------
// Medios de verificación of a medición (S4 U4, AJ-06 T3). Mirrors
// progress/{progressId}/attachments exactly, scoped to `medicion_id` instead
// of `avance_id`; a medición has no semáforo/"cuenta" concept, so its POST
// response omits that field.
// ---------------------------------------------------------------------------

const MedicionMedioParams = IndicadorMedicionParams.extend({ measurementId: z.string().uuid() });
const MEDICION_ATTACHMENTS_PATH = `${MEDICIONES_PATH}/{measurementId}/attachments`;

registry.registerPath({
  method: "get",
  path: MEDICION_ATTACHMENTS_PATH,
  tags: ["Projects"],
  summary: "Lista los medios vivos de una medición",
  description: `Nunca expone la clave de storage: la descarga va por su ruta firmada. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: MedicionMedioParams },
  responses: {
    200: {
      description: "Medios vivos de la medición.",
      content: { "application/json": { schema: z.object({ medios: z.array(MedioSchema) }) } },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: `${MEDICION_ATTACHMENTS_PATH}/sign`,
  tags: ["Projects"],
  summary: "Firma la subida directa de un archivo de soporte de una medición (ADR-13)",
  description:
    `${WRITE_NOTE} La medición no puede estar anulada (409). La política de archivo es la única de la app (PDF, ` +
    "DOCX, XLSX, PPTX, JPG/JPEG, PNG; 413 FILE_TOO_LARGE sobre el máximo). El servidor elige la clave " +
    "`proyectos/{id}/soportes/{uuid}_{nombre}`; el cliente nunca envía una. Después de subir, confirma con POST " +
    ".../attachments. Los objetos nunca se eliminan de storage.",
  security: [{ sessionCookie: [] }],
  request: {
    params: MedicionMedioParams,
    body: { content: { "application/json": { schema: MEDIO_SIGN_SCHEMA } } },
  },
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
  method: "post",
  path: MEDICION_ATTACHMENTS_PATH,
  tags: ["Projects"],
  summary: "Adjunta un medio a una medición (archivo confirmado o enlace https)",
  description:
    `${WRITE_NOTE} Dos formas de cuerpo: confirmar un archivo ya subido (\`storage_path\`, \`nombre\`, \`tamano_bytes\`, ` +
    "`tipo_mime?`; la clave debe estar bajo `proyectos/{id}/soportes/`, el objeto debe existir y no superar lo " +
    "declarado ni el máximo de la app; se guarda el tamaño real) o enlazar una URL externa (`url_externa` https de " +
    "hasta 2000 caracteres, `nombre`). Una medición anulada responde 409; el mismo objeto no puede respaldar dos " +
    "medios (409). A diferencia de un avance, una medición no tiene concepto de semáforo/\"cuenta\": la respuesta " +
    "solo trae el medio creado.",
  security: [{ sessionCookie: [] }],
  request: {
    params: MedicionMedioParams,
    body: {
      content: {
        "application/json": { schema: z.union([MEDIO_ARCHIVO_SCHEMA, MEDIO_ENLACE_SCHEMA]) },
      },
    },
  },
  responses: {
    201: {
      description: "Medio adjunto.",
      content: { "application/json": { schema: z.object({ medio: MedioSchema }) } },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: `${MEDICION_ATTACHMENTS_PATH}/{attachmentId}/download`,
  tags: ["Projects"],
  summary: "Descarga de un medio de una medición (URL firmada de 60 s o enlace https)",
  description: READ_NOTE,
  security: [{ sessionCookie: [] }],
  request: { params: MedicionMedioParams.extend({ attachmentId: z.string().uuid() }) },
  responses: {
    200: {
      description: "URL de descarga.",
      content: {
        "application/json": {
          schema: z.object({
            tipo: z.enum(["archivo", "enlace"]),
            url: z.string(),
            expires_in: z.number().int().nullable().openapi({ description: "60 para un archivo; null para un enlace." }),
          }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

const ProjectIdParam = z.object({ id: z.string().uuid() });
const BENEFICIARIOS_PATH = "/api/v1/projects/{id}/beneficiaries";

registry.registerPath({
  method: "get",
  path: BENEFICIARIOS_PATH,
  tags: ["Projects"],
  summary: "Lista los registros de beneficiarios y su total vivo",
  description: `Incluye los anulados (se listan, no suman al \`total\`). ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: "Registros y total de beneficiarios no anulados.",
      content: {
        "application/json": {
          schema: z.object({ estado: z.string(), registros: z.array(RegistroBeneficiarioSchema), total: z.number().int() }),
        },
      },
    },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: BENEFICIARIOS_PATH,
  tags: ["Projects"],
  summary: "Registra una cantidad de beneficiarios",
  description:
    `${WRITE_NOTE} \`cantidad\` entero > 0; la fecha no puede ser posterior a hoy (400); \`actividad_id\` opcional debe ` +
    "ser una actividad viva del mismo proyecto (400). Audita `CREAR beneficiarios`.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectIdParam,
    body: { content: { "application/json": { schema: BENEFICIARIOS_CREATE_SCHEMA } } },
  },
  responses: {
    201: { description: "Registro creado.", content: { "application/json": { schema: z.object({ registro: RegistroBeneficiarioSchema }) } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: `${BENEFICIARIOS_PATH}/{beneficiaryId}/void`,
  tags: ["Projects"],
  summary: "Anula un registro de beneficiarios (solo ADM/GER)",
  description:
    "Solo `ADMINISTRADOR`/`GERENCIA`, en cualquier estado del proyecto. Exige `motivo` (1..500). La fila se conserva, " +
    "sale del total y se audita con `ANULAR`. Ya anulado responde 409 CONFLICT.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectIdParam.extend({ beneficiaryId: z.string().uuid() }),
    body: { content: { "application/json": { schema: MOTIVO_ANULACION_SCHEMA } } },
  },
  responses: {
    200: { description: "Registro anulado.", content: { "application/json": { schema: z.object({ registro: RegistroBeneficiarioSchema }) } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

// ---------------------------------------------------------------------------
// Technical status / semáforo técnico (S4 U5)
// ---------------------------------------------------------------------------

const EstadoActividadSchema = z.enum(["NO_INICIADA", "EN_CURSO", "FINALIZADA", "FINALIZADA_CON_RETRASO"]);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/technical-status",
  tags: ["Projects"],
  summary: "Semáforo técnico: avance real vs programado a una fecha de corte",
  description:
    `${READ_NOTE} Solo cuentan los avances no anulados con fecha hasta el corte y, mientras \`avance_requiere_medio\` ` +
    "sea true, con al menos un medio vivo. `avance_real`, `avance_programado` y `progreso` van en porcentaje 0..100 con " +
    "un decimal; `desviacion_pp` son puntos porcentuales; el `color` sale de la desviación sin redondear y de los " +
    "umbrales (`desviacion <= umbral1` verde, `<= umbral2` amarillo, si no rojo). Cada actividad trae además su " +
    "`programado` (% planeado al corte), `dias` (duración), `al_corte` (días transcurridos al corte), su propio " +
    "`color` y `sin_soporte`; `objetivos` es el acumulado por objetivo (planeado vs ejecutado y su color). " +
    "`umbrales.confirmado` es true solo " +
    "si ambos umbrales están confirmados. `base=original` usa las semanas, pesos y cantidades congeladas en la " +
    "versión 0 (409 mientras no exista; una base desconocida responde 400). Un proyecto sin " +
    "fechas responde 409; un `corte` mal formado responde 400.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectIdParam,
    query: z.object({
      corte: z.string().optional().openapi({
        description: "Fecha de corte AAAA-MM-DD; por defecto hoy en Bogotá.",
        example: "2026-10-25",
      }),
      base: z.enum(["vigente", "original"]).optional().openapi({ description: "Por defecto vigente; `original` usa la versión 0." }),
    }),
  },
  responses: {
    200: {
      description: "Estado técnico del proyecto al corte.",
      content: {
        "application/json": {
          schema: z.object({
            base: z.enum(["vigente", "original"]),
            corte: z.string(),
            estado: z.string().openapi({ description: "Estado del proyecto." }),
            avance_real: z.number(),
            avance_programado: z.number(),
            desviacion_pp: z.number().openapi({ description: "(programado - real) en puntos porcentuales; negativo si va adelantado." }),
            color: z.enum(["verde", "amarillo", "rojo"]),
            actividades: z.array(
              z.object({
                id: z.string().uuid(),
                codigo: z.string(),
                nombre: z.string(),
                objetivo_codigo: z.string().openapi({ description: "Código del objetivo al que pertenece la actividad." }),
                peso: z.number(),
                progreso: z.number(),
                programado: z.number().openapi({ description: "Porcentaje 0..100 planeado al corte (la columna «% plan»)." }),
                dias: z.number().int().openapi({ description: "Duración de la actividad en días calendario (la columna «Días»)." }),
                al_corte: z.number().int().openapi({ description: "Días transcurridos al corte, con tope en `dias` (la columna «Al corte»)." }),
                estado: EstadoActividadSchema,
                fecha_cumplimiento: z.string().nullable().openapi({
                  description: "Fecha en que el último entregable alcanzó su meta; null mientras haya alguno abierto.",
                }),
                color: z.enum(["verde", "amarillo", "rojo"]).openapi({
                  description: "Semáforo de la actividad al corte, calculado por el servidor.",
                }),
                sin_soporte: z.boolean().openapi({ description: "true cuando ningún avance de la actividad tiene un soporte vivo." }),
              }),
            ),
            objetivos: z.array(
              z.object({
                codigo: z.string(),
                programado: z.number().openapi({ description: "Media ponderada del % planeado de sus actividades." }),
                ejecutado: z.number().openapi({ description: "Media ponderada del % real de sus actividades." }),
                desviacion_pp: z.number().openapi({ description: "(programado - ejecutado) en puntos porcentuales." }),
                color: z.enum(["verde", "amarillo", "rojo"]),
              }),
            ),
            umbrales: z.object({ umbral1: z.number(), umbral2: z.number(), confirmado: z.boolean() }),
          }),
        },
      },
    },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});
