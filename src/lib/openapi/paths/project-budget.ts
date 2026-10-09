// OpenAPI path registrations for the S5 budget and monthly programming of a
// project (RF-18, RF-19). Registered from the actual route.ts files — same status
// codes, same field names, same auth rules. No route here changes the project estado.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { BUDGET_PUT_SCHEMA } from "@/app/api/v1/projects/[id]/budget/route";
import { PROGRAMMING_PUT_SCHEMA } from "@/app/api/v1/projects/[id]/programming/route";

const ProjectParams = z.object({ id: z.string().uuid() });

const READ_NOTE =
  "Lee quien puede leer la ficha del proyecto (ADMINISTRADOR/GERENCIA, COORDINADOR integrante activo o el visualizador " +
  "con la bandera); un proyecto desconocido responde 404 antes del 403. Se puede leer en cualquier estado.";

const WRITE_NOTE =
  "Solo `ADMINISTRADOR`/`GERENCIA` y solo mientras el proyecto está en `BORRADOR` (404 -> 403 -> 409 INVALID_STATE -> 400); " +
  "el estado se vuelve a comprobar bajo bloqueo de fila dentro de la transacción. Ninguna ruta cambia el estado del proyecto.";

export const BudgetViewSchema = registry.register(
  "PresupuestoProyecto",
  z.object({
    estado: z.string(),
    rubros: z.array(
      z.object({
        rubro_id: z.string().uuid(),
        codigo: z.string().nullable().openapi({ description: "Nulo en rubros heredados sin código." }),
        nombre: z.string(),
        activo: z.boolean(),
        linea_id: z.string().uuid().nullable().openapi({ description: "Nulo mientras el rubro no tiene línea (fila virtual en $0)." }),
        asignado: z.string().openapi({ example: "59500000.00", description: "Decimal(15,2) como string." }),
        heredado_pendiente: z.boolean().openapi({ description: "Rubro suspendido con monto pendiente de reasignación." }),
      }),
    ),
    suma: z.string().openapi({ description: "Σ A de todas las líneas." }),
    valor_total: z.string().nullable(),
    diferencia: z.string().nullable().openapi({ description: "Σ A − valor_total; nulo sin valor_total." }),
  }),
);

