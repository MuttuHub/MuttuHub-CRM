# Plan de trabajo — backlog completo y mejoras UX/UI del CRM

**Ubicación:** `docs/ux-crm-2026-11/`, junto con los prototipos y su portada `index.html`.

**Fecha de corte:** 2026-11-04 (noche) · **`main` en `8868f1a`** («docs(projects): propose milestone-based activity
progress (U22) for the PO», 2026-11-04).

> **Actualización 2026-11-04 (cierre) — dos agentes en paralelo:**
> - El backlog sigue primero (agente A). La sección renovada de Proyectos se prepara al lado como **Proyectos v3**
>   (agente B, otro worktree, ruta aparte con la bandera `FEATURE_PROYECTOS_V3`, apagada). B solo hace la base técnica
>   (B0) hasta que estén todas las decisiones de su puerta. Contrato: `plan-paralelo-backlog-proyectos-v3.md`;
>   instrucciones: `odd/tasks/prompt-agente-a-backlog.md` y `odd/tasks/prompt-agente-b-proyectos-v3.md`; avance de B:
>   `odd/tasks/proyectos-v3.md`. Entran las decisiones D-CP1 a D-CP6, D-V3-1 y D-V3-2 (sección 4).
>
> **Actualización 2026-11-04 (cierre) — ciclo de un proyecto:**
> - Entra `rediseno-ciclo-proyecto.md` con el video `ciclo-proyecto-antes-despues.mp4` (sección 9.2): el ciclo crear →
>   poblar → aprobar → ejecutar → terminar recreado desde el código, 14 puntos complejos y un plan en 3 olas. Las olas 1
>   y 2 ya son backlog (U4, U9–U21, BL#27); lo nuevo lleva prefijo **CP** (CP1–CP12) y las decisiones D-CP1 a D-CP6.
>
> **Actualización 2026-11-04 (noche) — prioridad al backlog:**
> - **El backlog va primero.** Las Fases 0 a 3 (componentes base, arreglos rápidos, flujos y errores de datos de
>   Reportes) se ejecutan antes que cualquier pantalla nueva. Los prototipos se prueban **en paralelo** con la PO y
>   gerencia, pero solo se construyen en la Fase 5, cuando el backlog esté cerrado.
> - Entran 3 prototipos para probar (sección 9): **Proyectos v2**, **Reportes v2** e **Informes PDF**, en
>   `docs/ux-crm-2026-11/` y en el proyecto de diseño Muttu Hub. Sirven de referencia visual para los PR del backlog que
>   tocan esas pantallas.
> - Entran el prefijo **P** (piezas de los prototipos que no son backlog) y las decisiones D-G10 a D-G12.
> - El **Frente M** (correo) queda después de la Fase 3, salvo PR-M1, que puede adelantarse porque no toca pantallas.
>
> **Actualización 2026-11-04 (tarde):**
> - Entran la propuesta **U22** (avance por hitos), la ventana de producción del 4-nov (rama
>   `docs/registro-ventana-prod-2026-11-04`) y lo registrado en **engram** (prefijo **G**).
> - Entra el nuevo frente **R — Reportes y PDF**, con los hallazgos de la sección Reportes y el diseño de los 5 informes
>   en carta vertical: página «Informes PDF · Reportes» del proyecto de diseño Muttu Hub.

**Objetivo:** juntar en un solo lugar **todo** lo que sigue pendiente en Muttu Hub, comprobarlo contra el código de
`main` y ordenarlo en fases y PRs. La regla del plan es **primero los componentes compartidos y después las pantallas**:
unos diez ítems salen de los mismos 3–4 componentes base, y arreglarlos pantalla por pantalla repite el trabajo.

**Fuentes consolidadas** (este documento las reemplaza como lista de trabajo; cada una conserva su detalle):

| Prefijo | Fuente | Fecha |
|---|---|---|
| **N** | Hallazgos nuevos del CRM (revisión de código del 2026-11-04, este documento) | 2026-11-04 |
| **BL** | `docs/pendientes/mejoras-ux-reunion-2026-10-28.md` | 2026-10-29 |
| **U** | `docs/pendientes/plan-mejora-ux-proyectos.md` | 2026-11-03 |
| **O** | `docs/pendientes/oportunidades-mejora-funcionalidad-ux.md` | 2026-08-19 |
| **V / B / A / E** | `docs/plan-trabajo-restante.md` y `odd/tasks/v7-paridad-crm-2026-10-20.md` | 2026-10-19 / 26 |
| **T** | `docs/pendientes/pendientes-y-mejoras.md` (deuda técnica) | 2026-10-19 |
| **X** | Arreglos chicos anotados en el corte del 2026-10-26 | 2026-10-26 |
| **R** | Revisión de la sección Reportes y de sus PDF + diseños de Claude Design: página «Informes PDF - Reportes» (formato de los 5 PDF) y vista «Reportes» de «Muttu Hub v7» (informes nuevos y envíos programados), en el [canvas MUTTUHUB](https://claude.ai/artifact/MGkJ1Lr9JDmEdsejHqSg3t) | 2026-11-04 |
| **G** | Memorias de engram del proyecto `muttuhub-crm` (auditoría de worktrees, sesiones de sept-oct) | 2026-09-01 a 2026-11-03 |
| **P** | Prototipos para probar: Proyectos v2, Reportes v2 e Informes PDF (`docs/ux-crm-2026-11/`, sección 9) | 2026-11-04 |
| **U22** | Propuesta de avance por hitos en `docs/pendientes/plan-mejora-ux-proyectos.md` (#8868f1a) | 2026-11-04 |

**Estados:** **Abierto** (verificado en el código de `main`) · **Parcial** · **Hecho** · **Decisión** (espera a la PO
o al negocio) · **Revisar** (el código cambió después de anotarlo; hay que volver a comprobarlo) · **Descartado**
(decisión explícita de no hacerlo; no se vuelve a proponer).

---

## 1. Resumen

| Fuente | Ítems | Hecho | Parcial | Abierto | Decisión / Revisar |
|---|---|---|---|---|---|
| N — hallazgos nuevos | 10 | 0 | 0 | 10 | 2 dependen de la PO (N1, N7) |
| BL — reunión 28-oct | 27 | 0 | 1 | 21 | 3 decisión · 2 revisar |
| U — plan Proyectos | 22 | 0 | 0 | 21 | 1 decisión (U22, PO) |
| R — Reportes y PDF | 19 | 0 | 1 | 16 | 3 decisión (R12, R14, R19) |
| O — oportunidades de agosto | 12 | 5 | 1 | 6 | — |
| V — v7 en CRM | 10 | 3 | 2 | 3 | 2 fuera de alcance |
| B — producto Proyectos | 8 | 5 | 0 | 1 | 2 esperan a la PO |
| A / E — operación y plataforma | 8 | 2 | 0 | 6 | 2 dependen de acceso o decisión |
| T — deuda técnica | 9 | 2 | 0 | 6 | 1 decisión |
| G — engram | 7 | 0 | 0 | 6 | 1 descartado (Z3-11) |
| X — arreglos chicos | 2 | 0 | 0 | 2 | — |
| P — piezas nuevas de los prototipos | 5 | 0 | 0 | 0 | 5 decisión (se prueban; se construyen en la Fase 5) |

**Lectura rápida:**
- Ningún ítem de la reunión del 28-oct se cerró en `main` desde que se anotó, y el plan de Proyectos (U1–U21) está
  completo por hacer.
- Lo que sí avanzó desde el 19-oct es el producto de Proyectos (AJ-01 a AJ-06, B2, B3, B7, B8) y la parte de CRM de v7
  (Salud, Relaciones, Interacciones).
- El 4-nov producción recibió las migraciones de AJ-01 y AJ-02 (expansión) y el backfill de carpetas de cliente.
- **Reportes** es el pedido nuevo de gerencia. Tiene errores de datos que conviene corregir antes de rediseñar los PDF
  (R1–R3).
- **Prioridad:** primero el backlog (Fases 0–3). Los prototipos de Proyectos y Reportes muestran **cómo** queda cada
  arreglo del backlog; lo que no es backlog (prefijo P) espera a la Fase 5 y a las decisiones D-G10 a D-G12.

---

## 2. Estado del repositorio

- `main` local y remoto están en `8868f1a`. Desde el corte de la mañana entraron `b77f767` y `2b9445b` (backfill de
  carpetas con habilitación por host exacto) y `8868f1a` (propuesta U22).
- **Rama `docs/registro-ventana-prod-2026-11-04`** (`2e62a15`, **PR #130** abierto, solo docs). Registra la ventana de
  producción del 4-nov:
  - migraciones de AJ-01 (`ReporteActividad`) y de expansión de AJ-02 aplicadas, tras ensayo local y sobre una copia
    de producción;
  - backfill de carpetas de cliente: 52 documentos en 11 carpetas;
  - limpieza de 4 carpetas manuales duplicadas, por decisión del usuario.
- **Ramas de octubre:** todas entraron a `main` por *squash* (PRs #97–#129). Git las sigue mostrando «sin fusionar»
  porque el squash cambia los commits; se pueden borrar (lista en el Anexo B).
- **Paso de contrato de AJ-02:** la migración que borra `peso` y `peso_manual` ya está **desbloqueada**, porque el
  código de AJ-02 está en producción. Necesita su propio ensayo sobre una copia de producción
  (`odd/tasks/aj02-peso-duracion.md` L7).
  - Vive en `feat/aj02-drop-peso-columns` (`2383348`, migración `20261102120000_v2_actividades_drop_peso`) y choca con
    `main`: hay que rehacerla encima.
- **Worktrees (engram, 2026-11-03):** los 7 de `MuttuHub-CRM-worktrees/` están obsoletos y limpios. 6 de 7 ya están en
  `main`; solo `feat/deepseek-lote-5` quedó fuera (ver G1).
  - **No correr `git worktree prune` a ciegas:** git los marca «prunable» porque se registraron con rutas WSL, no
    porque falten.

---

## 3. Cómo trabajamos

Son las reglas que el repositorio ya usa (`docs/plan-trabajo-restante.md` §9), más tres para el trabajo de UI:

1. **Un PR chico por unidad, siempre desde `main`.** Sin PRs apilados: el repositorio ya documenta la trampa de la rama
   base en PRs apilados (`dd74c6a`).
2. **Pruebas primero.** Cada componente tocado tiene su `*.test.tsx`; los flujos nuevos llevan e2e en `e2e/`.
3. **CI en verde** (`unit` con piso de cobertura + `e2e`), `tsc` y lint limpios.
4. **Cambios de esquema, permisos o dinero** entran con documento en `odd/tasks/` y siguen el runbook: respaldo
   verificado, `migrate deploy` antes del código y `migrate diff` vacío.
5. **UI:** capturas de antes y después en el PR (con la base demo), textos en «tú», y ningún texto visible con Σ, pp,
   v0 ni códigos de regla.
6. **Nombres:** todo texto nuevo usa el glosario de la decisión **D-G1** (sección 4).
7. **Al cerrar un ítem**, se marca **Hecho** en este documento con el número de PR.

---

## 4. Decisiones que hay que pedir

> **Para la reunión:** las 26 decisiones abiertas están reunidas, con propuesta y bloqueo asociado,
> en `decisiones-abiertas-2026-11-04.md`.

Se resuelven juntas en la reunión de la Fase 0. Las decisiones D-A a D-D (2026-10-21 y 2026-10-26) ya están tomadas y
siguen vigentes.

| ID | Pregunta | Quién | Bloquea |
|---|---|---|---|
| **D-G1** | **Glosario:** ¿cómo se llama cada cosa? Propuesta: **Clientes** (menú, título y submenú; «Aliados» como tipo de cliente), **Tareas** para el Kanban, **Portafolio** para el tablero gerencial, **Actividades** dentro del proyecto, **Interacciones** para lo que hoy es «Bitácora». Exportar: **Excel** y **PDF**, siempre con esas dos palabras. | PO | PR-3, BL#1, N3, N7 |
| **D-G2** | **Inicio:** ¿pasa a ser «Mi día» (vencidos, agenda, compromisos y accesos rápidos) y la analítica vive solo en Reportes? | PO / gerencia | PR-12, PR-13, N1, N2 |
| **D-G3** | **Valores iniciales por rol:** Kanban en «Mías» y pestaña «Mi resumen» para Colaborador y Coordinador; «Todas» y «Pipeline» para Gerencia y Administración. ¿Se recuerda la última elección de cada usuario? | PO | PR-6, N9 |
| **D-G4** | BL#17: al soltar archivos en Documentos, ¿se suben directo con una categoría por defecto o con la última usada? | PO | PR-9 |
| **D-G5** | BL#24: ¿la exportación de clientes (Excel/PDF) respeta el filtro de etiqueta activo? | PO | PR-4 |
| **D-G6** | BL#25: ¿dónde se ven las etiquetas del cliente (tarjeta, fila, ficha)? | PO | PR-10 |
| **D-A (pregunta 1)** | En una segunda importación del mismo proyecto, ¿se conserva la estructura y solo se carga el presupuesto, o se reemplaza? | PO | B5 |
| **D-B8** | ¿Cualquier miembro del proyecto (o el coordinador) puede adjuntar el soporte de un gasto, o solo quien lo registró? | PO | — |
| **D-E** | Acceso al DNS de `muttu.co` para verificar Resend | Negocio / TI | A2, T6 |
| **D-F** ✔ | ¿Railway reemplaza solo a Vercel (Opción A) o también a Supabase (Opción B)? **Decidida (2026-11-04, Adrián): Opción A.** La app pasa a Railway y Supabase sigue dando Auth, Storage y Postgres (un día de trabajo, sin tocar identidad ni datos). La Opción B —stack completo en Railway— se revisa cuando haya requisito de datos en infraestructura propia; son 1–2 semanas con la migración de identidad como ruta crítica | Usuario | E4, E5 |
| **D-T5** ✔ | Sign-off del dueño de los datos sobre la lectura global de clientes y tareas. **Decidida (2026-11-04):** Adrián firma como dueño técnico de los datos (administra el acceso a Supabase); se pide una línea de gerencia que avale que todo el equipo lea todos los clientes y la bitácora. Abre **D-T5b**: ocultar `texto` y `próximo_paso` de la bitácora a COLABORADOR (recomendación de `docs/analisis/T3-seguridad.md:291`) | Dueño | T5 |
| **D-T5b** ✔ | **Bitácora:** ¿se ocultan `texto` y `próximo_paso` a los COLABORADOR? **Decidida (2026-11-04): se mantiene como está, por pedido de la PO.** La recomendación de la auditoría (`docs/analisis/T3-seguridad.md:291`) queda declinada a sabiendas: toda la bitácora sigue visible para cualquier usuario autenticado. Si más adelante se suma un cliente o un rol externo, revisar esto primero | PO / Adrián | T3 deuda técnica |
| **D-G7** | **U22 — avance por hitos:** ¿se aprueba? ¿Los hitos se definen al planificar o también en ejecución? ¿Pesan igual? ¿Son obligatorios para aprobar la línea base? | PO | U22 |
| **D-M1** | **Correo:** ¿se mantiene Resend (gratis hasta ~3.000/mes y 100/día, según fuentes de terceros; confirmar en su página) o se usa Brevo, Amazon SES o el SMTP de Microsoft 365? Recomendación: Resend detrás del puerto `EmailSender` | Gerencia / TI | PR-M1 en producción |
| **D-G8** | **Reportes:** ¿se aprueba el formato común de los 5 informes («Informes PDF · Reportes»)? ¿Las frases de «Lo esencial» las arma el sistema con reglas fijas? ¿Qué informes salen en envíos programados, a quién y con qué frecuencia? ¿Puede uno de ellos ir a un cliente externo? ¿Se habilita la «Legalización de gastos» con detalle por gasto, que hoy prohíbe P04 / REQ-ACC-05, y para qué roles? | Gerencia | PR-R3 a PR-R7, PR-R11, PR-R13 |
| **D-G10** | **Reportes v2:** ¿se pasa de 6 secciones a 4 informes (Mi semana, Equipo = Tareas + Gestión de tareas, Comercial = Pipeline + Actividad de clientes, Semanal)? Si se aprueba, los PDF también son 4 | Gerencia | P1, PR-R3 a PR-R7 |
| **D-G11** | **Proyectos v2:** ¿entra «Lo que te toca esta semana» en el portafolio, distinto por rol? | PO | P3 |
| **D-G12** | **Proyectos v2:** ¿entra «Avisar a Gerencia» cuando un borrador queda listo y quien lo armó no puede aprobar? | PO | P4 |
| **D-CP1** | **Ciclo del proyecto:** ¿el responsable es obligatorio al crear la actividad o basta con exigirlo para aprobar la línea base? | PO | CP3 |
| **D-CP2** | **Ciclo del proyecto:** ¿se elimina «Tipo de medio exigido» del entregable? | PO | CP5 |
| **D-CP3** | **Ciclo del proyecto:** en el checklist de cierre, ¿qué bloquea el cierre y qué solo avisa? | PO / Gerencia | CP11 |
| **D-CP4** | **Ciclo del proyecto:** ¿el cambio de meta de un entregable es una modificación existente o nueva, y quién la aprueba? | PO | CP10 |
| **D-CP5** | **Ciclo del proyecto:** ¿qué lleva el informe de cierre y a quién se envía? | Gerencia | CP12 |
| **D-CP6** | **Ciclo del proyecto:** ¿el código automático se puede editar a mano? | PO | CP1 |
| **D-V3-1** ✔ | **Proyectos v3:** ¿la interfaz de U17–U21 (F4.7) se hace solo en v3 y el backlog entrega solo el backend? **Decidida (2026-11-04, Adrián): no se reserva.** La interfaz de U17–U21 se construye en la sección viva a medida que el backlog la pida, y v3 hereda ese trabajo cuando llegue. Razón: v3 está en cero, su puerta necesita 13 decisiones y la gente sigue reportando que Proyectos es difícil de usar; reservarle la interfaz dejaría esas mejoras esperando meses | Adrián | F4.7, B3–B7 |
| **D-V3-2** | **Proyectos v3:** ¿cuándo se retira v1? **Pendiente de precisión:** «v1» no existe como sección — en el código **v2 es lo que está en producción**. Reformular: ¿cuándo se retira la sección actual (v2) cuando v3 esté lista? Propuesta original: tras 2 semanas de piloto con un coordinador y paridad de reglas al 100 % | Adrián / Gerencia | B8 |
| **D-G9** | **R12:** ¿hace falta un «Informe de avance para el aliado» por proyecto, sin valores comerciales ni notas internas, para enviar a clientes externos? | Gerencia | R12 |

---

## 5. Fases y PRs

Tamaños: **S** ≤ 1 día · **M** 2–4 días · **L** ≥ 1 semana.

**Regla de prioridad:** el backlog va primero.
1. **Fases 0 a 3** son backlog puro (BL, N, U1–U21, R1–R9, X, G): se hacen en ese orden y nada nuevo se mete en medio.
2. **Mientras tanto**, los prototipos de la sección 9 se prueban con la PO y gerencia (semanas 1 y 2) y sus decisiones
   se anotan en la sección 4.
3. **Cada PR del backlog que toca Proyectos o Reportes se hace como se ve en su prototipo**, para no rediseñar dos
   veces. Ejemplo: PR-7a a PR-7d (textos de Proyectos) usan los nombres del prototipo de Proyectos v2.
4. **Fase 4** (funcionalidad nueva del backlog), el **Frente M** (correo) y la **Fase 5** (piezas nuevas de los
   prototipos) van al final, en ese orden.

### Fase 0 — Preparación (~1 día, sin tocar UI)

| ID | Tarea | Tamaño | Terminado cuando |
|---|---|---|---|
| F0.1 | ~~Subir los 2 commits de `feat/backfill-carpetas-remote-guard`~~ | S | **Hecho** (2026-11-04): `b77f767` y `2b9445b` están en `main`; el backfill corrió en producción |
| F0.1b | Abrir y fusionar el PR de `docs/registro-ventana-prod-2026-11-04` (`2e62a15`) | S | Registro de la ventana en `main` |
| F0.2 | Borrar las ramas ya fusionadas (Anexo B), revisando antes la lista de PRs cerrados en GitHub | S | `git branch -r` solo muestra trabajo vivo |
| F0.3 | Rehacer `feat/aj02-drop-peso-columns` sobre `main`, ensayarla sobre una copia de producción y aplicarla. Ya está desbloqueada: AJ-02 está en producción desde el 4-nov | S | Migración aplicada con respaldo, `migrate diff` vacío y conteos verificados |
| F0.4 | **X1**: «La descripción es obligatorio.» → «obligatoria» (corregir también `gastos-import/parse.test.ts:317`). **X2**: los imports de presupuesto y gastos aceptan solo `modo=validar` o `modo=aplicar` (hoy `budget/import/route.ts:72` aplica con cualquier otro valor) | S | Pruebas que fijan ambos comportamientos |
| F0.5 | Reunión con la PO: decisiones D-G1 a D-G6 y D-A pregunta 1 | S | Respuestas anotadas en la sección 4 |
| F0.6 | Este documento en `main` como lista única de trabajo; los documentos de origen enlazan aquí | S | PR de docs fusionado |
| F0.7 | Capturas de referencia («antes») de Inicio, Clientes, ficha del cliente, Tareas, Reportes y ficha de proyecto con la base demo, a 1440 px y 390 px. Incluir un PDF de cada reporte actual | S | Capturas y PDF guardados para comparar en los PRs |
| F0.8 | Limpiar los 7 worktrees obsoletos (G2) sin `git worktree prune` a ciegas: `git worktree remove` uno por uno desde el mismo entorno (WSL) que los creó | S | `git worktree list` solo muestra el repositorio principal |
| F0.9 | Reunión con gerencia sobre Reportes: D-G8 y D-G9 | S | Formato de informes aprobado |

### Fase 1 — Componentes base (~2–3 días, 3 PRs)

| PR | Rama | Ítems | Tamaño | Terminado cuando |
|---|---|---|---|---|
| **PR-1** | `fix/ui-dialog-base` | BL#14, BL#21, BL#12, BL#11 | M | `DialogContent` trae altura máxima con desplazamiento del cuerpo y pie fijo; un solo tamaño de título; convención de «Cancelar» documentada junto al componente y aplicada en todos los diálogos |
| **PR-2** | `fix/ui-dialog-pending` | BL#9, BL#22, BL#15, BL#10 | M | Un helper compartido impide cerrar con Esc, clic fuera o X mientras hay una operación en curso; `ConfirmDialog` espera la respuesta con botón en carga y error en línea; los formularios largos preguntan «¿Descartar los cambios?» |
| **PR-3** | `chore/ui-glosario` | BL#1, N7, N3 (nombres) | S–M | Menú, títulos (`src/lib/nav.ts`), submenú y botones de exportar usan el glosario D-G1; las guías de `docs/` actualizadas |
| **PR-R1** | `fix/reportes-datos` | R1, R2, R3, R4, R6 | M | Ver PR-R1 en la sección «Frente R» |
| **PR-R2** | `feat/print-sheet-base` | R9 | M | Ver PR-R2 en la sección «Frente R» |

> PR-1 y PR-2 no dependen de nadie. PR-3 espera a D-G1. PR-R1 y PR-R2 tampoco dependen de nadie y corrigen lo que
> gerencia ve hoy.

### Fase 2 — Arreglos rápidos por área (~1 semana)

| PR | Rama | Ítems | Tamaño |
|---|---|---|---|
| **PR-4** | `fix/clientes-rapidos` | N3 («Desactivar» a un menú «Más»; tipo de interacción por defecto «Reunión» en la ficha), N6 (quitar «Ver detalle» repetido), BL#18, BL#23, BL#24 (según D-G5) | M |
| **PR-5** | `fix/inicio-reportes-rapidos` | N8 / R5, BL#3, BL#5 | S–M |
| **PR-6** | `feat/valores-por-rol` | N9 (según D-G3), BL#26 | S–M |
| **PR-7a–d** | `fix/proyectos-textos-*` | U1–U8, en 4 PRs como propone el plan de Proyectos: asistente (U1–U3), presupuesto (U4), ejecución e indicadores (U5), importación y plantilla (U6–U8) | S cada uno |
| **PR-8** | `fix/proyectos-rapidos` | BL#13, BL#16, BL#7, N10 | S–M |
| **PR-9** | `fix/documentos-revision` | BL#17 (según D-G4), BL#19 y BL#20 después de comprobarlos contra el rediseño del explorador (`74c227c`) | S–M |

### Fase 3 — Flujos (~2 semanas)

| PR | Rama | Ítems | Tamaño | Nota |
|---|---|---|---|---|
| **PR-10** | `feat/ficha-cliente-acciones` | N3 («Registrar interacción» en la cabecera, «Convertirlo en compromiso» desde «Próximo paso», pestaña **Proyectos**, pestaña activa en la URL), BL#25 | M | La pestaña Proyectos es solo frontend: `GET /api/v1/projects?cliente_id=` ya existe |
| **PR-11** | `feat/clientes-ultimo-contacto` | N6 (último contacto y días sin gestión en tarjeta, lista y tabla; filtro «sin gestión hace N días») | M | Requiere backend: el listado no trae el dato. Reutilizar el cálculo de contacto reciente de `GET /api/v1/clients/health` |
| **PR-12** | `feat/inicio-mi-dia` | N1, BL#2 | M–L | Según D-G2. Reutiliza `CaraMiResumen`, el panel de notificaciones y «Requiere atención» |
| **PR-13** | `refactor/reportes-tareas-unico` | N2 | M | Un solo informe de tareas; la vista «Reporte» del Kanban enlaza a Reportes |
| **PR-14** | `feat/proyectos-linea-base-check` | U9, U10 | M | Endpoint `GET /projects/:id/baseline/check` y «Próximos pasos» con «Corregir aquí» |
| **PR-15** | `feat/proyectos-revision-semaforo` | U11, U12 | M | Depende de PR-14 |
| **PR-16** | `feat/proyectos-atajos` | U13–U16 | S–M | |
| **PR-17** | `fix/impresion-unificada` | BL#8 | M | Mover `/proyectos/[id]/imprimir` a `/print/*` con el mismo encabezado y «Volver» |
| **PR-18** | `docs/discovery-proyectos-simple` | BL#27 | S | Discovery con la PO: jerarquía de acciones, separar «Reportar avance %» de «Registrar entregable», aviso de fechas pasadas al importar |

### Fase 4 — Funcionalidad nueva (cada ítem con documento en `odd/tasks/`)

| ID | Ítems | Tamaño | Depende de |
|---|---|---|---|
| **F4.1** | **Oportunidades globales**: N4, V1, V2 (lista y kanban por etapas; ficha propia con conversión a proyecto) | L | D-D (ya aprobada); mapeo del enum de estados a las etapas |
| **F4.2** | **Búsqueda global** (`Ctrl/Cmd+K`): N5, O1 | M–L | — |
| **F4.3** | Tareas vinculadas a un proyecto: BL#6 | M | Migración |
| **F4.4** | PDF del portafolio: BL#4 | M | PR-17 |
| **F4.5** | Rubros habilitables por proyecto: B6 | M–L | D-B (decidida), migración |
| **F4.6** | Solo estructura / plantillas de la PO: B5, B4 | S–M | D-A pregunta 1; validación de la PO |
| **F4.7** | Flujos más cortos en Proyectos: U17–U21 | L | PR-14 |
| **F4.7b** | Avance por hitos: U22 (tabla nueva de hitos, checklist en «Registrar avance», hoja «Hitos» en la plantilla) | M/L | D-G7, migración aditiva |
| **F4.8** | Papelera (O2), exportar Documentos y Bitácora de auditoría (O3), línea de tiempo unificada en la ficha (O4), preferencias de notificación por usuario (O5), orden dentro de una columna del Kanban (O6, migración), densidad de tabla (O11) | M cada uno | — |
| **F4.9** | Mapa por departamento (V5), reglas extra de automatización (V8), tabla mensual editable con «nueva planeación» (V9) | M–L | V5: migración; V8 plantillas de correo: A2 |

### Frente R — Reportes y PDF (pedido de gerencia, 2026-11-04)

El diseño de referencia es la página **«Informes PDF · Reportes»** del proyecto de diseño Muttu Hub. Tiene 7 hojas
carta vertical con datos ficticios:

| Informe | Páginas |
|---|---|
| Tareas del equipo | 2 |
| Semanal de gerencia | 2 |
| Pipeline comercial | 1 |
| Actividad de clientes | 1 |
| Mi resumen | 1 |

Todas comparten la misma anatomía:
- cabecera con logo, clasificación («Interno · Gerencia» o «Personal»), «Reporte N de 5» y página;
- «Lo esencial» en tres frases;
- 4 indicadores con comparación contra el periodo anterior;
- gráficos con valores y leyenda;
- tablas con fila de total;
- línea de filtros en lenguaje claro («Responsable: Todos · Excluye: Canceladas»), nunca nombres de campos;
- seguro para imprimir: texto de 12 px o más y legible en escala de grises, sin depender de «Gráficos de fondo»;
- pie con quién lo generó y «Página X de Y».

La vista **«Reportes» de «Muttu Hub v7»** (mismo canvas) agrega dos cosas que no están en los 5 PDF:
- **informes nuevos**, con botones PDF y Excel: avance de proyecto, estado del portafolio, ejecución financiera por
  rubro, legalización de gastos y semaforización territorial (R14, R15);
- **envíos programados** (R16), con un ejemplo de cada uno: «Estado del portafolio» a Gerencia los lunes 07:00,
  «Informe de avance» del proyecto al cliente el día 5 de cada mes y «Pipeline comercial» al equipo comercial los
  viernes 16:00.

**Orden:** primero que los números sean correctos (PR-R1), luego la base de impresión (PR-R2), y al final cada informe.

| PR | Rama | Ítems | Tamaño | Terminado cuando |
|---|---|---|---|---|
| **PR-R1** | `fix/reportes-datos` | R1, R2, R3, R4, R6 | M | «A tiempo» cuenta las cerradas hasta el final del día de entrega; ninguna barra pasa del 100 %; no salen filas en cero ni usuarios de prueba; no se ven nombres de campos (`completed_at`); cada indicador muestra su propia barra. Pruebas que fijan cada regla |
| **PR-R2** | `feat/print-sheet-base` | R9 | M | Un componente de hoja compartido para todas las vistas de `/print/*`, con: `@page { size: letter }`, `print-color-adjust: exact`, cabecera y pie fijos, imprimir solo tras `document.fonts.ready`, y filas que no se parten. Hoy hay 3 plantillas distintas (`kanban/print-report.tsx`, `dashboard/print-dashboard.tsx`, `reportes/print-reporte-semanal.tsx`) |
| **PR-R3** | `feat/reporte-tareas-unico` | R10 (Tareas), N2, R7, R8 | M | Una sola pestaña «Tareas del equipo» (se va «Gestión de tareas»), en pantalla y en PDF según el diseño |
| **PR-R4** | `feat/reporte-semanal-v2` | R10 (Semanal) | M | Semáforo ordenado por urgencia, «Requiere atención» con responsable, actividades atrasadas y gastos por validar |
| **PR-R5** | `feat/reporte-pipeline-v2` | R10 (Pipeline) | S–M | Embudo por etapa con valor, clientes con más valor en juego y decisiones de los próximos 30 días |
| **PR-R6** | `feat/reporte-clientes-v2` | R10 (Actividad de clientes) | S–M | Lista de clientes sin gestión con días, interacciones por tipo y gestión por responsable |
| **PR-R7** | `feat/reporte-mi-resumen-v2` | R10 (Mi resumen) | S–M | Para hoy, vencidas, resto de la semana, compromisos y mis clientes con días sin gestión |
| **PR-R8** | `feat/reportes-comparativo` | R11 | M | La API devuelve el periodo anterior y las reglas de «Lo esencial»; puede ir antes de PR-R3 o junto con él |
| **PR-R9** | `feat/informe-aliado` | R12 | M | Según D-G9 |
| **PR-R10** | `feat/semanal-por-correo` | R13 | M | El semanal llega por correo a gerencia el lunes. Depende de A2 (dominio en Resend) |
| **PR-R11** | `feat/informes-financieros` | R14 | M | «Ejecución financiera por rubro» (proyectado vs ejecutado y semáforo por rubro y mes) en PDF con la base de PR-R2, reutilizando la hoja «Financiera» del Excel del proyecto. «Legalización de gastos» solo si D-G8 autoriza el detalle por gasto (hoy lo prohíbe P04 / REQ-ACC-05), con el mismo control de acceso que los soportes |
| **PR-R12** | `feat/informe-territorial` | R15 | M | «Semaforización territorial»: estado técnico y financiero por departamento. Depende de V5 (`Cliente.ubicacion` es texto libre) |
| **PR-R13** | `feat/envios-programados` | R16 | M–L | Cualquier informe se programa con destinatarios, día y hora; generaliza PR-R10. Depende de A2 y D-G8 |

Ubicación en el calendario:
- PR-R1 y PR-R2 entran en la **Fase 1** (semana 1).
- PR-R3 a PR-R8 pasan a la **Fase 5**, después del backlog: dependen de D-G10 (¿6 o 4 informes?) y se construyen
  según el prototipo Reportes v2 y los Informes PDF. Excepción: si gerencia pide un informe antes, PR-R3 (Tareas
  unificado, que también cierra N2) puede adelantarse a la Fase 3.
- PR-R9 a PR-R13 entran en la **Fase 4**. «Estado del portafolio» en PDF ya es BL#4 (F4.4), y conviene hacerlo con la
  base de PR-R2.

### Frente M — Notificaciones por correo (pedido de gerencia, 2026-11-04)

Pedido, textual: «mi jefe me pidió que se enviaran notificaciones por correo electrónico, que tipo de notificaciones
podemos enviar y que servicio o microservicio propio podemos utilizar, o herramientas opensource o gratuitas».

**Punto de partida (verificado en `main`):** `src/lib/email.ts` ya envía un resumen diario por usuario con Resend
desde el cron (`api/v1/cron/daily`), y hoy falla con 403 «domain not verified» (A2). La app tiene 5 tipos de
notificación interna (`TipoNotificacion`). Supabase envía los correos de acceso con sus plantillas
(`supabase/email-templates/`). En local, el stack de Supabase trae **Mailpit** (`localhost:54324`) para ver los correos
sin enviarlos.

**Arquitectura elegida:** sin microservicio aparte. Un **outbox** en Postgres (hecho en PR-M1, rama `feat/email-outbox`; el adaptador local usa la API HTTP de Mailpit en vez de SMTP, así que un proveedor solo-SMTP según D-M1 necesitará un adaptador nuevo) (la notificación se escribe en la misma
transacción que el evento), un worker con reintentos (el cron existente) y un puerto `EmailSender` con adaptadores
(Resend hoy; SMTP con Nodemailer para Mailpit en local y como salida a Brevo, SES o Microsoft 365). Plantillas con la
marca. Cambiar de proveedor toca un solo adaptador.

| ID | Notificación | Envío | Destinatario |
|---|---|---|---|
| M1 | Resumen diario (vencidas, hoy, próximas) | 7:00 a. m. | Cada usuario (ya existe) |
| M2 | Tarea asignada o comentada | Inmediato | Asignado |
| M3 | Gasto rechazado | Inmediato | Quien lo registró |
| M4 | Gastos por validar | En el resumen diario | Validador |
| M5 | Sobregasto de rubro | Inmediato | Coordinador y gerencia |
| M6 | Solicitud de modificación creada, aprobada o rechazada | Inmediato | Aprobadores y solicitante |
| M7 | Entregable por vencer sin soporte | En el resumen diario | Responsable |
| M8 | Proyecto pasa a rojo en el semáforo | Inmediato | Coordinador y gerencia |
| M9 | Solicitud de acceso | Inmediato | Administración |
| M10 | Preferencias por usuario: qué recibe e inmediato o en resumen (O5) | — | — |

| PR | Rama | Ítems | Tamaño | Terminado cuando |
|---|---|---|---|---|
| **PR-M1** | `feat/email-outbox` | Outbox, worker con reintentos, puerto `EmailSender` con adaptadores Resend y SMTP (Mailpit en local) | M | Un evento de prueba llega a Mailpit en local; un fallo del proveedor se reintenta sin duplicar; pruebas del worker |
| **PR-M2** | `feat/email-plantillas` | Plantillas con la marca para M1–M9 (incluye T6) | M | Cada plantilla con su prueba de render; textos en «tú» |
| **PR-M3** | `feat/email-eventos` | M2, M3, M5, M6, M8, M9 | M | Cada evento escribe su fila en el outbox en la misma transacción; pruebas por evento |
| **PR-M4** | `feat/email-resumen-v2` | M1, M4, M7 | S–M | El resumen diario suma gastos por validar y entregables sin soporte |
| **PR-M5** | `feat/email-preferencias` | M10, O5 | M | Pantalla de preferencias por usuario; el worker las respeta |
| **PR-M1b** | `fix/email-outbox-lease` | Seguimiento del verificador de PR-M1: token de reclamo en las transiciones (hoy, si una corrida supera el lease de 10 min, un correo ya enviado vuelve a PENDIENTE y se reenvía; Resend lo deduplica 24 h, Mailpit/SMTP no), timeout en `fetch` y respeto de 429, drenar la cola después del resumen diario, y en el runbook: migración antes que el código | S–M | Prueba que reproduce la carrera y queda en verde; lote de 200 con timeout |

Depende de **D-E** solo para producción (DNS de `muttu.co`: SPF y DKIM para cualquier proveedor). En local no hay
bloqueo. **D-M1** decide el proveedor de producción.

**Ubicación del Frente M:** después de la Fase 3, porque es funcionalidad nueva. PR-M1 (outbox y adaptadores, con
Mailpit en local) puede adelantarse si gerencia lo prioriza: no toca pantallas ni choca con el backlog.

### Fase 5 — Refactor según los prototipos (después del backlog)

Cuando las Fases 0 a 3 estén cerradas, gran parte de los prototipos ya estará construida, porque es backlog. Esta fase
solo junta lo que falta, según las decisiones que salgan de las pruebas.

| ID | Qué | Ya cubierto por el backlog | Lo que queda para esta fase | Depende de |
|---|---|---|---|---|
| **F5.1** | Proyectos v2 (portafolio, asistente, ficha y registros) | U1–U21 (PR-7, PR-14 a PR-16, F4.7), BL#7, 9, 10, 13, 16 y 27 | P3 «Lo que te toca esta semana», P4 «Avisar a Gerencia», P5 reorganización del portafolio y del detalle de actividad | D-G11, D-G12 |
| **F5.2** | Avance por hitos | — | U22 (F4.7b) con la variante del prototipo | D-G7 |
| **F5.3** | Reportes v2 (flujo de 4 pasos) | N2, N8, BL#3, BL#5, R1–R9 | P1 4 informes, P2 selector por preguntas, filtro único, barra de acciones y vista previa del PDF; PR-R3 a PR-R8 | D-G10, D-G8 |
| **F5.4** | Envíos programados | — | PR-R10 y PR-R13 (usan el outbox de PR-M1) | A2, D-G8, PR-M1 |

### En paralelo — operación, plataforma y deuda técnica

| ID | Tarea | Depende de |
|---|---|---|
| A2 | Verificar `muttu.co` en Resend y ajustar `EMAIL_FROM` (hoy el cron registra 403 «domain not verified») | D-E |
| A3 | Prueba de humo en producción con un Coordinador y un Colaborador reales | — |
| A4 | Respaldos automáticos y una restauración de prueba | Plan de Supabase |
| E4 / E5 | Migración a Railway, opción A u opción B | D-F |
| E6 | Limpiar artefactos del repositorio (zip del prototipo, PDFs y HTML sueltos en la raíz) | Decisión del usuario |
| T1 | Pasar a CI los e2e legacy de la raíz (`invitation-flow`, `oportunidad-ciclo`, `permisos-colaborador`, `proyectos-ficha-pagina`) | — |
| T3 | Medir el rendimiento de las listas tras la globalización (2 `count()` por request, enriquecimiento O(n²) en `clients/route.ts`) | — |
| T4 | Borrar el fork personal del repositorio para cortar los pushes al remoto equivocado | — |
| T5 | Sign-off del dueño de los datos | D-T5 |
| T6 | Plantillas de correo con marca (`supabase/email-templates/`) | A2 |
| T7 | Interfaz de reautenticación para operaciones sensibles | — |
| T8 | Archivar el cambio `openspec/changes/oportunidades-comerciales` (sus PRs ya están en `main`) | — |
| G1 | Revisar y portar lo útil de `feat/deepseek-lote-5`: `aria-label` en las pestañas de la ficha de proyecto y en los 4 filtros del CRM, responsive a 390 px, endurecimiento de asserts Z5, unificación de labels y hints, y 122 líneas del test de invariantes v1. Verificar cada uno contra `main` antes de portarlo | — |
| G2 | Limpiar los 7 worktrees obsoletos (F0.8) | — |
| G3 | Unificar los tipos `AuditEntidad`/`AuditAccion`: siguen duplicados en `src/lib/api/audit.ts:29` y `src/hooks/admin.ts:45` | — |
| G4 | Parametrizar `scripts/offboard-camarabaq.ts`: tiene 4 correos escritos en el código. Engram pedía generalizarlo antes de subirlo y hoy está en `main` | — |
| G5 | Cerrar los 3 «⚠» sin verificar del runbook (`docs/runbook-lanzamiento-v2.md`): versión de Node en Vercel, `psql` en WSL, reenvío `WSLENV` con `npx` | — |
| G6 | Evitar carpetas de cliente duplicadas: `findOrCreateClientFolder` solo busca por `cliente_id`, así que una carpeta manual con el nombre del cliente queda duplicada. Avisar o enlazar por nombre al crear | — |

### Calendario orientativo

| Semana | Contenido |
|---|---|
| 1 | Fase 0 + PR-1 + PR-2 + **PR-R1 + PR-R2** (+ PR-3 si D-G1 llega a tiempo) · **pruebas del prototipo Proyectos v2 con la PO** |
| 2 | Fase 2 completa (PR-4 a PR-9) · **pruebas de Reportes v2 e Informes PDF con gerencia** · decisiones D-G7, D-G8, D-G10 a D-G12 |
| 3–4 | Fase 3 (PR-10 a PR-18) |
| 5 en adelante | Fase 4 (backlog funcional) en el orden F4.1 → F4.2 → F4.3 → resto, según la PO; luego Frente M (PR-M1 a PR-M5) |
| Después | Fase 5: piezas nuevas de los prototipos según lo decidido |

---

## 6. Hallazgos nuevos del CRM (N1–N10)

Revisión de código del 2026-11-04 sobre `main` (`a55c575`), comparada con el diseño v7.

### Mayor impacto

**N1 — Inicio no responde «¿qué hago hoy?».** · Abierto · PR-12
Abre con 4 pestañas de analítica y arranca en «Pipeline» para todos (`src/components/dashboard/dashboard-page.tsx:62`).
Esas mismas 4 pestañas se repiten en Reportes (`src/components/reportes/reportes-page.tsx`). El diseño v7 plantea
Inicio como «esto necesita tu atención hoy», con alertas y agenda.
*Propuesta:* que Inicio sea «Mi día» (vencidos, agenda, mis compromisos y accesos rápidos) y que la analítica viva solo
en Reportes.

**N2 — Reportes tiene informes de tareas repetidos.** · Abierto · PR-13
Hay una pestaña «Tareas» (`reportes-page.tsx:139`) y otra «Gestión de tareas» (una de las 4 caras), y además el
Tablero tiene su propia vista «Reporte» (`kanban-board.tsx`). Hay que dejar uno solo.

**N3 — En la ficha del cliente, la acción principal está escondida.** · Abierto · PR-3, PR-4, PR-10
- «Registrar interacción» no está en la cabecera. Ahí está «Desactivar cliente», que es destructiva, al mismo nivel
  que «Editar» (`src/components/crm/client-sheet.tsx`, `SheetHeaderContent`). *Propuesta:* mover «Desactivar» a un
  menú «Más».
- La misma cosa tiene tres nombres: «Bitácora» en la ficha, «Interacciones» en el submenú y el botón «Agregar nota».
- El tipo por defecto en la ficha es «Otro» (`client-sheet.tsx:1334`) y en el diálogo global es «Reunión»
  (`interaccion-form-dialog.tsx:54`). Esto ensucia los datos. (El esquema también tiene `@default(OTRO)` en
  `BitacoraEntrada.tipo`; basta con cambiar el valor inicial de la interfaz.)
- «Próximo paso» es texto libre y no crea un compromiso con fecha. *Propuesta:* botón «Convertirlo en compromiso».
- No hay pestaña de Proyectos del cliente: solo existe el botón «Crear proyecto».

**N4 — No hay vista global de Oportunidades.** · Abierto · F4.1
La ruta `/clientes/oportunidades` redirige a `/clientes` y las oportunidades solo se ven dentro de cada ficha. Es la
brecha funcional más grande para un CRM; v7 la tiene como kanban de 7 etapas. Coincide con V1 y V2 (aprobadas en D-D).

**N5 — No hay búsqueda global.** · Abierto · F4.2
v7 muestra «Buscar aliados, oportunidades, proyectos…» y sigue pendiente desde agosto (O1).

### Arreglos rápidos (1–2 días)

**N6 — La tarjeta del cliente no muestra el último contacto ni los días sin gestión.** · Abierto · PR-4, PR-11
Es la señal clave de un CRM y ya se calcula en Salud. Además la tarjeta repite el botón «Ver detalle» aunque toda la
tarjeta ya es clicable (`client-list.tsx`, `ClientCard`).

**N7 — Nombres inconsistentes.** · Abierto · PR-3
- El mismo módulo se llama «Clientes» en el menú, «Aliados y clientes» en el título y «Aliados» en el submenú.
- Para exportar hay cuatro textos: «PDF», «Imprimir», «Generar reporte» y «Exportar PDF».

**N8 — Rango de fechas duplicado en Inicio.** · Abierto · PR-5
El desplegable del header (`src/components/shell/header.tsx`) y los chips del dashboard controlan el mismo dato
(`useFiltersStore`).

**N9 — Valores iniciales sin pensar en el rol.** · Abierto · PR-6
El Kanban abre en «Todas» (`kanban-board.tsx:144`). Para un colaborador debería abrir en «Mías», y la app debería
recordar la última elección. Lo mismo con la pestaña inicial de Inicio.

**N10 — `/proyectos/nuevo` muestra «Muttu Hub» como título genérico.** · **Hecho** (verificado 2026-11-04) · PR-8
Falta en `PAGE_HEADERS` (`src/lib/nav.ts`) y la página queda con dos `<h1>` (el del shell y el de
`nuevo-proyecto.tsx:103`). Lo mismo pasa en `/proyectos/[id]/imprimir`.

---

## 7. Inventario completo del backlog

### 7.1 Reunión del 2026-10-28 (BL#1–27)

| # | Ítem | Estado | Evidencia en `main` | Fase / PR |
|---|---|---|---|---|
| BL#1 | «Tablero» significa tres cosas distintas | Abierto | `src/lib/nav.ts`: «Tablero» sigue en el menú | PR-3 |
| BL#2 | El portafolio no aparece en Inicio ni en Reportes | Parcial | Reportes › Semanal ya incluye el portafolio (#111); Inicio no | PR-12 |
| BL#3 | Reportes › Gestión de tareas sin filtro por responsable ni cliente | Abierto | `reportes-page.tsx`: `responsable={undefined} cliente={undefined}` | PR-5 |
| BL#4 | No existe el PDF del portafolio | Abierto | `dashboard/portfolio/export/route.ts`: `formato=pdf` responde 400 | F4.4 |
| BL#5 | Pestañas de Reportes con parches `!important` | Abierto | `reportes-page.tsx` (3 clases forzadas) | PR-5 |
| BL#6 | Tareas sin vínculo a proyecto | Abierto | `model Tarea` solo tiene `cliente_id` y `oportunidad_id` | F4.3 |
| BL#7 | Nuevo proyecto usa el pie de un modal | **Hecho** (verificado 2026-11-04: `variant` por defecto es `page`) | `project-create-form.tsx:594` (`DialogFooter`) | PR-8 |
| BL#8 | Vistas de impresión inconsistentes | Abierto | `/proyectos/[id]/imprimir` sigue fuera de `/print/*` | PR-17 |
| BL#9 | Esc, clic fuera o X cierran con la operación en curso | Abierto | Sin helper compartido (p. ej. `import-dialog.tsx:118`) | PR-2 |
| BL#10 | Formularios largos pierden lo escrito sin aviso | Abierto | Sin confirmación en `editar-datos-generales.tsx` ni `modificacion-form.tsx` | PR-2 |
| BL#11 | «Cancelar» con estilos distintos | Abierto | Mezcla de `ghost` y `outline` | PR-1 |
| BL#12 | Tamaño del título distinto entre diálogos | Abierto | `subir-documento-dialog.tsx:86` usa el tamaño por defecto | PR-1 |
| BL#13 | «Cambiar estado» confirma con «Confirmar» genérico | **Hecho** (2026-11-04, `adc3c72`) | `estado-proyecto-acciones.tsx:152` | PR-8 |
| BL#14 | Los diálogos no limitan su altura | Abierto | `ui/dialog.tsx` sin altura máxima | PR-1 |
| BL#15 | Aprobar una solicitud cierra el diálogo antes del resultado | Abierto | `solicitudes-section.tsx:383` | PR-2 |
| BL#16 | «Subir documento» no dice qué archivos acepta | **Hecho** (verificado 2026-11-04: `accept` y «máx. N MB» salen de las constantes de la API) | Sin `accept` ni tamaño en `subir-documento-dialog.tsx` | PR-8 |
| BL#17 | Soltar archivos siempre abre el diálogo | Decisión | D-G4; revisar tras `74c227c` | PR-9 |
| BL#18 | «Carpeta de cliente» solo encuentra 100 clientes | Abierto | `hooks/kanban.ts:278` (`limit=100`) | PR-4 |
| BL#19 | Soltar un documento en su propia carpeta lo «mueve» | Revisar | El explorador se rediseñó el 2026-11-02 (`74c227c`) | PR-9 |
| BL#20 | Asa de arrastre muy pequeña | Revisar | Mismo rediseño | PR-9 |
| BL#21 | Los diálogos largos del CRM no fijan el pie | Abierto | `ui/dialog.tsx` | PR-1 |
| BL#22 | `ConfirmDialog` se cierra antes de terminar | Abierto | `entity-dialogs.tsx`: `onConfirm: () => void` | PR-2 |
| BL#23 | El formulario de cliente siempre está montado | Abierto | `client-form.tsx:620`, `client-sheet.tsx:271` | PR-4 |
| BL#24 | PDF y Excel de clientes ignoran el filtro de etiqueta | Decisión | D-G5; el export no lee `etiqueta` | PR-4 |
| BL#25 | Etiquetas del cliente no se ven fuera del formulario | Decisión | D-G6; ni tarjeta, ni fila, ni ficha | PR-10 |
| BL#26 | Filtro de etiquetas del Kanban de selección única | Abierto | `kanban-board.tsx`: `etiqueta: ""` | PR-6 |
| BL#27 | La sección Proyectos se percibe compleja | Abierto | Discovery pendiente; fechas pasadas sin aviso al importar | PR-18 |

### 7.2 Plan UX de Proyectos (U1–U21)

Detalle, evidencia y propuesta de cada ítem en `docs/pendientes/plan-mejora-ux-proyectos.md`. Verificado el
2026-11-04: **todos abiertos** (p. ej. U1 sigue con «Es opcional» en `project-create-form.tsx:556`; U2 sigue con el
paso «Metas»; U3 sigue diciendo «Si no lo escribes…»; U4 tiene 5 apariciones de «Σ»; U5 conserva «Original (v0)» y
«No confirmado»; U6 muestra la columna «Regla»; U8 tiene 7 voseos en `plantilla/generate.ts`; U9 no existe
`baseline/check`).

| Fase del plan | Ítems | PR |
|---|---|---|
| 1 — Palabras y avisos | U1–U8 | PR-7a a PR-7d |
| 2 — Requisitos visibles | U9–U12 | PR-14, PR-15 |
| 3 — Atajos | U13–U16 | PR-16 |
| 4 — Flujos más cortos | U17–U21 | F4.7 |
| Propuesta para la PO — avance por hitos | U22 (#8868f1a): el % se calcula con hitos cumplidos ÷ hitos totales y se conservan las reglas de AJ-01. **Decisión: espera aprobación de la PO (D-G7)** | F4.7b |

### 7.3 Oportunidades de agosto (O1–O12)

| # | Ítem | Estado | Fase |
|---|---|---|---|
| O1 | Búsqueda global (`Ctrl/Cmd+K`) | Abierto | F4.2 |
| O2 | Papelera para restaurar lo borrado | Abierto | F4.8 |
| O3 | Exportar Documentos y Bitácora de auditoría a Excel | Abierto | F4.8 |
| O4 | Línea de tiempo unificada en la ficha del cliente | Abierto | F4.8 |
| O5 | Preferencias de notificación por tipo y por usuario | Abierto (Automatizaciones es global, no por usuario) | F4.8 |
| O6 | Orden persistente dentro de una columna del Kanban | Abierto (sin campo `orden` en `Tarea`) | F4.8 |
| O7 | Kanban en móvil como lista agrupada | Hecho (Fase 5, PR 34) | — |
| O8 | Teclado en el drag and drop | Hecho | — |
| O9 | Confirmaciones destructivas consistentes | Hecho (sin `window.confirm` en `src/components`) | — |
| O10 | Estados vacíos accionables | Hecho en la ficha del cliente | — |
| O11 | Densidad de tabla configurable | Parcial (Clientes tiene vista «Lista»; falta en Repositorio y Bitácora) | F4.8 |
| O12 | Indicadores visuales en el dashboard | Hecho (`sparkline.tsx`, `trend-figure.tsx`) | — |

### 7.4 v7 en CRM (V1–V10)

| # | Ítem | Estado | Fase |
|---|---|---|---|
| V1 | Oportunidades globales con kanban por etapas | Abierto (aprobada en D-D) | F4.1 |
| V2 | Ficha de oportunidad con conversión a proyecto | Parcial (existe dentro de la ficha del cliente) | F4.1 |
| V3 | Interacciones con `tipo`, `próximo paso` y feed global | Hecho (`/clientes/interacciones`) | — |
| V4 | Convocatorias | Fuera de alcance (D-D) | — |
| V5 | Mapa por departamento | Abierto (la ruta redirige; `Cliente.ubicacion` es texto libre) | F4.9 |
| V6 | Salud de cartera con score | Hecho | — |
| V7 | Relaciones poder/interés/fuerza | Hecho (lectura; se edita en la ficha) | — |
| V8 | Automatizaciones | Parcial (solo el resumen diario) | F4.9 |
| V9 | Tabla mensual editable con «nueva planeación» | Abierto | F4.9 |
| V10 | Propuesta económica | Fuera de alcance (D-D) | — |

### 7.5 Producto Proyectos (B1–B8) y ajustes de la PO

| # | Ítem | Estado | Fase |
|---|---|---|---|
| B1 | D1: no reintentar 403/404 en `useProject()` | Hecho | — |
| B2 | Importar presupuesto de la PO | Hecho (#92) | — |
| B3 | Importar estructura de la PO | Hecho (#98) | — |
| B4 | Plantillas actualizadas para la PO | Esperando validación de la PO (#86–#88) | F4.6 |
| B5 | Importar solo estructura | Esperando D-A pregunta 1 | F4.6 |
| B6 | Rubros habilitables por proyecto | Abierto (D-B decidida; requiere migración) | F4.5 |
| B7 | Cerrar, suspender y cancelar | Hecho (#97) | — |
| B8 | Importar gastos | Hecho (#95) | — |
| AJ-01 a AJ-06 | Ajustes de la PO del 28-oct | Hechos. Migraciones de AJ-01 y expansión de AJ-02 en producción desde el 4-nov. Falta el **paso de contrato de AJ-02** (desbloqueado) | F0.3 |

### 7.6 Operación, plataforma y deuda técnica

| # | Ítem | Estado | Fase |
|---|---|---|---|
| A1 | Etiqueta `v2.0.0` | Hecho | — |
| A2 | Dominio en Resend | Abierto (D-E) | Paralelo |
| A3 | Humo en producción con usuarios reales | Abierto | Paralelo |
| A4 | Respaldos automáticos y restauración de prueba | Abierto | Paralelo |
| A5 | Limpieza de credenciales y respaldos locales | Hecho | — |
| E4 / E5 | Migración a Railway | Abierto (D-F) | Paralelo |
| E6 | Limpieza de artefactos del repositorio | Abierto | Paralelo |
| T1 | e2e legacy fuera de CI | Abierto | Paralelo |
| T2 | Código muerto `loadClientScoped` | Hecho (ya no existe; `loadTaskScoped` sigue en uso) | — |
| T3 | Rendimiento de listas tras la globalización | Abierto (medir) | Paralelo |
| T4 | Borrar el fork personal | Abierto | Paralelo |
| T5 | Sign-off del dueño de los datos | Decisión (D-T5) | Paralelo |
| T6 | Plantillas de correo con marca | Abierto (depende de A2) | Paralelo |
| T7 | Interfaz de reautenticación | Abierto | Paralelo |
| T8 | Archivar `openspec/changes/oportunidades-comerciales` | Abierto | Paralelo |
| T9 | `scripts/cron_setup.sql` con el secreto real | Hecho (solo tiene el marcador `[CRON_SECRET]`) | — |
| X1 | «La descripción es obligatorio.» | Abierto | F0.4 |
| X2 | Imports que aplican con cualquier `modo` | Abierto | F0.4 |

### 7.7 Reportes y PDF (R1–R13)

Revisión del 2026-11-04 del HTML de la sección Reportes en producción y del código de `main`.

| # | Ítem | Estado | Evidencia | PR |
|---|---|---|---|---|
| R1 | «1 a tiempo · 38 tarde»: probable error de cálculo. Se compara `completed_at` (con hora) contra `fecha_entrega`; si la entrega se guarda a medianoche, todo lo cerrado ese mismo día cuenta como tarde. Confirmar primero cómo se guarda la fecha | Abierto | `src/app/api/v1/tasks/report/route.ts:240` | PR-R1 |
| R2 | Las barras de «Carga por persona» pasan del 100 %: las vencidas se suman encima de «en curso», aunque ya están incluidas | Abierto | Segmentos de 27 + 73 + 35 % en una sola persona | PR-R1 |
| R3 | «Por persona» muestra filas en cero y usuarios de prueba o duplicados («Admin Test», «Administrador», dos variantes del mismo nombre) | Abierto | Tabla del reporte; también es un tema de limpieza de usuarios en producción | PR-R1 |
| R4 | Texto técnico visible: «completadas por completed_at, abiertas por updated_at» | Abierto | Pestaña Tareas | PR-R1 |
| R5 | Dos controles de rango que no coinciden (header «Todo el tiempo» y pestaña «Mes») | Abierto | Mismo caso que N8 | PR-5 |
| R6 | La tarjeta «Tasa de cumplimiento» muestra una barra rotulada «completadas» | Abierto | Pestaña Tareas | PR-R1 |
| R7 | Tendencias como líneas de 96 × 28 px sin ejes ni valores | Abierto | `sparkline.tsx` en Reportes | PR-R3 |
| R8 | «+11 clientes más» no se puede ver | Abierto | Sección «Por cliente» | PR-R3 |
| R9 | PDF sin base común: sin `@page` (cada navegador decide tamaño y márgenes y agrega URL y fecha); auto-impresión a los 250 ms sin esperar las fuentes; sin `print-color-adjust` (la tarjeta rosada con texto blanco sale vacía si «Gráficos de fondo» está apagado); 3 plantillas distintas sin logo, sin número de página y sin autor | Abierto | `kanban/print-report.tsx:62`, `dashboard/print-dashboard.tsx`, `reportes/print-reporte-semanal.tsx`, `app/globals.css:418`; solo `proyectos/print/project-print-sheet.tsx:53` tiene `@page` | PR-R2 |
| R10 | Rediseño de los 5 informes según «Informes PDF · Reportes»; «Gestión de tareas» se une a «Tareas del equipo» | Abierto | Proyecto de diseño Muttu Hub | PR-R3 a PR-R7 |
| R11 | Comparación con el periodo anterior y frases de «Lo esencial»: la API de tareas no devuelve el periodo anterior | Abierto | `GET /api/v1/tasks/report` | PR-R8 |
| R12 | Informe de avance para el aliado (versión externa, sin datos comerciales ni internos) | Decisión (D-G9) | — | PR-R9 |
| R13 | Envío automático del semanal por correo | Abierto (bloqueado por A2) | — | PR-R10 |
| R14 | Informes financieros de la vista Reportes de v7: «Ejecución financiera por rubro» y «Legalización de gastos» (PDF y Excel) | Parcial · **Decisión** para la legalización | La ejecución por rubro ya sale **agregada** en el Excel del proyecto (`src/lib/proyectos/export-xlsx.ts`, hoja «Financiera»); falta en PDF con el formato común. La legalización (gasto por gasto, tercero y soporte) **choca con P04 / REQ-ACC-05**: hoy ningún Excel lleva ese detalle por regla de acceso (`export-xlsx.ts:6`). Necesita decisión de quién puede verlo y descargarlo (D-G8) | PR-R11 |
| R15 | «Semaforización territorial» por departamento (vista Reportes de v7) | Abierto (depende de V5) | La ubicación del cliente es texto libre | PR-R12 |
| R16 | Envíos programados de cualquier informe (v7 propone 3: portafolio, avance de proyecto, pipeline) | Abierto (bloqueado por A2; destinatarios según D-G8) | Solo existe el cron diario (`api/v1/cron/daily`) | PR-R13 |
| R17 | «Vencidas» del reporte de tareas cuenta una tarea que vence hoy como vencida desde las 19:00 (Bogotá) del día anterior: compara `fecha_entrega < now` con la fecha guardada a medianoche UTC | Abierto (hallado en PR-R1) | `src/app/api/v1/tasks/report/route.ts` | PR-R1b |
| R18 | El tablero usa la misma regla de «a tiempo» con el error de R1 (`updated_at <= fecha_entrega`) | Abierto (hallado en PR-R1) | `src/lib/openapi/paths/dashboard-admin.ts` y su implementación | PR-R1b |
| R19 | Usuarios de prueba o duplicados en producción («Admin Test», «Administrador», dos variantes del mismo nombre): el código ya oculta las filas en cero; los que tienen tareas siguen saliendo | Decisión (limpieza de datos en producción) | Reporte de tareas | — |

### 7.8 Engram (G1–G7)

Memorias del proyecto `muttuhub-crm`, contrastadas con `main` el 2026-11-04. Las de septiembre y octubre que ya
están cerradas en el código (fases 1–6, AJ-06, B3, arreglos de autenticación) no se listan.

| # | Ítem | Estado | Origen en engram |
|---|---|---|---|
| G1 | Lo útil de `feat/deepseek-lote-5` (accesibilidad, responsive, asserts, invariantes v1) nunca llegó a `main` | Abierto (revisar uno por uno) | Auditoría de worktrees, 2026-11-03 |
| G2 | 7 worktrees obsoletos registrados con rutas WSL | Abierto | Auditoría de worktrees, 2026-11-03 |
| G3 | `AuditEntidad`/`AuditAccion` duplicados entre servidor y cliente | Abierto (verificado en `main`) | Resumen de sesión, 2026-09-07 |
| G4 | `scripts/offboard-camarabaq.ts` con correos escritos en el código | Abierto (verificado en `main`) | Resumen de sesión, 2026-09-07 |
| G5 | Runbook con 3 pasos «⚠» sin verificar | Abierto (verificado en `main`) | Referencia de worktrees (R8), 2026-11-03 |
| G6 | Carpetas de cliente duplicadas por nombre; lección: los ensayos de backfill deben revisar nombres duplicados, no solo conteos | Abierto | Ventana de producción, 2026-11-04 |
| G7 | Rescatar el arreglo Z3-11 de `PrioridadChip` (muestra «Baja» para una prioridad desconocida) | **Descartado** por decisión de Adrián el 2026-11-03 («No, déjalo»). No volver a proponerlo salvo que él lo pida | Decisión, 2026-11-03 |

**Notas de entorno** (no son tareas, pero frenan el trabajo):
- La red corporativa intercepta TLS (`SEC_E_UNTRUSTED_ROOT`): `git push`, `gh` y `npm` fallan desde algunos entornos.
- La puerta de revisión de Gentle AI falló varias veces por defectos propios (gentle-ai#5836 y #5840), no por el
  código. El protocolo es declinar el candidato y seguir.

---

## 8. Cómo medir que mejoró

- [ ] Un usuario nuevo crea y aprueba la línea base de un proyecto de ejemplo **sin ver un error 409** (U9–U11).
- [ ] Ningún texto visible contiene Σ, pp, v0 ni códigos de regla (U4–U6).
- [ ] Registrar un gasto, un avance o una interacción toma **un clic hasta el formulario** (U13, U14, N3).
- [ ] Un colaborador que entra al Hub ve en Inicio lo que vence hoy, sin cambiar de pestaña (N1, N9).
- [ ] Cada concepto tiene un solo nombre en menú, títulos, botones y guías (BL#1, N7).
- [ ] Ningún diálogo pierde lo escrito ni se cierra con una operación en curso (BL#9, BL#10, BL#22).
- [ ] La lista de clientes deja ver quién lleva más días sin gestión (N6).
- [ ] Las capturas de «después» de cada PR de UI se comparan con las de F0.7 a 1440 px y 390 px.
- [ ] Los 5 PDF salen en carta, con logo, página X de Y y autor, en Chrome y Edge, y con «Gráficos de fondo» apagado
  (R9).
- [ ] Los números de Reportes cuadran: «a tiempo + tarde = cerradas», las barras no pasan del 100 % y no hay filas en
  cero (R1–R3).
- [ ] Gerencia lee «Lo esencial» del semanal sin abrir la segunda página.

- [ ] Las decisiones de las pruebas de prototipos (D-G7, D-G8, D-G10 a D-G12) quedan anotadas antes de cerrar la Fase 2.

---

## 9. Prototipos para probar

Los tres están en `docs/ux-crm-2026-11/` (abren directo en Chrome o Edge, sin instalar nada) y en el proyecto de diseño
Muttu Hub. **`index.html` (en esta misma carpeta)** es la portada: enlaza a los tres y trae la lista de qué probar y qué decidir.
Todos usan datos ficticios.

| Archivo | Qué es | Con quién | Valida | Decide |
|---|---|---|---|---|
| `proyectos-v2-prototipo.html` | Portafolio, asistente, ficha y flujos de registro de Proyectos, con todas las reglas de la PO (AJ-01 a AJ-06, B7, línea base). Barra de prueba: rol (Coordinadora / Gerencia), estado del proyecto y variante U22 | PO y un coordinador | U1–U21, BL#7, 9, 10, 13, 16, 27 | D-G7, D-G11, D-G12 |
| `reportes-v2-prototipo.html` | Sección Reportes con flujo de 4 pasos. Barra de prueba: rol y estructura (4 informes o 6 secciones actuales, con los bloques repetidos marcados) | Gerencia | N2, N8, BL#3, R1–R8 | D-G8, D-G9, D-G10 |
| `informes-pdf-reportes.html` | Los 5 informes en 7 hojas carta vertical, listos para imprimir | Gerencia | R9, R10 | D-G8 |

**Cómo registrar el resultado:** cada decisión va a la sección 4 con fecha y quién decidió. Si una prueba cambia una
regla de la PO, se anota primero en el documento de la PO y después aquí.

**Lo que los prototipos no hacen:** guardar datos (todo vive en memoria y se reinicia al recargar), enviar correos ni
generar PDF reales. En Proyectos v2 solo se abren PRY-2026-002 y el borrador PRY-2026-007. En Reportes v2, el periodo
cambia las etiquetas pero no los números.

### 9.1 Piezas nuevas de los prototipos (P1–P5)

| # | Pieza | Estado | Prototipo | Fase |
|---|---|---|---|---|
| P1 | Reportes: 4 informes en lugar de 6 secciones (Mi semana, Equipo, Comercial, Semanal) | Decisión (D-G10) | Reportes v2 | F5.3 |
| P2 | Reportes: selector por preguntas, filtro único con chips, barra fija de acciones, vista previa del PDF y programación del envío | Decisión (D-G8) | Reportes v2 | F5.3 |
| P3 | Proyectos: «Lo que te toca esta semana» en el portafolio, por rol | Decisión (D-G11) | Proyectos v2 | F5.1 |
| P4 | Proyectos: «Avisar a Gerencia» cuando el borrador queda listo | Decisión (D-G12) | Proyectos v2 | F5.1 |
| P5 | Proyectos: portafolio en filas con semáforo y siguiente acción; detalle de actividad con «Avance de la actividad» y «Entregables» lado a lado | Decisión (pruebas con la PO) | Proyectos v2 | F5.1 |

### 9.2 Ciclo de un proyecto: video y plan de rediseño

- **`ciclo-proyecto-antes-despues.mp4`** (2 min 55 s, sin voz, datos ficticios): el mismo proyecto de ejemplo hoy, con
  14 puntos complejos en rojo, y con el rediseño, con los mismos números en verde. Para mostrar al equipo que usa el Hub
  y llevar a la sesión de discovery de BL#27 (PR-18).
- **`rediseno-ciclo-proyecto.md`**: el ciclo paso a paso, la tabla de los 14 puntos cruzada con el backlog, el plan en
  3 olas (ola 1 = Fases 2–3, ola 2 = F4.7, ola 3 = Fase 5 con CP1–CP12, P3, P4 y U22) y las decisiones D-CP1 a D-CP6.

---

## Anexo A — Piezas existentes a reutilizar

- `src/components/ui/`: `help-hint`, `empty-state`, `dialog`, `tabs`, `kpi-tile`, `status-chip`, `page-header`.
- `src/components/proyectos/ui.tsx`: `EmptyBlock`, `InlineError`, `SectionHeader`; `Disclosure`, `CaptureSurface`.
- `ProximosPasos` y `RequiereAtencion` como modelo de lista guiada por el servidor con enlaces.
- `CaraMiResumen`, `NotificationPanel` y el reporte semanal (#111) como base de «Mi día».
- `GET /api/v1/clients/health` para el último contacto; `GET /api/v1/projects?cliente_id=` para la pestaña Proyectos.
- Reglas puras de `lib/proyectos/linea-base.ts` y `ficha-financiera.ts` para U9–U12.
- `useFiltersStore` y `src/store/sidebar.ts` como patrón de preferencias persistidas por usuario.
- `src/components/print/print-toolbar.tsx` («Volver» + «Imprimir») y `proyectos/print/project-print-sheet.tsx`, la
  única vista que ya usa `@page`, como punto de partida de PR-R2.
- Diseño «Informes PDF · Reportes» en el proyecto de diseño Muttu Hub: estilos de cabecera, pie, indicadores, barras
  y tablas listos para traducir a componentes.

## Anexo B — Ramas para borrar (Fase 0)

Ya están en `main` (por squash o fusión). **Antes de borrarlas, revisar en GitHub que su PR esté cerrado.**

- Octubre: `feat/aj01-estado-en-curso`, `feat/aj06-soportes-multiples`, `feat/reporte-semanal`,
  `feat/sin-pestanas-nuevas`, `feat/admin-editar-usuarios`, `feat/admin-sin-municipios`, `feat/tags-catalogo-tareas`,
  `feat/proyecto-cierre-suspension`, `feat/po-structure-import`, `feat/gastos-iva-periodo`,
  `feat/esquema-jefe-carril-1`, `fix/modales-admin-proyectos`, `docs/backlog-mejoras-ux`, `docs/ajustes-po-261028`,
  `docs/proceso-proyectos-desde-cero`, `docs/decisiones-po-2026-10-26`, `docs/guia-plantilla-pruebas-e-plan-ux`,
  `chore/ci-e2e-estructura`.
- Septiembre y anteriores (reemplazadas por `feat/projects-v2` y sus PRs): `feat/projects-v2`,
  `feat/tablero-seguimiento-*`, `feat/gestion-proyectos-*`, `feat/oportunidades-comerciales-*`,
  `feat/admin-umbrales-semaforo-*`, y las ramas `fix/*` de septiembre.
- Noviembre: `feat/backfill-carpetas-remote-guard` (sus commits ya están en `main`).
- Ramas locales de los 7 worktrees (G2): `feat/project-documents-upload`, `test/e2e-proyectos-v2`,
  `feat/po-presupuesto-import`, `feat/r6d-decisions`, `docs/r8-runbook`, `fix/z-review-findings` y, **después de
  revisar G1**, `feat/deepseek-lote-5`.
- **No borrar:** `feat/aj02-drop-peso-columns` (F0.3) ni `docs/registro-ventana-prod-2026-11-04` (F0.1b, pendiente
  de PR).

---

## Mantenimiento de este documento

Se actualiza cuando un ítem cambia de estado, con el número de PR o la evidencia. Si un ítem se descarta, se marca
**Fuera de alcance** con la razón; no se borra la fila.
