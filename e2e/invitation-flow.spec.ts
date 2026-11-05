import { expect, test, type Page } from "@playwright/test";
import { login } from "./proyectos-v2/helpers";

// End-to-end walkthrough of the invitation flow:
//   1. Admin creates a user (invite mode, the dialog default) from
//      Administración → Usuarios; the submit button reads "Enviar invitación".
//   2. The invite link is captured without an inbox, simulating the email the
//      user would receive (see captureInviteToken below).
//   3. The user opens /auth/confirm?token_hash=...&type=invite&email=..., sets
//      their password and lands in the app with an active session.
//   4. The invalid-link screen offers "Solicitar de nuevo el enlace".
//
// Requirements: a seeded admin (prisma/seed.ts creates admin@demo.muttuhub.local)
// and a LOCAL Supabase. The invited user gets a unique email per run so the
// test is idempotent (a repeat run never hits "El correo ya está registrado").

const inviteEmail = `e2e.invite.${Date.now()}@demo.muttuhub.local`.toLowerCase();
const NEW_PASSWORD = "ClaveE2E2026!";

// Captured between steps.
let capturedTokenHash = "";

/**
 * Mint the invite `hashed_token` for the invited user, the same token Supabase
 * would put in the email.
 *
 * On a dev server (`next dev` + ENABLE_DEV_ROUTES=true) the dev-only route
 * /api/v1/dev/invite-token does it. That route answers 404 under `next start`
 * (NODE_ENV=production), which is how CI serves the app, so on a 404 the test
 * performs the same `generate_link` call itself against the local Supabase
 * Auth with the service key the CI job exports. It refuses any non-loopback
 * Supabase URL so it can never mint links against a remote project.
 */
async function captureInviteToken(page: Page): Promise<string> {
  const viaRoute = await page.request.get(
    `/api/v1/dev/invite-token?email=${encodeURIComponent(inviteEmail)}`,
  );
  if (viaRoute.ok()) {
    const body = (await viaRoute.json()) as { hashed_token?: string };
    return body.hashed_token ?? "";
  }
  expect(viaRoute.status(), "the dev invite-token route failed for a reason other than being disabled").toBe(404);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "The dev invite-token route is disabled and NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set for the test process.",
    );
  }
  const host = new URL(supabaseUrl).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to mint an invite link against a non-local Supabase (${host}).`);
  }
  const res = await page.request.post(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    data: { type: "invite", email: inviteEmail },
  });
  const body = (await res.json()) as { hashed_token?: string; msg?: string; error?: string };
  expect(res.ok(), `generate_link answered ${res.status()}: ${body.msg ?? body.error ?? ""}`).toBeTruthy();
  return body.hashed_token ?? "";
}

test.describe.configure({ mode: "serial" });

test("invitation flow: admin invites a user, user sets a password, invalid link offers resend", async ({
  page,
}) => {
  await test.step("1. Login as admin", async () => {
    await login(page, "admin", "/administracion");
    await expect(page).toHaveURL(/\/administracion/);
  });

  await test.step("2. Invite the user (invite mode is the default)", async () => {
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo usuario" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Nombre completo").fill("Usuario E2E Invitacion");
    await dialog.getByLabel("Correo electrónico").fill(inviteEmail);
    // Role defaults to COLABORADOR and "Cómo crea su acceso" to "Enviar
    // invitación por email", so neither select is touched; the invite-mode
    // hint proves the default.
    await expect(dialog.getByText("El usuario recibirá un email para elegir su contraseña.")).toBeVisible();
    await dialog.getByRole("button", { name: "Enviar invitación", exact: true }).click();
    // The dialog closes and the user shows up in the table.
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("row").filter({ hasText: inviteEmail })).toBeVisible({ timeout: 15_000 });
  });

  await test.step("3. Capture the invite link (simulating the email)", async () => {
    capturedTokenHash = await captureInviteToken(page);
    expect(capturedTokenHash).toBeTruthy();
  });

  await test.step("4. User opens the invite link, sets a password and enters the app", async () => {
    // The invited user starts with a clean session, as from their own inbox.
    await page.context().clearCookies();
    await page.goto(
      `/auth/confirm?token_hash=${encodeURIComponent(capturedTokenHash)}&type=invite&email=${encodeURIComponent(inviteEmail)}`,
    );
    await expect(page.getByRole("heading", { name: "Crea tu contraseña" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Contraseña", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirmar contraseña", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("heading", { name: "¡Tu cuenta fue validada!" })).toBeVisible({ timeout: 15_000 });
    // The session is already active: the page redirects into the app, not to /login.
    await page.waitForURL((u) => !u.pathname.startsWith("/auth/confirm"), { timeout: 30_000 });
    expect(new URL(page.url()).pathname.startsWith("/login")).toBe(false);
  });

  await test.step("5. Invalid-link screen offers the resend button", async () => {
    // /auth/confirm without a token simulates a broken or expired link.
    await page.goto(`/auth/confirm?email=${encodeURIComponent(inviteEmail)}`);
    await expect(page.getByRole("heading", { name: "Enlace no válido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Solicitar de nuevo el enlace" })).toBeVisible();
  });
});
