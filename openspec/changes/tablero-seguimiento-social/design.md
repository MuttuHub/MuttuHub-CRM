# Design: tablero-seguimiento-social — Tablero de Seguimiento y Gestión de Proyectos de Impacto Social

## Technical Approach

Módulo nuevo y **enteramente aditivo**. Ningún modelo existente cambia de forma salvo una columna
booleana con default en `usuarios`. El agregado nuevo es `Proyecto`, colgado de `Cliente` (FK requerida,
misma forma que `Oportunidad`) con un vínculo opcional y único hacia la `Oportunidad` que lo originó.

Se reutiliza, sin inventar mecanismos nuevos, todo lo que el repositorio ya tiene probado:

1. **Invariantes de pertenencia en la base de datos** — `@@unique([id, padre_id])` + relación compuesta de
   Prisma + `CHECK` escrito a mano en la migración, exactamente el patrón `Tarea ↔ Oportunidad` de
   `oportunidades-comerciales` (D1/D2 de ese change).
2. **Permisos como predicados puros componibles** en `src/lib/permissions.ts`, con la forma literal de
   `hasCommercialAccess` / `canManageOpportunity`. Sin middleware genérico.
3. **Parámetros configurables sobre la tabla `Setting` existente** (`getSetting` + default de fábrica en
   `catalogs.ts`) para los umbrales de semáforo — así D10 deja de bloquear la implementación.
4. **Gráficos SVG propios**, con las constantes de viewBox y el estilo de `sparkline.tsx` / `BarRow`.
5. **`logAudit`** con las uniones `AuditEntidad` ampliadas, mismo precedente que `"oportunidad"`.

El endpoint de conversión comercial (`.../convert/route.ts`) **no se toca** (D1-bis). La creación del
proyecto desde una oportunidad adjudicada es una ruta hermana, nueva y con su propia suite.

## Architecture Decisions

| # | Decisión | Alternativas rechazadas | Racional |
|---|---|---|---|
| T1 | `Proyecto.oportunidad_id String? @unique` + **relación compuesta** `@relation(fields: [oportunidad_id, cliente_id], references: [id, cliente_id])` sobre el `@@unique([id, cliente_id])` que `Oportunidad` **ya tiene** | FK de una sola columna; validar la coherencia de cliente solo en la API | Aprovecha un índice que ya existe en `main` (no hay que crearlo). Hace imposible a nivel de base de datos que un proyecto apunte a una oportunidad de otro cliente. **`Proyecto.cliente_id` es NOT NULL**, así que el hueco de `MATCH SIMPLE` que obligó al `CHECK` en `tareas` no existe aquí — misma asimetría ya documentada para `BitacoraEntrada`. |
| T2 | La acción "crear proyecto desde oportunidad ganada" es **`POST /api/v1/clients/:id/opportunities/:opportunityId/project`**, archivo nuevo, hermano estructural de `convert/route.ts` | `POST /api/v1/projects` aceptando `oportunidad_id` en el body; auto-creación dentro de `convert` | D1/D1-bis. Una sola ruta escribe `oportunidad_id`: un solo lugar que auditar, un solo 409 de idempotencia, una sola suite. `POST /api/v1/projects` (proyecto sin origen comercial) **no acepta `oportunidad_id`** en su schema zod. El endpoint de conversión queda con diff cero. |
| T3 | `monto_ejecutado_cop` es **derivado** (`SUM(gastos.monto_cop)`), nunca una columna contador | Columna denormalizada actualizada en cada alta de gasto | RF-06 exige que el soporte cuelgue del **gasto**, así que la fila `Gasto` existe de todos modos. Un contador paralelo se desincroniza en el primer borrado lógico o rollback de transacción, y el semáforo financiero mentiría sin fallar. El spec pide "mantener y exponer siempre proyectado y ejecutado juntos": el DTO lo hace, el almacenamiento tiene una sola fuente de verdad. |
| T4 | `Rubro` tabla catálogo; `LineaPresupuestal` con `@@unique([proyecto_id, rubro_id])` | Varias líneas por rubro y proyecto | D5. Una línea por rubro hace que "proyectado por rubro" sea una lectura, no una agregación con riesgo de doble conteo. El detalle fino vive en `Gasto`, que es donde el negocio lo necesita. |
| T5 | Umbrales de semáforo en la tabla **`Setting`** (`key = "semaforo_umbrales"`, JSON) + `Proyecto.umbrales_override Json?`; comparación en `src/lib/semaforo.ts`, puro, sin DB ni framework | Tabla nueva `ParametroSemaforo`; constantes en código; columnas sueltas en `Proyecto` | D10. `settings.ts` + `getSetting(key, fallback)` es el mecanismo que este repositorio ya usa para catálogos administrables (`task_tags`, `doc_categories`), con admin gateado por `requireApiRole(["ADMINISTRADOR"])` — cero infraestructura nueva. El default de fábrica vive en `catalogs.ts`, igual que `DOC_CATEGORIES`: **no es el valor que lee la comparación**, es el valor inicial de la fila. |
| T6 | El payload de umbrales lleva **`confirmado: boolean`** (`false` por defecto) y la UI pinta un aviso "umbrales pendientes de confirmación del negocio" mientras siga en `false` | Guardar solo los números | D10 dice que los cortes son una asunción sin firmar. Si la asunción es invisible en el producto, se vuelve verdad por omisión. Este flag la mantiene visible hasta que alguien la firme, y cambiarla es un dato, no un despliegue. |
| T7 | La **curva S planificada** se deriva del cronograma: `proyectado_total × (Σ peso de actividades con fecha_planificada ≤ mes / Σ peso)` | Reparto lineal entre `fecha_inicio` y `fecha_fin`; nueva tabla de fases presupuestales mensuales | El cronograma **ya** tiene la distribución temporal y los pesos. Un reparto lineal inventa una curva que nadie planificó; una tabla de fases mensuales es un módulo entero que el documento no pide. |
| T8 | `Actividad` y `Gasto` llevan `@@unique([id, proyecto_id])` para que `SoporteProyecto` cuelgue por FK compuesta | `SoporteProyecto` polimórfico con `entidad`/`entidad_id` sin FK | Un soporte no puede apuntar a una actividad de otro proyecto. Aquí `proyecto_id` es NOT NULL y `actividad_id`/`gasto_id` nullable: `MATCH SIMPLE` **salta** la FK cuando el opcional es NULL, que es justo el caso legítimo "soporte a nivel de proyecto". No hay hueco que tapar. |
| T9 | `canManageProject` **extiende** el piso del spec con un eje `responsable_id` del proyecto | Solo `canManageAny` | **Extensión declarada, no silenciosa** (el spec la autoriza explícitamente). Sin ella el rol "Gestor de Proyecto / Ejecutor" del documento de origen —un COLABORADOR que registra cronograma, metas y presupuesto de *su* proyecto— es inimplementable. Es el espejo exacto de `canEditClient`. |
| T10 | Helpers de acceso en **`src/lib/api/projects.ts`** nuevo, no dentro de `crm.ts` | Ampliar `crm.ts` | `crm.ts` es el agregado CRM (cliente/tarea/oportunidad) y ya pasa de 450 líneas. `projects.ts` copia su forma literal (`{ ok, code }`, `NOT_FOUND`/`FORBIDDEN`). Desviación menor respecto de "Affected Areas" de la propuesta, declarada aquí. |

