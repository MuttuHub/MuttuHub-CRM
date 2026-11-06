# Inventario de UI — módulo Proyectos (F1, paso 1)

Fecha: 2026-11-05 · Plan: `plan-mejoras-ui-proyectos.md` (F1) · Fuente: código de `main` (8868f1a) en la copia principal.
Rutas: `src/app/(app)/proyectos/{page, nuevo/page, [id]/page, [id]/imprimir/page}.tsx`. `cp/` = `src/components/proyectos/`.
Pendiente de F1: las capturas en escritorio (1440) y móvil (390) por rol (paso 2), cuando el servidor local esté libre.

## Roles (`src/lib/permissions.ts`)

- **Gestor** = ADMINISTRADOR o GERENCIA (`canManageProjects`, l. 115).
- **Miembro** = COORDINADOR o COLABORADOR que integra el equipo del proyecto.
- `useEjecucionPermisos` (`cp/project-ejecucion.tsx:199`): `canWrite` = gestor o miembro; `canVoid` = solo gestor.
- `canValidateExpense` = gestor que no registró el gasto. Aprobar línea base y modificaciones: solo gestor.

## Pantallas

| # | Pantalla / cómo se llega | Archivos | Qué hace la persona (etiquetas reales) | Roles | Notas de UX vistas en el código | Tareas |
|---|---|---|---|---|---|---|
| 1 | `/proyectos` › Portafolio | `cp/proyectos-vista.tsx:18`, `cp/project-list.tsx:103`, `cp/portafolio-filtros.tsx:155`, `cp/portafolio-kpis.tsx:31` | Filtrar, «Limpiar filtros», «Nuevo proyecto», «Ver detalle» | Todos (la API limita a sus proyectos); totales con `canViewPortfolio` | Etiquetas «No confirmado», «Sin medir»; 4 estados vacíos | T-9, T-6 |
| 2 | `/proyectos` › panel «Gastos por validar» | `cp/expense-validation-queue.tsx:15` (montado en `cp/project-list.tsx:208`) | Cola de validación de todos los proyectos | Solo gestor | «Supera el asignado», «Datos incompletos». Vive bajo el portafolio, no en la ficha | T-4, T-5 |
| 3 | `/proyectos?vista=tablero` | `cp/project-dashboard.tsx:53`, `tacometro.tsx`, `curve-s-chart.tsx`, `radar.tsx` | 6 filtros, «Exportar Excel», «Ver detalle» | Todos | «Posible retraso», tacómetro, radar, «Corte al …» | T-9, T-1 |
| 4 | `/proyectos/nuevo`, asistente de 5 pasos | `cp/nuevo-proyecto/nuevo-proyecto.tsx:37`, `stepper-logic.ts`, `paso-general.tsx:21`, `project-create-form.tsx:159`, `paso-siguientes.tsx:23`, `paso-revision.tsx:36` | General, Metas, Cronograma, Presupuesto, Revisión; «Atrás», «Siguiente», «Guardar borrador», «Abrir proyecto» | `canCreateProject` (los 4 roles) | Paso 1 con ~9 campos. **Mensaje desactualizado:** «Solo Administración y Gerencia pueden crear proyectos» contradice `canCreateProject` | T-6, T-7 |
| 5 | Ficha `/proyectos/[id]`, cabecera fija | `cp/project-ficha.tsx:33`, `cp/ficha/ficha-header.tsx:40` | 2 chips de semáforo (técnico, financiero) que llevan a su pestaña; «Aprobar línea base», «Cambiar estado», «Registrar avance», «Registrar gasto»; menú ⋯: «Exportar a Excel», «Imprimir / PDF» | Línea base y estado: gestor. Avance/gasto: `canWrite` y EN_EJECUCION | Aviso de proyecto congelado; 5 pestañas con pista de desplazamiento en móvil | T-1, T-7 |
| 6 | Ficha › Resumen | `cp/ficha/ficha-resumen.tsx:422`, `cp/requiere-atencion.tsx:48`, `cp/ficha/editar-datos-generales.tsx:77`, `cp/project-team.tsx:42` | BORRADOR: «Próximos pasos». Si no: tarjeta Estado (Al día / Atención / En riesgo, «Ver actividades», «Ver finanzas»), «Requiere atención», «Editar datos generales», Equipo «Agregar» | Edición: gestor o miembro según estado; equipo: gestor | «Nada pendiente por ahora.» | T-1, T-5, T-7 |
| 7 | Actividades › Lista (BORRADOR) | `cp/project-estructura.tsx:27`, `estructura-objetivos.tsx:39`, `estructura-actividades.tsx:44`, `estructura-entregables.tsx:20`, `estructura-indicadores.tsx:17` | «Cargar desde Excel» / «Crear a mano», «Agregar …», «Importar plantilla», «Importar estructura (formato PO)» | `canWrite` y BORRADOR | Campos «Código», «Semana inicial/final» | T-6 |
| 8 | Actividades › Lista (en ejecución) | `cp/project-ejecucion.tsx:58`, `ejecucion-avance.tsx:67`, `ejecucion-avance-form.tsx:24`, `reporte-actividad-form.tsx:21`, `ejecucion-indicadores.tsx:50`, `curve-s-chart.tsx:75` | «Registrar avance» (Fecha, Cantidad, Observación, Justificación, Medio: Sin medio/Archivo/Enlace), «Adjuntar», anular, «Registrar medición», «Opciones avanzadas» (Base: Vigente / Original (v0)) | `canWrite` + responsable de la actividad (gestor puede siempre); anular: gestor | **En móvil abre hoja inferior** (`capture-surface.tsx:31`, < 768 px). Jerga «pp», «v0» | T-2, T-5, T-1 |
| 9 | Actividades › Gantt | `cp/estructura-gantt.tsx:39` | Solo lectura | Todos | «Fuera de la duración del proyecto» | T-1, T-5 |
| 10 | Actividades › Tablero (oculto en BORRADOR) | `cp/ficha/actividades-tablero.tsx:57` | Columnas Por iniciar / En curso / Atrasada / Terminada; la tarjeta abre la fila en Lista | Todos | — | T-5, T-1 |
| 11 | Finanzas › Resumen | `cp/project-financiero.tsx:40` | «Opciones avanzadas» (Corte, Base), «Restablecer» | Todos | **Jerga: columnas P, E, D, «E/P», «E/A»** (el PR de grupos 1-2 cambia «E/P») | T-1 |
| 12 | Finanzas › Gastos | `cp/project-gastos.tsx:97`, `gasto-form.tsx:92`, `gasto-acciones.tsx:74`, `gasto-soportes.tsx:19`, `adjuntar-soporte.tsx:43`, `gastos-kpis.tsx:11`, `gastos-import-dialog.tsx:186` | «Registrar gasto» (~10 campos + soporte) → «Registrar»; «Importar gastos», «Adjuntar», «Validar» / «Rechazar» → «Confirmar rechazo» | Registrar: gestor o miembro, EN_EJECUCION. Validar: gestor que no lo registró | Hoja inferior en móvil; «Validar» bloqueado sin soporte | T-3, T-4, T-5 |
| 13 | Finanzas › Presupuesto | `cp/project-presupuesto.tsx:32`, `presupuesto-programacion.tsx:54`, `presupuesto-import-dialog.tsx:129` | «Guardar presupuesto», «Igualar valor total a Σ A», «Guardar programación», «Importar presupuesto» | `canWrite` y BORRADOR | **Jerga «Σ A»** | T-6, T-7 |
| 14 | Ficha › Documentos | `cp/ficha/ficha-documentos.tsx:65`, `subir-documento-dialog.tsx:33` | «Buscar por nombre», filtro por grupo, «Abrir», «Subir documento» | Escribir: gestor o miembro; borrar: solo archivos del proyecto, gestor o quien lo subió | — | T-8, T-5 |
| 15 | Historial › Modificaciones | `cp/project-modificaciones.tsx:56`, `modificacion-form.tsx:50` | «Solicitar modificación» (6 tipos + Motivo) → «Enviar solicitud»; «Aprobar» / «Rechazar» | Solicitar: gestor o miembro, EN_EJECUCION; decidir: gestor | «Aún no hay solicitudes de modificación.» | T-7 |
| 16 | Historial › Versiones | `cp/project-versiones.tsx:70` | Comparar «Desde» / «Hasta» | Todos | Etiquetas v0…vN | T-7 |
| 17 | Historial › Auditoría | `cp/project-historial.tsx:23` | Solo lectura | Todos | «Sin movimientos registrados.» | T-8 |
| 18 | Cabecera ⋯ › Exportar a Excel | `cp/project-kpis-panel.tsx:43` | Elegir Corte y Base, descargar | Todos | — | T-1 |
| 19 | `/proyectos/[id]/imprimir` | `cp/print/project-print-sheet.tsx:76` | Imprimir / PDF | Según API | — | T-1 |
| 20 | Diálogos de importación (filas 7, 12, 13) | `cp/import-dialog.tsx:103`, `estructura-po-import-dialog.tsx:164`, `gastos-import-dialog.tsx:186`, `presupuesto-import-dialog.tsx:129` | «Descargar plantilla», «Validar plantilla», «Descargar reporte (.csv)», «Listo» | Igual que la pestaña que lo abre | .xlsx ≤ 4 MB, «primeros 500 errores»; la importación de gastos no lleva soportes | T-6, T-3 |

