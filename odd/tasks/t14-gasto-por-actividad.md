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
| T14.2B | S9 | API y UI del reparto: suma = total, `DROP NOT NULL` y reescritura de lectores | delegated (writer) | en curso | — |
| T14.3 | S9 | Importación con «Código de actividad», agrupación por documento y umbral de duplicados en tres capas | inline | pending | — |
| T14.4A | S10 | Vistas por actividad, lado servidor: costura con `actividadId` y `actividades` con detalle por rubro | delegated (writer) | done | `1a9c4fa` |
| T14.4B | S10 | Selector «Por actividad / Por rubro» en Finanzas y árbol de detalle | delegated (writer) | done | `1f85a18` |
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

---

### Rebanada 4-A (T14.4-A) — vistas por actividad, lado servidor

**L21** El prompt autoriza avanzar la rebanada 4 mientras Claude revisa la migración («no te quedes parado»), sobre el
modelo de la rebanada 1 y sin depender del reparto. Costura única respetada: `loadGastosEjecutados` pasa a llevar
`actividadId` y el bloque por actividad se arma llamando al `computeFicha` puro **por actividad** sobre sus líneas, sin
tocar `ficha-financiera.ts` ni duplicar un umbral de semáforo.

**L22** Ampliación de superficie aprobada por mí, con motivo (el worker frenó en vez de cruzarla):
`src/lib/openapi/paths/project-budget.ts` (ahí vive `FinancialSheetSchema`, no en el de baseline que figuraba en el
brief), `prisma/gastos.invariant.test.ts` (dos filas esperadas necesitan `actividadId`),
`src/app/api/v1/projects/[id]/export/route.test.ts` (su stub necesita `actividades: []` o `tsc` rompe) y
`src/lib/api/atencion.test.ts` (para que `actividadId` sea **obligatorio y nullable** en vez de opcional: un
`undefined` silencioso es peor contrato). En `project-budget.ts` el alcance queda limitado al schema y la descripción
de la hoja financiera: el path de presupuesto es del carril A y no se toca. Aviso para Claude: ese archivo lo tocamos
después de que T13 cerró, así que no debería haber solapamiento.

**L23** Limitación aceptada en esta rebanada: el bloque por actividad lee siempre el presupuesto vigente, así que
`?base=original` solo cambia las filas por rubro y el total. La foto v0 no registra de qué línea salió cada peso, y
arreglarlo pediría un campo nuevo en el snapshot, fuera de esta rebanada. Queda documentado en el código, en la
cabecera de la ruta y fijado por un test, no como bug latente.

**L24** Riesgo del orden en que se cerró esto: la 4-A es aditiva sobre el payload (`actividades` como campo nuevo) y
el payload por rubro más los totales quedan intactos, con un test de regresión que lo fija. El criterio «El ejecutado
total es igual en las dos vistas» es estructural: las dos vistas leen las mismas filas de la única costura.

**L25** Commit `1a9c4fae8ac728e683c1908be2f1ea113f04f3bb` — `feat(finanzas): publish the per-activity view next to the
per-rubro one (S10, T14.4a)`. 11 archivos, +660 / −32 (unas 340 líneas son tests).

**L26** Hueco que encontré antes de commitear y mandé cerrar: la primera entrega armaba cada actividad como **una
fila sintética** (todos sus rubros fusionados), y S10 pide «Al abrir una actividad se ve el detalle por rubro». Ahora
`filasPorActividad` corre `computeFicha` **una vez por grupo con los rubros reales** de la actividad; la fila de la
actividad es `fila.total` y los hijos son `fila.rubros`, ambos del mismo cálculo, así que «la actividad es la suma de
sus hijos» no puede cumplirse por casualidad. El test que lo protege comparte el rubro R12 entre las actividades 1.2 y
1.3: si las filas se indexaran por rubro, se cruzarían y falla.

**L27** Cobertura de S10 con sus tests: «El ejecutado total es igual en las dos vistas» →
`el ejecutado total es igual en las dos vistas (S10)` (lib y ruta); «Un gasto registrado en la actividad 1.2 sube el
ejecutado de esa actividad y el de su rubro» → `un gasto registrado en la actividad 1.2 sube el ejecutado de esa
actividad y el de su rubro (S10)`; detalle al abrir → `una actividad con dos rubros publica su detalle y los hijos suman
exactamente la fila de la actividad (S10)` y `cada actividad publica su detalle por rubro (S10)`; agrupación y
«Gestión del proyecto» → `agrupa en «Gestión del proyecto» la transversal y la fila «Sin actividad» (S10, D4)`;
«Sin actividad» con sus propios rubros → `«Sin actividad» detalla los rubros de sus propias líneas (S10, D4)`; no
fuga entre actividades → `350.000 en la actividad 1.2 y 650.000 en la 1.3 no se cruzan en los hijos (S10)`; asignado y
programado por actividad → `el asignado y el programado al corte de una actividad son la suma de sus líneas (S10)`;
regresión del nivel superior → `mantiene intactos el payload por rubro y los totales (regresión S5)`.

