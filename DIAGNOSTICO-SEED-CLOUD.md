# Diagnóstico — Seed demo ejecutado en Supabase Cloud (producción)

**Fecha del diagnóstico:** 2026-09-22
**Estado:** ✅ **RESUELTO** — limpieza aplicada el 2026-09-22, regla anti-recurrencia implementada

---

## 1. Contexto

El seed demo (`prisma/seed.ts`) — datos ficticios con ids fijos `00000000-0000-4000-*` — se ejecutó por error contra el proyecto **Supabase Cloud (producción)** `rxwtgvuijaketidnbtoh`, cuando debía ejecutarse contra la base **Docker local** (`supabase_db_muttu-hub`, 127.0.0.1:54322).

**Causa raíz probable:** `prisma/seed.ts` hace `import "dotenv/config"`, que carga `.env` (apunta a la nube) y **no** `.env.local` (apunta a Docker local). Por eso `npm run db:seed` impactó producción.

## 2. Línea de tiempo verificada (con evidencia)

| Base | Seed presente | Cuándo se insertó |
|---|---|---|
| Docker local (`muttu-hub`, 54322) | ✅ Sí (correcto — ahí debía estar) | 2026-09-16 20:11 UTC |
| Supabase Cloud (producción) | ❌ **Sí (contaminación)** | **2026-09-17 14:37–14:38 UTC** |

Evidencia en la nube: los 4 usuarios demo de `auth.users` fueron creados el 17/09 14:37; los documentos seed fueron subidos al bucket `muttu-docs` el 17/09 14:38.

## 3. Inventario exacto de la contaminación en la nube

Filas con id de prefijo seed (`00000000-0000-4000-*`):

| Tabla | Filas seed |
|---|---|
| clientes | 12 |
| contactos | 24 |
| oportunidades | 10 |
| tareas | 20 |
| subtareas | 14 |
| comentarios_tareas | 9 |
| adjuntos_tareas | 2 |
| bitacora_entradas | 24 |
| documentos | 8 |
| documento_versiones | 9 |
| solicitudes_acceso | 3 |
| accesos | 8 |

Otros elementos a eliminar junto con las filas:

- **4 usuarios demo en `auth.users`** (admin/gerencia/coordinador/colaborador@demo.muttuhub.local) + sus 4 filas en `usuarios` (rol ADMINISTRADOR/GERENCIA/COORDINADOR/COLABORADOR).
- **52 notificaciones reales** que referencian tareas seed (generadas por el cron `daily-notifications` sobre tareas demo).
- **11 objetos en storage** `muttu-docs` cuyas rutas contienen el prefijo seed.

**Datos reales que NO se tocan:** 14 clientes reales, 74 tareas reales, 59 documentos reales, 43 versiones reales, 21 adjuntos reales, usuarios reales, etc. Única dependencia cruzada: las 52 notificaciones → tareas demo.

## 4. Dato importante: NO hay datos de "gestión de proyectos" en ninguna base

Se esperaba registrar datos de testing de las nuevas features de gestión de proyectos (PR1–7, migración `20260918153200_tablero_seguimiento_social`). Verificado en ambas bases:

| Tabla | Cloud | Local |
|---|---|---|
| proyectos | 0 | 0 |
| metas | 0 | 0 |
| actividades | 0 | 0 |
| lineas_presupuestales | 0 | 0 |
| gastos | 0 | 0 |
| indicadores | 0 | 0 |
| soportes_proyecto | 0 | 0 |

La actividad de HOY (22/09) en la nube fue solo: notificaciones del cron (POR_VENCER/TAREA_VENCIDA), 2 ediciones de tareas, 4 logins, 2 errores del job de correos (`daily-notifications` con `failed=14`). **Ninguna fila de proyectos** — el módulo nunca se usó en producción.

## 5. Por qué "retroceder hasta antes de hoy" NO es viable

El seed entró el **17/09**, no hoy:

- Restaurar a "antes de hoy" (backup del 21/09 o PITR al 22/09 00:00) → **conserva el seed** (ya estaba desde el 17/09).
- Restaurar a antes del 17/09 → **destruiría 5 días de datos reales** (tareas, documentos, usuarios creados el 21/09, accesos, etc.).

**La única vía limpia es el borrado quirúrgico por prefijo de id seed**, en orden de FKs, más los 4 usuarios demo, las 52 notificaciones huérfanas y los 11 objetos de storage.

## 6. Plan propuesto (pendiente de aprobación)

1. (Opcional recomendado) Dump de respaldo de las filas a borrar por las dudas.
2. Borrar en orden: notificaciones → subtareas → comentarios → adjuntos → versiones → documentos → bitácora → accesos → solicitudes → tareas → oportunidades → contactos → clientes (todas con `id LIKE '00000000-0000-4000-%'`).
3. Borrar los 4 usuarios demo de `auth.users` + sus filas en `usuarios`.
4. Borrar los 11 objetos de storage `muttu-docs` con ruta seed.

**⚠️ Es una mutación destructiva sobre producción — requiere OK explícito del humano.**

## 7. Fix raíz (APLICADO 2026-09-22)

- **Guard en `prisma/seed.ts`**: `assertLocalTarget()` aborta el seed ANTES de escribir nada si `DATABASE_URL` no apunta a `127.0.0.1`/`localhost` (override explícito `SEED_ALLOW_NON_LOCAL=1` solo para demo descartable).
- **Script seguro**: `npm run db:seed:local` = `tsx --env-file=.env.local prisma/seed.ts` (siempre apunta a Docker local).
- **Script de limpieza**: `scripts/cleanup-seed-cloud.ts` (dry-run por defecto, `--apply` para ejecutar; aborta si el host no es Supabase Cloud).

## 8. Ejecución de la limpieza (2026-09-22)

- Backup previo: `/tmp/opencode/seed-cloud-backup-20260922.sql` (202 INSERTs + auth/storage registrados).
- Aplicado con `npx tsx scripts/cleanup-seed-cloud.ts --apply`.
- Nota: hubo un reorden de FKs (`documentos_clientes` antes de `documentos`) — corregido en el script.
- **Verificación post-limpieza:** 0 filas seed en las 14 tablas, 0 usuarios demo en auth, 0 objetos storage con ruta seed, 0 notificaciones → tareas seed.
- **Datos reales intactos:** 14 clientes, 74 tareas, 59 documentos, 14 oportunidades, 14 usuarios reales.

## 9. Evidencia / referencias

- Proyecto cloud: `rxwtgvuijaketidnbtoh` (MuttuHub's Project, us-west-2).
- Local: `supabase_db_muttu-hub`, puerto 54322, DB `postgres`.
- `prisma/seed.ts` — helper `fixedId()` con prefijo `00000000-0000-4000-`.
- Migración: `prisma/migrations/20260918153200_tablero_seguimiento_social` (crea `rubros` con catálogo inicial; en cloud aplicada 18/09, en local aplicada 22/09 13:06).