## Data Model

```prisma
enum LineaEstrategica {
  EMPLEABILIDAD
  EMPRENDIMIENTO
  PRODUCTIVIDAD
  CULTURAL
  SOCIAL
  CIVICO_POLITICO
  METODO_MUTTU
  AMBIENTAL
}

enum EstadoProyecto {
  PLANIFICACION
  EN_EJECUCION
  SUSPENDIDO
  CERRADO
  CANCELADO
}

enum TipoSoporte {
  VERIFICACION // RF-04: medio de verificación de un entregable
  LEGALIZACION // RF-06: factura, cuenta de cobro, planilla
}

model Proyecto {
  id                 String           @id @default(uuid())
  codigo             String           @unique // RF-01: código de proyecto
  nombre             String
  cliente_id         String
  // D1: vínculo opcional y único con la oportunidad que originó el proyecto.
  // NO se escribe desde convert/route.ts — solo desde la acción dedicada
  // (T2). @unique impide dos proyectos sobre la misma oportunidad.
  oportunidad_id     String?          @unique
  territorio         String
  linea_estrategica  LineaEstrategica
  fecha_inicio       DateTime
  fecha_fin          DateTime
  estado             EstadoProyecto   @default(PLANIFICACION)
  // D6: contador, no registro nominal de personas (habeas data). Los
  // atendidos se derivan de Indicador.cuenta_beneficiarios.
  beneficiarios_meta Int              @default(0)
  responsable_id     String
  // D10/T5: override opcional de los umbrales de semáforo para este proyecto.
  // null = usa el default de organización de la tabla `settings`. Nunca se
  // comparan constantes de código.
  umbrales_override  Json?
  created_at         DateTime         @default(now())
  updated_at         DateTime         @updatedAt
  deleted_at         DateTime?

  cliente     Cliente             @relation(fields: [cliente_id], references: [id])
  responsable Usuario             @relation("ProyectosResponsable", fields: [responsable_id], references: [id])
  // Relación compuesta (T1): comparte el escalar `cliente_id` con la relación
  // `cliente` de arriba. Esa superposición ES el invariante. NoAction es
  // obligatorio cuando dos relaciones comparten un escalar (Prisma rechaza
  // las rutas de cascada en conflicto); el borrado del proyecto es lógico.
  oportunidad Oportunidad?        @relation(fields: [oportunidad_id, cliente_id], references: [id, cliente_id], onDelete: NoAction, onUpdate: NoAction)
  metas       Meta[]
  actividades Actividad[]
  lineas      LineaPresupuestal[]
  gastos      Gasto[]
  indicadores Indicador[]
  soportes    SoporteProyecto[]

  @@index([cliente_id, estado])
  @@index([deleted_at])
  @@map("proyectos")
}

model Meta {
  id          String    @id @default(uuid())
  proyecto_id String
  nombre      String
  descripcion String?
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt
  deleted_at  DateTime?

  proyecto    Proyecto    @relation(fields: [proyecto_id], references: [id])
  actividades Actividad[]
  indicadores Indicador[]

  // Objetivo de la FK compuesta de Actividad (D2): garantiza en base de datos
  // que una actividad solo pueda apuntar a una meta de SU mismo proyecto.
  @@unique([id, proyecto_id])
  @@index([proyecto_id])
  @@map("metas")
}

model Actividad {
  id                String    @id @default(uuid())
  proyecto_id       String
  meta_id           String // RF-02: toda actividad declara su meta. NOT NULL.
  nombre            String
  descripcion       String?
  peso              Int       @default(1) // ponderación del avance (CHECK > 0)
  fecha_planificada DateTime // línea base
  fecha_real        DateTime? // null = aún sin resolver (ni a tiempo ni tarde)
  porcentaje_avance Int       @default(0) // CHECK 0..100
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt
  deleted_at        DateTime?

  proyecto Proyecto          @relation(fields: [proyecto_id], references: [id])
  meta     Meta              @relation(fields: [meta_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  soportes SoporteProyecto[]

  @@unique([id, proyecto_id]) // objetivo de la FK compuesta de SoporteProyecto (T8)
  @@index([proyecto_id, fecha_planificada]) // D9: clave de fecha del cronograma
  @@index([meta_id])
  @@index([deleted_at])
  @@map("actividades")
}

model Rubro {
  id         String    @id @default(uuid())
  nombre     String    @unique
  activo     Boolean   @default(true) // false = no ofrecible en líneas nuevas, histórico intacto
  orden      Int       @default(0)
  created_at DateTime  @default(now())
  updated_at DateTime  @updatedAt
  deleted_at DateTime?

  lineas LineaPresupuestal[]

  @@map("rubros")
}

model LineaPresupuestal {
  id                   String    @id @default(uuid())
  proyecto_id          String
  rubro_id             String
  monto_proyectado_cop Decimal   @db.Decimal(15, 2) // D4: COP únicamente
  created_at           DateTime  @default(now())
  updated_at           DateTime  @updatedAt
  deleted_at           DateTime?

  proyecto Proyecto @relation(fields: [proyecto_id], references: [id])
  rubro    Rubro    @relation(fields: [rubro_id], references: [id])
  gastos   Gasto[]

  @@unique([proyecto_id, rubro_id]) // T4: una línea por rubro y proyecto
  @@unique([id, proyecto_id]) // objetivo de la FK compuesta de Gasto
  @@index([proyecto_id])
  @@map("lineas_presupuestales")
}

model Gasto {
  id                String    @id @default(uuid())
  proyecto_id       String
  linea_id          String
  concepto          String
  monto_cop         Decimal   @db.Decimal(15, 2)
  fecha_gasto       DateTime
  registrado_por_id String
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt
  deleted_at        DateTime?

  proyecto Proyecto          @relation(fields: [proyecto_id], references: [id])
  // RF-06: la trazabilidad contable al rubro es por FK garantizada
  // (gasto -> linea -> rubro), nunca por un string copiado en el gasto.
  linea    LineaPresupuestal @relation(fields: [linea_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  soportes SoporteProyecto[]

  @@unique([id, proyecto_id]) // objetivo de la FK compuesta de SoporteProyecto
  @@index([proyecto_id, fecha_gasto])
  @@index([linea_id])
  @@map("gastos")
}

model Indicador {
  id                   String    @id @default(uuid())
  proyecto_id          String
  meta_id              String?
  nombre               String
  unidad               String
  meta_valor           Decimal   @db.Decimal(15, 2)
  // null = sin medir. Un indicador sin valor_actual NUNCA cuenta como cumplido.
  valor_actual         Decimal?  @db.Decimal(15, 2)
  // D6: marca los indicadores poblacionales que alimentan
  // "Beneficiarios Atendidos". Sin tabla de personas.
  cuenta_beneficiarios Boolean   @default(false)
  created_at           DateTime  @default(now())
  updated_at           DateTime  @updatedAt
  deleted_at           DateTime?

  proyecto Proyecto @relation(fields: [proyecto_id], references: [id])
  meta     Meta?    @relation(fields: [meta_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)

  @@index([proyecto_id])
  @@map("indicadores")
}

model SoporteProyecto {
  id            String      @id @default(uuid())
  proyecto_id   String
  actividad_id  String? // RF-04
  gasto_id      String? // RF-06
  tipo          TipoSoporte
  nombre        String // obligatorio en ambos casos (D8)
  // D8: XOR en base de datos. Exactamente uno de los dos no nulo.
  storage_path  String?
  url_externa   String? // solo esquema https (CHECK + validación zod)
  tamano_bytes  Int?
  // Espejo opcional al Repositorio de Documentos, mismo contrato que
  // AdjuntoTarea: nullable y sin cascada.
  documento_id  String?
  subido_por_id String
  created_at    DateTime    @default(now())
  deleted_at    DateTime?

  proyecto  Proyecto   @relation(fields: [proyecto_id], references: [id])
  actividad Actividad? @relation(fields: [actividad_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  gasto     Gasto?     @relation(fields: [gasto_id, proyecto_id], references: [id, proyecto_id], onDelete: NoAction, onUpdate: NoAction)
  documento Documento? @relation(fields: [documento_id], references: [id])

  @@index([proyecto_id])
  @@index([actividad_id])
  @@index([gasto_id])
  @@map("soportes_proyecto")
}

model Usuario {
  // ... campos existentes sin cambios ...
  // D3: eje ortogonal a `rol`, como gestiona_oportunidades. Otorga LECTURA
  // del Tablero de Control Gerencial y nada más: no compone en ningún
  // predicado de escritura.
  puede_ver_tablero_gerencial Boolean @default(false)

  proyectos_responsable Proyecto[] @relation("ProyectosResponsable")
}
```

