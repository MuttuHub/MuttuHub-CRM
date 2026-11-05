# Proyectos v3 — línea B en paralelo al backlog (2026-11)

Objetivo: preparar la sección renovada de Proyectos (prototipo `docs/ux-crm-2026-11/proyectos-v2-prototipo.html`) en
una ruta aparte y apagada, sin frenar el backlog. Contrato: `docs/ux-crm-2026-11/plan-paralelo-backlog-proyectos-v3.md`.
Instrucciones del agente: `odd/tasks/prompt-agente-b-proyectos-v3.md`.
Ramas: una por unidad desde `main`, sin apilar; push, PR y merge los decide Adrián.
Pruebas: Vitest bajo `node.exe`; e2e en `e2e/proyectos-v3/`; base local Docker vía `.env.local`, **solo lectura en B0**.

## Specs

- **S1 — Pedido, textual (2026-11-04):** «Vale, me gusta como está rediseñada la nueva sección de proyectos, ahora la
  prioridad es terminarel el backlog que tenemos pendiente, y depronto con otro agente en paralelo podemos ir
  desarrollando esta sección renovada, como podriamos crear el plan de trabajo».
  Respuestas: agente B = Claude Code en otro worktree; convivencia = ruta paralela con bandera; decisiones = **esperar
  todas** (B solo prepara la base técnica); entregable = plan + instrucciones por agente.
- **S2 — Reglas:** las del tracker del backlog (S2 y S4) más la sección 3 del plan paralelo («Quién toca qué»). El
  backlog tiene prioridad. Con la bandera en `off`, la app es idéntica a `main`.
- **S3 — Puerta de decisiones (reescrita el 2026-11-04):** **ABIERTA PARA LOCAL.** Las pantallas de v3 se
  construyen en local detrás de la bandera aunque falten decisiones de la PO; las que falten se resuelven sobre la
  marcha y lo construido se ajusta. **Lo que sigue cerrado es producción:** v3 llega a producción solo en `admin`
  (solo Administración y Gerencia) y solo Adrián enciende la bandera, paso a paso (regla S4). El reemplazo de la
  sección actual requiere su visto bueno explícito después de probarla.
  Decisiones que todavía faltan y afectan pantallas: D-G1, D-G7, D-G11, D-G12, D-CP1 a D-CP6, P5, D-V3-2.
  Consecuencia asumida: puede haber retrabajo cuando la PO responda.
- **S4 — Zona de edición de B.** Solo `src/app/(app)/proyectos-v3/**`, `src/components/proyectos-v3/**` (los hooks
  nuevos en `data/`), `e2e/proyectos-v3/**`, `src/lib/flags.ts` (y su prueba), `odd/tasks/proyectos-v3.md`,
  `odd/tasks/proyectos-v3-contratos.md` y un modo `v3` en `.claude/qa/capturar.mjs` sin tocar los modos existentes.
  Nada de `src/components/proyectos/**`, `src/app/api/**`, `src/lib/proyectos/**`, `prisma/**`, `src/hooks/projects.ts`,
  `src/components/ui/**`, `src/lib/nav.ts`, `globals.css`, `eslint.config.mjs` ni los planes.
- **S5 — B0.2, prueba guardiana.** Plan, fila B0.2: «Carpeta `src/components/proyectos-v3/` y prueba guardiana (estilo
  `design-guards.test.ts`): v1 no importa nada de v3, y v3 solo importa de `src/components/proyectos/` los módulos puros
  de una lista permitida» · Terminado cuando: «La prueba falla si alguien cruza la frontera».
- **S6 — Cierre de cada unidad.** Pruebas primero (RED → GREEN); `tsc` y `eslint` en cero; con la bandera en `off`, la
  app se comporta exactamente igual que en `main`; una línea en el Log con commit, pruebas y riesgos.
- **S7 — Entorno.** Vitest y `next dev` solo corren bajo `node.exe`; en el worktree `node_modules` es una junction de
  Windows, no un symlink. `next dev -p 3001` (A usa el 3000). La base local de Docker se comparte con A y en B0 **solo
  se lee**: nada de seeds, resets, migraciones ni scripts de datos. Nunca se lee ni se imprime `.env*`, contraseñas ni
  tokens. **Nada en producción.**
- **S8 — Cuándo parar y preguntar.** Necesito tocar algo fuera de mi zona; una decisión de la PO que no está anotada;
  algo de la app actual cambiaría con la bandera en `off`; o una instrucción de Adrián que contradice el estado anotado
  acá.

## Tasks

