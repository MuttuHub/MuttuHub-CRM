# Plan en paralelo: backlog primero y Proyectos v3 al lado

**Fecha:** 2026-11-04 · **Estado:** acordado con Adrián · **Ubicación:** `docs/ux-crm-2026-11/`
**Va con:** `plan-trabajo-ux-crm.md` (lista única de trabajo), `rediseno-ciclo-proyecto.md` (qué cambia y por qué),
`proyectos-v2-prototipo.html` (cómo se ve), `odd/tasks/backlog-completo-2026-11.md` (avance del backlog) y
`odd/tasks/proyectos-v3.md` (avance de la sección nueva).

> **Pedido, textual:** «Vale, me gusta como está rediseñada la nueva sección de proyectos, ahora la prioridad es
> terminarl el backlog que tenemos pendiente, y depronto con otro agente en paralelo podemos ir desarrollando esta
> sección renovada, como podriamos crear el plan de trabajo».
>
> **Acordado:** el agente B trabaja en otro worktree con Claude Code. La sección nueva vive en una ruta aparte, apagada
> con una bandera. Ninguna pantalla de v3 se construye antes de cerrar todas las decisiones de la PO. Mientras tanto,
> B solo prepara la base técnica.

### Sobre el nombre «v3»

En el código, **«v2» ya es la sección de Proyectos que está en producción**: la rama `feat/projects-v2`,
«Portafolio v2» en `src/lib/nav.ts`, `e2e/proyectos-v2/` y `runbook-lanzamiento-v2.md`. Por eso la sección renovada se
llama **Proyectos v3** en el código: ramas, carpetas, ruta y bandera. El archivo del prototipo conserva su nombre
(`proyectos-v2-prototipo.html`), y en este plan los dos nombres hablan de lo mismo.

---

## 1. Las dos líneas de trabajo

| | **Línea A: backlog** | **Línea B: Proyectos v3** |
|---|---|---|
| Quién | Sesión principal de Claude Code (la que ya lleva `backlog-completo-2026-11.md`) | Segunda sesión de Claude Code en su propio worktree |
| Prioridad | **Primera.** Si hay que elegir, gana A | Segunda. Nunca bloquea a A |
| Qué hace | Fases 0 a 4 del plan principal, en su orden, y el Frente M | B0 (base técnica) ya; B1 a B8 después de la puerta de decisiones |
| Dónde escribe | Todo el repo salvo la zona de B (sección 3) | Solo su zona (sección 3) |
| Avance | `odd/tasks/backlog-completo-2026-11.md` | `odd/tasks/proyectos-v3.md` |
| Instrucciones | `odd/tasks/prompt-agente-a-backlog.md` | `odd/tasks/prompt-agente-b-proyectos-v3.md` |

**Adrián** decide los push, PR y merges (regla S2 del tracker), lleva las decisiones a la PO y cambia la bandera en
producción.

---

## 2. Cómo convive v3 con la sección actual

- **Ruta aparte:** `src/app/(app)/proyectos-v3/`, bajo el mismo layout que ya valida la sesión (`requireUser()`).
- **Bandera de servidor:** `FEATURE_PROYECTOS_V3` con tres valores: `off` (por defecto), `admin` (solo Administración
  y Gerencia) y `on` (todos). Si la bandera no deja pasar, la ruta responde 404. Se lee en `src/lib/flags.ts` y no
  toca la base de datos.
- **Sin entrada en el menú** hasta B8: en las pruebas se entra por URL. Así nadie toca `src/lib/nav.ts`, que también
  cambia en PR-3 (glosario).
- **El backend se comparte.** v3 usa las mismas APIs y las mismas reglas de la PO (`src/lib/proyectos/`). Nada de
  reglas duplicadas en la interfaz: si una regla falta en el servidor, se agrega allí.
- **En producción no cambia nada** mientras la bandera esté en `off`. Encenderla en Vercel es un cambio de
  producción, y lo decide Adrián paso a paso (regla S4).

---

## 3. Quién toca qué

