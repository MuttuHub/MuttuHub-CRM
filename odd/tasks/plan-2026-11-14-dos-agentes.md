# Plan de trabajo — 2026-11-14 · dos agentes (claude + deepseek)

Estado de partida: `T11` (presupuesto por actividad) está **terminado y commiteado local, sin pushear**, en cinco ramas
encadenadas (`odd/tasks/t11-presupuesto-por-actividad.md`, Log L11). `T12` (actividad Transversal) está commiteado en
`feat/t12-actividad-transversal`, también sin pushear. Queda de la Parte 2: `T13`, `T14`, `T15`, más `T7` de la Parte 1.
Un verificador independiente revisaba `T11` al cierre del 2026-11-13: su veredicto se lee antes de mergear.

## 1. Paso 0 — bloqueante, antes de que arranque nadie (humano + claude)

1. **Levantar Docker Desktop** (el 2026-11-13 `/usr/bin/docker` daba «Input/output error» y la base descartable
   `muttu-t10-db`, puerto 55432, estaba caída).
2. **Correr las invariantes contra la base descartable** — nunca contra `.env`:
   `DATABASE_URL=postgresql://supabase_admin:t10local@localhost:55432/muttu?schema=public` y `DIRECT_URL` igual, luego
   `npx prisma migrate deploy` y `npx vitest run prisma --no-file-parallelism`. Lo que nunca corrió local:
   `plantilla-import.invariant` y `proyecto-create-flow.invariant` (editadas por `T11`), y la migración de `T12`.
3. **Leer el veredicto del verificador de `T11`** y corregir sus blockers en el commit de la rebanada que corresponda.
4. **Push, PRs y merge, en este orden** (estrategia elegida: encadenados a main, L7):
   1. `feat/t11-presupuesto-por-actividad` → main.
   2. `feat/t11-2-programacion-por-linea` (rebase sobre main) → main.
   3. `feat/t11-3-plantilla-por-linea` → main. Es riesgo 1: reimportar borra líneas y su programación.
   4. `feat/t11-6-valor-total-derivado` → main. Es riesgo 3: create, conversión y PATCH rechazan `valor_total`.
   5. `feat/t11-5-retirar-import-po` → main.
   6. `feat/t12-actividad-transversal` (rebase sobre main; trae migración) → main.

   Mergear con squash, como el repo; esperar CI verde (incluye las invariantes) en cada uno antes del siguiente.

Nadie arranca `T13` ni `T14` hasta que `T11` esté en main: los dos parten de su modelo.

## 2. Carril A — claude · `T13` programación propuesta y reprogramación, más los restos de `T11`/`T12`

**Spec:** `odd/tasks/po-2026-11-10-proyectos.md`, `T13`.

Por qué a `A`: `T13` vive sobre la programación por línea que `T11` acaba de construir (`programming/route.ts`,
`presupuesto.ts`, `presupuesto-programacion.tsx`) y sobre `modificaciones.ts`, que `T10`/`T11` ya conocen.

En orden:
1. **`T13`**: programación propuesta y reprogramación. Reemplaza la programación «a mano» que `T11` dejó como puente
   (S8 de `T11`).
2. **Restos de `T11` que caen en `T13`**: `modificacion-form.tsx:108` y `traslado-form.tsx:52` todavía leen las celdas
   por rubro; con dos líneas del mismo rubro toman la primera. El mensaje de la línea base
   (`ficha-financiera.ts:168`) nombra solo el rubro.
3. **Columna «Tipo» en la hoja Actividades de la plantilla** (la que `T12` dejó para `A`).
4. **Si sobra:** sacar «Valor total» de la hoja 2 de la plantilla (hoy se digita, la importación lo ignora y W-02 avisa).

**Superficie:** `src/lib/proyectos/modificaciones.ts`, `src/app/api/v1/projects/[id]/programming/**`,
`src/app/api/v1/projects/[id]/modifications/**`, `src/lib/api/presupuesto.ts`,
`src/components/proyectos/presupuesto-programacion.tsx`, `modificacion-form.tsx`, `traslado-form.tsx`,
`src/lib/proyectos/plantilla/**`, `src/lib/api/plantilla-import.ts`, sus tests, OpenAPI de presupuesto y
modificaciones, y la sección de presupuesto/programación de `src/hooks/projects.ts`.

## 3. Carril B — deepseek · `T14` gasto por actividad

**Spec:** `odd/tasks/po-2026-11-10-proyectos.md`, `T14`.

Por qué a `B`: después de `T11` un rubro puede tener varias líneas, y los gastos todavía eligen por rubro. Toca archivos
que `A` no abre.

**Qué arreglar primero** (visibles al usuario desde que un rubro tiene dos líneas):
- `gasto-form.tsx:157` esconde el rubro que tiene dos o más líneas.
- `gastos.ts:242` elige una línea arbitraria.

Después, el resto de `T14` según su spec: el gasto se registra contra una línea (actividad + rubro), la factura
distribuida y las vistas financieras por actividad. También entra la redefinición del umbral de duplicados de `T5`.