| ID | Qué | Rama | Espera a | Estado | Evidencia |
|---|---|---|---|---|---|
| B0.1 | Bandera `FEATURE_PROYECTOS_V3` y ruta «En construcción» | `feat/proyectos-v3-bandera` | — | **hecho**, PR #139 | `4863dd3`: 3 archivos, +121; 5 pruebas; `tsc` y `eslint` 0. Verificado en navegador: sin bandera **404** para todos; con `admin`, Gerencia **200** y Colaborador **404** |
| B0.2 | Prueba guardiana de importaciones v1 ↔ v3 | `chore/proyectos-v3-guardas` | — | **hecho**, PR #140 | `80b05c2` + `1b01976` + `54f4a24`; 15 pruebas (8 de frontera, 5 de la pieza, 2 de superficies); `tsc` y `eslint` 0 |
| B0.4 | Inventario de contratos (`proyectos-v3-contratos.md`) | `docs/proyectos-v3-contratos` | — | **hecho**, PR #141 | `4c9349e`: +190; las cuatro superficies del prototipo y 14 pedidos a A |
| B0.3 | Selectores de datos de solo lectura | `feat/proyectos-v3-datos` | Pausa (L4) y paso 0 de A | en espera | — |
| B0.5 | Piezas de presentación neutras | `feat/proyectos-v3-piezas` | Pausa (L4) y paso 0 de A | en espera · primer recorte ya hecho en `chore/proyectos-v3-guardas` (`54f4a24`, `lista-verificacion`) | `54f4a24`: 2 archivos, +107; 5 pruebas |
| B0.6 | e2e de humo y matriz de paridad | `test/proyectos-v3-e2e` | Pausa (L4) y paso 0 de A | en espera | — |
| B1–B8 | Pantallas de v3 | — | Pausa (L4); la puerta **local** ya está abierta (S3) | bloqueado por la pausa | — |

## Pedidos a A

