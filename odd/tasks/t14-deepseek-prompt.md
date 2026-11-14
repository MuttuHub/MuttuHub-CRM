# Prompt para DeepSeek: T14, gasto por actividad (carril B, 2026-11-14)

Copia todo lo que está debajo de la línea y pégalo en tu sesión de DeepSeek. El agente trabaja en su worktree,
`/home/adrian/MuttuHub-CRM-deepseek`, en una **rama nueva**: `feat/t14-gasto-por-actividad`.

---

## Rol

Eres un desarrollador full-stack sénior en MuttuHub CRM: Next.js 16, React, TypeScript, Prisma, PostgreSQL, TanStack
Query y Vitest con Testing Library. Implementas `T14`: el gasto se registra contra una línea del presupuesto
(actividad + rubro), con facturas distribuidas y vistas financieras por actividad.

## Contexto que tienes que saber

- `T11` (presupuesto por actividad) y `T12` (actividad Transversal) **ya están en main** (PRs #182–#187). Partes de
  `origin/main`.
- Desde `T11`, un rubro puede tener **varias líneas** (una por actividad). Los gastos todavía eligen por rubro, y eso ya
  está roto para el usuario. Eso es lo primero que arreglas.
- Claude trabaja al mismo tiempo en el carril A (`T13`, programación y modificaciones). **No abras sus archivos**
  (lista abajo). En `prisma/schema.prisma` tú eres dueño de `Gasto` y de la tabla nueva de reparto. Claude tiene una
  migración propia en camino a main (`20261114180000_t13_programacion_confirmada`, dos columnas en `Proyecto` y su
  relación en `Usuario`): **no toques los modelos `Proyecto` ni `Usuario`**, y nombra tu migración con fecha
  `20261115…` o posterior, para que quede después de la suya.

## Paso 0: ¿ya entró el PR #188 de Claude?

El PR #188 (`T13.1`–`T13.3`: migración `20261114180000_t13_programacion_confirmada`, programación propuesta y
confirmación) es la última pieza antes de que arranques. Compruébalo:

```bash
cd /home/adrian/MuttuHub-CRM-deepseek
git fetch origin
git log origin/main --oneline -15 | grep -c "T13.1"   # 1 = ya está en main
```

- **Si da 1:** sigue con la Preparación. Tu base trae todo.
- **Si da 0:** arranca igual desde `origin/main` (no esperes). Cuando el humano te avise que entró #188, haz
  `git fetch origin && git merge origin/main` antes de crear tu migración, para que la tuya quede después de la de
  Claude.

## Preparación (una sola vez)

```bash
cd /home/adrian/MuttuHub-CRM-deepseek
git status                                    # debe estar limpio
git fetch origin
git switch -c feat/t14-gasto-por-actividad origin/main
npm ci
npx prisma generate
npx tsc --noEmit                              # línea base: sin errores
```

Lee `AGENTS.md` y `CLAUDE.md`. Esta versión de Next.js tiene cambios importantes: antes de usar APIs de Next, consulta
`node_modules/next/dist/docs/`.

Cuando el humano te avise que algo nuevo entró a main (por ejemplo `T13`), incorpóralo con
`git fetch origin && git merge origin/main` (no rebase: tu rama ya puede estar subida). Si hay conflictos en archivos
que no son tuyos, quédate con la versión de main y avisa.

## Especificación

Lee completas, en este orden:
1. `odd/tasks/po-2026-11-10-proyectos.md`: **S9, S10 y S11** (citas textuales de la PO: no las reescribas ni agregues
   requisitos). Los criterios de S11 están citados en la rebanada 5.
2. `odd/tasks/po-2026-11-10-parte-2-diseno.md`, sección 6: decisiones #3 (factura con N líneas de reparto que suman el
   total) y #4 (los gastos ya cargados sin actividad van en una fila «Sin actividad»).
3. `odd/tasks/t11-presupuesto-por-actividad.md` hasta `## Log`, para entender el modelo de líneas.

## Qué hacer, en este orden (un commit por rebanada)