**Superficie:** `src/lib/api/gastos*.ts`, `src/app/api/v1/projects/[id]/expenses/**`,
`src/components/proyectos/gasto-form.tsx` y demás pantallas de gastos, `src/lib/proyectos/gastos-import/**`,
`src/lib/api/financiera.ts`, `src/lib/api/financial-sheet.ts` y su ruta, `src/components/proyectos/ficha/ficha-finanzas.tsx`
y `src/components/proyectos/ficha/finanzas/**`, la sección de gastos de `src/hooks/projects.ts`, OpenAPI de gastos y sus
tests.

**Prohibido:** todo lo del carril A, `src/lib/proyectos/excel-celdas.ts` sin avisar (lo comparten la importación de
estructura y la de gastos), y `prisma/schema.prisma` para `A` (es de `B`, ver la regla 1: si `T14` lo exige, migración
ensayada en la base descartable, riesgo 1, y reporte antes de commitear).

## 4. Reglas de convivencia (las dos)

1. **Un dueño por archivo.** `src/hooks/projects.ts` se comparte por secciones: `A` la de presupuesto/programación y
   modificaciones, `B` la de gastos. Nadie toca la sección del otro. `src/lib/proyectos/ficha-financiera.ts` (la ficha
   pura), `linea-base.ts` y `versiones.ts` son de `A`; `src/lib/api/financiera.ts` y `src/lib/api/financial-sheet.ts`
   son de `B`. Solo `B` toca `schema.prisma`.
2. **Sin esperas (2026-11-14, usuario: «dale»):** los dos carriles arrancan desde la punta `T11` + `T12` sin esperar el
   merge; la migración de `B` la revisa claude, no el humano; mientras espera revisión, `B` avanza las vistas. Lo que
   un carril necesite de un archivo ajeno lo anota y sigue: lo resuelve el dueño.
3. **Rama propia por carril** desde la punta `T11` + `T12`, sin esperar el merge a main (sustituye al «a partir de main
   ya con `T11` y `T12` mergeados» original); commits por unidad de trabajo, sin push ni PR: los revisa el humano.
4. **Tests primero** donde hay comportamiento nuevo, y el comando de verificación en el mensaje del commit.
5. **`prisma generate` después de tocar el schema**, antes de creerle a `tsc`.
6. **En WSL, vitest con globs** para las carpetas con corchetes (`src/app/api/v1/projects/*/budget`): el filtro
   `"[id]"` entre comillas cuelga el worker.
7. **No re-decidir** lo que ya decidió el humano: en `T11`, L2, L5, L7 y L10.

## 5. Secuencia del día

| Momento | Quién | Qué |
|---|---|---|
| Arranque | humano + claude | Paso 0: Docker, invariantes, veredicto del verificador, merge de `T11` (5 PRs) y `T12` |
| Mañana | los dos, en paralelo | `A`: `T13`. `B`: `T14`, empezando por el formulario de gasto |
| Mediodía | claude | revisar los dos carriles: superficies respetadas, `hooks/projects.ts` sin choques |
| Tarde | `A` | restos de `T11` en modificación/traslado y columna «Tipo»; `B` sigue con `T14` |
| Cierre | humano | revisar PRs de `T13` y `T14`; decidir `T7` y `T15` |

## 6. Lo que este plan deja fuera, a propósito

- **`T7`** (resumen del periodo): toca la ficha financiera, la misma que `T14` está moviendo.
- **`T15`** (cierre y CedeTextil): toca datos de producción. Además su plan citaba `presupuesto-po/*`, que `T11.5`
  retiró: hay que replantear cómo se carga el presupuesto de CedeTextil (plantilla 2026.2 o línea por línea) antes de
  estimarla.
- **`estructura-po-import.ts`**: la importación simple de estructura borra y recrea actividades. Las líneas del
  presupuesto quedarían apuntando a actividades borradas. Necesita el mismo arreglo que `T11.3` hizo en la plantilla,
  o retirarse como el import simple de presupuesto. Es una decisión del humano: preguntarla en el Paso 0.
  **Respondida (2026-11-14, usuario):** «Hazlo de tal manera se cumplan los criterios de aceptacion del documento
  "C:\Users\Adrian\Downloads\Hub-proyectos261028.docx"». Ese documento (AJ-01…AJ-06) no trae criterios sobre esta
  importación; lo que aplica es AJ-01 (el historial de avances no se pierde: ya lo cuida `exigirSinHistorial`) y la
  decisión D-A de la PO (`importar-estructura-po.md` S6: «modo "solo estructura" que conserva el presupuesto
  existente»). Conclusión: **adaptarla**, no retirarla. Al reimportar, las actividades se emparejan por código, como
  hizo `T11.3`, y las líneas del presupuesto siguen vivas. Va en el carril A, después de mergear `T11`. Riesgo 1.
- **Seed demo** (`scripts/seed-projects-demo.ts`): escribe un `valor_total` que no es la suma de sus líneas. Menor; entra
  cuando alguien toque el seed.
