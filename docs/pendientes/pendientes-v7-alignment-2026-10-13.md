# Pendientes y traspaso — v7 alignment (2026-10-13)

Estado al cierre de la sesión del 2026-10-13 (rama `feat/projects-v2`, HEAD `2084828`,
árbol limpio). El plan vivo, con el detalle por unidad, está en
`odd/tasks/v7-alignment.md`; este documento lista lo que requiere decisión y los puntos
de retomada.

## Hecho

- **Clientes:** C1a (shell de sub-navegación con las 7 secciones), C3 (Interacciones),
  C4 (Relaciones), C5 (Salud), C7 (Automatizaciones).
- **Tablero:** T1. **Proyectos:** P1 (reagrupación de la ficha + Soportes).

## Decisiones pendientes

1. **Revisión nativa por sección — no ejecutable desde opencode.**
   `gentle-ai review assess --agent opencode` devuelve `risk: high` con
   `code: unassessable`: *"the active runtime is not eligible for immutable receipt
   review; supported immutable review runtimes: claude-code, codex"*, sin
   `next_transition`. La recepción de desarrollo por recibos (RDD) está `on`
   (decidido en global). Consecuencia: **C3, C4, C5 y C7 quedaron con verificación del
   padre** (suite completo + `tsc` + eslint + guardas), sin revisión nativa.
   Opciones: (a) correr esas revisiones desde claude-code/codex; (b) desactivar RDD en
   este clon (`gentle-ai review mode disable --scope clone`) — decisión del usuario;
   (c) aceptar la verificación del padre como registro.
2. **Cobertura de guardas.** Las guardas `design` y `a11y` escanean solo
   `src/components/proyectos`; lo nuevo en `src/components/crm` (Interacciones,
   Relaciones, Salud, Automatizaciones) queda cubierto por `surface`/`control`/`table`
   pero **no** por `design`/`a11y`. Extenderlas es ampliar alcance: pendiente de ok.
3. **C6 Mapa — fuente de datos.** `Cliente.ubicacion` es texto libre: no hay vínculo a
   departamento (`Municipio.departamento` existe para proyectos). Hay que decidir si se
   modela la relación o se agrega por el texto actual.
4. **C8 Guías — forma.** El prototipo v7 no tiene guías ni ayuda in-app (cero
   coincidencias de `guia/ayuda/tour/help`), así que "una guía por sección" no viene del
   diseño: hay que definir si es un panel in-app o un documento del repositorio.
5. **Capturas de pantalla pendientes** en C3, C4, C5 y C7: el runtime de opencode no
   tiene navegador. El checklist visual de cada sección quedó en el handover del writer
   correspondiente (claro/oscuro, 1440 y 390 px).
6. **Unidades diferidas:** C1b (reenfoque master/detail de Aliados), C2 (Oportunidades:
   kanban global de 7 etapas + ficha; falta el mapeo de etapas), P2 (Nuevo proyecto como
   página con stepper). Opcionales: Convocatorias, propuesta económica.
7. **Decisión de producto arrastrada desde P1:** el input mensual editable "Nueva
   planeación" del prototipo choca con el bloqueo de la línea base (S8); la pestaña ya
   muestra la tabla mensual de solo lectura vía la curva S.

## Puntos de retomada

- Rama `feat/projects-v2`, HEAD `2084828`, árbol limpio.
- Plan y decisiones: `odd/tasks/v7-alignment.md` — espejo en Engram, topic
  `odd/v7-alignment/tasks`.
- Análisis de brechas del prototipo: `odd/tasks/v7-gap-analysis.md`.
- Auditoría profunda del 2026-10-13: `docs/analisis/` (T1 historial de commits,
  T2 arquitectura, T3 seguridad, T4 proceso y pruebas).
- Verificación vigente: suite completa **336 archivos / 3594 tests verde**;
  `npx tsc --noEmit` limpio; `npx eslint` limpio; las 6 guardas en verde.
- Comandos de verificación: `TZ=America/Bogota npx vitest run`,
  `npx tsc --noEmit`, `npx eslint <archivos>`.
- Fórmula de Salud ya decidida y en código: Contacto 40 / Compromisos 35 / Proyectos 25,
  componentes sin datos descartados y pesos renormalizados.
