# Proyectos v3 — línea B en paralelo al backlog (2026-11)

Objetivo: preparar la sección renovada de Proyectos (prototipo `docs/ux-crm-2026-11/proyectos-v2-prototipo.html`) en
una ruta aparte y apagada, sin frenar el backlog. Contrato: `docs/ux-crm-2026-11/plan-paralelo-backlog-proyectos-v3.md`.
Instrucciones del agente: `odd/tasks/prompt-agente-b-proyectos-v3.md`.
Ramas: una por unidad desde `main`, sin apilar; push, PR y merge los decide Adrián.
Pruebas: Vitest bajo `node.exe`; e2e en `e2e/proyectos-v3/`; base local Docker vía `.env.local`, **solo lectura en B0**.

## Specs

- **S1 — Pedido, textual (2026-11-04):** «Vale, me gusta como está rediseñada la nueva sección de proyectos, ahora la
  prioridad es terminarl el backlog que tenemos pendiente, y depronto con otro agente en paralelo podemos ir
  desarrollando esta sección renovada, como podriamos crear el plan de trabajo».
  Respuestas: agente B = Claude Code en otro worktree; convivencia = ruta paralela con bandera; decisiones = **esperar
  todas** (B solo prepara la base técnica); entregable = plan + instrucciones por agente.
- **S2 — Reglas:** las del tracker del backlog (S2 y S4) más la sección 3 del plan paralelo («Quién toca qué»). El
  backlog tiene prioridad. Con la bandera en `off`, la app es idéntica a `main`.
- **S3 — Puerta de decisiones (vigente desde el plan paralelo, 2026-11-04 22:11):** **CERRADA.** Vale el plan
  paralelo (`docs/ux-crm-2026-11/plan-paralelo-backlog-proyectos-v3.md`): «Ninguna pantalla de v3 se construye antes
  de cerrar todas las decisiones de la PO. Mientras tanto, B solo prepara la base técnica.» B hace solo B0; B1 a B8
  esperan a que Adrián marque la puerta como abierta acá. La versión «ABIERTA PARA LOCAL» (2026-11-04, 20:27) quedó
  superada por la pausa (L4, 20:33) y después por el plan paralelo. Producción sigue igual: v3 llega solo en `admin`
  y solo Adrián enciende la bandera, paso a paso (regla S4).
  Decisiones que todavía faltan y afectan pantallas: D-G1, D-G7, D-G11, D-G12, D-CP1 a D-CP6, P5, D-V3-2.
- **S4 — Zona de edición de B.** Solo `src/app/(app)/proyectos-v3/**`, `src/components/proyectos-v3/**` (los hooks
  nuevos en `data/`), `e2e/proyectos-v3/**`, `src/lib/flags.ts` (y su prueba), `odd/tasks/proyectos-v3-contratos.md` y
  un modo `v3` en `.claude/qa/capturar.mjs` sin tocar los modos existentes. Nada de `src/components/proyectos/**`,
  `src/app/api/**`, `src/lib/proyectos/**`, `prisma/**`, `src/hooks/projects.ts`, `src/components/ui/**`,
  `src/lib/nav.ts`, `globals.css`, `eslint.config.mjs` ni los planes. Este tracker es la única excepción: B lo edita y
  **A lo commitea**.
- **S5 — B0.2, prueba guardiana.** Plan, fila B0.2: «Carpeta `src/components/proyectos-v3/` y prueba guardiana (estilo
  `design-guards.test.ts`): v1 no importa nada de v3, y v3 solo importa de `src/components/proyectos/` los módulos puros
  de una lista permitida» · Terminado cuando: «La prueba falla si alguien cruza la frontera».
- **S6 — Cierre de cada unidad.** Pruebas primero (RED → GREEN); `tsc` y `eslint` en cero; con la bandera en `off`, la
  app se comporta exactamente igual que en `main`; una línea en el Log con commit, pruebas y riesgos.
- **S7 — Entorno.** Vitest y `next dev` solo corren bajo `node.exe`; en el worktree `node_modules` es una junction de
  Windows, no un symlink. `next dev -p 3001` (A usa el 3000). La base local de Docker se comparte con A y en B0 **solo
  se lee**: nada de seeds, resets, migraciones ni scripts de datos. Nunca se lee ni se usa `.env` ni `.env.local`: B0 no
  necesita base de datos. **Nada en producción.**
- **S8 — Cuándo parar y preguntar.** Antes de cualquier `git push`, PR o merge: **visto bueno de Adrián en el chat**; un
  permiso de la herramienta no es ese visto bueno. También: tocar algo fuera de la zona de S4, una decisión de la PO que
  no está anotada, algo de la app actual que cambiaría con la bandera en `off`, o una instrucción de Adrián que
  contradice el estado anotado acá.
- **S9 — Decisiones pendientes (recordatorio de B).** Además de las de S3, B mantiene **D-V3-1** en la lista de
  pendientes hasta que su cierre quede anotado en la sección 4 del plan principal con fecha y quién decidió: su
  contenido («U17–U21 se construye en la sección viva y v3 la hereda») cambia el alcance de B3, B4, B6 y B7.

