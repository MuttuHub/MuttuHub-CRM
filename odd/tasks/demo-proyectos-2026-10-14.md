# Demo de Proyectos en servidor de pruebas (2026-10-14)

Feature: `demo-proyectos-2026-10-14`. Rama: `feat/projects-v2`, HEAD `d1b5b01`, árbol limpio.
Plan vivo de v7 (no se abandona, se prioriza distinto hoy): `odd/tasks/v7-alignment.md`.
Guion de prueba del módulo: `docs/guia-prueba-proyectos.md` (incluye "Recorrido de 10 minutos para la reunión").
Guion de demo general y stack local: `docs/guia-demo.md`.

## Specs

S1. Prioridad de la entrega de hoy, textual del usuario:
> "Lo mas importante es mostrar la parte de proyectos, lo de clientes y tablero se puede realizar luego con mas calma"

S2. Para Oportunidades (C2) cuando se retome, mapeo decidido por el usuario: reetiquetar los 7 estados existentes
del enum de Prisma, **sin migración** — `EN_REVISION` → «Revisión TDR», `DISENANDO_PROPUESTA` → «En formulación»,
`PRESENTADA` → «Enviada · seguimiento», `EN_NEGOCIACION` → «En negociación», `GANADA` → «Aceptada»,
`PERDIDA` → «Rechazada», `STANDBY` → «En espera». El enum del backend sigue siendo la fuente de verdad.

S3. Destino elegido por el usuario: preview del PR en Vercel desde la rama `feat/projects-v2`, con su advertencia
aceptada de confirmar antes a qué base de datos apunta. Autoriza el push de la rama. Push, apertura de PR y merge
siguen siendo decisiones del usuario.

S4. No apuntar migraciones ni datos de demostración a la base de producción sin una decisión explícita e informada.
`docs/guia-demo.md` lo exige y `scripts/seed-projects-demo.ts` lo hace cumplir con la guarda `require-local-db`.

## Hallazgos que bloquean la Spec S3 (verificados 2026-10-14)

H1. **No existe entorno de pruebas.** El proyecto Vercel `muttu-hub` tiene sus 12 variables de entorno con alcance
**solo `Production`** (`vercel env ls`); un deployment de *Preview* no recibe `DATABASE_URL`. No hay rama `develop`
(el canal de staging que declara `docs/Muttu_Hub_PRD_v2.md:1027`) ni local ni remota. Los otros dos proyectos de la
cuenta no son este sistema.

H2. **`main` no tiene el módulo de Proyectos.** `git show main:prisma/schema.prisma` → 0 ocurrencias de `model Proyecto`;
`src/app/(app)/` en `main` no incluye `proyectos/`. Producción (desplegada desde `main`, `6bee83f`, 2026-09-30) nunca
ha recibido el módulo. Por tanto la demo de Proyectos no puede mostrarse desde producción.

H3. **Push a GitHub bloqueado en este entorno.** Inspección TLS del firewall Fortinet `FGT60FTK20005270`: `github.com`
presenta un certificado emitido por `O=Fortinet`, que el bundle `/etc/ssl/certs/ca-certificates.crt` de WSL no confía
(`Verify return code: 21`). `git ls-remote` y `gh` fallan con error de verificación de certificado; el CLI de Vercel sí
funciona. `git merge-base --is-ancestor` confirma que el push sería *fast-forward* (la punta remota es ancestro), así
que el bloqueo es solo de confianza TLS, no de historia.

H4. **18 migraciones pendientes** entre la punta remota (2026-10-03) y HEAD
(`20261005120000_v2_municipios` … `20261013130000_v2_relaciones`), más 267 commits sin publicar.

H5. **Stack local caído.** Docker no estaba corriendo y el Supabase local (`127.0.0.1:54322`) no responde.
Docker Desktop fue lanzado el 2026-10-14 para habilitar la validación local.

## Tasks

- [x] T1 Decidir la ruta de la demo — **local** (L5, "opcion a"), servidor de desarrollo; el push va después (L6).
- [ ] T2 Verificar HEAD verde: suite completa + `tsc --noEmit` (en curso, job `job-1`). **No correr mientras se ensaya
      o demuestra** (H6); correr solo después de la reunión o antes de restaurar los datos.
- [x] T3 Levantar el stack local — verificado 2026-10-14 09:06: 12 contenedores `supabase_*_muttu-hub` arriba,
      `127.0.0.1:54322` abierto; `next dev -H 0.0.0.0` corre en Windows (PID 7000, desde 08:53), `/login` → 200
      (desde WSL: `http://172.30.48.1:3000`).
- [x] T4 Sembrar el demo de Proyectos — ver "Estado verificado de los datos" (08:49).
- [ ] T5 Recorrer `docs/guia-prueba-proyectos.md` end-to-end y registrar qué falla (crear proyecto, ficha 11
      pestañas, cronograma, presupuesto, aprobar línea base, gastos, versiones, tablero, exportaciones).
- [ ] T6 (si la ruta lo exige) desbloquear el push TLS y publicar el destino elegido.
- [ ] T7 Registrar el resultado verificado, los checks fallidos y el siguiente paso.

## Log

L1 (2026-10-14, textual):
> "cual es el estado del proyecto en cuanto a la implementación de v7?"

L2 (2026-10-14, textual):
> "termina las unidades restantes, que me estan pidiendo una prueba para hoy en la tarde, que tan probable puede ser terminar hoy para mostrar en el servidro de pruebas?"

L3 (2026-10-14, decisiones del usuario, ver S1–S3):
> Alcance: "Lo mas importante es mostrar la parte de proyectos, lo de clientes y tablero se puede realizar luego con mas calma"
> Etapas C2: reetiquetar los 7 estados existentes, sin migración.
> Despliegue: preview del PR en Vercel (rama feat/projects-v2), autorizando el push.

