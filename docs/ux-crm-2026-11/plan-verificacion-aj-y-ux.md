# Plan de trabajo — verificar AJ-01 a AJ-06 y mejorar la UX/UI de Proyectos

Fecha: 2026-11-05 · Estado: **borrador para retomar** · Fuente de los ajustes: documento de la PO
«Ajustes al módulo Proyectos» v1.1 (28 de octubre de 2026). Prototipo visual:
https://claude.ai/artifact/B2jBj1ScW9vrGFxWNEi5xC (privado; compartirlo antes de enviárselo a la PO).

## 1. Lo que ya está comprobado

- Las seis mejoras están en `main` y en producción: AJ-04/AJ-05 (#99), AJ-06 (#108), AJ-01 (#113, #114,
  #119, #120), AJ-02 (#128), AJ-03 (#129). Hay despliegue a producción confirmado en GitHub para cada una.
- **Causa probable de que la PO (Coordinadora) «no vea ningún cambio»:** el botón «Registrar avance»
  solo se muestra a la responsable asignada de la actividad o a Administración/Gerencia
  (`src/components/proyectos/project-ejecucion.tsx:257-258` → `ejecucion-avance.tsx:144` y `:217`). El
  documento de la PO no pide esa restricción. Una Coordinadora que pertenece al equipo pero no es la
  responsable de la actividad no ve el botón.
- **Por qué no se detectó antes:** el seed demo ponía a la Coordinadora como responsable de todas las
  actividades. Ya se corrigió en `scripts/seed-projects-demo.ts`: en el proyecto B, las actividades ahora
  quedan a cargo del Colaborador. En la base local, las 4 actividades de PRY-2026-001 tienen ya a Andrés
  Torres como responsable.
- **Falta confirmar en el navegador:** entrar como Laura Jiménez (Coordinadora) a PRY-2026-001
  «Demo CedeTextil · En ejecución» (no a PRY-2026-002) y comprobar que «Registrar avance» no aparece.

## 2. Fase 1 — verificación de AJ-01 a AJ-06

Cada ajuste se prueba con **dos sesiones**: Coordinadora miembro del equipo pero no responsable de la
actividad, y Administración. Para cada uno se revisa el criterio «Se acepta si» del documento de la PO.

### Resultado de la primera ronda (2026-11-05, local, sesión de Laura Jiménez en PRY-2026-001)

Pruebas unitarias de las reglas (gastos-import, estado-actividad, kpis, weeks, avance, rutas de
progreso, formulario de gasto, adjuntar soporte, ejecución): **182 archivos / 3172 pruebas en verde**
(Vitest filtra por coincidencia de ruta, así que la corrida cubrió más que esos archivos).

| ID | Qué se verificó | Resultado |
|---|---|---|
| AJ-01 | Como Coordinadora miembro pero **no responsable**, en la lista de actividades | **Falla (F1).** Desaparecen «Registrar avance 1.1» a «1.4»; solo quedan los de entregables. El botón «Registrar avance» de la cabecera solo lleva a la pestaña Actividades, así que es un callejón sin salida (F5). El historial muestra un UUID en vez de un nombre (F2). Las reglas del 30 %, del «mayor que el último» y del tope del 90 % se prueban después de F1 |
| AJ-02 | Peso de cada actividad frente a su duración; avance ponderado | **Pasa.** Peso = semanas en las 4 actividades (1, 1, 1, 4); no hay ningún campo de peso. (100+100+25+0)/7 = 32,1 %, igual a `avance_real` de la API |
| AJ-03 | Avance programado con tope; cumplimiento del cronograma | **Pasa con los datos de la demo.** Programado ≤ 90 %; 1.1 y 1.2 llegaron al 100 % después de su fecha fin, así que «Finalizada con retraso» es correcto; 0 a tiempo de 3 vencidas. La demo no tiene el caso positivo de la PO (90 % a tiempo y soportes tarde) (F6) |
| AJ-04 | Formulario de gasto | **Pasa.** 1.000.000 + 190.000 → Total «$ 1.190.000», calculado y de solo lectura. La lista muestra el IVA aparte |
| AJ-05 | Periodo automático; opciones; aviso | **Pasa.** Hoy → 2026-11; 28/10/2026 → 2026-10; solo meses del proyecto, sin «Mes del documento». El aviso funciona, pero los 5 gastos de la demo lo muestran porque el seed los fecha en noviembre con periodo de octubre (F6) |
| AJ-06 | Botón visible; enlace como soporte; importación | **Pasa.** «Adjuntar archivo» visible en los gastos registrados y en los entregables; el formulario acepta Archivo o Enlace; la importación lee «Enlace del soporte» con varios enlaces separados por `;` y valida http(s). Al crear el gasto se admite un solo soporte; el resto se agrega después (F7) |

Resultado esperado: una tabla «pasa/falla» con capturas, para mostrársela a la PO.

## 3. Fase 2 — correcciones encontradas

- **F1 — decidido y corregido en local (2026-11-05):** Adrián decidió «cualquier miembro» del equipo.
  Rama `fix/aj01-registrar-avance-miembros` (desde `origin/main`, sin commit todavía): el gate del
  servidor (`gateReporteActividadWrite`) y la pantalla siguen la membresía. RED observado (4 pruebas de
  API + 6 de interfaz) → GREEN (101/101), `tsc` sin errores fuera de `.next`, `eslint` limpio. En el
  navegador como Laura: vuelven «Registrar avance 1.1» a «1.4»; en la API real, sin observación → 409, 95 %
  → 409 (tope), 30 % → 201 a nombre de Laura, 30 % otra vez → 409, anular → 200 (la demo quedó como
  estaba). Efecto: anular y adjuntar soportes a un reporte también quedan abiertos a cualquier miembro.
  Detalle de redacción: los mensajes dicen «90%» y la PO escribe «90 %».
- **F1 (texto original del hallazgo; AJ-01, permisos — riesgo alto, ítem 2):** que «Registrar avance» siga la misma regla de
  membresía que el resto de la ejecución (`canWrite`) y no `responsable_id === usuario`. Hay que cambiar
  también la **API**: `src/app/api/v1/projects/[id]/activities/[activityId]/progress/route.ts:7` («Create:
  only the activity's own `responsable_id`, or ADMINISTRADOR/GERENCIA») y revisar la misma regla en
  `progress/[reportId]/void` y `progress/[reportId]/attachments` (sus pruebas simulan
  `responsable_id: "resp-1"`). Pruebas primero (RED con la Coordinadora miembro no responsable, en UI y
  API), verificación independiente y revisión.
  **Decisión de la PO:** «todos los roles» significa ¿cualquier miembro del equipo (Coordinador o
  Colaborador) o cualquier usuario?
- **F2 (AJ-01, historial):** el historial muestra un UUID (`6e9fd0f1-…`) en vez del nombre cuando quien
  registró ya no es miembro (`nombreUsuario` hace `?? id`). El nombre lo tiene que devolver la API.
- **F3 (AJ-03, UX, no es un bug):** «Verde» (el semáforo de hoy frente al plan) y «Finalizada con
  retraso» (terminó después de su fecha fin) son correctos los dos, pero juntos se leen como una
  contradicción. Propuesta: que el chip diga «Semáforo: verde» o agregar una ayuda que explique cada uno.
- **F4 (seed):** decidir si PRY-2026-002 también necesita un responsable distinto de la Coordinadora.
- **F5 (AJ-01, UX):** hay dos botones con el mismo texto «Registrar avance»: el de la actividad
  (porcentaje) y el de cada entregable (cantidad). Propuesta: «Registrar avance de la actividad» y
  «Registrar cantidad» (o «Registrar avance del entregable»). El botón de la cabecera debería llevar
  directo al formulario o explicar qué falta, no solo cambiar de pestaña.
- **F6 (seed de gastos y actividades):** que la demo muestre los casos de la PO: un gasto con IVA > 0,
  gastos con el periodo igual al mes de la fecha y solo uno modificado, y una actividad con 90 % a tiempo
  y soportes tarde.
- **F7 (AJ-06, a decidir con la PO):** el formulario de gasto admite un solo soporte al crearlo; los
  demás se agregan después con «Adjuntar archivo». ¿Basta así o se quieren varios desde el inicio?

## 4. Fase 3 — mejoras de UX/UI

1. **Que el permiso se entienda:** cuando alguien no puede registrar un avance, explicar por qué
   («Solo el equipo del proyecto puede registrar avances»), en vez de ocultar el botón sin aviso.
2. **Que la PO pueda ver los cambios:** una nota corta de «qué cambió» por ajuste, con capturas.
3. **Retomar lo pendiente de `plan-trabajo-ux-crm.md`:** T4 (PR-2, diálogos con operación en curso),
   T10 (PR-14/15, requisitos de línea base), T11 (PR-16, atajos), T12 (PR-17, impresión), según el
   tracker `odd/tasks/backlog-completo-2026-11.md`.
4. **Fidelidad del prototipo:** ajustar AJ-02 y AJ-03 del canvas a las pantallas reales (lista de
   estructura y columna «Atrasada» del tablero) y corregir «Período» → «Periodo».

## 5. Orden propuesto

1. Confirmar en el navegador la causa (sección 1).
2. Decisión de la PO sobre F1.
3. F1 + F2 en un PR chico, con pruebas primero.
4. Fase 1 completa con la tabla pasa/falla.
5. F3 y Fase 3, un PR por unidad.

Nada de esto toca producción sin la autorización explícita de Adrián, paso a paso.

## 6. Avance del 2026-11-05 (segunda sesión): grupos 1 y 2 de «Mejoras UX»

- **Merge a `main` (2026-11-05, con autorización de Adrián):** #145 entró como `1ded4dd`. Después, #146 se
  rebasó sobre `main` sin los commits de #145, se reapuntó a `main` y entró como `0726e5d`. Antes de mergear
  se corrigió el e2e `historial-impresion` (título quitado y contadores). Las ramas siguen vivas en remoto.
- **Grupo 1:**
  - Un reporte anulado no ofrece «Adjuntar archivo».
  - Una actividad finalizada muestra «Actividad finalizada: ya no recibe avances…» en lugar de «Registrar avance».
  - El formulario de entregable envía con «Registrar cantidad».
  - `SelectorArchivo` en español reemplaza los 9 `<input type="file">`.
- **Hallazgo nuevo, corregido en #146:** «Anular» aparecía en el último reporte de la lista aunque estuviera anulado.
  La API (`void/route.ts`) toma el último reporte **vigente** por fecha y luego por creación. En la 1.1 de la demo, el
  90 % de Laura se quedaba sin «Anular» porque detrás estaba el 30 % anulado de Mateo. Ahora la UI usa la misma regla.
- **Grupo 2, S1–S7:**
  - Sin títulos repetidos.
  - «% de lo programado».
  - Barras de «Ejecutado» con el color de su semáforo.
  - «Umbrales sin confirmar» con su ⓘ.
  - Periodo e IVA desglosado en la lista de gastos.
  - Contadores «Gastos · N», «Modificaciones · N» y «Versiones · N».
  - **Efecto a tener en cuenta:** al abrir Finanzas se piden los gastos de inmediato, por el contador.
- **Verificación:**
  - `vitest --dir src`: 4614 pruebas en verde.
  - `--dir scripts`: 132 en verde.
  - tsc y eslint: sin errores.
  - Revisión visual en local de la 1.1, el formulario de gasto, Finanzas › Resumen, la lista de gastos e
    Historial › Modificaciones: todo como se especificó.
  - El e2e `ficha-ejecucion.spec.ts` se actualizó pero no se ejecutó.
- **Pendiente:**
  - Grupos 3 y 4 (T5): esperan el OK de la PO. Falta compartir el canvas con ella.
  - Decisiones abiertas: F4, F7 y el merge de #145 y luego #146.