`Cliente`, `Oportunidad` y `Documento` reciben **solo** el lado inverso de las relaciones nuevas
(`proyectos Proyecto[]`, `proyecto Proyecto?`, `soportes_proyecto SoporteProyecto[]`): ni una columna.

> **Verificar antes de codificar (primera tarea del change):** `npx prisma validate`. `Proyecto` repite el
> patrón de escalar compartido (`cliente_id` en `cliente` y en `oportunidad`) que ya está validado en `main`
> para `Tarea`, así que se espera que pase. Si Prisma rechazara alguna de las relaciones compuestas nuevas,
> el fallback es idéntico al documentado en `oportunidades-comerciales`: relación de una sola columna en el
> schema + `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (a, b) REFERENCES t(a, b)` a mano en la migración.
> La garantía de base de datos es la misma; solo se mueve la fuente de verdad.

## Migration

`prisma/migrations/2026xxxxxxxxxx_tablero_seguimiento_social/migration.sql`.

**Estrategia: estrictamente aditiva, sin backfill.** No existe dato legado de este módulo en ninguna tabla
(confirmado: `prisma/schema.prisma` no tiene ningún modelo de proyecto, y `Oportunidad.proyectos_relacionados`
es un `String?` libre ya marcado `@deprecated` que este change **no** lee ni migra). Lo único que toca una
tabla existente es `ALTER TABLE "usuarios" ADD COLUMN "puede_ver_tablero_gerencial" BOOLEAN NOT NULL DEFAULT false`
— y a diferencia del seed de `gestiona_oportunidades`, aquí **no hay seed**: nadie tiene hoy acceso de solo
lectura gerencial, así que empezar todos en `false` no le quita capacidad a nadie. El flag se otorga desde
`/administracion`.

DDL a mano que Prisma no emite (el resto lo genera `prisma migrate dev`):

