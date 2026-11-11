# Plan de mejora UX — módulo Proyectos

**Objetivo:** que un usuario de Muttu sin formación técnica cree, apruebe y ejecute un proyecto sin
descubrir las reglas por ensayo y error. Hoy el módulo funciona, pero esconde requisitos, usa jerga
interna y obliga a buscar las acciones. Este plan prioriza **decirle al usuario qué falta y dónde
arreglarlo, antes de que falle**.

Base: auditoría de solo lectura del código (2026-11-03) más el backlog
`docs/pendientes/mejoras-ux-reunion-2026-10-28.md` (BL#n). No repite lo que ya está ahí; lo cita.

## Resumen en una tabla

| Fase | Qué resuelve | Tamaño | Ítems |
|------|--------------|--------|-------|
| **1. Palabras y avisos** | Jerga, ayudas que contradicen la regla, requisitos ocultos de un campo | S (copy/UI, ~2-3 días) | U1–U8 |
| **2. Requisitos visibles** | La línea base solo explica qué falta después de fallar | M (~1 semana) | U9–U12 |
| **3. Atajos que llevan a la acción** | Botones que cambian de pestaña pero no abren nada | S/M (~3-4 días) | U13–U16 |
| **4. Flujos más cortos** | Importaciones duplicadas, captura celda a celda, formularios largos | M/L (~1-2 semanas) | U17–U21 |

Orden recomendado: **1 → 2 → 3 → 4**. La fase 1 es barata y reduce la mayoría de las consultas; la
fase 2 es la de mayor impacto. Cada ítem es una unidad entregable independiente (PR chico).

---

## Fase 1 — Palabras y avisos (S)

| # | Problema | Evidencia | Propuesta |
|---|----------|-----------|-----------|
| U1 | **Beneficiarios «opcional» al crear, obligatorio para aprobar.** El usuario lo descubre al final, y el paso 1 del asistente ya no se puede editar. | `project-create-form.tsx:556` («Es opcional») vs `lib/proyectos/linea-base.ts:45` | Cambiar la ayuda a «Obligatorio para aprobar la línea base» y validarlo al crear (o avisar en amarillo). |
| U2 | **El paso «Metas» es toda la estructura**; «Cronograma» dice «Planifica…» pero es de solo lectura. «Meta» significa cuatro cosas distintas. | `nuevo-proyecto/stepper-logic.ts:6-7`, `project-ejecucion.tsx:464` | Renombrar a «Estructura» y «Ver cronograma»; usar «Objetivo» donde hoy dice «meta» (p. ej. «Avance por objetivo»). Complementa BL#1. |
| U3 | **La ayuda del peso contradice la regla**: dice que se puede escribir, pero ya es la duración en semanas (AJ-02). | `stepper-logic.ts:14` | Reescribir: «El peso es la duración en semanas; lo calcula el sistema». |
| U4 | **Jerga en presupuesto**: «Σ asignado», «Igualar valor total a Σ A», «Control (Σ programación − asignado)». | `project-presupuesto.tsx:147,183`, `presupuesto-programacion.tsx:176` | «Total asignado», «Usar la suma como valor total», «Falta por programar». |
| U5 | **Jerga en ejecución e indicadores**: «pp», «Corte», «Base: Vigente / Original (v0)», «No confirmado». | `project-ejecucion.tsx:165-177,386`, `project-kpis-panel.tsx:72-95`, `ficha/ficha-header.tsx:99` | Términos llanos + `HelpHint` donde el concepto sea necesario. |
| U6 | **Códigos internos en errores de importación** (columna «Regla»: V-13, W-02). | `import-dialog.tsx:73,83` | Ocultar la columna en pantalla; dejarla solo en el CSV. |
| U7 | **«Descargar plantilla» de la barra no se desactiva sin fechas**, pero la del diálogo sí. | `import-dialog.tsx:206` vs `:238` | Mismo estado y misma explicación en ambos. |
| U8 | **Las notas del Excel usan voseo** («Pasá el mouse», «Leé esta hoja»); la app y la guía PDF usan «tú». | `lib/proyectos/plantilla/generate.ts` | Unificar a «tú». |

## Fase 2 — Requisitos visibles antes de fallar (M) ⭐ mayor impacto

Hoy los requisitos de la línea base solo aparecen como respuesta 409 **después** de pulsar «Aprobar»
(`baseline-approval.tsx:66-79`), y «Próximos pasos» revisa menos cosas de las que exige el servidor.

| # | Propuesta | Evidencia / reutiliza | Tamaño |
|---|-----------|-----------------------|--------|
| U9 | **Endpoint de verificación** `GET /projects/:id/baseline/check` que devuelve la misma lista que el POST de aprobación, sin aprobar. | Reutiliza `lib/proyectos/linea-base.ts` y `ficha-financiera.ts:133-185` (funciones puras). | M |
| U10 | **«Próximos pasos» alimentado por U9**, con enlace «Corregir aquí» en cada fila. Hoy no revisa beneficiarios, actividades por objetivo, entregables por actividad, suma = valor total, programación que cuadre ni rubros suspendidos; y «Presupuesto asignado» se marca listo con cualquier suma > 0. | `ficha/ficha-resumen.tsx:212-256` (`ProximosPasos`), `requiere-atencion.tsx` como modelo con enlaces. | M |
| U11 | **Paso «Revisión» del asistente con semáforo** de U9, y un paso marcado «hecho» solo si cumple (hoy basta con haber pasado por él). | `nuevo-proyecto/paso-revision.tsx:107-122`, `stepper-logic.ts:68` | M |
| U12 | **Programación que no cuadra se ve**: aviso y color por fila cuando «Falta por programar» ≠ 0. Hoy «Programación pendiente» solo aparece si ningún rubro tiene valores; los mensajes como «Programación pendiente.» deben decir qué rubro y cuánto falta. | `presupuesto-programacion.tsx:111,133`, `ficha-financiera.ts:157` | S/M |

## Fase 3 — Atajos que llevan a la acción (S/M)

| # | Problema | Evidencia | Propuesta |
|---|----------|-----------|-----------|
| U13 | «Registrar gasto» del encabezado abre Finanzas › Resumen, no Gastos. | `ficha/ficha-header.tsx:162`, `ficha/ficha-finanzas.tsx:19` | Abrir el segmento Gastos con el formulario abierto. |
| U14 | «Registrar avance» del encabezado solo cambia de pestaña. | `ficha/ficha-header.tsx:159` | Abrir un selector de actividad y luego el formulario. |
| U15 | Si no eres el responsable, «Registrar avance» **desaparece** sin explicación. | `project-ejecucion.tsx:257-258`, `ejecucion-avance.tsx:217` | Mostrarlo deshabilitado con «Solo {responsable} puede reportar». **Resuelto de otra forma (2026-11-05, PR #145): cualquier integrante del proyecto puede registrar avance, así que el botón ya no desaparece para el equipo.** |
| U16 | El formulario de avance no muestra el último % ni el tope sin entregables (90 %): el usuario lo aprende por el error. | `reporte-actividad-form.tsx:88-110` | Pista bajo el campo: «Último: 70 %. Máximo hoy: 90 %». Relacionado con BL#27 (dos «Registrar avance»). |

## Fase 4 — Flujos más cortos (M/L)

| # | Propuesta | Evidencia | Tamaño |
|---|-----------|-----------|--------|
| U17 | **Un solo «Importar desde Excel»** que pregunte el formato (plantilla MuttuHub o formato PO) y diga qué reemplaza. Hoy hay 3 botones en Estructura y un 4.º en Presupuesto, sin explicación. | `project-estructura.tsx:47-55`, `project-presupuesto.tsx:186` | M |
| U18 | **«Repartir en partes iguales»** por rubro en la programación mensual (hoy celda a celda). | `presupuesto-programacion.tsx` | M |
| U19 | **Un solo guardado** para presupuesto y programación (hoy dos botones y la programación espera al primero). | `presupuesto-programacion.tsx:99` | M |
| U20 | **Formulario de gasto agrupado** (Documento / Tercero / Valores / Soporte), obligatorios marcados y error por campo. Hoy ~14 campos en una rejilla y errores de a uno al pie. | `gasto-form.tsx:135-142,220-375,385` | M |
| U21 | **«Solicitar cambio» en contexto** (Actividades y Presupuesto en ejecución, y en el aviso «La estructura solo se edita en borrador»); descripción de cada tipo de modificación; meses legibles. | `project-modificaciones.tsx:88,137`, `project-estructura.tsx:62`, `modificacion-form.tsx:38-45,193` | M |

## Propuesta para la PO — avance por hitos (U22)

> **Requiere aprobación de la PO antes de construir:** cambia cómo se mide el avance definido en AJ-01
> (documento «Ajustes al módulo Proyectos» v1.1). Opción elegida por el equipo el 2026-11-04 entre tres
> alternativas (hitos, híbrido, solo entregables).

**Problema.** Hoy el responsable escribe el porcentaje a mano («70 %»). Es subjetivo: el mismo número
significa cosas distintas para cada persona, y la observación obligatoria solo lo compensa a medias.

**Propuesta.** Cada actividad lleva una lista de **hitos** (3 a 6, p. ej. «Convocatoria enviada»,
«Taller 1 realizado», «Acta firmada»). El avance se **calcula**: hitos cumplidos / total de hitos.

| Regla | Cómo queda |
|-------|-----------|
| Cálculo | % = hitos cumplidos ÷ hitos totales (redondeado a entero). |
| Tope sin entregables (AJ-01) | Se mantiene: el % calculado se limita al tope configurado (90 %) mientras los entregables no estén completos. |
| 100 % y «Terminada» (AJ-01) | Se mantiene: solo con todos los entregables completos (meta y medio de verificación). |
| El avance no baja (AJ-01) | Marcar un hito es definitivo; desmarcarlo pide justificación y queda en el historial. |
| Observación | Opcional al marcar un hito; el historial guarda fecha, hito y usuario. |
| Actividades sin hitos | Siguen con el registro manual actual (compatibilidad con proyectos ya en ejecución). |
| Peso en el proyecto (AJ-02) | Sin cambios: la actividad pesa su duración en semanas. |

**Impacto técnico (estimado, M/L):** tabla nueva de hitos por actividad (migración aditiva), edición de
hitos en Estructura (solo en Borrador o vía modificación), checklist en «Registrar avance», cálculo del %
reutilizando la lógica de `ReporteActividad`, y una hoja opcional «Hitos» en la plantilla Excel (nueva
versión de plantilla).

**Preguntas abiertas para la PO:** ¿los hitos se definen al planificar o se pueden agregar en ejecución?
¿Todos los hitos pesan igual o se ponderan? ¿Es obligatorio tener hitos para aprobar la línea base?

Ya en el backlog, no se repiten aquí: pie de modal en página completa (BL#7), Esc durante una
operación y pérdida de lo escrito (BL#9, BL#10), proyecto que nace atrasado por fechas pasadas y los
dos «Registrar avance» (BL#27; resuelto el 2026-11-05 en PR #145: el del entregable se llama «Registrar cantidad»).

## Piezas existentes a reutilizar

- `src/components/ui/help-hint.tsx` y `src/components/ui/empty-state.tsx`.
- `EmptyBlock`, `InlineError`, `SectionHeader` (`proyectos/ui.tsx`), `Disclosure`, `CaptureSurface`.
- `ProximosPasos` y `RequiereAtencion` (modelo de lista guiada por el servidor con enlaces).
- `AYUDA_PASOS` en `stepper-logic.ts` para la ayuda de cada paso.
- Reglas puras de `linea-base.ts` y `ficha-financiera.ts` para U9–U12.

## Cómo medir que mejoró

- [ ] Un usuario nuevo crea y aprueba la línea base de un proyecto de ejemplo **sin ver un error 409**.
- [ ] Ningún texto visible contiene Σ, pp, v0 ni códigos de regla.
- [ ] Registrar un gasto o un avance desde el encabezado toma **un clic hasta el formulario**.
- [ ] Las consultas de soporte sobre «por qué no me deja aprobar» bajan tras la fase 2.

## Siguiente paso

Validar el orden de fases con la PO y abrir la fase 1 como una rama con un PR por grupo de textos
(asistente, presupuesto, ejecución, importación).
