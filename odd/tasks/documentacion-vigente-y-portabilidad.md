# Documentación vigente y portabilidad del repositorio

Feature: poner la documentación al día con el estado real de `main` (v2 del módulo de Proyectos, matriz de permisos del
2026-10-19) y dejar preparada la migración a otro proveedor (Railway Pro y equivalentes). Mirror de Engram:
`odd/documentacion-vigente-y-portabilidad/tasks`.

## Specs

- **S1.** El `README.md` describe el estado real: stack, módulos, permisos, pruebas, puesta en marcha, variables y
  despliegue. No puede seguir diciendo «v1 completa, 711 tests».
- **S2.** Un índice de documentación (`docs/README.md`) dice, para cada documento, si está **vigente**, es **histórico** o
  es una **feature** en curso. Nadie debe tener que adivinar qué documento manda.
- **S3.** Un documento de despliegue y portabilidad enumera los servicios externos, las variables de entorno y los
  acoplamientos a Supabase, y describe qué haría falta para migrar a Railway Pro sin prometer que ya está hecho.
- **S4.** Un documento de pendientes (`docs/pendientes-v7.md`) reúne lo que quedó abierto de los retoques de v7 y del
  lanzamiento, con estado explícito: hecho, pendiente, sin verificar o descartado.
- **S5.** Los documentos históricos se marcan como tales en su encabezado y apuntan al documento vigente; no se
  reescribe su contenido.
- **S6.** No se borra ningún archivo del repositorio en esta feature: los candidatos a limpieza se listan para decisión
  del usuario.

## Tasks

- [x] **T1** `README.md` reescrito al estado real.
- [x] **T2** `docs/README.md` con el índice y el estado de cada documento.
- [x] **T3** `docs/despliegue-y-portabilidad.md` con servicios, variables, acoplamientos y plan de migración.
- [x] **T4** `docs/pendientes-v7.md` con el inventario de pendientes y su estado.
- [x] **T5** Encabezados de los documentos históricos (`PENDIENTES-MENORES.md`, `HANDOFF-contexto-sesion.md`) apuntando
  a los vigentes.

## Log

- **L1 (2026-10-19, verbatim).** «Actualiza toda la documentación de muttu, hasta la version que llevamos, esto con la
  finalidad de pulir el codigo del repositorio, en caso tal quiera migrarlo a un servicio com Raylway Pro. Además, que
  tareas quedaron pendientes por terminar de estos ultimos retoques de v7»
- **L2.** Estado de partida: `README.md` del 2026-09-02 (v1, 711 tests, sin módulo de Proyectos); `main` en `da14703`
  (v2 desplegada, matriz de permisos vigente); 4136 pruebas unitarias y 29 e2e en verde.
- **L3.** Candidatos a limpieza detectados, sin borrar: `Guia-acceso-Muttu-Hub.pdf`, `Manual-de-usuario-Muttu-Hub.pdf`,
  `guia-acceso.html`, `manual-usuario.html`, `docs/muttu-hub-v2.html` (prototipo de 504 KB),
  `voy-a-hacer-un-synthetic-rabin.md`, `docs/guia-prueba-proyectos.md` y `docs/guia-demo.md` (superados por la guía
  vigente en lo que respecta a Proyectos). `AGENTS.md` lo regenera `next dev`: no se toca.