### Rebanada 1: el formulario elige la línea (sin cambiar el schema)
- `src/components/proyectos/gasto-form.tsx:157` esconde el rubro que tiene dos o más líneas.
- `src/lib/api/gastos.ts:242` elige una línea arbitraria.
- Formulario en el orden de S9: Objetivo (o «Gestión del proyecto») → Actividad → Rubro. El objetivo solo filtra y no
  se guarda. En Rubro solo aparecen los rubros presupuestados en la actividad elegida. El gasto se guarda con el
  `linea_id` exacto.
- De dónde sale el mapa actividad → rubro: **no lo agregues al endpoint de presupuesto**. `GET
  /api/v1/projects/:id/budget` ya devuelve `lineas` con `actividad_id`, `rubro_id` y `valor` (tipo `ProjectBudgetLinea`,
  `src/hooks/projects.ts:1482`); el formulario hoy solo recibe `rubros`. Lee las líneas de esa respuesta, filtra en el
  cliente y valida en el servidor. `useProjectBudget` y la sección de presupuesto del hook son del carril A
  (`src/lib/api/presupuesto.ts` está prohibido): se **leen**, no se editan.
- Criterio de S9: «Al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2.»

### Rebanada 2: factura distribuida (cambia el schema: RIESGO ALTO)
- Hoy `Gasto` ya es la factura en todo menos el reparto: `tercero_*`, `numero_documento`, `soportes`,
  `motivo_anulacion` y `periodo` existen (`prisma/schema.prisma:1233-1275`) y `linea_id` es **obligatorio**
  (`:1236`). Lo nuevo es la tabla de reparto: N líneas por factura, cada una con su `linea_id` y su valor; la cabecera
  se queda con tercero, documento, soportes, periodo y estado.
- La suma de las líneas debe ser exactamente el total de la factura; si no, no se guarda. Propuesto: el IVA de cada
  reparto en proporción a su subtotal y corregible.
- La migración convierte cada gasto existente en una factura con **una** línea de reparto, sin perder ni cambiar
  ningún valor. Esto es riesgo 1 (datos existentes).
- **Antes de commitear la migración, repórtala** en tu bitácora, con la migración ya escrita en la rama, y estos
  seis puntos:
  1. el SQL completo;
  2. conteos antes y después por tabla (`Gasto`, la tabla de reparto, `LineaPresupuestal`) en tu base de ensayo;
  3. la suma total del ejecutado antes y después: **idéntica**;
  4. cada factura quedó con al menos un reparto y la suma de sus repartos es exactamente su total;
  5. ningún `estado`, `periodo`, fecha, tercero ni valor cambió;
  6. cómo se vuelve atrás si la migración sale mal.
  Claude revisa la migración leyendo tu rama y tu bitácora; el humano solo decide si Claude marca un riesgo que no se
  puede deshacer. Mientras esperas esa revisión, **no te quedes parado**: avanza la rebanada 4 con la regla de costura
  única que está ahí (cambias `loadGastosEjecutados`, no la UI ni los tests de superficie). Si la revisión pide
  cambios, corrige la migración antes de seguir con la rebanada 3.
- Ensáyala en **tu propia** base descartable. El puerto `55433` es tuyo; el `55432` es del Paso 0, no lo uses:
  ```bash
  docker run -d --name muttu-t14-db -p 55433:5432 \
    -e POSTGRES_PASSWORD=t14local -e POSTGRES_DB=muttu public.ecr.aws/supabase/postgres:17.6.1.143
  export DATABASE_URL='postgresql://supabase_admin:t14local@localhost:55433/muttu?schema=public'
  export DIRECT_URL="$DATABASE_URL"
  npx prisma migrate deploy                   # primero sin tu migración, carga datos de prueba, luego con ella
  npx vitest run prisma --no-file-parallelism
  ```
  Si el usuario `supabase_admin` no acepta la contraseña, usa `postgres` y dilo en tu reporte.
- Criterios de S9: «La factura de $1.000.000 queda con $350.000 en la actividad 1.2 y $650.000 en la 1.3, y se puede
  consultar como un solo documento.» y «Una distribución que suma $990.000 para una factura de $1.000.000 no se
  guarda.»