```sql
-- D2/RF-02: pertenencia actividad -> meta dentro del mismo proyecto.
-- meta_id y proyecto_id son ambos NOT NULL, así que el hueco de MATCH SIMPLE
-- (el que obligó al CHECK en `tareas`) no puede existir: la FK compuesta se
-- evalúa siempre. Los CHECK de abajo cubren el dominio, no la nulabilidad.
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_peso_positivo"
  CHECK ("peso" > 0);
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_avance_rango"
  CHECK ("porcentaje_avance" BETWEEN 0 AND 100);

-- D8: archivo XOR enlace externo. Exactamente uno no nulo.
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_archivo_xor_url"
  CHECK ( (("storage_path" IS NOT NULL)::int + ("url_externa" IS NOT NULL)::int) = 1 );
-- Defensa en profundidad del esquema https (la validación zod es la primera línea).
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_url_https"
  CHECK ("url_externa" IS NULL OR "url_externa" LIKE 'https://%');
-- Un soporte cuelga del proyecto, o de una actividad, o de un gasto: nunca de ambos.
ALTER TABLE "soportes_proyecto" ADD CONSTRAINT "soportes_destino_unico"
  CHECK (NOT ("actividad_id" IS NOT NULL AND "gasto_id" IS NOT NULL));

ALTER TABLE "gastos" ADD CONSTRAINT "gastos_monto_positivo" CHECK ("monto_cop" > 0);
ALTER TABLE "lineas_presupuestales" ADD CONSTRAINT "lineas_monto_no_negativo"
  CHECK ("monto_proyectado_cop" >= 0);

-- D5: catálogo inicial de rubros (los del documento de origen). Idempotente.
INSERT INTO "rubros" ("id", "nombre", "orden", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'Personal', 1, now(), now()),
       (gen_random_uuid(), 'Transporte', 2, now(), now()),
       (gen_random_uuid(), 'Material POP', 3, now(), now()),
       (gen_random_uuid(), 'Operación logística', 4, now(), now())
ON CONFLICT ("nombre") DO NOTHING;

-- D10/T5: fila de parámetros por defecto, CONFIRMADA por el negocio el 2026-09-18.
INSERT INTO "settings" ("id", "key", "value", "updated_at", "created_at")
VALUES (gen_random_uuid(), 'semaforo_umbrales',
        '{"confirmado":true,
          "tecnico":{"verde":0.85,"rojo":0.60},
          "financiero":{"verde_min":0.85,"verde_max":1.15,"amarillo_min":0.60,"amarillo_max":1.40}}'::jsonb,
        now(), now())
ON CONFLICT ("key") DO NOTHING;
```

## Permissions

```ts
// src/lib/permissions.ts — mismo archivo, mismo estilo que hasCommercialAccess.

/** Actor con el flag gerencial (D3). Ortogonal a `rol`, como gestiona_oportunidades. */
export type ProjectActor = PermissionActor & { puede_ver_tablero_gerencial: boolean };

/** EJE DE LECTURA (RNF-01): quién ve el Tablero de Control Gerencial. */
export function canViewManagementDashboard(actor: ProjectActor): boolean {
  return canManageAny(actor.rol) || actor.puede_ver_tablero_gerencial;
}

/** Creación de Proyecto: permiso de Administrador/gestión en el documento de origen. */
export function canCreateProject(actor: PermissionActor): boolean {
  return canManageAny(actor.rol);
}

/**
 * EJE DE ESCRITURA sobre un proyecto y TODO lo que cuelga de él (metas,
 * actividades, líneas presupuestales, gastos, soportes). T9: extiende el piso
 * del spec (`canManageAny`) con el eje del responsable del proyecto, espejo
 * exacto de canEditClient — sin él, el rol "Gestor de Proyecto / Ejecutor"
 * del documento de origen no existe.
 */
export function canManageProject(
  proyecto: { responsable_id: string },
  actor: PermissionActor,
): boolean {
  return canManageAny(actor.rol) || proyecto.responsable_id === actor.id;
}

/** Lectura del detalle de un proyecto: gerencial global, o el propio responsable. */
export function canViewProject(
  proyecto: { responsable_id: string },
  actor: ProjectActor,
): boolean {
  return canViewManagementDashboard(actor) || proyecto.responsable_id === actor.id;
}
```

- **El flag nunca compone en escritura.** `canManageProject` y `canCreateProject` no lo miran: un
  Visualizador/Directivo (COLABORADOR + flag) obtiene `403` en todo POST/PATCH/DELETE del módulo, incluida
  la subida y el borrado de soportes (RNF-03). Esto es una propiedad estructural, no una convención: el flag
  no está en la firma de esos predicados.
- **Catálogo y parámetros maestros** (`/api/v1/rubros` de escritura y el setting `semaforo_umbrales`) usan
  `requireApiRole(["ADMINISTRADOR"])`, el mismo gate que `src/app/api/v1/settings/route.ts` — el documento
  de origen asigna "catálogos de rubros, control de parámetros" exclusivamente al Administrador.
- **Plomería del actor:** `requireApiUser()` ya devuelve la fila completa de `Usuario`, así que
  `puede_ver_tablero_gerencial` está en alcance en cada call site. Sin cambios de sesión ni de JWT.
- **Helpers de acceso** en `src/lib/api/projects.ts` (T10), con la forma literal de
  `getClientForOpportunityWrite`: `loadProjectScoped` / `getProjectForWrite` devolviendo
  `{ ok: false, code: "NOT_FOUND" | "FORBIDDEN" }`.
- **Superficie UI:** el DTO de proyecto emite `puede_editar_proyecto: boolean`, calculado como
  `canManageProject(proyecto, actor)`, exactamente como `puede_editar` / `puede_gestionar_oportunidades`.
  El servidor sigue siendo la autoridad: las rutas responden 403 igual.

## Crear Proyecto desde una Oportunidad ganada (D1/T2)

`convert/route.ts` queda **con diff cero**. La acción nueva es su hermana estructural:

```
POST /api/v1/clients/:id/opportunities/:opportunityId/project
  │
  ├─ requireApiUser ───────────────────────────────► 401
  ├─ getClientForOpportunityWrite(id, usuario) ────► 404 (cliente) | 403
  ├─ canCreateProject(usuario) ────────────────────► 403
  ├─ oportunidad existe, cliente_id coincide ──────► 404 "La oportunidad no existe."
  ├─ oportunidad.fase !== 'EJECUCION' ─────────────► 409 "Solo se crea un proyecto desde una
  │                                                       oportunidad adjudicada."
  ├─ ya existe Proyecto con ese oportunidad_id ────► 409 "Esta oportunidad ya tiene un proyecto."
  ├─ zod body inválido ────────────────────────────► 400 (zodError)
  │
  └─ tx: INSERT proyectos (... oportunidad_id, cliente_id de la oportunidad ...)
         logAudit({ entidad: "proyecto", entidad_id, accion: "crear",
                    cambios: { oportunidad_id, codigo, cliente_id } })
     → 201 { proyecto }
```

```ts
// Body (zod). `cliente_id` y `oportunidad_id` NO se aceptan del cliente:
// se derivan de la ruta y de la oportunidad cargada.
const crearProyectoDesdeOportunidad = z.object({
  codigo: z.string().min(1).max(60),
  nombre: z.string().min(1).max(200),
  territorio: z.string().min(1).max(160),
  linea_estrategica: catalogEnum(ENUM_VALUES.LineaEstrategica, "Línea estratégica no válida."),
  fecha_inicio: z.string(),          // parseDate, misma convención que el resto del API
  fecha_fin: z.string(),
  beneficiarios_meta: z.number().int().min(0).optional(),
  responsable_id: z.string().uuid().optional(),   // default: el usuario autenticado
});
```

