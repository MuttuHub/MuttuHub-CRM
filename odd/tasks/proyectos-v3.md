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
- **S3 — Puerta de decisiones (reescrita el 2026-11-04):** **ABIERTA PARA LOCAL.** Las pantallas de v3 se
  construyen en local detrás de la bandera aunque falten decisiones de la PO; las que falten se resuelven sobre la
  marcha y lo construido se ajusta. **Lo que sigue cerrado es producción:** v3 llega a producción solo en `admin`
  (solo Administración y Gerencia) y solo Adrián enciende la bandera, paso a paso (regla S4). El reemplazo de la
  sección actual requiere su visto bueno explícito después de probarla.
  Decisiones que todavía faltan y afectan pantallas: D-G1, D-G7, D-G11, D-G12, D-CP1 a D-CP6, P5, D-V3-2.
  Consecuencia asumida: puede haber retrabajo cuando la PO responda.

## Tasks

| ID | Qué | Rama | Espera a | Estado | Evidencia |
|---|---|---|---|---|---|
| B0.1 | Bandera `FEATURE_PROYECTOS_V3` y ruta «En construcción» | `feat/proyectos-v3-bandera` | — | **hecho** | `4863dd3`: 3 archivos, +121; 5 pruebas; `tsc` y `eslint` 0. Verificado en navegador: sin bandera **404** para todos; con `admin`, Gerencia **200** y Colaborador **404** |
| B0.2 | Prueba guardiana de importaciones v1 ↔ v3 | `chore/proyectos-v3-guardas` | — | pendiente | — |
| B0.4 | Inventario de contratos (`proyectos-v3-contratos.md`) | `docs/proyectos-v3-contratos` | — | pendiente | — |
| B0.3 | Selectores de datos de solo lectura | `feat/proyectos-v3-datos` | Paso 0 de A | pendiente | — |
| B0.5 | Piezas de presentación neutras | `feat/proyectos-v3-piezas` | Paso 0 de A | pendiente | — |
| B0.6 | e2e de humo y matriz de paridad | `test/proyectos-v3-e2e` | Paso 0 de A | pendiente | — |
| B1 | Portafolio v3 | — | Puerta | bloqueado | — |
| B2 | Ficha v3 en lectura | — | Puerta, PR-16 | bloqueado | — |
| B3 | Estructura en tabla | — | Puerta, backend U17 | bloqueado | — |
| B4 | Presupuesto y programación | — | Puerta, backend U18/U19 | bloqueado | — |
| B5 | Aprobación y «Enviar a Gerencia» | — | Puerta, PR-14, PR-15 | bloqueado | — |
| B6 | Registros (avance unificado, gasto) | — | Puerta, PR-16, backend U20, PR-18 | bloqueado | — |
| B7 | Cierre | — | Puerta, backend U21 | bloqueado | — |
| B8 | Activación y retiro de v1 | — | B1–B7, D-V3-2, S4 | bloqueado | — |

## Pedidos a A

(Vacío. Formato: «**Pedido a A** (fecha, unidad): qué, por qué, archivo».)

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
