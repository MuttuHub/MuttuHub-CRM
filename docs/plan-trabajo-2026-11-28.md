# Plan de trabajo — 2026-11-28

Fuente: `docs/informe-pendientes-2026-11-27.md` (los números `§x.y` remiten a ese informe).
Objetivo del día: cerrar el lanzamiento del 2026-11-27, dejar una sola lista viva de
pendientes y limpiar el repositorio.

## Bloque 1 — Cierre operativo del lanzamiento (≈1 h)

- [ ] Prueba rápida en producción (§1.1): proyecto de posición propia con un aliado,
      su reporte y Excel; etiquetar una oportunidad y una entrada de bitácora y verlas
      en el reporte por etiqueta.
- [ ] Decidir si la regla 2 de V8 («30 días sin contacto») queda apagada antes de la
      próxima corrida del cron de las 8:00 (§1.4).
- [ ] Decidir qué hacer con la migración fantasma
      `20260918153200_tablero_seguimiento_social` (§1.6).

## Bloque 2 — PR #227 con el ritual de migración (≈1,5 h)

Se hace mientras todavía existe `~/.muttu-prod-url`; si no se hace hoy, la URL se borra
igual al cerrar el bloque.

- [ ] Rebase de #227 sobre `main` y CI verde.
- [ ] Migración contra local (`.env.local`) e invariantes.
- [ ] Ensayo sobre una copia restaurada de producción (dump nuevo, contenedor aislado,
      `migrate deploy` + `diff` + conteos); borrar el contenedor al terminar.
- [ ] `migrate deploy` en producción, verificación y merge de #227.
- [ ] Borrar `~/.muttu-prod-url` (§1.2).
- [ ] Decidir la retención de `~/muttu-backups/` y borrar lo que sobre (§1.3).

## Bloque 3 — Arreglo rápido (≈30 min)

- [ ] Corregir el texto de `nuevo-proyecto.tsx:193`, que dice que solo Administración
      y Gerencia crean proyectos (§2.1); test que lo fije; PR.

## Bloque 4 — Mensaje a la PO (≈30 min)

- [ ] Redactar un solo mensaje con las 9 preguntas de §7 y enviarlo.

## Bloque 5 — Higiene de documentación (≈2 h)

- [ ] Elegir una sola lista viva de pendientes (`docs/pendientes.md` o
      `docs/plan-trabajo-restante.md`), reescribirla a partir del informe y retirar la otra
      (§8.1). Descartar los cambios sin commitear de `docs/pendientes.md` si quedan
      superados.
- [ ] Crear `odd/archive/` y mover los documentos de §8.3; antes, pasar a la lista viva
      los pendientes de los que «siguen vivos».
- [ ] Mover a `docs/archive/` los documentos de §8.2.
- [ ] Actualizar `docs/README.md` y corregir el estado de
      `odd/tasks/v1-oportunidades-globales.md`.

## Bloque 6 — Limpieza del repositorio (≈1 h)

- [ ] Quitar los worktrees que ya no se usan (§6.2), cuidando el que guarda el
      `node_modules` compartido.
- [ ] Borrar las ramas locales ya mergeadas (§6.3) y la ref
      `backup/pre-rebase-feat-projects-v2-20260930` (§6.4).
- [ ] Decidir sobre los archivos sin versionar y los `.docx` de la PO (§6.5) y sobre las
      capturas generadas (§6.6).

## Si sobra tiempo

- Avisos del verificador de V8 (§2.5) y carreras del congelamiento (§2.7).
- Specs e2e fuera de CI (§4.3).

## Fuera del día (bloqueado o depende de terceros)

- DNS de `muttu.co` y Resend (§5.1), respaldos automáticos (§5.2), Railway (§5.3),
  gasto de $938.000 de la Gestora (§3.1), respuestas de la PO (§7).