L4 (2026-10-14, hallazgos del padre): H1–H5. El destino elegido en L3 no es viable tal como está configurado, porque
no existe entorno de pruebas (H1) y el módulo no está en producción (H2). Se devuelve al usuario la decisión de ruta.

L5 (2026-10-14, textual):
> "opcion a. Tengo hasta las 3:30 pm, te tengo a ti y a claude code, crees que si alcance el tiempo?"

Consentimiento explícito para reconstruir la base local (Opción A), usado como valor de
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` = `opcion a.` en el `migrate reset` del 2026-10-14.
Ruta elegida: demo local. Fecha límite declarada: 15:30.

L6 (2026-10-14 09:05, textual):
> "necesito bro entregar el modulo de proyectos para hoy a las 3:30 pm. [...] por ahora podemos mostrarlo en el
> servidor de desarrollo y luego subir los cambios al repositorio. Enfoquemonos solo en el modulo de proyectos, los
> demás cambios dejalos documentados como pendiente"

## Fuera del alcance de hoy (pendiente, documentado por L6)

Solo se trabaja el módulo de Proyectos. Lo siguiente queda pendiente, sin cambios hoy; su detalle vive en
`odd/tasks/v7-alignment.md`:

| Módulo | Pendiente | Estado / decisión abierta |
|---|---|---|
| Tablero | Exponer id/código del proyecto en el DTO de la tarea para que la tarjeta convertida enlace al proyecto exacto | Diferido desde T1 |
| Clientes | C1b re-skin maestro/detalle de Aliados | La lista actual sigue como pestaña Aliados |
| Clientes | C2 Oportunidades (API global, kanban de 7 etapas, ficha) | Mapeo de etapas ya decidido (S2), sin migración |
| Clientes | C5b Salud — pase de capturas en navegador | Implementado (`8cc448a`), sin verificación visual |
| Clientes | C6 Mapa | Sin empezar |
| Clientes | C7 reglas v7 adicionales (2 días antes, 30 días sin contacto, plantillas de correo) | No modeladas |
| Clientes | C8 guías por sección | Decisión de producto abierta: panel en la app vs documento |
| Opcional | Convocatorias, propuesta económica | Sin empezar |
| Entrega | Push de `feat/projects-v2` (267+ commits, 18 migraciones) y PR | Bloqueado por inspección TLS de Fortinet (H3); sin entorno de pruebas en Vercel (H1) |

Pendientes del propio módulo de Proyectos que no bloquean la demo:

- **P2** "Nuevo proyecto" como página con stepper (v7). Hoy un proyecto solo nace convirtiendo una oportunidad
  GANADA (`POST /api/v1/clients/:id/opportunities/:opportunityId/project`); el flujo funciona, falta la página.
- **P1** decisión de producto: la entrada mensual editable "Nueva planeación" del prototipo v7 choca con el bloqueo de
  la programación tras aprobar la línea base (S8); la pestaña muestra la tabla mensual de solo lectura.

## Estado verificado de los datos (SQL, 2026-10-14 08:49)

| Proyecto | Estado | Actividades | Entregables | Indicadores | Rubros | Avances | Mediciones | Gastos |
|---|---|---|---|---|---|---|---|---|
| PRY-2026-001 Demo CedeTextil · En ejecución | EN_EJECUCION | 4 | 7 | 2 | 8 | 5 | 3 | 5 |
| PRY-2026-002 Demo CedeTextil · Borrador | BORRADOR | 4 | 7 | 2 | 8 | 0 | 0 | 0 |

Oportunidades GANADA libres para la conversión en vivo: 2. Credenciales: `admin@demo.muttuhub.local` /
`gerencia@demo.muttuhub.local`, contraseña `MuttuDemo2026!`.

H6. **Las pruebas de invariantes contaminan la base local.** `prisma/modificaciones.invariant.test.ts:5` declara que
no todo va en transacción: crea filas y **borra después**. Durante la corrida de la suite de las 08:49 apareció y
desapareció un proyecto `PRY-SDD-M-444be4c7…` / `sdd-invariant-modificaciones-…` en EN_EJECUCION. Consecuencia
operativa: **no correr la suite completa mientras se ensaya o se demuestra**; si aparece un proyecto
`sdd-invariant-*` en `/proyectos`, hay una suite corriendo de fondo.

## Checklist de ensayo en el navegador (antes de la reunión)

1. `/proyectos`: deben verse **exactamente 2 proyectos demo** (PRY-2026-001 y PRY-2026-002). Si aparece algo
   `sdd-invariant-*`, detener la suite y recargar.
2. Ficha de **PRY-2026-002** (Borrador): recorrer las **11 pestañas** y confirmar los nombres de la tabla de la guía
   (Resumen, Metas e indicadores, Cronograma, Gantt, Ficha de seguimiento, Financiero, Legalización, Beneficiarios,
   Soportes, Equipo, Cambios).
3. **Aprobar línea base** en PRY-2026-002: pasa a En ejecución y aparecen los chips de semáforo.
4. **PRY-2026-001**: pestaña **Ficha de seguimiento** (curva S + semáforo técnico), **Legalización** (5 gastos:
   2 registrados, 2 validados, 1 con sobreejecución bloqueada) y **Cambios** (Modificaciones, Versiones, Historial).
5. **Convertir en proyecto** una de las 2 oportunidades GANADA libres.
6. Tablero: `/proyectos?vista=tablero` y **Exportar Excel**.
7. Vista móvil (<768 px): lista y tablero en tarjetas.

