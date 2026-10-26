# Pendientes por corregir y oportunidades de mejora — Muttu Hub CRM

> Última actualización: 2026-10-19 (retiro del workflow de TestSprite y gate de tipos en CI).
> Estado del pipeline: PR #72 (release v2) — unit ✅, typecheck ✅, Vercel ✅, e2e retirado (ver deuda #2).

## Pendientes por corregir (deuda técnica)

### 1. Cobertura de tests — piso activo con ratchet ✅ (2026-10-21, E2)

- **Estado**: medido el 2026-10-21 con `npm run test:coverage` (`src` + `scripts`, el mismo alcance que CI): líneas 73 %, sentencias 72 %, funciones 68 %, ramas 63 %; el 2026-10-26 el ratchet subió ramas a 64 %. La cifra de ~13-15 % de esta sección era de una suite mucho más chica.
- **Decisión**: esos valores son el **piso** en `vitest.config.ts`. Una corrida por debajo falla, y CI corre `npm run test:coverage` en cada PR.
- **Cómo sube**: `autoUpdate` reescribe los umbrales hacia arriba (redondeados hacia abajo) cuando la cobertura mejora; ese cambio se commitea junto con las pruebas que lo lograron. Bajar un valor es una edición explícita que se revisa en el PR.

### 2. E2E — sin workflow (retirado 2026-10-19)

- **Estado**: `.github/workflows/testsprite.yml` se **eliminó**. Ejecutaba `TestSprite/run-action@v1`, una acción de
  terceros que **ya no existe** en GitHub: toda corrida falla en el paso «Set up job» con
  `Unable to resolve action testsprite/run-action, not found`. Un check permanentemente rojo que nunca ejecuta pruebas
  entrena a ignorar el CI, así que se retiró en lugar de dejarlo como estaba.
- **Qué queda como gate de PR**: `ci.yml` corre migraciones sobre un Postgres desechable, `prisma generate`,
  **`tsc --noEmit`** (agregado el 2026-10-19), `eslint` y Vitest.
- **La suite E2E real existe y es local**: `e2e/` con Playwright y `playwright.verify.config.ts`. Necesita un servidor
  levantado y una base sembrada (la demo local), por eso no corre en CI todavía.
- **Acción futura (post-lanzamiento)**: conectar esa suite a CI con un entorno reproducible (Supabase local o un
  servicio de Postgres + seed + `next start`) y publicarla como check informativo; solo entonces volver a exigirla en
  PRs. No se reintroduce TestSprite.

### 3. Templates de email con marca — listos en repo, NO pegados en Supabase

- **Estado**: 6 templates con marca en `supabase/email-templates/` (confirm-signup, invite, magic-link, reset-password, change-email, reauthentication). CTA directo a `/auth/confirm` con token OTP (excepto reset-password que usa el flujo PKCE existente). Centrado wrapper-table aplicado.
- **Decisión 2026-08-11**: postergado. Customizar templates con el servicio built-in requiere **Pro ($25/mes)**; SMTP custom sin DNS de `muttu.co` obliga a remitente ajeno (Resend shared `onboarding@resend.dev`) o Gmail con entregabilidad media (Brevo; Google eliminó las app passwords en 2025 → Gmail SMTP directo inviable).
- **Acción futura**: cuando exista acceso al DNS de `muttu.co` → Resend con dominio + `no-reply@muttu.co` + pegar los 6 templates + Redirect URLs (`/auth/confirm`, `/auth/reset-password/confirm`). Pasos detallados en `docs/plan-supabase-manana.md` sección 8.

### 4. Deploy de producción — verificación post-merge (2026-08-11)

- ✅ La integración Git deploya producción automáticamente en push a main (verificado: `/auth/confirm` y `/login` 200 tras el merge).
- **Bug encontrado y corregido en la verificación**: `/auth/confirm` no estaba en las rutas públicas del proxy (`src/proxy.ts`) → un usuario recién registrado (sin sesión) era redirigido a `/login` y perdía el token del email. Fix: rutas `NEUTRAL_PATHS` — accesibles para anónimos (no redirigen a login) y logueados (no expulsan a `/`, preservando el flujo de change-email). **Verificado en prod**: GET anónimo a `/auth/confirm?token=…` responde 200 con la página (antes 307 → `/login?next=…`).

### 5. MCP de Supabase — limitaciones conocidas

- `list_branches` falla por permisos del token (`Project reference is missing`) — solo afecta branches de desarrollo.
- El MCP no expone `service_role` ni el password de postgres: el `.env` completo y la config de auth (templates, SMTP, URLs) son manuales del dashboard.
- Credenciales sensibles respaldadas en `~/seguros/muttu-hub-secrets.txt` (chmod 600, fuera del repo).

### 6. Actualización de docs pendientes de sesiones previas

