# Plan de trabajo — viernes 2026-11-13 · dos agentes (claude + deepseek)

Estado de partida: `T10` (modelo y claves de la Parte 2) está **terminado y commiteado local, sin pushear**
(`49f28ef`, `545ee2f`). La Parte 1 del PO está cerrada salvo una mirada manual a AJ-07. Lo que queda de la Parte 2 es
`T11` a `T15`, más `T7` de la Parte 1.

## 1. Cómo se reparte, y por qué no «Claude hace más»

El límite con dos agentes en el mismo repo no es cuánto trabajan sino **cuántos archivos comparten**. Mirando las
rebanadas que quedan:

| Rebanada | Archivos que toca | Choca con |
|---|---|---|
| `T11` presupuesto por actividad | `budget/route.ts`, `programming/route.ts`, `presupuesto.ts`, `plantilla/*`, pantalla de presupuesto | `T12` (plantilla), `T13` (programación) |
| `T12` actividad Transversal | `schema.prisma` + migración, tipo de actividad, `avance.ts`, `curva.ts`, `atencion.ts`, UI de actividades, `plantilla/*` | `T11` (plantilla) |
| `T13` programación y reprogramación | `modificaciones.ts`, `programming/*`, pantallas | `T11` |
| `T14` gasto por actividad y vistas | `gastos*`, `financiera.ts`, `financial-sheet.ts`, `gastos-import/*` | `T7` |
| `T15` cierre y CedeTextil | `presupuesto-po/*`, scripts de datos | `T14` |
| `T7` resumen del periodo | `financial-sheet.ts`, ficha | `T11`, `T14` |

Conclusión: **sólo hay un par de carriles que no se pisan hoy**. El reparto correcto es por acoplamiento y no por
volumen:

- **Carril A — claude: `T11` completo.** Es la ruta crítica: todo lo demás depende de que el presupuesto por actividad
  exista en la API, la pantalla y la plantilla. Necesita el contexto de `T9`/`T10` y criterio de producto. Que haga
  «más» es consecuencia de eso, no un objetivo.
- **Carril B — deepseek: `T12` sin su columna de plantilla.** El tipo de actividad y su exclusión del avance técnico
  tocan `avance`/`curva`/`atencion`, archivos que `A` no abre. La columna «Tipo» de la hoja Actividades queda para `A`,
  porque ese módulo es suyo.
- **`T7`, `T13`, `T14`, `T15`: no hoy.** `T7` y `T14` se pelean por la ficha financiera; `T13` y `T15` dependen de `T11`.

## 2. Paso 0 — bloqueante, antes de que arranque nadie

`T10` no está en `origin`, así que ningún agente lo tiene. Orden exacto:

1. Pushear la rama `feat/t10-modelo-y-claves` (2 commits pendientes) y abrir su PR.
2. Revisar y mergear los tres PRs que ya están listos: **#178** (diseño de la Parte 2), **#179** (las cinco preguntas a
   la PO), **#165** (ver si sigue vigente o se cierra).
3. Mergear el PR de `T10` en `main`.
4. Recién entonces los dos agentes parten de `main` limpio, en ramas propias.

Si `T10` no se mergea, los dos carriles trabajan sobre un modelo que sólo existe en una rama: no lo hagan.

## 3. Carril A — claude · `T11` presupuesto por actividad (`S5`)

**Spec:** `odd/tasks/po-2026-11-10-proyectos.md`, `T11`, `S5`. Diseño: `odd/tasks/po-2026-11-10-parte-2-diseno.md`.
Decisiones cerradas: `D6`–`D10` (una actividad puede tener varios rubros; el asignado se controla por renglón; la factura
se reparte; gastos viejos «sin actividad»; programación por días).

**Qué tiene que quedar, según el PO:**
- Cada línea del presupuesto es una combinación **actividad + rubro + valor**, y una actividad puede tener uno o varios
  rubros.
- El asignado por rubro y el valor total **se calculan sumando las líneas**, no se digitan.
- Plantilla, hoja Presupuesto: columnas **Código de actividad, Rubro, Valor**; una fila por combinación. Se elimina la
  hoja de Programación mensual (la reemplaza `T13`).
- Validaciones: la actividad existe, el rubro está activo y **no se repite la misma combinación actividad + rubro**.
- Se acepta si: una actividad con Formación $15.000.000 y Transporte $8.000.000 aparece con las dos líneas y esos
  valores suman en sus rubros; y una plantilla con la misma actividad y rubro en dos filas se rechaza con fila y columna.

**Superficie de edición (suya y de nadie más):** `src/app/api/v1/projects/[id]/budget/**`,
`src/app/api/v1/projects/[id]/programming/**`, `src/lib/api/presupuesto.ts`, `src/lib/api/plantilla-import.ts`,
`src/lib/proyectos/plantilla/**`, `src/lib/proyectos/presupuesto-po/**`, la pantalla de presupuesto en
`src/components/proyectos/**` y sus tests.

