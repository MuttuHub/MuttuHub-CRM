# Plan de emergencia — push, PR y lanzamiento v2 (2026-10-18)

Guía rápida para el operador y el acompañante. La vuelta atrás de la **ventana** sigue viviendo en el runbook
(`docs/runbook-lanzamiento-v2.md` §5); este documento añade la fase de push/PR/CI, que el runbook no detalla, y
consolida el árbol de decisión. Reglas del §0 del runbook vigentes: nada de `migrate resolve`, `db push`, `reset`
ni `--force`; el respaldo se restaura **nunca sobre producción** (PITR o el panel primero).

## Fase A — Push y PR (antes de la ventana)

**A1. El push falla (certificado Fortinet en WSL).**
Síntoma: `Verify return code: 21` / `SSL certificate problem` al empujar a `github.com`. Es el problema conocido.
Salidas (en orden):
1. Instalar la CA raíz de Fortinet en WSL: copiarla a `/usr/local/share/ca-certificates/` y
   `sudo update-ca-certificates`; reintentar el push.
2. Empujar desde Git de Windows (usa el almacén de certificados de Windows), según
   `docs/pasos-post-reunion-2026-10-14.md` §2. Es *fast-forward*: no hay conflicto de historia.
No hay nada que deshacer: la rama local queda igual y se reintenta.

**A2. El PR queda con CI en rojo.**
1. Ver el job que falló: `gh pr checks` y `gh run view <id> --log-failed`.
2. Reintentar una vez (`gh run rerun <id> --failed`): el fallo puede ser del runner (la suite local está verde:
   370 archivos / 4134 pruebas, `tsc` y build limpios).
3. Si el rojo persiste y la ventana corre riesgo: el runbook §3.8 permite la **vía de merge directo** como
   alternativa al PR (decisión del usuario; G-1 ya aceptó el merge grande). En ese caso el push a `main` también
   dispara CI sobre `main`: si ese CI falla *después* del deploy, se corrige hacia adelante o se revierte Vercel
   (§5.4); la base no se toca.
4. Nunca saltarse el CI con permisos de admin sin una decisión explícita del usuario.

**A3. `gh pr create` falla (auth o red).**
`gh auth status` para confirmar sesión; si la red lo impide, crear el PR desde la UI de GitHub (el push ya dejó la
rama arriba). Alternativa menor: no bloquear la ventana por el PR.

**A4. El merge (PR o directo) da conflictos.**
STOP. No empujar. `main` no se tocaba desde 2026-09-30: un conflicto es una sorpresa que hay que revisar (runbook
§3.8). No resolver a ciegas con `-X theirs/ours`.

**A5. El tag `v2.0.0-rc1` no se puede empujar.**
Es opcional para el lanzamiento: no bloquea nada. Se empuja después.

## Fase B — Ventana R9 (resumen del árbol del runbook §5)

| Fallo | Acción | Dónde |
|---|---|---|
| Antes de migrar (3.0–3.3) | No hay nada que deshacer: corregir y reintentar, o reprogramar | §5.2 |
| `migrate deploy` a medias (3.4) | Restaurar respaldo; la app de `main` sigue arriba | §5.3 |
| La migración terminó pero los conteos o el diff no cuadran (3.5) | STOP; decidir con datos: si faltan datos → restaurar | §5.2 / §5.3 |
| `s1-rubros` dejó datos incorrectos (3.7) | `s1-rubros --revert <lote>` | §5.5 |
| La app nueva falla después del deploy (3.9/3.10) | Código → Instant Rollback de Vercel (la base se queda; las migraciones son aditivas y compatibles con `main`); datos → rollback y luego restaurar | §5.4 / §5.3 |

Recordatorios:
- **Punto de no retorno:** `migrate deploy` (3.4). Antes: todo es reversible sin tocar datos.
- **El push a `main` dispara el deploy de Vercel**; el build no ejecuta migraciones (por eso van antes).
- Un build de Vercel que falla **no promueve**: el sitio sigue sirviendo el deploy anterior.
- Los enums añadidos y las tablas de auditoría no se «deshacen»; el respaldo es lo único que los retrotrae.

## Fase C — Después del deploy

- Humo v2 (§4). Si algo del humo falla: clasificar código vs datos con la tabla de arriba antes de tocar nada.
- Monitoreo (runbook §6) y decisión de mantener o revertir.

## Quién hace qué

- **Usuario:** decide, ejecuta los comandos de producción y autoriza push/merge/deploy.
- **Acompañante:** diagnostica fallos, prepara los comandos, corre la suite e2e del ensayo y verifica resultados.