- `docs/pendientes/bugs-pendientes.md` — BUG-001 y BUG-002 marcados ✅ (2026-08-11).
- `docs/pendientes/vitest-unit-tests.md` — suite 212 tests en verde.
- `docs/plan-supabase-manana.md` — sección 8 actualizada (email postergado); ítem VERCEL_TOKEN ✅ completo (secret cargado, preview deploy verificado en PR #2, deploy de prod automático por integración Git).

## Oportunidades de mejora del CRM

### Producto

1. **Emails con marca propios** (ver deuda #3): identidad visual completa en los correos transaccionales cuando haya dominio — el mayor salto de imagen del producto.
2. **UI de reautenticación para operaciones sensibles** (eliminar cuenta, cambiar email): el template `reauthentication.html` está listo; falta la página/modal en la app (`verifyOtp` type=reauthentication). La página `/auth/confirm` no maneja ese tipo a propósito.
3. **Flujo de registro completo con la página `/auth/confirm`**: ya implementada (verifyOtp + exchangeCodeForSession PKCE, modal "¡Correo verificado!", redirect 3s a /login). Falta exponerlo en producción real pegando los templates.

### Técnica

4. **Cobertura de tests hacia 60%** (ver deuda #1): priorizar hooks (`useClientsQuery`, dashboard) y componentes de alta criticidad (tablero, pipeline).
5. **Conectar la suite E2E de Playwright a CI** (ver deuda #2): hoy es local; el gate de PRs es `ci.yml` (unit, tipos y lint).
6. **Supabase Pro** cuando haya uso real: backups diarios, pausa automática, >500 MB storage / 5 GB egress. Hoy Free sobra con margen (evaluación 2026-08-09).

### Infraestructura

7. **Dominio propio para el remitente** (`no-reply@muttu.co`) — desbloquea templates custom + reputación de envío (SMTP de Resend/Google Workspace).
8. **Revisar `scripts/cron_setup.sql`** — contiene el `CRON_SECRET` real; evaluar moverlo a variable de entorno/secret del repo si se versiona.

## Pendientes de Fase 1 — Tablero global (2026-09-02)

> Cierre completo: `docs/cierre-fase-1-tablero-global.md`. La Fase 1 está entregada en `main`; estos son
> los pendientes que dejó (ninguno bloquea la Fase 2 Documentos).

1. **Sign-off de owner-of-data** (decisión del dueño) — tras globalizar lecturas, confirmar por escrito que compartir todos los datos de clientes/tareas es aceptable. Campos sensibles: `Oportunidad.valor_estimado_cop`, `Contacto.correo/telefono`, `Cliente.riesgos_barreras`. La única frontera de confidencialidad que le queda a un COLABORADOR son las categorías restringidas de documentos.
2. **Borrar dead code** — `loadClientScoped`/`loadTaskScoped` quedaron sin uso en `src/lib/api/crm.ts` tras abrir lecturas. Commit aparte.
3. **Perf post-globalización** (medir): 2 `count()` por request de lista (`total`), `clients/route.ts` enriquece en O(n²), `nextTasks` con `take: ids.length` global. Anotado en plan §Verificación.
4. **Limpieza** — borrar el fork innecesario `agutierrezreginodev/MuttuHub-CRM` y el remote `fork` local si no se usa. El push a la org va por WSL con la cuenta `MuttuHub` (ver nota en el cierre).
   - **Reincidencia (2026-09-16)**: el mismo error volvió a pasar al entregar `oportunidades-comerciales` — se pusheó al fork con `gh`/`git` activos como `agutierrezreginodev` y se abrieron 3 PRs desde ahí (#41/#42/#43) antes de notar este mismo pendiente. Se corrigió en el momento: `gh auth switch --user MuttuHub` + `gh auth setup-git`, push directo a `origin`, se cerraron las 3 PRs del fork y se reabrieron correctas desde `origin` (**#44/#45/#46**). Las ramas quedaron huérfanas en el fork (no se pudieron borrar desde acá — `MuttuHub` no tiene permisos de escritura sobre el fork ajeno). **Mientras el fork exista va a seguir pasando** — borrarlo de una vez corta la raíz del problema en vez de repetir el fix cada entrega.

## Pendientes de `oportunidades-comerciales` (2026-09-16)

> Cambio SDD completo (36/36 tasks, `sdd-verify`: PASS WITH WARNINGS). Diseño en
> `openspec/changes/oportunidades-comerciales/`. Detalle completo del batch de
> verificación en `verify-report.md` de esa misma carpeta.

1. **3 PRs abiertas, esperando review/merge en orden** — apiladas a `main`, cada una depende de que la anterior se mergee primero (la diff de la 2ª y 3ª se ve inflada hasta entonces, se corrige sola):
   - PR1 (esquema/migración): `MuttuHub/MuttuHub-CRM#44`
   - PR2 (permisos + vínculo tarea-oportunidad): `MuttuHub/MuttuHub-CRM#45`
   - PR3 (conversión + UI + remediación post-verify): `MuttuHub/MuttuHub-CRM#46`
2. **E2E (`e2e/oportunidad-ciclo.spec.ts`) escrito pero sin ejecutar** — bloqueado, no por el código. Al intentar correrlo contra un stack local de Supabase (Docker), el propio Docker Desktop se rompió a mitad de sesión por errores reales de I/O en el disco virtual de WSL2 (`loop0`, confirmado con `dmesg`). Antes de eso: `supabase start` + `prisma migrate deploy` + seed funcionaron bien local, y el login contra Supabase Auth local funcionó por API directa — la lógica de la app no está en duda.
   - **Acción futura**: reparar WSL2/Docker Desktop (probablemente `wsl --shutdown` + reabrir Docker Desktop desde Windows — **esto también mata el contenedor `microservicio-propuestas`** que corre aparte, avisar antes). Después, `docker ps -a` para chequear si quedaron contenedores huérfanos del intento de Supabase local y limpiarlos, y reintentar el e2e.
3. **Deviation de diseño aceptada, sin cambio de código**: la pestaña "Oportunidades" se oculta por completo (no queda en solo lectura) para un COLABORADOR con acceso comercial que no es responsable del cliente — más angosto que la prosa de `design.md`, pero en dirección segura (oculta de más, nunca filtra de más). Firmado como riesgo aceptado el 2026-09-16.
4. **`sdd-archive` pendiente** de que las 3 PRs se mergeen (o de una decisión explícita de archivar antes, con el estado "PRs abiertas, no mergeadas" documentado).