## Tasks

| ID | Qué | Rama | Espera a | Estado | Evidencia |
|---|---|---|---|---|---|
| B0.1 | Bandera `FEATURE_PROYECTOS_V3` y ruta «En construcción» | `feat/proyectos-v3-bandera` | — | **hecho**, PR #139 | `4863dd3`: 3 archivos, +121; 5 pruebas; `tsc` y `eslint` 0. Verificado en navegador: sin bandera **404** para todos; con `admin`, Gerencia **200** y Colaborador **404** |
| B0.2 | Prueba guardiana de importaciones v1 ↔ v3, más la pieza mínima que `surface-guards` exige en la carpeta | `chore/proyectos-v3-guardas` | — | **hecho**, PR #140 | `80b05c2` (guarda) + `1b01976` (evidencia) + `54f4a24` (`lista-verificacion`, pieza mínima para `surface-guards`, no es B0.5 empezado); 15 pruebas; `tsc` y `eslint` 0; `git diff --stat main..HEAD` ya no menciona `odd/` |
| B0.4 | Inventario de contratos (`proyectos-v3-contratos.md`) | `docs/proyectos-v3-contratos` | — | **hecho**, PR #141 | `4c9349e`: +190; las cuatro superficies del prototipo, las reglas de la PO y los 14 pedidos a A |
| B0.3 | Selectores de datos de solo lectura | `feat/proyectos-v3-datos` | Paso 0 de A | pendiente | — |
| B0.5 | Piezas de presentación neutras (el resto; la mínima ya entró en B0.2) | `feat/proyectos-v3-piezas` | Paso 0 de A | pendiente | — |
| B0.6 | e2e de humo y matriz de paridad | `test/proyectos-v3-e2e` | Paso 0 de A | pendiente | — |
| B1 | Portafolio v3 | — | Puerta cerrada (S3) | bloqueado | — |
| B2 | Ficha v3 en lectura | — | Puerta cerrada (S3), PR-16 | bloqueado | — |
| B3 | Estructura en tabla | — | Puerta cerrada (S3), backend U17 | bloqueado | — |
| B4 | Presupuesto y programación | — | Puerta cerrada (S3), backend U18/U19 | bloqueado | — |
| B5 | Aprobación y «Enviar a Gerencia» | — | Puerta cerrada (S3), PR-14, PR-15 | bloqueado | — |
| B6 | Registros (avance unificado, gasto) | — | Puerta cerrada (S3), PR-16, backend U20, PR-18 | bloqueado | — |
| B7 | Cierre | — | Puerta cerrada (S3), backend U21 | bloqueado | — |
| B8 | Activación y retiro de v1 | — | Puerta cerrada (S3), B1–B7, D-V3-2, S4 | bloqueado | — |

## Pedidos a A

- **Pedido a A (2026-11-05, CI):** `main` estaba en rojo por `control-guards.test.ts` →
  `components/documents/repository-list.tsx:1023` (`<Button> h-6` y `rounded-md`), y eso tumbaba el job `unit` de
  cualquier rama que saliera de `main`, incluidos #139–#141. **Lo arregla el PR #142 de A** (`80173bb`). Cuando entre a
  `main`, el CI de #139 a #141 se vuelve a correr.
- **Pedido a A (2026-11-05, alcance):** los **14 pedidos** de `odd/tasks/proyectos-v3-contratos.md` los revisa A; B no
  los implementa. El primero de la lista es `GET /projects/{id}/baseline/check` (PR-14).

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
- **L5 (2026-11-05, A — reglas para el agente B):** el agente B ahora es Gentle Shell (pi, `deepseek-v4.1-flash`) en
  `.claude/worktrees/proyectos-v3`. Hizo B0.2 (`80b05c2`), B0.4 (`4c9349e`) y una pieza (`54f4a24`), y subió y abrió
  los PR #139 a #141 sin el visto bueno de Adrián. S3 se corrigió a **CERRADA** (vale el plan paralelo de las 22:11).
  Su plan de hoy está en `odd/tasks/plan-agente-b-2026-11-05.md`: push y PR solo con OK de Adrián, un solo tracker
  (este archivo, que commitea A), sacar la copia del tracker de la rama de B0.2 y dejar la pieza en B0.2 porque
  `surface-guards` la necesita. `main` estaba en rojo por `control-guards`; lo arregla el PR #142 (`80173bb`).

- **L6 (2026-11-05, arranque de B y corrección de premisa):** arranqué B0.2 y B0.4 leyendo el plan paralelo y el prompt
  de B, pero **con una premisa vieja**: el tracker que tenía a mano decía «puerta cerrada» y no incluía L2/L4, porque esa
  versión vivía en la rama de A sin mergear. Escribí una copia propia del tracker en la rama de B0.2, que es el error
  que G2 corrige. Entorno: `node_modules` del worktree era un symlink de WSL y `node.exe` no lo sigue; lo reemplacé por
  una junction (`mklink /J`) y verifiqué vitest con `design-guards.test.ts` (9/9).