- **Pre-llenado del formulario**: derivación de cliente, sin endpoint nuevo. La vista de la oportunidad ya
  tiene `nombre`, `cliente_id` y `valor_estimado_cop` en alcance; el CTA abre el diálogo con esos valores.
  `fecha_inicio` se sugiere desde `fecha_adjudicacion` y es editable.
- **Carrera concurrente**: dos llamadas simultáneas pasan ambas la pre-comprobación; el `@unique` de
  `oportunidad_id` hace fallar la segunda con `P2002`, que se traduce a `409` con el mismo mensaje. La
  base de datos es la garantía, la pre-comprobación es solo el mensaje amable.
- **Único camino** que escribe `oportunidad_id`. `POST /api/v1/projects` (proyecto sin origen comercial) no
  lo acepta en su schema.
- **Auditoría**: `AuditEntidad` se amplía a `"proyecto" | "actividad" | "presupuesto" | "soporte"`.
  `AuditAccion` **no cambia** — `crear`/`editar`/`eliminar` alcanzan. `audit-log-section.tsx` necesita las
  etiquetas de las entidades nuevas en el mismo commit que amplía el tipo.

## Semáforos parametrizados (RF-03, RF-07, D10)

**Fórmulas.** `corte` = `min(hoy, hasta)` del filtro del tablero.

```
avance_tecnico       = Σ(porcentaje_avance × peso) / Σ(peso)            -- 0 si Σ(peso) = 0
avance_planificado   = 100 × Σ(peso donde fecha_planificada ≤ corte) / Σ(peso)
razon_tecnica        = avance_tecnico / avance_planificado              -- 1 si planificado = 0
avance_financiero    = ejecutado_total_cop / proyectado_total_cop       -- 0 si proyectado = 0
razon_financiera     = avance_financiero
```

**Lectura del parámetro** — `src/lib/semaforo.ts`, puro, sin `@/lib/db` ni `next/server` (misma disciplina
que `permissions.ts`):

```ts
export type UmbralesSemaforo = {
  confirmado: boolean;                               // T6: falso hasta que el negocio firme
  tecnico: { verde: number; rojo: number };          // razón real/planificado
  financiero: { verde_min: number; verde_max: number; amarillo_min: number; amarillo_max: number };
};

export type ColorSemaforo = "verde" | "amarillo" | "rojo";

export function colorTecnico(razon: number, u: UmbralesSemaforo): ColorSemaforo {
  if (razon >= u.tecnico.verde) return "verde";
  if (razon < u.tecnico.rojo) return "rojo";
  return "amarillo";
}

/** Bidireccional a propósito (D10): la sobre-ejecución también es un hallazgo. */
export function colorFinanciero(razon: number, u: UmbralesSemaforo): ColorSemaforo {
  const f = u.financiero;
  if (razon >= f.verde_min && razon <= f.verde_max) return "verde";
  if (razon >= f.amarillo_min && razon <= f.amarillo_max) return "amarillo";
  return "rojo";
}

/** Resolución: override del proyecto > setting de organización > default de fábrica. */
export function resolverUmbrales(
  organizacion: UmbralesSemaforo,
  override: unknown,
): UmbralesSemaforo { /* merge superficial validado con zod; override inválido cae al de organización */ }
```

Call site: `const org = await getSetting(SETTING_SEMAFORO_UMBRALES, UMBRALES_SEMAFORO_DEFAULT)` —
`UMBRALES_SEMAFORO_DEFAULT` vive en `src/lib/catalogs.ts` como **default de fábrica de la fila**, igual que
`DOC_CATEGORIES`, y no aparece en ninguna comparación. Cambiar un corte es un `PATCH /api/v1/settings`, no
un despliegue. Mientras `confirmado === false`, toda vista con semáforo pinta el aviso de T6.

## Endpoint agregado del tablero (D9)

`GET /api/v1/dashboard/projects` — **un solo round-trip**, gateado por `canViewManagementDashboard`,
agregación en SQL vía `db.$queryRaw` (Prisma `groupBy` no hace promedios ponderados). Filtros: los comunes
del dashboard (`desde`, `hasta`, `responsable_id`, `tipo_cliente`) más `proyecto_id?` y `cliente_id?`.

```sql
WITH tecnico AS (
  SELECT a.proyecto_id,
         SUM(a.porcentaje_avance::numeric * a.peso) / NULLIF(SUM(a.peso), 0)        AS avance_real,
         100.0 * SUM(a.peso) FILTER (WHERE a.fecha_planificada <= $corte)::numeric
               / NULLIF(SUM(a.peso), 0)                                            AS avance_planificado,
         COUNT(*) FILTER (WHERE a.fecha_real IS NOT NULL
                            AND a.fecha_real <= a.fecha_planificada)                AS a_tiempo,
         COUNT(*) FILTER (WHERE a.fecha_real IS NOT NULL)                           AS resueltas,
         COUNT(*)                                                                   AS programadas
  FROM actividades a
  WHERE a.deleted_at IS NULL AND a.fecha_planificada <= $hasta
  GROUP BY a.proyecto_id
),
financiero AS (
  -- LATERAL, no JOIN directo: unir gastos a lineas y sumar
  -- monto_proyectado_cop multiplicaría el proyectado por el número de gastos.
  SELECT l.proyecto_id,
         SUM(l.monto_proyectado_cop)      AS proyectado,
         SUM(COALESCE(gx.ejecutado, 0))   AS ejecutado
  FROM lineas_presupuestales l
  LEFT JOIN LATERAL (
    SELECT SUM(g.monto_cop) AS ejecutado FROM gastos g
    WHERE g.linea_id = l.id AND g.deleted_at IS NULL AND g.fecha_gasto <= $corte
  ) gx ON TRUE
  WHERE l.deleted_at IS NULL
  GROUP BY l.proyecto_id
),
indicadores AS (
  SELECT i.proyecto_id,
         COUNT(*)                                                                    AS total,
         COUNT(*) FILTER (WHERE i.valor_actual IS NOT NULL
                            AND i.valor_actual >= i.meta_valor)                      AS cumplidos,
         SUM(i.valor_actual) FILTER (WHERE i.cuenta_beneficiarios)                   AS beneficiarios
  FROM indicadores i WHERE i.deleted_at IS NULL GROUP BY i.proyecto_id
),
entregables AS (
  SELECT a.proyecto_id,
         COUNT(*)                                                                    AS programados,
         COUNT(*) FILTER (WHERE a.porcentaje_avance = 100 AND s.id IS NOT NULL)      AS entregados
  FROM actividades a
  LEFT JOIN LATERAL (
    SELECT 1 AS id FROM soportes_proyecto s
    WHERE s.actividad_id = a.id AND s.deleted_at IS NULL LIMIT 1
  ) s ON TRUE
  WHERE a.deleted_at IS NULL GROUP BY a.proyecto_id
)
SELECT p.id, p.nombre, p.codigo, p.linea_estrategica, p.territorio,
       p.beneficiarios_meta, p.umbrales_override, t.*, f.*, i.*, e.*
FROM proyectos p
LEFT JOIN tecnico t ON t.proyecto_id = p.id
LEFT JOIN financiero f ON f.proyecto_id = p.id
LEFT JOIN indicadores i ON i.proyecto_id = p.id
LEFT JOIN entregables e ON e.proyecto_id = p.id
WHERE p.deleted_at IS NULL;
```