| Zona | Dueño | Regla para el otro |
|---|---|---|
| `src/app/(app)/proyectos/**`, `src/components/proyectos/**` | A | B no edita |
| `src/app/(app)/proyectos-v3/**`, `src/components/proyectos-v3/**`, `e2e/proyectos-v3/**`, `src/lib/flags.ts` | B | A no edita |
| `src/app/api/**`, `src/lib/proyectos/**` (reglas de negocio) | A | B no toca nada en B0. Desde B3 puede **agregar** archivos de endpoint nuevos, previo aviso en su tracker. Un cambio a un archivo existente se pide a A |
| `prisma/**` (migraciones) | A | B no crea migraciones en B0. Desde B3, cada migración se anuncia en los dos trackers y pasa por ensayo (S2). En local nunca se acepta un `migrate reset` (la base tiene `email_outbox` de otra rama, L6) |
| `src/hooks/projects.ts` | A | B importa y no edita; sus hooks nuevos van en `src/components/proyectos-v3/data/` |
| `src/components/ui/**`, `src/lib/nav.ts`, `globals.css`, `eslint.config.mjs` | A | B pide el cambio en su tracker. `nav.ts` solo se toca en B8 |
| `plan-trabajo-ux-crm.md`, `backlog-completo-2026-11.md` | A (o Adrián) | B propone cambios en su Log |
| `odd/tasks/proyectos-v3.md` | B | A solo lee |

**Pedidos entre líneas:** quien necesite algo de la zona del otro lo escribe en su propio Log como «**Pedido a A**» o
«**Pedido a B**». Adrián lo pasa al otro agente. Ningún agente edita la zona ajena «porque era un cambio chico».

**Ritmo:** cada vez que entra a `main` algo de una zona compartida (API, reglas, migraciones, `ui/`), B rebasa sus
ramas abiertas el mismo día. B nunca apila ramas: una rama por unidad, siempre desde `main` (plan §3).

---

## 4. Puerta de decisiones (antes de B1)

B no construye pantallas de v3 hasta que **todas** estas decisiones estén anotadas en la sección 4 del plan principal,
con fecha y quién decidió. Adrián marca la puerta como abierta en `odd/tasks/proyectos-v3.md` (S3).

| ID | Pregunta corta | Quién | Bloquea |
|---|---|---|---|
| D-G1 | Glosario (Clientes, Actividades, Portafolio…) | PO | Todos los textos de v3 |
| D-G7 | Avance por hitos (U22) | PO | B6 |
| D-G11 | «Lo que te toca esta semana» / «Mi semana en el proyecto» | PO | B1, B6 |
| D-G12 | «Enviar a Gerencia» | PO | B5 |
| D-CP1 a D-CP6 | Responsable obligatorio, «Tipo de medio exigido», qué bloquea el cierre, cambio de meta, informe de cierre, código editable | PO / Gerencia | B3, B7 |
| P5 | Portafolio en filas y detalle de actividad (pruebas del prototipo con la PO) | PO | B1, B2 |
| **D-V3-1** | ¿La interfaz de U17–U21 (F4.7) se hace **solo en v3** y A entrega solo el backend? Propuesta: sí, para no diseñar dos veces. Si v3 se atrasa más de 4 semanas respecto del calendario, A agrega la interfaz mínima en v1 | Adrián | B3, B4, B6, B7 |
| **D-V3-2** | ¿Cuándo se retira v1? Propuesta: 2 semanas de piloto con un coordinador sin bloqueos y paridad de reglas al 100 % | Adrián / Gerencia | B8 |

**Cómo cerrarla rápido:** una sola sesión de 90 minutos con la PO en la semana 2. Se ve el video
`ciclo-proyecto-antes-despues.mp4` (3 min), se recorre el prototipo con la lista de `index.html` y se responden las
preguntas de esta tabla. La misma sesión sirve de discovery para BL#27 (PR-18).

**Si la puerta no abre a tiempo:** B termina B0 y **se detiene**. No construye con supuestos. Si Adrián quiere usar
ese tiempo, puede darle a B una unidad del backlog que no toque Proyectos (por ejemplo T13: N6 en Clientes). Esa unidad
la asigna A en su tracker y se trabaja con las reglas de A.

---

## 5. Línea A: el backlog, en orden

Sale de `backlog-completo-2026-11.md` (estado al 2026-11-04) y del plan principal. Las unidades que v3 necesita están en
**negrita**.

