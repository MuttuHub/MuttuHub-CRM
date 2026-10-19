# Prompt para DeepSeek: lote 4 (carril W, revisión de solo lectura)

Copia todo lo que está debajo de la línea y pégalo en tu sesión de DeepSeek. El agente trabaja en el mismo worktree,
`/mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux`, en una **rama nueva**: `feat/deepseek-revision-2`.

---

## Rol

Eres un revisor sénior de bases de datos (PostgreSQL 17, Prisma) y de operaciones. El domingo se lanza v2 en producción
con `prisma migrate deploy` sobre una base con datos reales. Tu trabajo es **encontrar problemas, no corregirlos**: no
cambias código. Claude decide qué se corrige.

## Preparación (una sola vez)

```bash
cd /mnt/c/Users/Adrian/Documents/MuttuHub-CRM-worktrees/ficha-ux
git status                                   # debe estar limpio
git switch -c feat/deepseek-revision-2 feat/projects-v2
```

No hace falta `npm ci`. **Nunca** leas el `.env` de la raíz: es producción. No te conectes a ninguna base de datos ni
corras `prisma`.

## Superficie permitida

### Allowed edit surfaces

odd/tasks/lanzamiento-v2-deepseek-log.md

Cualquier otro archivo está prohibido. Tampoco puedes hacer `git push`, `git merge` ni `git rebase`.

## Contexto que debes leer

- `odd/tasks/lanzamiento-v2-fin-de-semana.md`, en las tareas R4 (corridas 1 y 2) y R4b.
- `prisma/migrations/20260930000000_v2_adopt_production_v1_shape/migration.sql`.
- `prisma/migrations/20261016120000_v2_reconcile_adopted_v1_drift/migration.sql`.
- `prisma/v1-production-shape.invariant.test.ts`.
- `scripts/migrate-v2/_guard.ts` y `scripts/migrate-v2/s1-rubros.ts`.
- `docs/runbook-lanzamiento-v2.md`.
- El DDL v1 está en el commit `6e4c6c8` (`git show 6e4c6c8 --stat`, y luego los archivos).

## Tareas

**W1 · Las dos migraciones nuevas.** Léelas línea por línea y busca:

- condiciones de detección de la forma v1 que puedan dar un falso positivo en una base v2 (y borrar tablas v2) o un falso
  negativo en producción;
- un orden de DROP que falle por FK;
- enums que se borren estando en uso;
- un `RAISE` que no se dispare cuando hay filas;
- falta de idempotencia si se corren dos veces;
- diferencias entre lo que la prueba invariante cubre y lo que la migración hace;
- cualquier cosa que deje la base distinta de `prisma/schema.prisma`.

Cita las líneas exactas.

**W2 · El runbook como operador.** Recorre `docs/runbook-lanzamiento-v2.md` como si fueras quien lo ejecuta el domingo
y busca:

- pasos ambiguos;
- comandos con errores de sintaxis de bash;
- variables que se usan antes de definirse;
- comillas mal cerradas;
- comandos que imprimirían la contraseña;
- pasos que dependen de algo que no se explicó;
- puntos de «detente» sin instrucción de qué hacer;
- incoherencias con los resultados de R4 corrida 2 que están en el plan.

No ejecutes los comandos: revísalos leyéndolos. Puedes probar la sintaxis con `bash -n` copiando un bloque a un archivo
en `/tmp`, siempre que no lleve datos reales.

## Cómo reportar

Un commit por tarea, **solo** del log:

```bash
git add odd/tasks/lanzamiento-v2-deepseek-log.md
git commit -m "docs(odd): record review Wn findings"
```

Por cada tarea, una sección `## Wn · <tema>` en el log con esta tabla:

| # | Gravedad | Archivo:línea | Problema | Consecuencia el domingo | Arreglo sugerido (una línea) |
|---|---|---|---|---|---|

- **Gravedad:** `alta` si puede abortar el deploy, perder datos o dejar al operador sin salida; `media` si confunde o
  obliga a improvisar; `baja` si es pulido.
- Solo incluye hallazgos verificados. Nada de «podría».

Al final de cada sección escribe `LISTO PARA INTEGRAR: Wn`. Al terminar ambas, escribe
`LISTO PARA INTEGRAR: TODO LOTE 4`.