Los colores de semáforo **no** se calculan en SQL: la consulta devuelve razones, `semaforo.ts` las tiñe en
TypeScript con los umbrales resueltos. Así el corte sigue siendo un dato y la lógica sigue siendo testeable
sin base de datos.

Serie de la curva S (segunda consulta agregada dentro del **mismo** request, no un segundo round-trip HTTP):
ejecutado acumulado por mes desde `gastos.fecha_gasto`, y planificado acumulado por mes desde el cronograma
según T7.

## Visualizaciones del Tablero (D7)

Primitivas nuevas en `src/components/dashboard/charts/`, todas con constantes de viewBox fijas y sin
medición del DOM — el criterio que `sparkline.tsx` ya cumple y que `/print/dashboard/*` exige:

| KPI | Componente | Forma |
|---|---|---|
| Avance Técnico (%) | `Tacometro` *(nombre en español a propósito: `Gauge` ya está ocupado por el icono de lucide importado en `dashboard-page.tsx`)* | Arco de 180°, `path` con `A` sobre un radio fijo; tres bandas coloreadas derivadas de los **umbrales resueltos**, no de constantes; aguja como `line` rotada por `transform`. |
| Avance Financiero (%) | `CurvaS` | Dos `polyline` sobre el mismo viewBox normalizado (planificado punteado, ejecutado sólido), ticks mensuales. Extiende la normalización de `Sparkline` a dos series. |
| Cumplimiento de Indicadores (%) | `Radar` | `polygon` de N ejes: `x = cx + r·cos(θ)`, `y = cy + r·sin(θ)`, `θ = -π/2 + 2πi/N`, `r = clamp(valor/meta, 0, 1)·R`. |
| Cumplimiento de Cronograma (%) | `BarRow` existente + chip de color de `colorTecnico` | Sin componente nuevo. |
| Productos Entregados / Programados | `BarRow` existente (comparativo entregados vs. programados) | Sin componente nuevo. |
| Beneficiarios Atendidos / Meta | `StatTile` existente con `foot` | Sin componente nuevo. Tarjeta de resumen ejecutivo, tal cual lo pide el documento. |

Tres primitivas nuevas y tres reutilizaciones: el *escape hatch* de D7 (evaluar una librería si hicieran
falta tooltips, zoom o drill-down) **no se activa** — ninguno de los seis KPIs pide interacción.

Integración en el shell (`src/components/dashboard/dashboard-page.tsx`):

```ts
const CARAS = [
  { id: "pipeline", label: "Pipeline comercial", icon: Gauge },
  { id: "tasks", label: "Gestión de tareas", icon: ListChecks },
  { id: "clients-activity", label: "Actividad de clientes", icon: UsersRound },
  { id: "my-summary", label: "Mi resumen", icon: UserRound },
  { id: "management", label: "Tablero gerencial", icon: Target },   // ← quinta cara
] as const;
```

La cara se renderiza con `{cara === "management" && <CaraGerencial filters={filters} />}` junto a las otras
cuatro. La cara solo se ofrece cuando el DTO de sesión trae `puede_ver_tablero_gerencial` o un rol de
gestión; el endpoint responde 403 igualmente. **La impresión no es una ruta dinámica**: hay un directorio
por cara, así que se crea `src/app/print/dashboard/management/page.tsx` copiando la forma de
`print/dashboard/pipeline/page.tsx`. `generarReporte()` no cambia — ya compone la URL desde `cara`.

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `prisma/schema.prisma` | Modify | 8 modelos nuevos + 3 enums + `Usuario.puede_ver_tablero_gerencial` + lados inversos en `Cliente`/`Oportunidad`/`Documento`/`Usuario`. |
| `prisma/migrations/2026xxxx_tablero_seguimiento_social/migration.sql` | Create | DDL + `CHECK` a mano + catálogo de rubros + fila de umbrales. |
| `prisma/invariant.test.ts` | Modify | **Ampliar, no reescribir**: invariantes nuevos junto a los de `oportunidades-comerciales`. |
| `src/lib/permissions.ts` | Modify | `ProjectActor`, `canViewManagementDashboard`, `canCreateProject`, `canManageProject`, `canViewProject`. |
| `src/lib/permissions.test.ts` | Modify | Celdas nuevas de la matriz (TDD primero). |
| `src/lib/semaforo.ts` + `.test.ts` | Create | Comparación parametrizada, pura. |
| `src/lib/catalogs.ts` | Modify | `ENUM_VALUES.LineaEstrategica`, etiquetas UI, `UMBRALES_SEMAFORO_DEFAULT`. |
| `src/lib/settings.ts` | Modify | `SETTING_SEMAFORO_UMBRALES` + default en `ensureDefaultSettings`. |
| `src/lib/api/projects.ts` | Create | `loadProjectScoped`, `getProjectForWrite`, `PROJECT_SELECT`, `toProjectItem`. |
| `src/lib/api/files.ts` | Modify | `projectSupportStoragePath(proyectoId, soporteId, nombre)` reusando `sanitizeFileName`; `isValidExternalUrl(url)` (solo `https:`, vía `new URL`). |
| `src/lib/api/audit.ts` | Modify | Ampliar `AuditEntidad`. |
| `src/app/api/v1/projects/route.ts`, `[id]/route.ts` | Create | CRUD + soft delete. |
| `src/app/api/v1/projects/[id]/goals/**`, `activities/**`, `budget/**`, `expenses/**`, `indicators/**`, `attachments/**` | Create | Sub-recursos del agregado. |
| `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/project/route.ts` | Create | T2 — la acción auditada. |
| `src/app/api/v1/rubros/route.ts`, `[id]/route.ts` | Create | Catálogo; escritura `requireApiRole(["ADMINISTRADOR"])`. |
| `src/app/api/v1/dashboard/projects/route.ts` | Create | Endpoint agregado único (D9). |
| `.../opportunities/[opportunityId]/convert/route.ts` | **Sin cambios** | D1-bis. Diff obligatorio: cero. |
| `src/components/dashboard/dashboard-page.tsx` | Modify | Quinta entrada en `CARAS` + render de la cara. |
| `src/components/dashboard/cara-management.tsx` | Create | La cara, con los seis KPIs. |
| `src/components/dashboard/charts/{tacometro,curva-s,radar}.tsx` | Create | Primitivas SVG (D7). |
| `src/app/print/dashboard/management/page.tsx` | Create | Quinta cara imprimible. |
| `src/components/crm/entity-dialogs.tsx` | Modify | CTA "Crear proyecto" en oportunidades `EJECUCION`; enlace al proyecto si ya existe. Sin tocar la acción de convertir. |
| `src/components/proyectos/**` | Create | Ficha, cronograma, presupuesto, soportes. |
| `src/hooks/projects.ts`, `src/hooks/dashboard.ts` | Create/Modify | Queries y DTOs. |
| `src/lib/openapi/paths/projects.ts`, `dashboard.ts` | Create/Modify | Contratos. |
| `src/components/admin/audit-log-section.tsx` | Modify | Etiquetas de las entidades nuevas. |

