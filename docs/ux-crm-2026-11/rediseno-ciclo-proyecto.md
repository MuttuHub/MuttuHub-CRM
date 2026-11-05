# Rediseño del ciclo de un proyecto en Muttu Hub

**Fecha:** 2026-11-04 · **Autor:** Adrián Gutiérrez (con Claude) · **Estado:** borrador para priorizar con el equipo
**Ubicación:** `docs/ux-crm-2026-11/` · Acompaña al video `ciclo-proyecto-antes-despues.mp4` y al plan principal
`plan-trabajo-ux-crm.md`.

> **Regla de prioridad (igual que el plan principal):** el backlog va primero. Lo que aquí ya es backlog (U9–U21,
> BL#27) sigue su fase y su PR. Lo nuevo (prefijo **CP**) espera a la Fase 5 y a las decisiones de la sección 5.
>
> **Datos:** todo lo que aparece en el video y en los ejemplos es ficticio (PRY-2026-008 «Huertas escolares en
> Puerto Sol», Camila Pérez, Mariana Ortiz, Julián Restrepo, Laura Gómez).

---

## 1. Qué hicimos

1. **Recreamos el ciclo completo** de un proyecto mediano (2 objetivos, 6 actividades, 9 entregables, 2 indicadores,
   6 rubros, 7 meses) a partir del código de `main` (`8868f1a`) y de la documentación de la PO (AJ-01 a AJ-06, B7,
   línea base). No se ejecutó contra datos reales.
2. **Marcamos 14 puntos complejos** en los cinco pasos: crear, poblar, aprobar, ejecutar y terminar.
3. **Priorizamos con Adrián** qué entra en el rediseño. Se eligieron todas las opciones de Aprobar, Ejecutar y
   Terminar. En Poblar no se marcó ninguna opción explícita; **se asumió que entran las cuatro** (códigos
   automáticos, fechas en vez de semanas, editor en tabla y responsable obligatorio). Si alguna no va, se quita de la
   ola 3 sin afectar lo demás.
4. **Hicimos un video de antes y después** (2 min 55 s, 1920×1080, sin voz, texto en pantalla) para mostrárselo al
   equipo que usa el Hub.

---

## 2. Cómo es hoy: el ciclo paso a paso

| Paso | Quién | Qué se hace hoy | Esfuerzo en un proyecto mediano | Evidencia en el código |
|---|---|---|---|---|
| **Crear** | Coordinación | Asistente con datos generales | ~10 campos; el paso no se vuelve a mostrar | `project-create-form.tsx` |
| **Poblar** | Coordinación | Objetivos, actividades, entregables e indicadores, uno por diálogo; presupuesto por rubro; programación mensual | ~19 diálogos, ~90 campos y 48 celdas de programación | `estructura-actividades.tsx:233-236`, `presupuesto-programacion.tsx` |
| **Aprobar** | Gerencia | «Aprobar línea base»; si falta algo, error 409 con la lista | Los 6 requisitos solo se ven al fallar | `linea-base.ts`, `paso-revision.tsx` |
| **Ejecutar** | Responsables | Reporte de % por actividad (3 campos), avance de entregable (5–7 campos + soporte), gasto (15 campos) | Tres formularios distintos para un mismo avance | `reporte-actividad-form.tsx`, `ejecucion-avance-form.tsx`, `gasto-form.tsx` |
| **Terminar** | Coordinación y Gerencia | Cambiar estado a «Cerrado» | Cerrar no revisa nada | `api/v1/projects/[id]/estado/route.ts`, `transiciones-estado.ts` |

---

## 3. Los 14 puntos complejos y cómo los resuelve el rediseño

La columna **Backlog** dice si el punto ya tiene ítem. **CP** son ítems nuevos de este documento.

| # | Paso | Punto complejo (hoy) | Propuesta (en el video) | Backlog | Nuevo |
|---|---|---|---|---|---|
| 1 | Poblar | El código de cada elemento se escribe a mano; si se repite, error 409 al guardar | Códigos automáticos (1, 1.1, 1.2…) que se reordenan solos | — | **CP1** |
| 2 | Poblar | Las fechas de la actividad van en «semana inicial / final»; hay que contar desde el inicio | Rango de fechas real; las semanas (y el peso, AJ-02) se calculan | — | **CP2** |
| 3 | Poblar | El responsable es opcional, pero sin él nadie puede reportar avance (AJ-01) | Responsable obligatorio al crear la actividad | — | **CP3** · D-CP1 |
| 4 | Poblar | Un diálogo por elemento (~19) y 4 botones de importar | Estructura en una tabla editable («Enter crea la fila») y un solo «Importar desde Excel» | U17 | **CP4** |
| 5 | Poblar | El entregable aún pide «Tipo de medio exigido» | El entregable pide meta y soporte, nada más | — | **CP5** · D-CP2 |
| 6 | Poblar | Programación celda por celda y dos guardados | «Repartir según cronograma» (o en partes iguales) y un solo guardado | U18, U19 | **CP6** (según cronograma) |
| 7 | Poblar | La suma debe cuadrar exacto y no hay ayuda | Diferencia en vivo con salidas: «Ajustar en el último mes» o «Usar la suma como valor total» | U4, U12 | **CP7** (ajustar mes) |
| 8 | Aprobar | Los requisitos solo aparecen al fallar; la pestaña se marca «vista» con solo pasar | Checklist «Listo para aprobar · n de 6» con «Corregir aquí» | U9, U10, U11 | — |
| 9 | Aprobar | Quien arma el proyecto no puede aprobar ni avisar (el aviso sale por fuera del Hub) | «Enviar a Gerencia» cuando el checklist está completo; Gerencia aprueba desde el aviso | P4 · D-G12 | — |
| 10 | Ejecutar | Dos «Registrar avance»; el del encabezado solo cambia de pestaña | Un solo «Registrar avance»: % de actividad, entregables y soporte en el mismo registro | BL#27, U14 · PR-18 | **CP8** (registro unificado) |
| 11 | Ejecutar | El tope del 90 % se descubre al equivocarse; el botón desaparece si no eres responsable | Pista antes de escribir («Último 70 % · máximo hoy 90 %») y botón deshabilitado con motivo | U15, U16 | — |
| 12 | Ejecutar | Gasto de 15 campos sin agrupar; errores de a uno | Gasto en 4 grupos; total (AJ-04) y periodo (AJ-05) calculados; tercero recordado | U20 | **CP9** (tercero recordado) |
| 13 | Terminar | Si un entregable no puede llegar a la meta, nadie avisa y el proyecto no puede terminar | Aviso temprano con «Solicitar cambio de meta» | U21 | **CP10** · D-CP4 |
| 14 | Terminar | Se puede cerrar sin revisar nada; lo pendiente queda congelado | Checklist de cierre con «Resolver» e informe de cierre en PDF | — | **CP11**, **CP12** · D-CP3, D-CP5 |

**Además, en el video:**

- **«Mi semana en el proyecto»** (lo que le toca a cada persona en ese proyecto) → P3 · D-G11.
- **Avance por hitos** como variante → U22 · D-G7 (sigue pendiente de la PO).

---

## 4. Plan por olas (respeta el orden del plan principal)

### Ola 1 · Ya es backlog (Fases 2 y 3 del plan principal)

Nada nuevo: estos PR ya están planeados. Lo que aporta este documento es el **criterio de aceptación visual** (el
video y `proyectos-v2-prototipo.html`).

| PR | Ítems | Resuelve los puntos |
|---|---|---|
| PR-7 (a–d) | U1–U8 (palabras y avisos; incluye U4 «Usar la suma como valor total», «Falta por programar») | 7 |
| PR-14 | U9, U10 (`GET /projects/:id/baseline/check` + «Próximos pasos» con «Corregir aquí») | 8 |
| PR-15 | U11, U12 (semáforo en Revisión; programación que no cuadra se ve) | 7, 8 |
| PR-16 | U13–U16 (atajos; pista del último % y del tope; botón deshabilitado con motivo) | 10, 11 |
| PR-18 | BL#27 (discovery con la PO) — **usar el video como insumo de la sesión** | 10 |

### Ola 2 · Fase 4 del plan principal (F4.7)

| Ítem | Qué cambia | Resuelve | Tamaño |
|---|---|---|---|
| U17 | Un solo «Importar desde Excel» | 4 | M |
| U18 + CP6 | Repartir en partes iguales y **según cronograma** (usa las fechas de las actividades de cada rubro) | 6 | M |
| U19 | Un solo guardado para presupuesto y programación | 6 | M |
| U20 | Gasto agrupado en 4 bloques con error por campo | 12 | M |
| U21 | «Solicitar cambio» en contexto | 13 | M |

### Ola 3 · Nuevo (Fase 5, después de las decisiones de la sección 5)

| Ítem | Qué es | Depende de | Tamaño | Notas técnicas |
|---|---|---|---|---|
| **CP1** | Códigos automáticos en objetivos, actividades, entregables e indicadores | — | M | Generar en el servidor al crear (`objectives/route.ts` y hermanos); mantener la restricción única; reordenar sin romper referencias |
| **CP2** | Rango de fechas en vez de semanas | CP1 no | M | La UI pide fechas; el servidor guarda semana inicial/final calculadas desde la fecha de inicio del proyecto; el peso sigue siendo semanas (AJ-02) |
| **CP3** | Responsable obligatorio | D-CP1 | S | En el formulario y en la importación; si la PO lo quiere como requisito de línea base, se suma al checklist de U9 |
| **CP4** | Editor de estructura en tabla | CP1, CP2, CP3, U17 | L | Reemplaza ~19 diálogos; teclado tipo hoja de cálculo; validación por fila |
| **CP5** | Quitar «Tipo de medio exigido» del entregable | D-CP2 | S | Hoy se sigue enviando en `estructura-entregables.tsx:141`; migración aditiva (dejar la columna sin uso) |
| **CP7** | «Ajustar en el último mes» cuando la programación no cuadra | U12 | S | Complementa «Usar la suma como valor total» (U4) |
| **CP8** | Registro de avance unificado (actividad + entregables + soporte) | BL#27, PR-18 | L | Conserva todas las reglas de AJ-01 (mayor que el último, tope 90 %, observación obligatoria, anular solo el último) |
| **CP9** | Recordar el tercero del último gasto | U20 | S | Solo sugiere; no llena datos de identificación sin que el usuario lo confirme |
| **CP10** | Aviso de entregable que no puede llegar a la meta + «Solicitar cambio de meta» | U21, D-CP4 | M | La modificación de meta sigue la regla de la PO: la aprueba Admin/Gerencia |
| **CP11** | Checklist de cierre | D-CP3 | M | Hoy `estado/route.ts` solo revisa permiso y transición; agregar verificación previa (mismo patrón que U9) |
| **CP12** | Informe de cierre en PDF | CP11, D-CP5, Frente R | M | Usa el formato común de los informes PDF (R9, R10) |
| P3 | «Mi semana en el proyecto» | D-G11 | M | Ya está en el prototipo Proyectos v2 |
| P4 | «Enviar a Gerencia» | D-G12 | S/M | Ya está en el prototipo Proyectos v2 |
| U22 | Avance por hitos | D-G7 | M/L | F4.7b del plan principal |

---

## 5. Decisiones que necesitamos (PO / Gerencia)

| ID | Pregunta | Quién | Bloquea |
|---|---|---|---|
| **D-CP1** | ¿El responsable es obligatorio al crear la actividad, o basta con exigirlo para aprobar la línea base (requisito 7)? | PO | CP3 |
| **D-CP2** | ¿Se elimina «Tipo de medio exigido» del entregable? (AJ-06 ya permite varios archivos y enlaces por soporte) | PO | CP5 |
| **D-CP3** | En el checklist de cierre, ¿qué **bloquea** el cierre y qué solo **avisa**? Propuesta: bloquean los gastos sin validar y los entregables sin soporte; avisan las anulaciones pendientes | PO / Gerencia | CP11 |
| **D-CP4** | ¿El cambio de meta de un entregable es un tipo de modificación existente o uno nuevo? ¿Quién lo aprueba? | PO | CP10 |
| **D-CP5** | ¿Qué lleva el informe de cierre y a quién se envía (Gerencia, aliado)? | Gerencia | CP12 |
| **D-CP6** | ¿El código automático se puede editar a mano (por ejemplo, para calzar con el documento del aliado)? | PO | CP1 |
| D-G7, D-G11, D-G12 | Ya están en el plan principal (hitos, «Mi semana», «Enviar a Gerencia») | PO | U22, P3, P4 |

---

## 6. Cómo lo construimos en conjunto

1. **Ver el video con el equipo** que usa el Hub (3 min) y preguntar, por cada punto rojo: ¿te ha pasado?, ¿cuánto
   te cuesta?, ¿lo resolverías así?
2. **Anotar votos** en la tabla de la sección 3 (columna nueva «Equipo»: alto / medio / bajo).
3. **Llevar el resultado a la sesión de discovery de BL#27 (PR-18)** con la PO y cerrar D-CP1 a D-CP6.
4. **Actualizar este documento** con fecha y quién decidió, y mover a la ola que corresponda lo que se apruebe.

---

## 7. Cómo sabremos que funcionó

- [ ] Poblar un proyecto mediano toma **menos de la mitad de los diálogos** que hoy (de ~19 a ≤ 8 pantallas).
- [ ] **Cero errores 409** al crear la estructura o al aprobar la línea base (U9–U11, CP1).
- [ ] Ninguna persona descubre el tope del 90 % **por el error** (U16).
- [ ] Registrar un avance con entregable y soporte se hace **en un solo formulario** (CP8).
- [ ] Ningún proyecto se cierra con gastos sin validar sin que alguien lo decida (CP11).

---

## Anexo · Guion del video (2 min 55 s)

| Tramo | Escena | Duración |
|---|---|---|
| Portada | «Crear, poblar, avanzar y terminar un proyecto» | 5 s |
| Mapa | Cinco pasos y quién los hace | 5 s |
| Hoy | Crear · Poblar estructura (puntos 1–5) · Presupuesto (6–7) · Aprobar (8–9) · Registrar avance (10–11) · Gasto (12) · Terminar (13–14) | 71 s |
| Transición | «14 puntos complejos» | 7 s |
| Rediseño | Poblar en tabla · Presupuesto que cuadra solo · Checklist y aviso a Gerencia · Un solo «Registrar avance» · Gasto en 4 grupos · Avance por hitos (U22) · Cerrar con checklist | 77 s |
| Cierre | Lo que cambia y siguiente paso | 9 s |

Los números en rojo (hoy) y en verde (rediseño) son los mismos de la sección 3, para que se puedan cruzar.