### Rebanada 3: importación de gastos y duplicados
- Plantilla de gastos: columna «Código de actividad». Toca tres lugares concretos: `ENCABEZADOS_GASTOS`
  (`src/lib/proyectos/gastos-import/parse.ts:50`, hoy 13 columnas con «Rubro» y sin actividad), `ALIAS` (`:85`) y
  `ANCHOS` (`src/lib/proyectos/gastos-import/template.ts:12`).
- Varias filas con el mismo tercero y el mismo número de documento se leen como **una** factura distribuida, no como
  duplicados, y deben sumar el total. La clave de agrupación en archivo está en `parse.ts:419-420`.
- El control de duplicados de `T5` y la anulación se aplican a la factura completa; hoy la regla vive en tres capas:
  `buscarDuplicados` (`src/lib/api/gastos.ts:453`), `esDuplicado` (`src/lib/proyectos/gastos.ts:100`) y la clave del
  parser. Cambia el umbral en las tres y deja un test por cada caso de la regla.
- Anulación: `src/app/api/v1/projects/[id]/expenses/[expenseId]/void/route.ts` y
  `src/lib/api/validacion-gastos.ts` (`SOLO_EJECUTADO_MESSAGE`, `MOTIVO_GASTO_SCHEMA`).

### Rebanada 4: vistas financieras (S10)
- Selector «Por actividad / Por rubro» en Finanzas (`src/components/proyectos/ficha/ficha-finanzas.tsx` y
  `src/components/proyectos/ficha/finanzas/**`). Por actividad: agrupada por objetivo y por «Gestión del
  proyecto»; asignado, programado al corte, ejecutado, saldo y semáforo; al abrirla, detalle por rubro. Los gastos sin
  actividad van en la fila «Sin actividad» (`LineaPresupuestal.actividad_id` ya es opcional, `schema.prisma:1164`).
- **Una sola costura para el ejecutado.** Hoy `loadGastosEjecutados` (`src/lib/api/financiera.ts:25`) devuelve
  `{ rubroId, lineaId, periodo, valor, estado }` y la consumen `src/lib/api/financial-sheet.ts`, `curva.ts` y
  `atencion.ts`. Extiéndela para que lleve también la actividad y lee el ejecutado solo por ahí: no dupliques la
  consulta en la UI ni en otra capa. Así la rebanada 2 cambia **solo** la implementación de esa función.
- No toques `src/lib/proyectos/ficha-financiera.ts` (es puro, del carril A: `computeFicha` y sus tipos). Si te falta
  algo ahí, anótalo y sigue.
- Criterios: «El ejecutado total es igual en las dos vistas.» y «Un gasto registrado en la actividad 1.2 sube el
  ejecutado de esa actividad y el de su rubro.»

### Rebanada 5 (solo si terminaste lo anterior): S11, cierre de gastos de la actividad
Antes de empezarla, pregúntale al humano. Criterios de S11 («Se acepta si», textuales de la PO):
- «Una actividad abierta con asignado $10.000.000 y ejecutado $7.000.000 muestra saldo $3.000.000.»
- «Un ahorro de $3.000.000 trasladado y aprobado reduce el disponible de la actividad de origen y aumenta el de la
  actividad y rubro de destino; el total del proyecto no cambia.»
- «Al cerrarla con nota, muestra ahorro $3.000.000 y la nota.»
- «No se puede cerrar sin nota; no se pueden registrar gastos en una actividad cerrada.»

Además, cuando arranques: la nota al cerrar es obligatoria; la reapertura es con motivo y queda en auditoría
(propuesta de S11, aceptada en D4); y el traslado de ahorro lo solicita el Gestor y lo aprueba el Gerente (AJ-09). El
saldo abierto **no** se llama ahorro.

## Superficie permitida

- `src/lib/api/gastos*.ts` (incluye `validacion-gastos.ts`) y `src/lib/proyectos/gastos.ts`
- `src/app/api/v1/projects/[id]/expenses/**`
- `src/components/proyectos/gasto-form.tsx` y las demás pantallas de gastos
- Finanzas: `src/components/proyectos/ficha/ficha-finanzas.tsx`, `src/components/proyectos/ficha/finanzas/**` y
  `src/components/proyectos/curve-s-chart.tsx`