export const ProgrammingViewSchema = registry.register(
  "ProgramacionProyecto",
  z.object({
    estado: z.string(),
    periodos: z.array(z.string()).openapi({ example: ["2026-10", "2026-11"] }),
    filas: z.array(z.object({ rubro_id: z.string().uuid(), periodo: z.string(), valor: z.string() })),
    control_por_rubro: z.array(
      z.object({
        rubro_id: z.string().uuid(),
        codigo: z.string().nullable(),
        nombre: z.string(),
        asignado: z.string(),
        programado: z.string(),
        control: z.string().openapi({ description: "Σ celdas − A; informativo en Borrador." }),
      }),
    ),
    programacion_pendiente: z.boolean().openapi({ description: "Derivado: ninguna celda por encima de $0." }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/budget",
  tags: ["Projects"],
  summary: "Presupuesto por rubro de un proyecto",
  description:
    `Lista todos los rubros activos (fila virtual en $0 si aún no hay línea) y los rubros suspendidos que conservan una línea. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: { description: "Presupuesto del proyecto.", content: { "application/json": { schema: BudgetViewSchema } } },
    ...standardErrorResponses([401, 403, 404, 500]),
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/projects/{id}/budget",
  tags: ["Projects"],
  summary: "Reemplaza el presupuesto de un proyecto en Borrador",
  description:
    `${WRITE_NOTE} El cuerpo debe incluir todos los rubros activos exactamente una vez; los montos son string decimal o número ` +
    "con máximo dos decimales, no negativos. No rechaza una suma distinta de `valor_total` (la línea base lo exige después) y no " +
    "sobrescribe `valor_total`, salvo que sea nulo: entonces toma la suma. Las líneas se crean solo con montos > $0 y no se eliminan. " +
    "Audita un registro por línea cambiada en la misma transacción.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams, body: { content: { "application/json": { schema: BUDGET_PUT_SCHEMA } } } },
  responses: {
    200: { description: "Presupuesto guardado.", content: { "application/json": { schema: BudgetViewSchema } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/programming",
  tags: ["Projects"],
  summary: "Programación mensual de un proyecto",
  description:
    `Requiere fecha de inicio y fin (409 INVALID_STATE si falta alguna). Devuelve los periodos, las celdas y el control por rubro. ${READ_NOTE}`,
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: { description: "Programación del proyecto.", content: { "application/json": { schema: ProgrammingViewSchema } } },
    ...standardErrorResponses([401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/projects/{id}/programming",
  tags: ["Projects"],
  summary: "Reemplaza la programación mensual de un proyecto en Borrador",
  description:
    `${WRITE_NOTE} Reemplazo completo escrito por diferencia: las celdas > $0 se crean o actualizan; las que pasan a $0 o se omiten ` +
    "se eliminan. Cada rubro necesita una línea de presupuesto y cada periodo debe estar dentro del rango del proyecto (400). El control " +
    "por rubro es informativo en Borrador. Audita cada celda cambiada (`programacion`, `campo` = periodo).",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams, body: { content: { "application/json": { schema: PROGRAMMING_PUT_SCHEMA } } } },
  responses: {
    200: { description: "Programación guardada.", content: { "application/json": { schema: ProgrammingViewSchema } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

const FichaRowSchema = z.object({
  rubro_id: z.string().uuid().nullable().openapi({ description: "Nulo en la fila de total." }),
  codigo: z.string().nullable(),
  nombre: z.string(),
  asignado: z.string().openapi({ description: "A, Decimal(15,2) como string." }),
  programado: z.string().openapi({ description: "P acumulado hasta el corte." }),
  ejecutado: z.string().openapi({ description: "E acumulado de gastos validados hasta el corte; 0.00 sin fuente de gastos." }),
  diferencia: z.string().openapi({ description: "D = E − P." }),
  ep_decimas: z.number().int().nullable().openapi({ description: "E/P en décimas de punto porcentual (908 = 90,8 %); nulo si P = 0 o sin gastos." }),
  ea_decimas: z.number().int().nullable().openapi({ description: "E/A en décimas de punto porcentual; nulo si A = 0 o sin gastos." }),
  umbral_rojo: z.string().openapi({ description: "P × (1 + tolerancia): frontera amarillo/rojo." }),
  color: z.enum(["verde", "amarillo", "rojo"]).nullable().openapi({ description: "Nulo mientras `ejecucion_disponible` es false." }),
});

export const FinancialSheetSchema = registry.register(
  "FichaFinanciera",
  z.object({
    base: z.enum(["vigente", "original"]),
    corte: z.string().openapi({ example: "2026-11" }),
    estado: z.string(),
    ejecucion_disponible: z.boolean().openapi({ description: "False hasta que existan gastos (S6): E es 0 y no hay colores ni alerta." }),
    rubros: z.array(FichaRowSchema),
    total: FichaRowSchema,
    alerta_retraso: z.boolean().openapi({ description: "Sobre la fila de total: E/P bajo el umbral de retraso y semáforo técnico no verde." }),
    parametros: z.object({
      tolerancia: z.number(),
      retraso: z.number(),
      confirmado: z.boolean().openapi({ description: "True solo si tolerancia y retraso están confirmados." }),
    }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/financial-sheet",
  tags: ["Projects"],
  summary: "Ficha financiera: asignado, programado y ejecutado por rubro a un corte mensual",
  description:
    `${READ_NOTE} Solo agregados: no incluye gastos individuales ni soportes. El corte es \`AAAA-MM\` dentro de los periodos ` +
    "del proyecto (por defecto el mes actual en Bogotá, acotado al rango; 400 si es inválido o queda fuera). `base=original` " +
    "calcula A y P desde la versión 0 congelada (con E vigente y los periodos de sus fechas) y responde 409 mientras " +
    "no exista; una base desconocida responde 400. Sin fechas de proyecto responde 409. El color financiero sale de " +
    "`E > A` rojo, `E <= P` verde, tolerancia amarillo, si no rojo; la fila de total aplica las mismas fórmulas a las sumas.",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    query: z.object({
      corte: z.string().optional().openapi({ description: "Periodo AAAA-MM.", example: "2026-11" }),
      base: z.enum(["vigente", "original"]).optional().openapi({ description: "Por defecto vigente; `original` usa la versión 0." }),
    }),
  },
  responses: {
    200: { description: "Ficha financiera al corte.", content: { "application/json": { schema: FinancialSheetSchema } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});