**Prohibido:** `prisma/schema.prisma` y `prisma/migrations/**` (son de `B` hoy), `src/lib/api/avance*`, `curva*`,
`atencion*` (de `B`), `src/lib/api/gastos*` y `financial-sheet*` (de `T14`).

**Cómo saber que está bien:** `npx vitest run src/lib/api/presupuesto.test.ts src/lib/api/plantilla-import.test.ts
src/lib/proyectos/plantilla "src/app/api/v1/projects/[id]/budget"`, más `npx tsc --noEmit` y `npm run lint`. Los dos
casos de los tests de presupuesto que hoy son trampa ya están reescritos por `T10`: si vuelven a pasar a la forma vieja,
algo se rompió.

## 4. Carril B — deepseek · `T12` actividad Transversal (`S6`), sin plantilla

**Spec:** `odd/tasks/po-2026-11-10-proyectos.md`, `T12`, `S6`.

**Qué tiene que quedar:**
- Las actividades tienen un **tipo: Normal o Transversal** (columna nueva + migración).
- Las transversales se agrupan en **«Gestión del proyecto»**, un grupo aparte de los objetivos.
- Una transversal **no requiere entregables** y **no entra** en el avance técnico, la curva S técnica ni el
  cumplimiento del cronograma.
- **Sí entra** en presupuesto, programación, registro de gastos y vistas financieras.
- Se acepta si: un proyecto con una transversal de 17 semanas tiene **el mismo avance técnico** que sin ella, y la
  transversal aparece en «Gestión del proyecto» y se puede elegir al registrar gastos.

**Superficie de edición (suya y de nadie más):** `prisma/schema.prisma`, `prisma/migrations/**`,
`src/lib/proyectos/avance.ts`, `src/lib/proyectos/curva.ts`, `src/lib/api/curva.ts`, `src/lib/api/atencion.ts`,
`src/lib/proyectos/actividad.ts`, la UI de actividades y sus tests, y `scripts/` si hace falta un backfill.

**Prohibido:** todo `src/lib/proyectos/plantilla/**` y `plantilla-import.ts` (la columna «Tipo» la agrega `A` después),
`presupuesto*.ts`, `budget/route.ts`, `programming/route.ts`, `gastos*`, `financial-sheet*`.

**Regla de migración:** es riesgo 1. Ensayar antes de commitear, sobre la base descartable:
`docker start muttu-t10-db` y `DATABASE_URL=postgresql://supabase_admin:t10local@localhost:55432/muttu?schema=public npx prisma migrate deploy`;
probar el tipo nuevo, revertir con el SQL inverso y volver a aplicar. Si la base no está, se levanta otra: **nunca
contra `.env`**, que es la instancia compartida.

## 5. Reglas de convivencia (las dos)

1. **Un dueño por archivo.** Si necesitás tocar un archivo de la otra superficie, pará y avisá; no lo edites.
2. **Rama propia por carril**, commits por unidad de trabajo (código + tests + docs juntos), sin `push` ni PR: los
   revisa el humano.
3. **Tests primero** donde hay comportamiento nuevo, y el comando de verificación en el mensaje del commit.
4. **`prisma generate` después de tocar el schema**, antes de creerle a `tsc`. Ya nos mordió dos veces.
5. **No re-decidir** lo que ya está en el plan: `D1`–`D10` y los criterios textuales del PO mandan sobre la opinión del
   agente. Si un criterio y una recomendación chocan, gana el criterio.
6. **Al terminar cada carril:** informe con archivos tocados, comandos corridos con su salida y qué criterio del PO
   cubre cada test nuevo.

## 6. Secuencia del día

| Momento | Quién | Qué |
|---|---|---|
| Paso 0 | humano + yo | pushear `T10`, revisar y mergear #178, #179, #165 y el PR de `T10` |
| Mañana | los dos, en paralelo | `A`: presupuesto por actividad. `B`: tipo transversal + exclusión del técnico |
| Mediodía | yo | revisar los dos carriles: superficies respetadas, migración de `B` ensayada, criterios cubiertos |
| Tarde | `A` | pantalla y plantilla de presupuesto; si sobra, la columna «Tipo» que `B` dejó para `A` |
| Cierre | humano | revisar los dos PRs; decidir `T13` y `T14` para la próxima |

## 7. Lo que este plan deja fuera, a propósito

- **`T7`** (resumen del periodo): toca la ficha financiera, que `T11` y `T14` van a mover. Hacerlo hoy es trabajo para
  tirar.
- **`T13`** (programación propuesta y reprogramación): depende de la pantalla de presupuesto que `A` está construyendo.
- **`T14`** (gasto por actividad y factura distribuida): depende de `T11`; además redefine el umbral de duplicados de
  `T5` y merece su propio día.
- **`T15`** (cierre y CedeTextil): toca datos de producción. No entra en un día con dos agentes apurados.