**L28** Verificación propia: `npx tsc --noEmit` 0, `npx knip` 0, `npx eslint` de los 11 archivos 0, **41 tests** en
`financiera` + `financial-sheet` + la ruta, **259 tests** en `prisma` (la costura no rompió invariantes) y **99 tests**
en los consumidores (`atencion`, `curva`, `openapi`, export, `project-financiero`). Riesgo: **`Risk: none`** — campo
aditivo, sin dato, seguridad, concurrencia ni entrega: el payload por rubro y los totales siguen intactos y el
OpenAPI de `/budget` no se tocó. Tamaño: 660 líneas de autoría en un commit, otra vez sobre la guía; se deja junto
porque es un solo comportamiento con sus tests y el límite se anota para la revisión.

---

### Rebanada 4-B (T14.4-B) — selector de vistas en Finanzas

**L29** Commit `1f85a18310ea5091799a94ae2e0edf7000267d6d` — `feat(finanzas): pick the per-activity or the per-rubro view
(S10, T14.4b)`. Cinco archivos: `ficha-finanzas.tsx` (solo el swap del Resumen), dos componentes nuevos
(`vistas-financieras.tsx` 68 líneas, `por-actividad.tsx` 254) y su test (584).

**L30** Cobertura con sus tests: (a) ida y vuelta del selector y vista por rubro intacta →
`cambia a «Por actividad» y vuelve a «Por rubro» montando solo la vista activa (S10)`,
`abre en «Por rubro» con la tabla por rubro, su disponible y su semáforo (S10)`; (b) criterio de igualdad →
`es igual en las dos vistas porque sale del mismo payload (S10)` y `pinta el total, los colores y los umbrales que
manda el servidor, sin recalcularlos (S10)`; (c) agrupación → `agrupa por objetivo y deja «Gestión del proyecto» al
final, con su fila «Sin actividad» (S10)` y `no inventa «Gestión del proyecto» cuando el payload no trae filas
transversales (S10)`; (d) detalle → `abre una actividad y muestra sus rubros con los montos del payload (S10)` y
`el detalle no se mezcla entre actividades: cada una abre solo sus rubros (S10)`; (e) BORRADOR →
`no pinta color ni porcentajes: los dos llegan nulos y la UI no los inventa (S10)`; (f) accesibilidad →
`es un grupo etiquetado, con las dos opciones, y anuncia la vista elegida (S10)`.

**L31** Verificación propia: `npx tsc --noEmit` 0, `npx eslint` 0, `npx knip` 0, **189 tests** en `ficha` + `a11y-guards`
y **1087 tests** en todo `src/components/proyectos` (79 archivos). Riesgo: **`Risk: none`** — no toca datos, seguridad,
contratos ni concurrencia; el único cambio sobre una pantalla existente es el hijo del segmento Resumen, y la vista por
rubro queda fijada por un test que la pinta completa.

**L32** Deuda visible que deja esta rebanada, para decidir en la revisión (ninguna rompe S10 hoy):

1. **Corte y base:** `por-actividad.tsx:52` consulta con `corte = null` y `base = "vigente"` fijo, porque los
   controles viven en `src/components/proyectos/project-financiero.tsx` —el path real; el del brief,
   `src/components/proyectos/ficha/project-financiero.tsx`, no existe— y está fuera de la superficie. Mientras no haya
   corte elegible desde Finanzas el criterio se cumple; el día que lo haya, esta vista tiene que tomar el mismo corte
   o «el ejecutado total es igual en las dos vistas» deja de ser estructural.
2. **Móvil:** usa tabla con scroll horizontal en vez del patrón de tarjetas que sí tiene la vista por rubro. S10 no lo
   pide, pero es una inconsistencia con el vecino.
3. **Nombre del objetivo:** el payload trae `objetivo_codigo` pero no su descripción, así que el título dice
   «Objetivo 1» y no «Objetivo 1. Ferias» como en Actividades. Se arregla en la UI con `useProjectObjectives`; no
   necesita servidor.

---

### Revisión de la migración y arranque de la 2-B

