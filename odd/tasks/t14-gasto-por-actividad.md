# T14 — Gasto por actividad, factura distribuida y vistas financieras (carril B)

Rama `feat/t14-gasto-por-actividad`, base `220d544` (la punta de `origin/main` con T11 #183–#187 y T12 #182).
Bitácora de la rebanada: reportes, evidencia y decisiones. Specs textuales de la PO, sin reescribir.

## Specs

### S9. EV-05. Registro de gasto por objetivo, actividad y rubro, con facturas distribuidas

- «Orden del formulario: Objetivo (o “Gestión del proyecto”), Actividad y Rubro.»
- «El objetivo funciona solo como filtro: al elegir el objetivo 1, solo aparecen sus actividades. No se guarda como dato aparte; se deduce de la actividad.»
- «En Rubro solo aparecen los rubros presupuestados en la actividad elegida.»
- «Factura que cubre varias actividades: se registra una sola factura (un tercero, un número de documento, sus soportes) con varias líneas. El usuario indica en cada línea la actividad, el rubro y el valor que le corresponde. Ejemplo: factura de $1.000.000, actividad 1.2 por $350.000 y actividad 1.3 por $650.000.»
- «La suma de las líneas debe ser exactamente igual al total de la factura; si no, no se guarda. Propuesto: el IVA de cada línea se calcula en proporción a su subtotal y se puede corregir.»
- «El control de duplicados y la anulación se aplican a la factura completa.»
- «Plantilla de gastos: columna Código de actividad. Varias filas con el mismo tercero y el mismo número de documento se leen como una sola factura distribuida, no como duplicados, y deben sumar el total.»

**Se acepta si**

- «Al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2.»
- «La factura de $1.000.000 queda con $350.000 en la actividad 1.2 y $650.000 en la 1.3, y se puede consultar como un solo documento.»
- «Una distribución que suma $990.000 para una factura de $1.000.000 no se guarda.»

### S10. EV-06. Vistas financieras por actividad y por rubro

- «Selector “Por actividad / Por rubro” en Finanzas.»
- «Por actividad: agrupada por objetivo y por “Gestión del proyecto”. Por cada actividad: asignado, programado al corte, ejecutado, saldo o ahorro (EV-07) y semáforo. Al abrir una actividad se ve el detalle por rubro.»
- «Por rubro: la vista actual (curva S, tabla por periodo, semáforo). El valor de cada rubro es la suma de ese rubro en todas las actividades.»
- «El semáforo usa la misma regla de gasto óptimo en las dos vistas: ejecutado frente a lo programado al corte.»

**Se acepta si**

- «El ejecutado total es igual en las dos vistas.»
- «Un gasto registrado en la actividad 1.2 sube el ejecutado de esa actividad y el de su rubro.»

### S11. EV-07. Cierre de gastos de la actividad: saldo, ahorro o sobreejecución

- «Mientras la actividad tiene gastos abiertos, muestra saldo = asignado − ejecutado. No se llama ahorro, porque pueden faltar facturas.»
- «El Gestor marca “Cerrar gastos de la actividad” cuando ya no espera más facturas. Al cerrar, debe escribir una nota obligatoria que explique la diferencia (por ejemplo, “No se requirió transporte porque el taller fue en el mismo municipio”).»
- «Con los gastos cerrados, la actividad muestra ahorro (si sobró) o sobreejecución (si se gastó de más), con su nota.»
- «Una actividad con gastos cerrados no recibe gastos nuevos. Propuesto: el Gestor puede reabrirla con motivo, y queda en auditoría.»
- «El ahorro tiene dos destinos posibles: queda en la actividad como saldo disponible, o se traslada a otra actividad y a otro rubro (por ejemplo, ahorro de Transporte en la actividad 1.2 que pasa a Suministros en la actividad 2.1). El traslado lo solicita el Gestor y lo aprueba el Gerente (AJ-09).»

**Se acepta si**

- «Una actividad abierta con asignado $10.000.000 y ejecutado $7.000.000 muestra saldo $3.000.000.»
- «Un ahorro de $3.000.000 trasladado y aprobado reduce el disponible de la actividad de origen y aumenta el de la actividad y rubro de destino; el total del proyecto no cambia.»
- «Al cerrarla con nota, muestra ahorro $3.000.000 y la nota.»
- «No se puede cerrar sin nota; no se pueden registrar gastos en una actividad cerrada.»

## Tasks

| ID | Specs | Qué | Ruta | Estado | Commit |
|---|---|---|---|---|---|
| T14.1 | S9 | El formulario elige Objetivo → Actividad → Rubro y guarda el `linea_id` exacto (sin schema) | delegated (writer) | done | `466abb0` |
| T14.2A | S9 | Schema y migración del reparto (riesgo 1) con reporte de seis puntos | delegated (writer) | done | `45e98f7` |
| T14.2B | S9 | API y UI del reparto: suma = total, `DROP NOT NULL` y reescritura de lectores | pending | **espera la revisión de Claude** | — |
| T14.3 | S9 | Importación con «Código de actividad», agrupación por documento y umbral de duplicados en tres capas | inline | pending | — |
| T14.4 | S10 | Vistas por actividad / por rubro, fila «Sin actividad», costura única `loadGastosEjecutados` | inline | pending | — |
| T14.5 | S11 | Cierre de gastos de la actividad (solo con autorización explícita del humano) | inline | pending | — |

## Log

**L1** (2026-11-14, pedido del humano, verbatim):

> Trabajas en el carril B (T14, gasto por actividad) de MuttuHub CRM, en tu worktree /home/adrian/MuttuHub-CRM-deepseek.
>
> 1. Trae el prompt completo de tu tarea y síguelo al pie de la letra:
>
>    cd /home/adrian/MuttuHub-CRM-deepseek
>    git fetch origin
>    git show origin/main:odd/tasks/t14-deepseek-prompt.md 2>/dev/null \
>      || git show origin/feat/t13-programacion:odd/tasks/t14-deepseek-prompt.md
>
>    Lee todo lo que está debajo de la línea "---". Empieza por el "Paso 0".
>
> 2. El humano no está disponible hasta más tarde. Donde el prompt dice "cuando el humano te avise que entró #188",
>    compruébalo tú: antes de crear tu migración (rebanada 2), repite el Paso 0. Si "T13.1" ya está en origin/main,
>    haz `git merge origin/main` y después crea tu migración con fecha 20261115… o posterior.
>
> 3. Antes de commitear la migración de la rebanada 2, reporta los seis puntos en tu bitácora
>    (odd/tasks/t14-deepseek-prompt.md, rebanada 2) y sigue con la rebanada 4 mientras Claude la revisa.
>
> 4. No hagas push, PR ni merge a main. Commits locales en feat/t14-gasto-por-actividad, uno por rebanada.

**L2** (2026-11-14, aclaración del humano, verbatim): «quedamos en que claude iba a darte el trabajo, este es»

**L3** (2026-11-14) El prompt autoritativo es el de `origin/feat/t13-programacion:odd/tasks/t14-deepseek-prompt.md`
(214 líneas, con Paso 0 y el reparto de schema con Claude); el de `origin/main` todavía no existe. Se lee con `git
show` y se sigue tal cual.

**L4** (2026-11-14) **Paso 0: 0.** `git log origin/main --oneline -15 | grep -c "T13.1"` → `0`: PR #188 no entró. Se
arranca desde `origin/main` como autoriza el prompt; antes de crear la migración de la rebanada 2 se repite el chequeo
y, si ya entró, `git fetch origin && git merge origin/main` para que la migración de T14 quede después de la de Claude.

**L5** (2026-11-14) BASE = `220d544c9d70508ad24626643f01e1f5ed9b6aeb` (`git rev-parse HEAD` en
`feat/t14-gasto-por-actividad`).

**L6** (2026-11-14) Reporte de la rebanada 3: los seis puntos van **en esta bitácora**, no en el prompt (el pedido
menciona `odd/tasks/t14-deepseek-prompt.md`, que es el documento de Claude y no se toca).

---

### Rebanada 1 (T14.1) — cerrada

**L7** Commit `466abb0e8226a47c21a4482462fca4496142e69f` — `feat(gastos): choose the budget line by objective, activity
and rubro (S9, T14.1)`. `git diff --stat`: 14 archivos, **+627 / −30**. Todos dentro de la superficie permitida.

**L8** Cobertura de S9, con el test que la prueba:

| Spec / regla | Test |
|---|---|
| «Orden del formulario: Objetivo …, Actividad y Rubro.» | `no guarda nada hasta elegir objetivo, actividad y rubro, en ese orden (S9)` |
| «Al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2.» | `al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2 (S9)` |
| «Gestión del proyecto» (transversal sin objetivo) | `agrupa en «Gestión del proyecto» la actividad transversal, sin objetivo (S9)` |
| «En Rubro solo aparecen los rubros presupuestados en la actividad elegida.» | `la actividad elegida deja en Rubro solo los rubros presupuestados en ella (S9)`; `passes the budget lines to the form… (S9)` |
| «El objetivo funciona solo como filtro … no se guarda» | `un rubro presupuestado en dos actividades se ofrece en las dos y guarda su línea: … ` (el cuerpo no lleva `objetivo_id` ni `actividad_id`) |
| Línea exacta (rubro en dos actividades) | `… 1.1 · Talleres → linea_id l-a1-r12` y `… 2.1 · Ferias → linea_id l-a2-r12`; `saves the expense against the linea_id the form sends, pinned to the project and the rubro` |
| Línea ajena rechazada | `rejects a linea_id that is not a line of the project and the rubro, and writes nothing` |
| Compatibilidad del caller viejo (`rubro_id` solo) | `keeps accepting a body with only rubro_id (existing callers) and resolves that rubro's line`; `sin líneas del presupuesto mantiene el formulario por rubro de siempre` |
| Compatibilidad del PATCH | `keeps the expense on its own line when the correction re-sends the same rubro` (+ el preexistente de cambio de rubro) |

Pendiente para otras rebanadas: factura distribuida y suma = total (T14.2), importación (T14.3) y los criterios «La
factura de $1.000.000…» y «Una distribución que suma $990.000…».

**L9** Comandos y resultado real (verificación propia del orquestador sobre el árbol, no solo el reporte del worker):
`npx tsc --noEmit` → exit 0; `npx eslint` de los 14 archivos → exit 0; `npx knip` → exit 0 (solo los dos avisos
preexistentes de configuración); `npx vitest run src/lib/api/gastos src/components/proyectos/gasto-form
src/components/proyectos/project-gastos src/components/proyectos/a11y-guards
src/components/proyectos/ficha/registrar-gasto-dialog --no-file-parallelism` → **5 archivos, 139 tests en verde**. El
worker reportó además 191 tests en el árbol de `expenses` y 581 en los 33 archivos afectados.

**L10** Riesgo: **`Risk: none`**. Se agrega un campo **opcional** `linea_id` al POST (agregar un campo opcional no es
cambio de contrato) y `rubro_id` sigue obligatorio; no hay migración ni dato tocado, ni seguridad, ni concurrencia, ni
entrega. Tres reservas que no alcanzan la definición de riesgo alto y quedan anotadas: (a) el filtro por objetivo
lee `GET …/activities` y `GET …/objectives` desde el formulario, y si fallan degrada la etiqueta pero no la grabación;
(b) el modo corrección no tiene cascada porque la vista del gasto no trae `linea_id`, así que corregir el rubro a uno
con varias líneas sigue resolviendo por rubro; (c) `lineas` es opcional, así que un punto de montaje futuro que lo
omita cae al formulario viejo sin cascada (los tres puntos actuales lo pasan).

**L11** Tamaño de la rebanada: 657 líneas de autoría (incluye tests) contra la guía de ~400. Se deja como **un solo
commit** porque es un único comportamiento con sus tests y separarlos pondría los tests lejos de lo que prueban; se
anota aquí el límite para que la revisión sepa qué mirar. Para T14.2 se parte en dos commits: primero el schema y la
migración (con su reporte de seis puntos), después la API y la UI del reparto.

---

### Rebanada 2-A (T14.2-A) — schema y migración

**L12** Paso 0 repetido antes de escribir la migración: **dio 1**. El PR #188 (`f1789f5`, T13.1–T13.3) entró a main; se
mergeó `origin/main` en la rama sin conflictos y ya está `20261114180000_t13_programacion_confirmada`. Mi migración va
con fecha `20261115…` y no toco los modelos `Proyecto` ni `Usuario`.

**L13** Base descartable en `55433` (`muttu-t14-db`): todas las migraciones aplicadas y `npx vitest run prisma` con 34
archivos / 252 tests en verde antes de tocar nada. El `55432` sigue siendo del Paso 0.

**L14** **Decisión sobre `Gasto.linea_id`** (reportada por el worker como contradicción real): dejarlo nullable exige que
`Gasto.linea` pase a `LineaPresupuestal?`, y eso rompe `tsc` en siete accesos no nulos de cuatro archivos
(`src/lib/api/financiera.ts:36-37`, `src/lib/api/gastos.ts:450,607`, `src/app/api/v1/projects/[id]/expenses/[expenseId]/route.ts:122,129`,
`src/lib/api/modificaciones.ts:165`). Como los lectores de `gasto.linea` se reescriben igual en la 2-B —ahí el ejecutado
pasa a salir del reparto—, **la nulabilidad se difiere a la 2-B** y esta rebanada mantiene `linea_id` NOT NULL. Razones:
la migración de esta rebanada no cambia el contrato de nadie, `tsc` sigue en verde y la 2-B arrastra el `DROP NOT NULL`
junto con la reescritura de lectores que de todos modos tiene que hacer. Costo aceptado: dos migraciones sobre la misma
columna, la segunda trivial (ensanchar la restricción, sin datos).

**L15** Consecuencia anotada para la 2-B: al soltar NOT NULL hay que tocar `src/lib/api/modificaciones.ts`, que **no**
está en la lista de prohibidos pero tampoco en mi superficie; es del área de T13. Antes de la 2-B se avisa a Claude para
que no haya dos manos en ese archivo.

**L16** Commit `45e98f754a9bb3790b2b7780dc28220ed55532f7` — `feat(prisma): distribute an invoice across budget lines with
gastos_reparto (S9, T14.2a)`. La migración es **puramente aditiva**: crea `gastos_reparto`
(uuid, `proyecto_id`, `gasto_id`, `linea_id`, `valor DECIMAL(15,2)`, timestamps, cascada desde `Gasto`, dos FKs
compuestas al par `(id, proyecto_id)`, CHECK `valor > 0`, tres índices) y backfillea **una** fila por cada gasto
existente con su `linea_id` y su `monto_cop`. No hay un solo `ALTER TABLE "gastos"`. Vuelta atrás: `DROP TABLE
"gastos_reparto"` + sacar el directorio de la migración; no se pierde nada que no se pueda reconstruir desde la
cabecera.

**L17** Reporte de seis puntos, medido sobre el fixture insertado **antes** de la migración (proyecto con actividades
1.2 y 1.3, un rubro presupuestado en las dos, y gastos en REGISTRADO ×3, VALIDADO, RECHAZADO y ANULADO):

1. SQL completo: en `prisma/migrations/20261115120000_t14_gasto_reparto/migration.sql`.
2. Conteos antes → después: `gastos` 6 → 6, `gastos_reparto` (tabla nueva) 0 → 6, `lineas_presupuestales` 3 → 3.
3. Suma del ejecutado (REGISTRADO + VALIDADO) antes = después = **1.064.000,00**; total de todos los gastos
   1.383.000,00 → 1.383.000,00; y la suma de todos los repartos = 1.383.000,00.
4. `sin_reparto = 0` · `suma_no_cuadra = 0` · `linea_distinta = 0` · `fuera_del_proyecto = 0` · `huerfanas = 0`;
   factura por factura la suma de sus repartos es exactamente su `monto_cop`.
5. Nada más cambió: hash de fila completa sobre todas las columnas de `gastos` idéntico antes y después
   (`md5 = 42a39fdc83efa1a1fb5d346e2549a937`) y `gastos.linea_id` sigue `NOT NULL` en `information_schema`.
6. Vuelta atrás: ver L16.

**L18** Verificación propia del orquestador (no solo el reporte del worker): `npx tsc --noEmit` exit 0; `npx vitest run
prisma --no-file-parallelism` → **35 archivos / 259 tests** en verde (la base era 34/252 más el archivo nuevo);
auditoría SQL directa sobre la base → 6 gastos, `sin_reparto: 0`, `desalineados: 0`, `una_fila_otra_linea: 0`. Los
números globales (`ejecutado 1.064.000,00` contra `repartido 1.383.000,00`) son correctos y no un descuadre: el
ejecutado cuenta solo REGISTRADO+VALIDADO, el repartido suma también RECHAZADO y ANULADO.

**L19** Riesgo: **`Risk: item 1`** (datos existentes) y **probado**, no declarado: hash idéntico, suma idéntica y el
backfill verificado factura por factura sobre la base descartable. La migración no borra ni reescribe la tabla de
gastos. Deudas anotadas que **no** introduce esta rebanada: (a) existe un drift previo de T10 —
`lineas_presupuestales_actividad_id_idx` se crea en SQL y no está declarado en el schema, así que Prisma propone
borrarlo; se quitó esa sentencia de esta migración y hay que declarar `@@index([actividad_id])` para cerrarlo; (b) el
worker se desvió con razón de mi brief en `Decimal(15,2)`/`uuid()`, que es la convención real del repo.

**L20** **Alto:** la rebanada 3 no arranca hasta que Claude revise esta migración, como manda el prompt. La 2-B
(API y UI del reparto, con el `DROP NOT NULL` y la reescritura de lectores) también espera esa revisión.