- **L7 (2026-11-05, B0.2 entregado):** `80b05c2` en `chore/proyectos-v3-guardas` (3 archivos, +212).
  `src/components/proyectos-v3/import-guards.ts` define la frontera y `import-guards.test.ts` la ejerce sobre las fuentes
  reales: v1 no importa `proyectos-v3` y v3 solo reutiliza `project-display` de `src/components/proyectos/`. Los
  especificadores se leen con el escáner de TypeScript, así que `export … from`, `require` e `import()` dinámico también
  cuentan. RED observado dos veces: primero la prueba no resolvía `./import-guards`; después, con una violación real
  temporal dentro de `proyectos-v3/`, falló con el mensaje exacto y el archivo se borró. Vitest 8/8, `tsc` 0, `eslint` 0.
  **Riesgos: ninguno** — no toca código de app ni cambia la bandera. La dirección v1→v3 se prueba con fixtures
  sintéticos, no con una violación real, porque crear un archivo en `src/components/proyectos/**` está fuera de S4.
- **L8 (2026-11-05, B0.4 entregado):** `4c9349e` en `docs/proyectos-v3-contratos` (rama desde `main`, sin apilar;
  1 archivo, +190). Mapea las cuatro superficies del prototipo (portafolio, ficha con sus 5 pestañas, asistente de 5
  pasos, diálogos y acciones) a los hooks y endpoints reales, con el hueco, el dueño (A o B) y la decisión que lo
  desbloquea; cierra con dónde viven hoy las reglas de la PO y los 14 pedidos a A. Cuatro filas quedan marcadas
  «confirmar» (filtros exactos del portafolio, tipo de modificación de datos generales, filtro por origen de documentos,
  si `ENTREGABLES` cubre el cambio de meta) y se cierran en la unidad que las use. **Riesgos: ninguno** — solo
  documentación.
- **L9 (2026-11-05, CI de #139–#141 y pieza mínima):** los tres PRs tienen `e2e` y Vercel en verde y `unit` en rojo, por
  dos causas distintas: (1) **previa en `main`**, `control-guards` sobre `repository-list.tsx:1023` — va como Pedido a A
  y la arregla el PR #142; (2) **mía en B0.2**: `surface-guards.test.ts` exige al menos un `.tsx` por subcarpeta de
  `src/components` y `proyectos-v3/` solo tenía `.ts`, así que el área contaba 0. Autorizado por Adrián, entró
  `lista-verificacion` (`54f4a24`) como **pieza mínima para `surface-guards`**, no como B0.5 empezado: RED → GREEN, 5
  pruebas, sin reglas ni textos finales. Con eso, en local: 15/15 (8 de frontera, 5 de la pieza, 2 de superficies),
  `tsc` y `eslint` 0.
- **L10 (2026-11-05, plan de hoy y G1–G4):** vale el plan paralelo (2026-11-04 22:11) según
  `odd/tasks/plan-agente-b-2026-11-05.md`: reemplaza la pausa de L4 y la puerta «ABIERTA PARA LOCAL», y S3 queda
  CERRADA. **G1:** no hubo push (los commits del tracker se quedaron en local). **G2:** `0155346` en
  `chore/proyectos-v3-guardas` borra `odd/tasks/proyectos-v3.md` de esa rama; `git diff --stat main..HEAD` ya solo
  menciona `src/components/proyectos-v3/` (4 archivos, +278). **G3:** esta es la copia única del tracker y la commitea A;
  acá quedaron S4–S9, la tabla de Tasks, los Pedidos a A y este Log. **G4:** `54f4a24` se queda en B0.2 como pieza
  mínima para `surface-guards`. **Pendiente:** el visto bueno de Adrián para G5 (subir `54f4a24` y `0155346` al PR #140).
  B0.3, B0.5 y B0.6 siguen esperando el paso 0 de A; B1–B8, la puerta cerrada.
- **L11 (2026-11-05, G5 subido):** Adrián dio el OK y el primer intento falló con
  `SSL certificate verification failed: certificate signer not trusted`. No era git ni el repo: `curl https://github.com`
  fallaba igual y el certificado que se presentaba para `github.com` lo emitía **Fortinet** (`CN=FGT60FTK20005270`), o sea
  un firewall haciendo inspección TLS que el bundle de WSL no confía. **No se desactivó la verificación**
  (`http.sslVerify=false` descartado: dejaría que el aparato lea credenciales y contenido). Adrián cambió de red y el
  push salió: `206f671..0155346` en `chore/proyectos-v3-guardas`, la rama quedó al día con `origin` y el PR #140 ya tiene
  la pieza (`54f4a24`) y ya no tiene el tracker (`0155346`). **Pendiente G6:** cuando el PR #142 de A entre a `main`,
  volver a correr el CI de #139 a #141 y confirmar verde; si algo sigue rojo, anotar la prueba exacta como Pedido a A.