**L33** Merge de `origin/main` con T13 completo (#189–#194, 56 archivos): **sin un solo conflicto**. Merge en
`e783ccb`. Con el merge llega `odd/tasks/t14-revision-migracion.md`, la revisión de Claude.

**L34** **Revisión: APROBADA, sin bloqueantes.** La comprobó sobre su propia base `ci_t14` armada en el orden del CI:
md5 idéntico de `gastos` y `lineas_presupuestales`, 5 gastos → 5 repartos, $34.265.000,00 = suma de repartos, 0
facturas que no cuadran, CHECK presente, y vuelta atrás probada en una transacción con rollback. Dos avisos, ninguno
bloqueante: (1) la suma = total la tiene que garantizar el servidor en 2-B, con un test por caso de S9; si quiero,
un constraint trigger diferido la garantiza también en la base; (2) choque de carril a avisar: las tres comprobaciones
de «esta línea ya tiene gastos» del carril A cuentan `gastos.linea_id`, y una línea podrá tener gastos solo por un
reparto (los archivos del carril A no se tocan; Claude los ajusta cuando esta rama entre).

**L35** Dos decisiones que tomo yo y que cambio de rumbo respecto del plan de 2-A:

1. **`gastos.linea_id` se queda NOT NULL, para siempre, y significa «la línea del primer reparto».** Con esa regla
   una factura repartida nunca deja la columna nula, así que **no hace falta el `DROP NOT NULL`** que habíamos
   diferido: desaparecen de golpe la relación opcional y los siete accesos que rompían `tsc`, incluido
   `src/lib/api/modificaciones.ts`, que era la decisión pendiente y ya no hace falta tocar. La nulabilidad deja de
   ser deuda.
2. **Sin constraint trigger diferido en la base.** La regla «la suma de los repartos es exactamente el total» se
   garantiza en el servidor, en la única ruta que escribe facturas, con un test por caso de S9. Un trigger diferido
   obliga a manejar el borrado en cascada y la escritura masiva de la importación con excepciones, y hoy no hay un
   segundo escritor que lo justifique. Si T14.3 introduce otro, se añade con su propia migración.

Las dos van en el reporte de 2-B para que Claude ajuste el ejecutado y «la línea tiene gastos».

**L36** Resultado del post-merge, medido por mí: `npx prisma generate` sin cambios de cliente inesperados, `npx tsc
--noEmit` **exit 0**, `npx prisma migrate deploy` → `47 migrations found`, `No pending migrations to apply`, y `npx
vitest run prisma --no-file-parallelism` → **37 archivos / 275 tests** en verde sobre `localhost:55433`. El árbol de T13
quedó incorporado sin una sola intervención manual.

---

### Rebanada 2-B1 (T14.2-B1) — la factura distribuida en el servidor

**L37** Commit `f649a65891dc485c146c24f9af1c4800b364211d` — `feat(gastos): record a distributed invoice on the server
(S9, T14.2b1)`. 10 archivos, +1191 / −61. Contrato: `POST`/`PATCH` aceptan `repartos?: [{ linea_id, valor }]`
(min 1), **exclusivo** con `rubro_id`/`linea_id`; la suma se compara en centavos contra el total (subtotal + IVA); cada
línea debe ser del proyecto y con valor asignado; cabecera y filas en una sola transacción; `gastos.linea_id` = la
línea del primer reparto. Sin `repartos` el gasto recibe **una** fila con su total, así que los llamadores viejos
siguen igual y toda factura suma.

**L38** **Lo que Claude necesita** (su aviso 2 de la revisión): «`gastos.linea_id` de una factura repartida = la línea
del primer reparto, el primero que envió el cliente; la columna se queda NOT NULL para siempre y todo gasto creado por
la API tiene al menos una fila en `gastos_reparto` —una sola con el total cuando el cuerpo no trae `repartos`—, así
que las tres comprobaciones del carril A tienen que contar `gastos_reparto` cuando esta rama entre.»

**L39** Cobertura con sus tests: criterio del $990.000 → `evaluarRepartos > does not save a distribution of 990.000 for a
1.000.000 invoice (S9)`, `POST … > does not save a distribution of 990.000 … and writes nothing (S9)`, `PATCH … >
rejects a distribution that does not sum the new total and writes nothing (S9)`; criterio de los $350.000/$650.000 →
`saves 350.000 on activity 1.2 and 650.000 on 1.3 as one invoice, header on the first row's line (S9)` y `GET expenses
> shows a distributed invoice as one document with its two rows (S9)`; mezcla rubro+repartos rechazada sin escribir;
línea ajena o sin asignado rechazada sin escribir; cuerpo viejo sin `repartos` intacto (y sus 41 tests de POST y 29 de
PATCH previos siguen verdes); ejecutado por fila → `loadGastosEjecutados > attributes each row to its own line: 350.000
on 1.2 and 650.000 on 1.3, never 1.000.000 on the header's line (S9)` más el de regresión de la factura de una fila;
duplicados → `keeps the duplicate control on the invoice, not on its rows (S9)`; sobregasto por fila → `checks the
overspend against each row's own line and assigned amount (S9)`.

**L40** Verificación propia: `tsc` 0, **244 tests** en las suites del reparto (13 archivos), **75** en los consumidores
de la costura, **275** invariantes, y `knip`/`eslint` limpios. El worker corrió además una **prueba diferencial** contra
el árbol base (`git archive` en un temporal): 8 archivos / 145 tests idénticos a los dos lados — sin diferencia no
pedida en endpoints hermanos ni en el documento OpenAPI. El temporal se borró.

**L41** Riesgo: **`Risk: none`** con dos huecos nombrados, ninguno corregible en esta rebanada:

1. **Aviso de sobregasto.** La *comprobación* por fila está hecha, pero la aritmética previa del aviso
   (`superaAsignado`, `nivelSobregasto`, `cargarSobregastos` de la importación) sigue agregando `gastos.linea_id` y
   `monto_cop`, así que una línea que solo recibe dinero por una fila posterior de una factura repartida no lo cuenta
   para el aviso. La ficha financiera sí lo cuenta. **Requisito para 2-B2:** antes de que la pantalla permita repartir,
   el aviso tiene que agregar los repartos; si no, el hueco se vuelve visible al usuario.
2. **Invariante global vs. semillas.** `prisma/gasto-reparto.invariant.test.ts` audita `sinReparto = 0` sobre toda la
tabla, y la importación y los seeds escriben gastos sin filas. Comprobé en `.github/workflows/ci.yml` que el job de
   invariantes (línea 74) **no** siembra —las semillas viven en el job de Playwright, línea 138— así que CI no falla
   hoy. Cuando T14.3 escriba repartos en esos caminos hay que restaurar la auditoría estricta (tarea aparte).

---

### Rebanada 2-B2 (T14.2-B2) — la factura distribuida en pantalla y el aviso arreglado

**L42** Commit `16fb500561e9922d62f29a517d1c6590e27d8b6b` — `feat(gastos): split an invoice on screen and count it in
the alert (S9, T14.2b2)`. Cierra el hueco 1 de L41 **antes** de que la pantalla permita repartir: `ejecutadoDeLinea`
(`src/lib/api/gastos.ts:453`) suma las filas del reparto de la línea más las cabeceras **sin** filas
(`repartos: { none: {} }`), las dos filtradas por periodo y por la exclusión de la fila que se corrige; `superaAsignado`,
`nivelSobregasto` y `cargarSobregastos` usan esa función. Sin eso, una línea que solo recibe dinero por una fila
posterior de una factura repartida era invisible para el aviso.

**L43** Pantalla: el formulario gana líneas de distribución (Objetivo → Actividad → Rubro + Valor por línea, la misma
`cascadaDeGasto`), indicador «Suma de la distribución … de …» con «Faltan/Sobran …» comparado en centavos, rechazo con
el texto del servidor y cuerpo `repartos` solo desde dos filas; la corrección de una factura repartida muestra sus filas
bajo la misma regla; la lista marca «Distribuida en N líneas · total» sin convertir una factura en varias entradas; y
sin `lineas` cargadas la corrección de una repartida se **niega** con el mensaje del servidor y no escribe (test
`se niega a corregir una factura repartida mientras el presupuesto no trae sus líneas (S9)`).

**L44** Ampliación de superficie aprobada por mí, con medida exacta: los dobles de `$transaction` de cuatro tests bajo
`src/app/api/v1/projects/[id]/expenses/` (`route.test.ts`, `[expenseId]/route.test.ts`, `import/route.test.ts`,
`import/route.rules.test.ts`) no conocían el modelo `gastoReparto`, y sin ellos la rama entraba con **73 tests rojos**
(base: 4 archivos / 126 verdes). Se autorizó **solo** el doble, con valores por defecto vacíos que conservan los números
actuales; ni un archivo de producción bajo `src/app/api/**` cambió. Se cambió **una** expectativa, con motivo:
`route.test.ts` («flags the critical overspend alert…») lleva ahora `repartos: { none: {} }` en el `where` esperado
porque la consulta de cabeceras excluye los gastos con reparto — es comportamiento, no forma del doble, y ningún importe
cambió.

**L45** Riesgo: **`Risk: none`**. Cobertura: el criterio del $990.000 desde el formulario (indicador + rechazo) y la
factura 1.2/1.3 como un solo documento en formulario y lista; cuerpo viejo de una fila sin cambios; aviso por fila con
test propio (`gastos.test.ts`: 350.000 en 1.2 y 650.000 en 1.3). Verificación propia: `tsc` 0, `eslint` 0, `knip` 0,
**206 tests** en el árbol de `expenses`, **160** en las suites de UI y alerta, **275** invariantes. Tamaño: 857 líneas
insertadas en 10 archivos, sobre la guía; el reparto ya venía de 2-B1 y el límite se anota para la revisión.
