// OpenAPI path registrations for the S5 budget and monthly programming of a
// project (RF-18, RF-19). Registered from the actual route.ts files — same status
// codes, same field names, same auth rules. No route here changes the project estado.

import { z } from "zod";
import { registry, standardErrorResponses } from "@/lib/openapi/registry";
import { BUDGET_PUT_SCHEMA } from "@/app/api/v1/projects/[id]/budget/route";
import { PROGRAMMING_PUT_SCHEMA } from "@/app/api/v1/projects/[id]/programming/route";
import { PROGRAMMING_MOVE_SCHEMA } from "@/app/api/v1/projects/[id]/programming/move/route";

const ProjectParams = z.object({ id: z.string().uuid() });

const READ_NOTE =
  "Lee quien puede leer la ficha del proyecto (ADMINISTRADOR/GERENCIA, COORDINADOR o COLABORADOR integrante activo, o el " +
  "visualizador con la bandera); un proyecto desconocido responde 404 antes del 403. Se puede leer en cualquier estado.";

const WRITE_NOTE =
  "`ADMINISTRADOR`/`GERENCIA` en cualquier proyecto, y `COORDINADOR`/`COLABORADOR` solo como integrantes activos (S5), " +
  "siempre mientras el proyecto está en `BORRADOR` (404 -> 403 -> 409 INVALID_STATE -> 400); " +
  "el estado se vuelve a comprobar bajo bloqueo de fila dentro de la transacción. Ninguna ruta cambia el estado del proyecto.";

const BudgetViewSchema = registry.register(
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
    ).openapi({ description: "Por rubro: el asignado es la suma de sus líneas (S2). `linea_id` es nulo con 0 o con varias líneas." }),
    lineas: z.array(
      z.object({
        linea_id: z.string().uuid(),
        actividad_id: z.string().uuid().nullable().openapi({ description: "Nulo en una línea heredada, cargada antes de la Parte 2." }),
        actividad_codigo: z.string().nullable(),
        actividad_nombre: z.string().nullable(),
        rubro_id: z.string().uuid(),
        rubro_codigo: z.string().nullable(),
        rubro_nombre: z.string(),
        valor: z.string().openapi({ example: "15000000.00" }),
      }),
    ).openapi({ description: "Una línea por actividad + rubro (S1), por código de actividad; las heredadas al final." }),
    suma: z.string().openapi({ description: "Σ A de todas las líneas." }),
    valor_total: z.string().nullable().openapi({ description: "Suma de las líneas (S2): no se digita." }),
    diferencia: z.string().nullable().openapi({ description: "Σ A − valor_total; nulo sin valor_total." }),
  }),
);

const ControlProgramacion = z.object({
  rubro_id: z.string().uuid(),
  codigo: z.string().nullable(),
  nombre: z.string(),
  asignado: z.string(),
  programado: z.string(),
  control: z.string().openapi({ description: "Σ celdas − A; informativo en Borrador." }),
});