- `src/lib/proyectos/gastos-import/**`
- ejecutado y hoja financiera: `src/lib/api/financiera.ts`, `src/lib/api/financial-sheet.ts` y
  `src/app/api/v1/projects/[id]/financial-sheet/route.ts`
- la **sección de gastos** de `src/hooks/projects.ts` (solo esa sección)
- OpenAPI de gastos (`src/lib/openapi/paths/project-expenses.ts`) y sus tests, cada vez que cambies una ruta
- `prisma/schema.prisma` y `prisma/migrations/**` **solo en la rebanada 2**
- `odd/tasks/t14-gasto-por-actividad.md` (tu bitácora: créala)

## Prohibido

- Todo lo del carril A: `src/lib/proyectos/modificaciones.ts`, `src/app/api/v1/projects/[id]/programming/**`,
  `src/app/api/v1/projects/[id]/modifications/**`, `src/lib/api/presupuesto.ts`,
  `src/components/proyectos/presupuesto-programacion.tsx`, `modificacion-form.tsx`, `traslado-form.tsx`,
  `src/lib/proyectos/plantilla/**`, `src/lib/api/plantilla-import.ts`, `src/lib/api/estructura-po-import.ts`, y la
  sección de presupuesto/programación de `src/hooks/projects.ts`.
- `src/lib/proyectos/ficha-financiera.ts`, `src/lib/proyectos/linea-base.ts` y `src/lib/api/versiones.ts`: son del
  carril A (la ficha pura, el control de la línea base y `T13`). Tus archivos de vistas son `src/lib/api/financiera.ts`
  y `src/lib/api/financial-sheet.ts`, más las pantallas de Finanzas.
- `src/lib/proyectos/excel-celdas.ts` sin avisar antes (lo comparten las dos importaciones).
- **Cargar `.env`** o correr cualquier cosa contra él: `.env` es PRODUCCIÓN. Toda base que toques es `localhost:55433`.
- Push, PR, merge, rebase sobre main, `git reset --hard`, borrar ramas.

### Si un archivo prohibido te bloquea

No lo toques y no esperes: anota en tu bitácora qué necesitas y para qué, sigue con otra parte de tu rebanada y
avísalo en el reporte. Pregunta solo si eso te impide terminar la rebanada. No decides tú el orden de los carriles.

## Reglas de trabajo

1. **Test primero**: escribe el test que falla (RED), luego el código (GREEN). Un test por cada regla y por cada
   criterio «Se acepta si». Por cada comando o ruta existente que toques, un test que pruebe que lo de antes sigue
   igual.
2. **`npx prisma generate` después de tocar el schema**, antes de creerle a `tsc`.
3. **En WSL, vitest con globs** para carpetas con corchetes (`src/app/api/v1/projects/*/expenses`): un filtro
   `"[id]"` entre comillas cuelga el worker.
4. Antes de cada commit: `npx tsc --noEmit`, `npx eslint <archivos tocados>`, `npx knip` y los tests de lo que tocaste.
5. Commits convencionales en inglés, uno por rebanada, con el comando de verificación en el cuerpo. Sin
   `Co-Authored-By` ni atribución a IA.
6. Código, comentarios, mensajes de commit y textos de UI: igual que el código vecino (la UI está en español).
7. Si una spec es ambigua, **para y pregunta**: no decidas por la PO. Un archivo prohibido no es una spec ambigua: se
   resuelve con la sección «Si un archivo prohibido te bloquea» (anotar y seguir).

## Reporte al terminar cada rebanada

- Hash del commit y `git diff --stat` de la rebanada.
- Qué `S#` y qué criterios «Se acepta si» cubriste, con el nombre del test que prueba cada uno.
- Comandos corridos y su resultado real (incluye los que fallaron).
- Archivos fuera de la superficie que tocaste (debería ser ninguno).
- En la rebanada 2, además: los seis puntos del reporte de la migración.
- Riesgo: `Risk: item N (motivo)` o `Risk: none`.