| Orden | Unidad | Ítems | Por qué en este orden |
|---|---|---|---|
| 0 | **Fusionar lo terminado** | T1 (X1, X2), T2 (PR-R1), T3 (PR-1), T8 (PR-7a y 7b; luego 7c rebasado), PR-7d, T5+T5b (PR-R2), T6 (PR-M1), docs | B arranca desde un `main` con la base de diálogos y los textos nuevos de Proyectos |
| 1 | T4 · PR-2 | BL#9, BL#22, BL#15, BL#10 | Necesita T3 en `main` |
| 2 | T5c · PR-R2c | Semanal que desborda la carta | Cierra el Frente R de la Fase 1 |
| 3 | T9 · PR-8 | BL#13, BL#16, BL#7, N10 | Arreglos rápidos de Proyectos |
| 4 | **T10 · PR-14 y PR-15** | U9–U12 (`GET /projects/:id/baseline/check`, «Próximos pasos», semáforo de Revisión) | **v3 usa este endpoint en B5** |
| 5 | **T11 · PR-16** | U13–U16 (atajos, pista del último % y del tope) | **Las reglas de U15 y U16 se reutilizan en B6** |
| 6 | T12 · PR-17 | BL#8 (impresión unificada) | — |
| 7 | T13 · PR-11, PR-13 | N6, N2 | — |
| 8 | T14 · F0.3 | Contrato de AJ-02 (producción según S4) | — |
| 9 | **PR-18** | BL#27 (discovery) | Coincide con la sesión de la puerta |
| 10 | Bloqueados por decisión (TB) | PR-3, PR-4, PR-6, PR-9, PR-10, PR-12… | A medida que lleguen las decisiones |
| 11 | **Fase 4, empezando por F4.7 (backend)** | U17–U21 según D-V3-1 | **B3, B4, B6 y B7 lo necesitan** |
| 12 | Frente M (T7: PR-M2 a PR-M4, PR-M1b) y resto de la Fase 4 | — | Plan principal |

**Lo que A le entrega a B, en este orden:** PR-14 → PR-16 → backend de F4.7 (importar único, repartir, guardado único,
gasto con error por campo, solicitar cambio). Cuando cada uno entra a `main`, A lo anota en su Log con el nombre
«**Entrega para B**».

---

## 6. Línea B: Proyectos v3

### B0 · Base técnica (ya, sin decisiones; unos 4 a 6 días)

Una rama y un PR chico por unidad, siempre desde `main`. B0.1, B0.2 y B0.4 pueden empezar ya. B0.3, B0.5 y B0.6
esperan al paso 0 de A, porque usan los diálogos (T3) y los textos de Proyectos (T8) nuevos.

| ID | Rama | Qué | Terminado cuando |
|---|---|---|---|
| B0.1 | `feat/proyectos-v3-bandera` | `src/lib/flags.ts` (`off`/`admin`/`on`, por defecto `off`) y ruta `proyectos-v3` con una página «En construcción» | Pruebas: con `off` responde 404, con `admin` solo entran Administración y Gerencia, con `on` entra cualquier usuario con sesión. v1 no cambia |
| B0.2 | `chore/proyectos-v3-guardas` | Carpeta `src/components/proyectos-v3/` y prueba guardiana (estilo `design-guards.test.ts`): v1 no importa nada de v3, y v3 solo importa de `src/components/proyectos/` los módulos puros de una lista permitida | La prueba falla si alguien cruza la frontera |
| B0.3 | `feat/proyectos-v3-datos` | `proyectos-v3/data/`: selectores de solo lectura sobre los hooks existentes (filas del portafolio, resumen de la ficha) con pruebas sobre datos de ejemplo | Sin endpoints nuevos; cobertura de los selectores |
| B0.4 | `docs/proyectos-v3-contratos` | `odd/tasks/proyectos-v3-contratos.md`: cada pantalla y acción del prototipo con su endpoint o hook actual, o con el hueco, quién lo construye (A o B) y qué decisión espera | Cubre las 4 pantallas del prototipo y las acciones del video |
| B0.5 | `feat/proyectos-v3-piezas` | Piezas de presentación que ninguna decisión cambia: armazón de página, encabezado de sección, lista de filas, lista de verificación genérica y barra de progreso, sobre `src/components/ui/` | Sin reglas de negocio ni textos finales; pruebas de render y accesibilidad (`a11y-guards`) |
| B0.6 | `test/proyectos-v3-e2e` | `e2e/proyectos-v3/` con helpers, prueba de humo de la bandera y la **matriz de paridad**: cada regla de la PO (AJ-01 a AJ-06, B7, línea base, nadie valida su propio gasto, sin soporte no se valida) con el flujo de v3 que debe respetarla | La matriz está completa; la prueba de humo corre en local |

Al cerrar B0, B anota el resultado en su Log y **se detiene** hasta que abra la puerta.

### B1 a B8 · Pantallas (después de la puerta)