const ProgrammingViewSchema = registry.register(
  "ProgramacionProyecto",
  z.object({
    estado: z.string(),
    periodos: z.array(z.string()).openapi({ example: ["2026-10", "2026-11"] }),
    filas: z.array(
      z.object({ linea_id: z.string().uuid(), rubro_id: z.string().uuid(), periodo: z.string(), valor: z.string() }),
    ),
    control_por_linea: z
      .array(
        ControlProgramacion.extend({
          linea_id: z.string().uuid(),
          actividad: z
            .object({ id: z.string().uuid(), codigo: z.string(), nombre: z.string() })
            .nullable()
            .openapi({ description: "Nula en una línea anterior a las actividades (Sin actividad)." }),
        }),
      )
      .openapi({ description: "Una fila por línea del presupuesto (actividad + rubro): lo que se programa." }),
    control_por_rubro: z.array(ControlProgramacion).openapi({ description: "Las líneas de cada rubro sumadas." }),
    programacion_pendiente: z.boolean().openapi({ description: "Derivado: ninguna celda por encima de $0." }),
    programacion_confirmada: z
      .object({ at: z.string().datetime(), por_id: z.string().uuid().nullable() })
      .nullable()
      .openapi({
        description:
          "T13: cuándo y quién confirmó la programación. Nula hasta que el Gestor la confirma, y otra vez nula después de " +
          "cualquier cambio del presupuesto o de la programación. La línea base la exige.",
      }),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/projects/{id}/budget",
  tags: ["Projects"],
  summary: "Presupuesto de un proyecto, por línea y por rubro",
  description:
    "Lista cada línea (actividad + rubro + valor) y, por rubro, la suma de sus líneas: todos los rubros activos (en $0 si no " +
    `tienen línea) y los suspendidos que conservan alguna. ${READ_NOTE}`,
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
    `${WRITE_NOTE} El cuerpo es el presupuesto COMPLETO, una entrada por actividad + rubro; la misma combinación no puede ` +
    "repetirse. Una línea nueva necesita una actividad viva del proyecto y un rubro activo; una línea existente (también una " +
    "heredada sin actividad) se puede conservar o cambiar. Una línea que no viaja se elimina con su programación, salvo que " +
    "tenga gastos (400). Los montos son string decimal o número con máximo dos decimales, no negativos; una línea nueva en $0 " +
    "no se crea. `valor_total` queda siempre en la suma de las líneas (S2) y la diferencia con la oportunidad se recalcula. " +
    "Audita un registro por línea creada, cambiada o eliminada en la misma transacción.",
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
    `Requiere fecha de inicio y fin (409 INVALID_STATE si falta alguna). Devuelve los periodos, las celdas (cada una con su línea) y el control por línea y por rubro. ${READ_NOTE}`,
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
    "se eliminan. Cada fila nombra una línea del presupuesto del proyecto (`linea_id`) y cada periodo debe estar dentro del rango " +
    "del proyecto (400). El control por línea es informativo en Borrador. Audita cada celda cambiada (`programacion`, `campo` = periodo).",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams, body: { content: { "application/json": { schema: PROGRAMMING_PUT_SCHEMA } } } },
  responses: {
    200: { description: "Programación guardada.", content: { "application/json": { schema: ProgrammingViewSchema } } },
    ...standardErrorResponses([400, 401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/programming/confirm",
  tags: ["Projects"],
  summary: "Confirma la programación de un proyecto en Borrador",
  description:
    `${WRITE_NOTE} El Gestor confirma cuando «Falta por programar» queda en $0 en todas las líneas; después el Gerente aprueba la ` +
    "línea base, que exige la confirmación (precondición `PROGRAMACION_SIN_CONFIRMAR`). 409 CONFLICT con `pendientes` " +
    "(línea y control) si alguna línea no está programada completa. Registra cuándo y quién, y audita `programacion_confirmada_at`. " +
    "Cualquier cambio posterior del presupuesto o de la programación quita la confirmación.",
  security: [{ sessionCookie: [] }],
  request: { params: ProjectParams },
  responses: {
    200: { description: "Programación confirmada.", content: { "application/json": { schema: ProgrammingViewSchema } } },
    ...standardErrorResponses([401, 403, 404, 409, 500]),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/projects/{id}/programming/move",
  tags: ["Projects"],
  summary: "Mueve un valor entre meses de una misma línea de un proyecto en ejecución",
  description:
    "T13 (S4): el Gestor (quien puede editar los datos del proyecto) mueve un valor entre meses de UNA línea sin aprobación; " +
    "el total de la línea no cambia, así que no hace falta un traslado. Solo del mes en curso hacia meses futuros o entre meses " +
    "futuros: los meses cerrados no se modifican, para no cambiar los semáforos pasados. Escribe la programación vigente (la " +
    "línea base no cambia) y registra en auditoría una fila `programacion` (campo `mover`) con la línea, los meses de origen y " +
    "destino con sus valores antes y después, el valor, el usuario y la fecha. 400 VALIDATION_ERROR: mismo mes, mes cerrado, " +
    "el mes en curso como destino, " +
    "mes fuera del proyecto, valor mayor que lo programado en el origen o línea de otro proyecto. 409 INVALID_STATE fuera de " +
    "En ejecución (en Borrador se usa el PUT de la programación).",
  security: [{ sessionCookie: [] }],
  request: {
    params: ProjectParams,
    body: { content: { "application/json": { schema: PROGRAMMING_MOVE_SCHEMA } } },
  },
  responses: {
    200: { description: "Valor movido; la programación actualizada.", content: { "application/json": { schema: ProgrammingViewSchema } } },
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

// S10 (EV-06): una fila por actividad de la vista «Por actividad», con las mismas cifras que `rubros`
// pasadas por la misma `computeFicha`, más el saldo y los datos de agrupación de la pantalla.
const FichaActividadRowSchema = z.object({
  actividad_id: z.string().uuid().nullable().openapi({ description: "Nulo en la fila «Sin actividad» (líneas cargadas antes de la Parte 2, D4)." }),
  codigo: z.string().nullable().openapi({ description: "Nulo en la fila «Sin actividad»." }),
  nombre: z.string().openapi({ example: "Sin actividad" }),
  objetivo_id: z.string().uuid().nullable().openapi({ description: "Nulo en «Gestión del proyecto»: una actividad transversal no lleva objetivo (S6)." }),
  objetivo_codigo: z.string().nullable(),
  gestion: z.boolean().openapi({ description: "True en «Gestión del proyecto»: actividad TRANSVERSAL o fila «Sin actividad»." }),
  asignado: z.string().openapi({ description: "A: la suma de las líneas de la actividad, Decimal(15,2) como string." }),
  programado: z.string().openapi({ description: "P de esas líneas acumulado hasta el corte." }),
  ejecutado: z.string().openapi({ description: "E de esas líneas hasta el corte: las mismas filas de gastos que la vista por rubro." }),
  diferencia: z.string().openapi({ description: "D = E − P." }),
  ep_decimas: z.number().int().nullable().openapi({ description: "E/P en décimas de punto porcentual; nulo si P = 0 o sin gastos." }),
  ea_decimas: z.number().int().nullable().openapi({ description: "E/A en décimas de punto porcentual; nulo si A = 0 o sin gastos." }),
  umbral_rojo: z.string().openapi({ description: "P × (1 + tolerancia): la misma frontera amarillo/rojo que la vista por rubro." }),
  color: z.enum(["verde", "amarillo", "rojo"]).nullable().openapi({ description: "Nulo mientras `ejecucion_disponible` es false." }),
  saldo: z.string().openapi({
    description:
      "A − E. Mientras los gastos están abiertos es el saldo de la actividad y no se llama ahorro, porque pueden faltar facturas (S11).",
  }),
  cerrada: z.boolean().openapi({
    description: "S11: el Gestor cerró los gastos de la actividad. Con la actividad cerrada no entran gastos nuevos.",
  }),
  cerrada_at: z.string().nullable().openapi({ description: "Instante del cierre (ISO); nulo mientras los gastos están abiertos." }),
  nota_cierre: z.string().nullable().openapi({
    description: "S11: la nota obligatoria que explica la diferencia; nula mientras los gastos están abiertos.",
  }),
  ahorro: z.string().nullable().openapi({
    description:
      "S11: max(A − E, 0) cuando los gastos están cerrados; nulo mientras están abiertos, para no llamar ahorro a un saldo.",
  }),
  sobreejecucion: z.string().nullable().openapi({
    description: "S11: max(E − A, 0) cuando los gastos están cerrados y se gastó de más; nulo mientras están abiertos.",
  }),
  rubros: z.array(FichaRowSchema).openapi({
    description: "S10: el detalle por rubro de la actividad, con la misma forma que `rubros` del nivel superior; sus sumas son la fila de la actividad.",
  }),
});

const FinancialSheetSchema = registry.register(
  "FichaFinanciera",
  z.object({
    base: z.enum(["vigente", "original"]),
    corte: z.string().openapi({ example: "2026-11" }),
    estado: z.string(),
    ejecucion_disponible: z.boolean().openapi({ description: "False hasta que existan gastos (S6): E es 0 y no hay colores ni alerta." }),
    rubros: z.array(FichaRowSchema),
    total: FichaRowSchema,
    actividades: z.array(FichaActividadRowSchema).openapi({
      description:
        "S10: una fila por actividad (y una «Sin actividad») para el selector «Por actividad / Por rubro». " +
        "El ejecutado total es el mismo que el de `total` porque ambas vistas suman las mismas filas de gastos.",
    }),
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
    "`E > A` rojo, `E <= P` verde, tolerancia amarillo, si no rojo; la fila de total aplica las mismas fórmulas a las sumas. " +
    "S10: `actividades` da las mismas cifras agrupadas por la actividad de cada línea, en el orden de los objetivos y " +
    "después «Gestión del proyecto» (actividades transversales, sin objetivo, y la fila «Sin actividad» de las líneas sin " +
    "actividad, D4); las dos vistas suman las mismas filas de gastos, así que el ejecutado total es idéntico. La vista por " +
    "actividad lee siempre el presupuesto vigente: `base` sólo cambia `rubros` y `total`." +
    " S11: cada fila de `actividades` lleva además el cierre de la actividad (`cerrada`, `cerrada_at`, `nota_cierre`); " +
    "con los gastos cerrados publica `ahorro` = max(A − E, 0) o `sobreejecucion` = max(E − A, 0), y mientras están " +
    "abiertos los deja nulos y el saldo sigue siendo A − E. Nada de eso se guarda: se lee de la actividad y del ejecutado.",
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
