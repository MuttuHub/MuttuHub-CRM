import { expect, test } from "@playwright/test";

// End-to-end walkthrough of the invitation flow:
//   1. Admin creates a user (invite mode) from Administración → Usuarios.
//   2. In local dev the invite link is captured from the dev-only
//      invite-token route (type=invite), simulating the email the user would
//      receive (the route mints the same hashed_token Supabase would email).
//   3. The user opens /auth/confirm?token_hash=...&type=invite&email=... and
//      sets their password.
//   4. The invalid-link screen offers "Solicitar de nuevo el enlace".
//
// Requirements to run:
//   - Local dev server up on :3000 (Next dev) with Supabase configured.
//   - `ENABLE_DEV_ROUTES=true` in the local .env (same opt-in as
//     src/app/api/v1/dev/reset-token).
//   - A seeded admin account: prisma/seed.ts creates
//     admin@demo.muttuhub.local (Camila Restrepo, ADMINISTRADOR). If you log
//     in with a real admin instead, change ADMIN_EMAIL / ADMIN_PASSWORD.
//
// The invited user is minted with a unique email per run so the test is
// idempotent (a repeat run never collides with a previous "already exists").

const ADMIN_EMAIL = "admin@demo.muttuhub.local";
const ADMIN_PASSWORD = "MuttuDemo2026!";
const inviteEmail = `e2e.invite.${Date.now()}@demo.muttuhub.local`.toLowerCase();

// Captured between steps (module scope survives page reloads).
let capturedTokenHash = "";

// Helper: capture the invite token_hash for the user via the dev-only
// invite-token route (type=invite) — same pattern as reset-token but for
// invitations. Only enabled with ENABLE_DEV_ROUTES=true.
async function captureInviteToken(page: import("@playwright/test").Page) {
  const response = await page.request.get(
    `http://localhost:3000/api/v1/dev/invite-token?email=${encodeURIComponent(inviteEmail)}`,
  );
  const body = (await response.json()) as {
    hashed_token?: string;
    error?: string;
  };
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.hashed_token!;
}

test.describe.configure({ mode: "serial" });

test("invitation flow: admin creates user, user confirms, invalid-link offers resend", async ({
  page,
}) => {
  await test.step("1. Login as admin", async () => {
    await page.goto("/login?next=%2Fadministracion");
    await page.getByLabel("Correo corporativo").fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
    await page.waitForURL(/\/administracion/, { timeout: 30_000 });
  });

  await test.step("2. Create the invited user (invite mode)", async () => {
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    await page.getByLabel("Nombre completo").fill("Usuario E2E Invitacion");
    await page.getByLabel("Correo electrónico").fill(inviteEmail);
    // Rol por defecto COLABORADOR — no hace falta tocarlo.
    // "Cómo crea su acceso" por defecto: Enviar invitación por email.
    await page
      .getByRole("button", { name: "Crear usuario" })
      .click();
    // El diálogo se cierra y el usuario aparece en la tabla.
    await expect(page.getByText(inviteEmail)).toBeVisible({ timeout: 15_000 });
  });

  await test.step("3. Capture the invite link (simulating the email)", async () => {
    const tokenHash = await captureInviteToken(page);
    expect(tokenHash).toBeTruthy();
    capturedTokenHash = tokenHash;
  });

  await test.step("4. User opens the invite link and sets a password", async () => {
    await page.goto(
      `/auth/confirm?token_hash=${encodeURIComponent(capturedTokenHash)}&type=invite&email=${encodeURIComponent(inviteEmail)}`,
    );
    await expect(
      page.getByRole("heading", { name: "Crea tu contraseña" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Contraseña").fill("ClaveE2E2026!");
    await page.getByLabel("Confirmar contraseña").fill("ClaveE2E2026!");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(
      page.getByRole("heading", { name: "Contraseña creada" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  await test.step("5. Invalid-link screen offers the resend button", async () => {
    // Abrir /auth/confirm sin token (simula un enlace roto/vencido), con email
    await page.goto(
      `/auth/confirm?email=${encodeURIComponent(inviteEmail)}`,
    );
    await expect(
      page.getByRole("heading", { name: "Enlace no válido" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Solicitar de nuevo el enlace" }),
    ).toBeVisible();
  });
});