| ID | Qué | Ítems | Necesita de A | Decisiones |
|---|---|---|---|---|
| B1 | Portafolio v3 | P5, P3 | — | P5, D-G11, D-G1 |
| B2 | Ficha v3 en modo lectura (cabecera con un solo «Registrar avance», pestañas) | P5, U14 | PR-16 | D-G1 |
| B3 | Estructura en tabla | CP1–CP5, U17 (interfaz) | Backend de U17 (F4.7) | D-CP1, D-CP2, D-CP6, D-V3-1 |
| B4 | Presupuesto y programación | U18, U19, CP6, CP7 | Backend de U18 y U19 | D-V3-1 |
| B5 | Aprobación con checklist y «Enviar a Gerencia» | U9–U11 (interfaz), P4 | PR-14, PR-15 | D-G12 |
| B6 | Registros: avance unificado y gasto en 4 grupos | CP8, U20, CP9, U22 | PR-16, backend de U20, PR-18 | D-G7, D-G11 |
| B7 | Cierre | CP10–CP12 | Backend de U21; PR-R2 (ya hecho) | D-CP3, D-CP4, D-CP5 |
| B8 | Activación y retiro de v1 | Bandera `admin` → piloto con un coordinador → `on` → `/proyectos` apunta a v3 → borrar v1 en un PR aparte | — | D-V3-2 |

**Terminado, para cada unidad de B:** pruebas primero (RED → GREEN); `tsc` y `eslint` en cero; con la bandera en
`off`, v1 queda igual (lo comprueba la prueba guardiana); la fila de la matriz de paridad que toca la unidad está en
verde; capturas a 1440 y 390 px comparadas con el prototipo (arnés `.claude/qa/capturar.mjs`, modo nuevo `v3`); PR
chico.

---

## 7. Operación en local (dos agentes en la misma máquina)

Tomado de L4 y L11 del tracker del backlog:

- **Worktree de B:** `.claude/worktrees/proyectos-v3`, rama de la unidad en curso.
- **`node_modules`:** Vitest y `next dev` corren bajo `node.exe`, que no sigue los symlinks de WSL. En el worktree se
  usa una junction de Windows: `cmd.exe /c "mklink /J <worktree>\node_modules <repo>\node_modules"`.
- **`tsc` y `eslint`:** `node node_modules/typescript/bin/tsc --noEmit` y `node node_modules/eslint/bin/eslint.js`
  (no `npx`).
- **Puertos:** A usa `next dev` en el 3000; B usa `next dev -p 3001`.
- **Base de datos:** las dos líneas comparten la base local de Docker (`.env.local`). En B0, B **solo lee**: nada de
  seeds, resets ni scripts de datos. Cualquier script carga `.env.local` de forma explícita (CLAUDE.md); nunca `.env`,
  que apunta a producción.
- **Producción:** ninguno de los dos agentes aplica nada en producción. Encender la bandera en Vercel, migraciones y
  respaldos siguen la regla S4.

---

## 8. Calendario orientativo

Las semanas empiezan el jueves 5 de noviembre. El tracker del backlog estima 6 a 8 semanas para todo el backlog (L2).

| Semana | Línea A | Línea B | Adrián |
|---|---|---|---|
| 1 (5–11 nov) | Paso 0 (fusionar) · T4 · T5c · T9 | B0.1 · B0.2 · B0.3 | F0.5 con la PO (D-G1 a D-G6) · merges |
| 2 (12–18 nov) | T10 (PR-14, PR-15) · T11 (PR-16) | B0.4 · B0.5 · B0.6 → **se detiene** | **Sesión de la puerta** con la PO (sección 4) |
| 3–4 (19 nov–2 dic) | T12 · T13 · T14 · PR-18 · bloqueados que se liberen | Si abrió la puerta: B1 · B2. Si no: pausa o una unidad del backlog sin Proyectos | Merges · seguimiento de decisiones |
| 5–6 (3–16 dic) | F4.7 (backend) primero · Frente M | B5 · B3 · B4 (a medida que llegue el backend) | Merges |
| 7–8 (17–30 dic) | Resto de la Fase 4 | B6 · B7 | Merges |
| 9 (desde el 31 dic) | — | B8: bandera `admin` y piloto | Encender la bandera en producción (S4) |

---

## 9. Cómo arrancar mañana

1. Adrián fusiona el paso 0 de A (o decide el orden de los PR abiertos).
2. Abre la sesión A con `odd/tasks/prompt-agente-a-backlog.md`.
3. Crea el worktree de B desde `main` actualizado y abre la sesión B con `odd/tasks/prompt-agente-b-proyectos-v3.md`.
4. Agenda la sesión de la puerta con la PO para la semana 2.