## Testing Strategy

TDD estricto: RED primero en cada fila.

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Matriz completa de permisos: 4 roles × flag on/off × responsable sí/no, sobre los 4 predicados nuevos | `src/lib/permissions.test.ts` — **ampliar** la matriz existente, no bifurcarla. Celda obligatoria: COLABORADOR + flag → `canViewManagementDashboard` true **y** `canManageProject` false. |
| Unit | Semáforos parametrizados: verde/amarillo/rojo por parámetro, bordes exactos, bidireccionalidad financiera, y **el mismo dato cambia de color al cambiar solo el parámetro** | `src/lib/semaforo.test.ts`. Ningún test escribe un porcentaje literal como corte esperado. |
| Unit | Avance técnico ponderado: `(100×2 + 40×1)/3 = 80`; proyecto sin actividades → 0 sin división por cero | `src/lib/semaforo.test.ts` / `dashboard` |
| Invariante (DB real) | Actividad con `meta_id` de otro proyecto → rechazada por la FK compuesta, con y sin validación de API | `prisma/invariant.test.ts`, dentro del patrón `runAndRollback` ya existente. |
| Invariante (DB real) | Soporte con ambos campos, con ninguno, y con `url_externa` `http://` → rechazados por `CHECK` | `prisma/invariant.test.ts` |
| Invariante (DB real) | Segundo `Proyecto` con el mismo `oportunidad_id` → rechazado; `Proyecto` apuntando a una oportunidad de otro cliente → rechazado por la FK compuesta | `prisma/invariant.test.ts` |
| Integración | Crear proyecto desde oportunidad: 401/403/404/409 (`fase` ≠ EJECUCION), 409 (repetido), 201 + una fila de auditoría | **`.../opportunities/[opportunityId]/project/route.test.ts` — archivo NUEVO y separado.** |
| Integración | Visualizador/Directivo: 200 en el tablero, 403 en cada POST/PATCH/DELETE del módulo, soportes incluidos | `dashboard/projects/route.test.ts`, `projects/**/route.test.ts` |
| Integración | Presupuesto: agregación por `rubro_id` sin mezclar; rubro inactivo no ofrecible pero histórico intacto | `budget/route.test.ts`, `rubros/route.test.ts` |
| Integración | Los seis KPIs en un solo round-trip; indicador sin `valor_actual` no cumple; actividad completa sin soporte no es "entregada" | `dashboard/projects/route.test.ts` |
| Componente | `Tacometro`/`CurvaS`/`Radar` renderizan determinísticamente con datos vacíos, un punto y N puntos | `charts/*.test.tsx` |
| Rendimiento | p95 del endpoint agregado sobre el dataset sembrado (~50×20×200), **medido y reportado** contra 3 s (D9) | Script de siembra + medición manual; el número se reporta, no bloquea. |
| **Centinela** | **`convert/route.test.ts` pasa sin modificación y con diff de archivo cero, igual que `documents.test.ts` en el change anterior** | Chequeo de diff en la plantilla de PR. |

> **Corrección factual sobre el centinela.** La propuesta y el spec dicen "11/11 escenarios". El archivo real
> `src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.test.ts` tiene **7 casos `it`**
> (401, 403, 404, 409 no-GANADA, 409 repetido, conversión feliz con auditoría, COLABORADOR responsable con
> flag). La regla operativa no cambia y es más estricta que un conteo: **diff cero en ese archivo y en su
> ruta, y la suite verde**. `sdd-tasks` debe escribir la tarea con esa formulación, no con el número 11.

## Threat Matrix

N/A — este change no introduce enrutamiento dinámico de comandos, shell, subprocesos, automatización de
VCS/PR, clasificación de archivos ejecutables ni integración de procesos. Su superficie de seguridad es
autorización, integridad referencial y manejo de archivos, cubiertas arriba. Dos puntos explícitos:

- `url_externa` es **dato mostrado, nunca fetcheado por el servidor**: no hay SSRF porque el backend jamás
  la resuelve. Se valida `https` y se renderiza con `rel="noopener noreferrer"`.
- La subida de soportes reutiliza íntegramente los límites ya probados de `files.ts` (10 MB, extensión o
  MIME de la lista blanca, `sanitizeFileName` en el key de storage). No se relaja ninguno.

## Migration / Rollout y Rollback Plan

**Rollout.** Aditivo puro, desplegable en cualquier orden respecto del código: todos los modelos son nuevos
y la única columna añadida a una tabla existente es booleana con default `false`. La aplicación en `main`
sigue funcionando idéntica con la migración aplicada y sin una sola línea de código nuevo.

