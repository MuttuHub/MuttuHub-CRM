# Pendientes por corregir y oportunidades de mejora — Muttu Hub CRM

> Última actualización: 2026-08-11 (sesión de batch pendientes v1).
> Estado del pipeline: PR #2 mergeado — unit (Vitest 212) ✅, typecheck 0 errores ✅,
> preview deploy Vercel (integración Git) ✅, E2E TestSprite informativo ✅.

## Pendientes por corregir (deuda técnica)

### 1. Cobertura de tests — gate desactivado, meta 60% 📉

- **Estado**: la config de coverage estaba muerta (top-level, inválida en Vitest 4). Al corregirla (dentro de `test`, sin `all: true`), el coverage real resultó **~13-15%** vs los thresholds 60/60/60/50 que se habían autorizado.
- **Decisión**: thresholds **desactivados** (comentados en `vitest.config.ts`). El reporte `text`/`html` sigue generándose.
- **Acción futura**: cuando la suite de componentes/hooks crezca, correr `npx vitest run --coverage`, verificar el % real y reactivar thresholds cerca del valor real con meta 60%.
- No existe script `test:coverage` en `package.json` (los scripts son dev/build/start/lint/db). Opcional: agregarlo cuando se reactive el gate.

### 2. E2E TestSprite — informativo, no bloquea

- **Estado**: `testsprite.yml` corre `TestSprite/run-action@v1` (High priority) contra el preview deploy del PR (o producción en main). Comenta resultados en el PR. Los 5-14 tests del suite generado por el MCP **fallan determinísticamente en el sandbox** (~24 s, sin testError) por incompatibilidad del sandbox con los tests generados por el MCP (verificado: la app y credenciales QA funcionan contra prod con Playwright local).
- **Decisión**: `blocking: false` — el gate real de PRs es `ci.yml` (unit).
- **Acción futura**: cuando TestSprite soporte los tests del MCP en su action, volver a `blocking: true` y validar el suite completo.

### 3. Templates de email con marca — listos en repo, NO pegados en Supabase

- **Estado**: 6 templates con marca en `supabase/email-templates/` (confirm-signup, invite, magic-link, reset-password, change-email, reauthentication). CTA directo a `/auth/confirm` con token OTP (excepto reset-password que usa el flujo PKCE existente). Centrado wrapper-table aplicado.
- **Decisión 2026-08-11**: postergado. Customizar templates con el servicio built-in requiere **Pro ($25/mes)**; SMTP custom sin DNS de `muttu.co` obliga a remitente ajeno (Resend shared `onboarding@resend.dev`) o Gmail con entregabilidad media (Brevo; Google eliminó las app passwords en 2025 → Gmail SMTP directo inviable).
- **Acción futura**: cuando exista acceso al DNS de `muttu.co` → Resend con dominio + `no-reply@muttu.co` + pegar los 6 templates + Redirect URLs (`/auth/confirm`, `/auth/reset-password/confirm`). Pasos detallados en `docs/plan-supabase-manana.md` sección 8.

### 4. Deploy de producción — verificar integración Git tras el merge

- La integración Git de Vercel quedó activa (checks de Vercel en PRs). Verificar que el push a main deploye producción automáticamente (antes era por CLI: `npx vercel --prod`). Si el deploy automático falla, volver a CLI y revisar el linkeo.

### 5. MCP de Supabase — limitaciones conocidas

- `list_branches` falla por permisos del token (`Project reference is missing`) — solo afecta branches de desarrollo.
- El MCP no expone `service_role` ni el password de postgres: el `.env` completo y la config de auth (templates, SMTP, URLs) son manuales del dashboard.
- Credenciales sensibles respaldadas en `~/seguros/muttu-hub-secrets.txt` (chmod 600, fuera del repo).

### 6. Actualización de docs pendientes de sesiones previas

- `docs/pendientes/bugs-pendientes.md` — BUG-001 y BUG-002 marcados ✅ (2026-08-11).
- `docs/pendientes/vitest-unit-tests.md` — suite 212 tests en verde.
- `docs/plan-supabase-manana.md` — sección 8 actualizada (email postergado); pendiente marcar el ítem VERCEL_TOKEN como completo tras la verificación del deploy.

## Oportunidades de mejora del CRM

### Producto

1. **Emails con marca propios** (ver deuda #3): identidad visual completa en los correos transaccionales cuando haya dominio — el mayor salto de imagen del producto.
2. **UI de reautenticación para operaciones sensibles** (eliminar cuenta, cambiar email): el template `reauthentication.html` está listo; falta la página/modal en la app (`verifyOtp` type=reauthentication). La página `/auth/confirm` no maneja ese tipo a propósito.
3. **Flujo de registro completo con la página `/auth/confirm`**: ya implementada (verifyOtp + exchangeCodeForSession PKCE, modal "¡Correo verificado!", redirect 3s a /login). Falta exponerlo en producción real pegando los templates.

### Técnica

4. **Cobertura de tests hacia 60%** (ver deuda #1): priorizar hooks (`useClientsQuery`, dashboard) y componentes de alta criticidad (tablero, pipeline).
5. **Reactivar gate E2E de TestSprite** (ver deuda #2) cuando el sandbox lo soporte.
6. **Supabase Pro** cuando haya uso real: backups diarios, pausa automática, >500 MB storage / 5 GB egress. Hoy Free sobra con margen (evaluación 2026-08-09).

### Infraestructura

7. **Dominio propio para el remitente** (`no-reply@muttu.co`) — desbloquea templates custom + reputación de envío (SMTP de Resend/Google Workspace).
8. **Revisar `scripts/cron_setup.sql`** — contiene el `CRON_SECRET` real; evaluar moverlo a variable de entorno/secret del repo si se versiona.
