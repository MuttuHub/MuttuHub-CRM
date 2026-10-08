// OpenAPI path registrations for the S6 expenses of a project (RF-20, RF-21, RNF-03, RNF-04).
// Registered from the real schemas (`lib/api/gastos.ts`, `lib/api/soportes.ts`): same status codes,
// same field names, same auth rules. No route here changes the project estado.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { GASTO_CREATE_SCHEMA, GASTO_PATCH_SCHEMA } from "@/lib/api/gastos";
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
      content: { "application/json": { schema: z.object({ gastos: z.array(GastoSchema), totales: TotalesSchema }) } },
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