**Rollback.** Bajar la migración: `DROP TABLE` de las 8 tablas nuevas, `DROP TYPE` de los 3 enums,
`ALTER TABLE "usuarios" DROP COLUMN "puede_ver_tablero_gerencial"`, `DELETE FROM settings WHERE key =
'semaforo_umbrales'`. **Ningún dato preexistente se pierde**: `Cliente`, `Oportunidad`, `Tarea` y
`Documento` no ceden ninguna columna — todas las FK viven del lado nuevo. No hay backfill que revertir
porque no hay backfill.

Fallas parciales, sin tocar el esquema:

- **El tablero gerencial falla** → se quita la quinta entrada de `CARAS`; el módulo de proyectos sigue vivo.
- **Los permisos fallan** → `canViewManagementDashboard` vuelve a `return canManageAny(actor.rol)`; el flag
  queda inerte en la base de datos.
- **Los umbrales quedan mal configurados** → es un `PATCH /api/v1/settings`, no un despliegue (esa es
  exactamente la garantía que compra T5).
- **El ciclo comercial no tiene rollback** porque no se modificó: `convert/route.ts` sale de este change
  byte por byte igual que entró.

## Implementation Order (4 slices autónomos)

1. **Esquema + migración + catálogo de rubros + invariantes.** Desplegable como no-op. Incluye `prisma
   validate` (fallback de T1 se resuelve aquí) y los tests de invariante contra base de datos real.
2. **`Proyecto` CRUD + permisos + la acción desde oportunidad.** `permissions.ts` + matriz + `projects.ts`
   + `POST .../project` con su suite nueva. Envía **junto con** el toggle de
   `puede_ver_tablero_gerencial` en `/administracion`: sin él, el flag es inalcanzable.
3. **Metas, actividades, cronograma y soportes** (archivo y URL externa, `files.ts`).
4. **Presupuesto, gastos, semáforos parametrizados y quinta cara del dashboard.**

Cada slice tiene inicio, fin, verificación y rollback propios. `sdd-tasks` emite el forecast formal: se
anticipa `Chained PRs recommended: Yes` y `400-line budget risk: High`.

## Risks

| Riesgo | Sev. | Mitigación |
|---|---|---|
| Umbrales nunca confirmados y el placeholder se vuelve verdad por omisión | ~~Alta~~ Resuelto | Confirmado por el negocio el 2026-09-18 (ver D10). Semilla actualizada a `confirmado: true` con los cortes reales; T5/T6 siguen vigentes como mecanismo por si el negocio los ajusta más adelante. |
| `SUM(valor_actual)` de varios indicadores con `cuenta_beneficiarios` cuenta dos veces a la misma persona | Med | El endpoint devuelve también `indicadores_beneficiarios_count`; la UI avisa cuando es > 1. La configuración esperada es **un** indicador poblacional por proyecto. Documentado, no resuelto por el esquema: resolverlo de verdad exige el registro nominal que D6 difiere. |
| Doble conteo del presupuesto al unir `gastos` con `lineas_presupuestales` | Med | `LEFT JOIN LATERAL` en la CTE `financiero` + test que crea 2 gastos sobre 1 línea y verifica que el proyectado no se duplica. **Esta es la trampa más fácil de introducir de todo el módulo.** |
| Colisión de nombre `Gauge` (icono de lucide ya importado) con un componente `Gauge` nuevo | Baja | Se nombra `Tacometro`. |
| Esquema grande en un solo PR | **Alta** | 4 slices encadenados. |
| Regresión en `convert/route.ts` | Baja | Diff cero, verificado en la plantilla de PR. |
| El eje `responsable_id` de T9 amplía el piso que el spec fijó | Med | Declarado explícitamente (T9) y autorizado por el propio spec; cubierto por celdas dedicadas en `permissions.test.ts`. Si el owner lo rechaza, quitar el segundo término de `canManageProject` es una línea — pero entonces el rol "Gestor de Proyecto / Ejecutor" desaparece. |

## Asunciones tomadas (no resueltas por la propuesta)

- **Sin fasificación temporal del presupuesto.** `razon_financiera` compara ejecutado hasta la fecha de
  corte contra el proyectado **total**, no contra un proyectado prorrateado. La curva S sí es temporal, pero
  su línea base sale del cronograma (T7), no de un calendario presupuestal que nadie capturó.
- **`Actividad.meta_id` es NOT NULL.** RF-02 dice "cada actividad debe indicar claramente la meta asociada":
  se lee como obligatorio. Una actividad sin meta no puede verificarse objetivamente, que es justo lo que el
  requisito persigue.
- **Desviación declarada frente a la letra del spec de `project-schedule`:** ese spec pide FK compuesta
  "plus a Postgres CHECK". Con `meta_id` y `proyecto_id` ambos NOT NULL, un `CHECK` de no-nulabilidad sería
  vacuo: el hueco de `MATCH SIMPLE` que justificó el `CHECK` en `tareas` **no puede existir** aquí. La
  garantía que el spec exige —"la base de datos rechaza el write"— la da la FK compuesta sola, y el test de
  invariante la mide. Los `CHECK` de `actividades` cubren dominio (`peso > 0`, avance 0..100), no pertenencia.
- **`beneficiarios_meta` con default 0** en vez de obligatorio: un proyecto puede registrarse antes de tener
  la meta poblacional firmada.
- **`EstadoProyecto`** no está en el documento de origen; los 5 valores son una lista cerrada razonable.
- **Los soportes se borran lógicamente** (`deleted_at`), no físicamente: RNF-03 pide resguardo, y borrar el
  objeto de storage haría irrecuperable un comprobante financiero legalizado.

## Open Questions

- [ ] `npx prisma validate` sobre las cuatro relaciones compuestas nuevas — se resuelve en el slice 1, con
      fallback documentado en T1.
- [x] Firma del negocio sobre los cortes de D10 — **confirmado el 2026-09-18**, ver D10 en la propuesta.
- [ ] ¿El eje `responsable_id` de T9 tiene el visto bueno del owner? Sin él no existe el rol "Gestor de
      Proyecto / Ejecutor" del documento de origen.
- [ ] ¿El toggle de `puede_ver_tablero_gerencial` en `/administracion` entra en el slice 2 (esta propuesta
      dice que sí, por la misma razón de desbloqueo que el toggle comercial) o se difiere?

---

**Next step**: `sdd-tasks`.