La ruta `proyectos-v3` no existe en esta rama; queda fuera (regla del plan, §4).

## Cobertura por tarea

| Tarea | Pantallas |
|---|---|
| T-1 Ver si va bien y por qué | 3, 5, 6, 8, 9, 10, 11, 18, 19 |
| T-2 Registrar avance | 8 |
| T-3 Registrar gasto con soporte | 12, 20 |
| T-4 Validar o rechazar gastos | 2, 12 |
| T-5 Saber qué falta | 2, 6, 8, 9, 10, 12, 14 |
| T-6 Crear e importar plantilla | 1, 4, 7, 13, 20 |
| T-7 Línea base / modificación | 4, 5, 6, 13, 15, 16 |
| T-8 Encontrar un documento | 14, 17 |
| T-9 Revisar el portafolio | 1, 3 |

## Datos demo y arnés para las capturas (paso 2)

- `prisma/seed.ts` solo crea 4 usuarios (`seed.ts:114-122`): `admin@`, `gerencia@`, `coordinador@` y
  `colaborador@demo.muttuhub.local`. Los proyectos vienen de `scripts/import-plantilla-demo.ts`,
  `scripts/set-project-estado.ts` y `scripts/reset-demo.ts` (siempre con `.env.local`).
- PRY-2026-001 «Demo CedeTextil · En ejecución»: `/proyectos/579debc9-d3ce-4468-a5ca-3d9821d0df37` (id generado por la base).
- `.claude/qa/capturar.mjs` (Playwright): modos `antes|t3|t5|t8`, entra como `gerencia@`, vistas 1440×900 y
  390×844, es-CO. No tiene modo para subpestañas de la ficha ni para otros roles: falta el modo `ux` del plan.

## Hallazgos para F2 (ya vistos en el código)

1. Mensaje desactualizado en el asistente: «Solo Administración y Gerencia pueden crear proyectos» (todos los roles pueden).
2. La validación de gastos (T-4) está en el portafolio, lejos de la ficha y del soporte del gasto.
3. Jerga en pantalla: «E/A», «P/E/D», «pp», «Σ A», «v0», «Código».
4. Registrar avance exige ser el responsable de la actividad: el botón aparece o no según la persona (revisar con el aviso de solo consulta de AJ-06).

## Huecos

- Sin revisar: el detalle de columnas y tarjetas móviles de `ProjectGastos` y `EjecucionAvance`, los tipos de
  «Requiere atención» (vienen del servidor), el selector de rol de `ProjectTeam`, `ProjectCronograma` (paso 3).
- Los códigos e ids de los otros proyectos demo solo están en la base local.