- **Pedido a A (2026-11-05, CI):** `main` está rojo por `control-guards.test.ts` →
  `components/documents/repository-list.tsx:1023 <Button> h-6` y `rounded-md`. Lo reproduce cualquier rama que salga de
  `main` (lo confirmé con #141, que solo toca documentación), así que **bloquea el CI de los 8 PRs del paso 0**. Es zona
  de A; no lo toqué. Arreglo: quitar las dos clases del `<Button>` (el primitivo ya fija altura y radio) o marcarlo con
  `/* v6-compact */` si hay una razón.

## Log

- **L1 (2026-11-04):** plan paralelo acordado y escrito. Puerta cerrada. Próximo: B0.1, B0.2 y B0.4, que no dependen del
  paso 0 de A.

- **L2 (2026-11-04, cambio de requisito, usuario, textual):** «primero desarrollemos en local la v3, si me gusta la
  pasamos enseguida a produccion». Aclarado en la misma conversación: la v3 es **candidata con bandera** — se construye
  en local, se prueba en producción en modo `admin` y reemplaza a la sección actual solo con su visto bueno; la sección
  viva sigue recibiendo las mejoras del backlog mientras tanto (opción «Candidata con bandera» elegida por Adrián).
  Efectos: S3 reescrita (local abierto, producción cerrada); B0.1 y B0.2 arrancan ya.

- **L3 (2026-11-04, B0.1 cerrado):** `4863dd3` en `feat/proyectos-v3-bandera` (rama desde `main`, 3 archivos, +121).
  `src/lib/flags.ts` con `leerBanderaProyectosV3` / `puedeVerProyectosV3` (puras, 5 pruebas) y
  `src/app/(app)/proyectos-v3/page.tsx` como marcador. Regla que salió del test: **sin perfil de app no entra nadie**,
  ni con la bandera en `on` — v3 lee datos por rol. Cuando la bandera no deja pasar, la ruta responde **404**, no
  «sin permisos», para no anunciar la sección. Verificado en navegador real contra la base demo:
  sin bandera → 404 para Gerencia y Colaborador; con `admin` → Gerencia 200 con el marcador y Colaborador 404.
  El valor `on` queda cubierto por pruebas unitarias, no por el navegador. Próximo: B0.2 (guardian de importaciones)
  y B0.4 (inventario de contratos), que no dependen de nadie; después B1 (portafolio).
- **L4 (2026-11-04, prioridad, usuario, textual):** «terminemos primero todo el backlog que va a produccion y luego
  realizamos las nuevas vistas y mejoras en local». **La línea B se pausa** después de B0.1. B0.2, B0.4, B0.3, B0.5 y
  B1–B8 quedan en espera hasta que el backlog que va a producción esté cerrado. Lo hecho (bandera + ruta apagada) se
  queda: no molesta a nadie y deja el terreno preparado. Vuelve a la regla original del plan: el backlog primero.

- **L5 (2026-11-05, arranque de esta sesión y corrección):** Adrián me dejó el worktree `.claude/worktrees/proyectos-v3`
  y arranqué B0.2 y B0.4 leyendo el plan paralelo y el prompt de B. **Error mío, anotado acá:** este archivo vivía
  también en la rama `docs/plan-backlog-completo` (PR #138, sin mergear) con el requisito actualizado —S3 reescrita y
  L2/L4 de Adrián— y yo escribí una versión propia que decía «la puerta sigue cerrada». Trabajé con el plan viejo.
  Reconciliado en L9: manda el requisito de esta rama. Entorno: `node_modules` era un symlink de WSL y `node.exe` no lo
  sigue; lo reemplacé por una junction (`mklink /J`) y verifiqué vitest con `design-guards.test.ts` (9/9).
- **L6 (2026-11-05, B0.2 entregado):** `80b05c2` en `chore/proyectos-v3-guardas` (3 archivos, +212).
  `src/components/proyectos-v3/import-guards.ts` define la frontera y `import-guards.test.ts` la ejerce sobre las fuentes
  reales: v1 no importa `proyectos-v3` y v3 solo reutiliza `project-display` de `src/components/proyectos/`. Los
  especificadores se leen con el escáner de TypeScript, así que `export … from`, `require` e `import()` dinámico también
  cuentan. RED observado dos veces: primero la prueba no resolvía `./import-guards`; después, con una violación real
  temporal dentro de `proyectos-v3/`, la prueba falló con el mensaje exacto y el archivo se borró. Vitest 8/8, `tsc` 0,
  `eslint` 0. **Riesgos: ninguno** — no toca código de app ni cambia la bandera. La dirección v1→v3 se prueba con
  fixtures sintéticos y no con una violación real, porque crear un archivo en `src/components/proyectos/**` está fuera
  de mi zona (S4).
- **L7 (2026-11-05, B0.4 entregado):** `4c9349e` en `docs/proyectos-v3-contratos` (rama desde `main`, sin apilar;
  1 archivo, +190). Mapea las cuatro superficies del prototipo (portafolio, ficha con sus 5 pestañas, asistente de 5
  pasos, diálogos y acciones) a los hooks y endpoints reales, con el hueco, el dueño (A o B) y la decisión que lo
  desbloquea; cierra con dónde viven hoy las reglas de la PO y los **14 pedidos a A**. Cuatro filas quedan marcadas
  «confirmar» (filtros exactos del portafolio, tipo de modificación de datos generales, filtro por origen de documentos,
  si `ENTREGABLES` cubre el cambio de meta). **Riesgos: ninguno** — solo documentación.
- **L8 (2026-11-05, CI de los PRs y hallazgo de la pausa):** los tres PRs abiertos (#139, #140, #141) tienen `e2e` y
  Vercel en verde y `unit` en rojo. Dos causas distintas: (1) **previa en `main`**, `control-guards.test.ts` sobre
  `components/documents/repository-list.tsx:1023` — es la misma que el tracker del backlog ya anotó como ajena en L13 y
  sigue ahí; va como Pedido a A. (2) **mía en B0.2**: `surface-guards.test.ts` exige al menos un `.tsx` por subcarpeta de
  `src/components`, y `proyectos-v3/` solo tenía `.ts`. Autorizado por Adrián, adelanté el primer recorte de B0.5
  (`lista-verificacion`, `54f4a24`, RED → GREEN, 5 pruebas) en la misma rama: el área existe y la guarda de superficies
  volvió a verde sin tocar la zona de A. Al revisar lo que dejó Claude encontré **este tracker en la rama de A** con la
  pausa de L4: la línea B está en pausa por decisión de Adrián, y B0.2/B0.4 se hicieron sin saberlo. Las ramas quedan
  estacionadas y Adrián decide si la pausa sigue o se levanta.
- **L9 (2026-11-05, reconciliación):** este archivo adopta el requisito de la rama de A (S1, S2, S3 reescrita y Log
  L1–L4, textuales) y le suma lo mío (S4–S8, Tasks, Pedidos a A y L5–L8). Cuando se mergeen las dos ramas, este archivo
  es el que debe sobrevivir: no borra ninguna instrucción de Adrián y no repite la afirmación equivocada de que la
  puerta está cerrada.
- **L10 (2026-11-05, espera):** Adrián: «espera respuesta de claude code». La línea B queda **en espera de la decisión
  sobre la pausa de L4**: no abro unidades nuevas, no toco las ramas abiertas y no paso nada a producción. Pendiente de
  Adrián: aprobar el push de esta rama (los commits `54f4a24` y `27a49cf` están solo en local; el primer intento falló
  por SSL y el reintento lo bloqueó la política de seguridad) y decidir si los PRs #139–#141 van a draft mientras dure
  la pausa.
