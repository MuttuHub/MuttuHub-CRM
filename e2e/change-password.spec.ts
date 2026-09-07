import { expect, test } from "@playwright/test";

// Pedido #2 del jefe (HANDOFF-contexto-sesion.md): cambiar contraseña
// logueado desde el panel. Corre contra una cuenta de prueba descartable
// creada ad-hoc para esta verificación (QA_TEST_EMAIL / QA_TEST_PASSWORD),
// NUNCA contra una cuenta real — este proyecto Supabase es compartido con
// producción, así que este spec jamás debe apuntar a un usuario real.
//
// Requiere el dev server ya corriendo (playwright.config.ts no lo levanta) y
// las env vars QA_TEST_EMAIL / QA_TEST_PASSWORD apuntando a la cuenta
// descartable creada para esta corrida.

const QA_EMAIL = process.env.QA_TEST_EMAIL;
const QA_PASSWORD_INITIAL = process.env.QA_TEST_PASSWORD;
const QA_PASSWORD_NEW = "NuevaTempQA2026!";

test.skip(
  !QA_EMAIL || !QA_PASSWORD_INITIAL,
  "QA_TEST_EMAIL/QA_TEST_PASSWORD no configuradas — este spec necesita una cuenta descartable, nunca una real.",
);

test.describe.configure({ mode: "serial" });

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo corporativo").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
  await page.waitForURL(/\/(?!login)/, { timeout: 30_000 });
}

async function openChangePasswordDialog(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cambiar contraseña" }).click();
  await expect(page.getByRole("heading", { name: "Cambiar contraseña" })).toBeVisible();
}

test("cambiar contraseña — validaciones, Cancelar y caso exitoso end-to-end", async ({ page }) => {
  await test.step("1. Login con la cuenta de prueba", async () => {
    await login(page, QA_EMAIL!, QA_PASSWORD_INITIAL!);
  });

  await test.step("2. Nueva contraseña que no cumple la política", async () => {
    await openChangePasswordDialog(page);
    await page.getByLabel("Contraseña actual").fill(QA_PASSWORD_INITIAL!);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("corta");
    await page.getByLabel("Confirmar contraseña nueva").fill("corta");
    await page.getByRole("button", { name: "Actualizar contraseña" }).click();
    await expect(page.getByRole("alert")).toContainText("Mínimo 8 caracteres");
  });

  await test.step("3. Confirmación de contraseña nueva que no coincide", async () => {
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(QA_PASSWORD_NEW);
    await page.getByLabel("Confirmar contraseña nueva").fill("OtraCosa2026!");
    await page.getByRole("button", { name: "Actualizar contraseña" }).click();
    await expect(page.getByRole("alert")).toContainText("no coinciden");
  });

  await test.step("4. Cancelar limpia el estado (regresión: código review de esta sesión)", async () => {
    await page.getByLabel("Contraseña actual").fill("lo-que-sea");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("heading", { name: "Cambiar contraseña" })).toHaveCount(0);

    await openChangePasswordDialog(page);
    await expect(page.getByLabel("Contraseña actual")).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  await test.step("5. Contraseña actual incorrecta — mensaje con salida hacia 'Olvidaste tu contraseña'", async () => {
    await page.getByLabel("Contraseña actual").fill("contraseña-incorrecta-1");
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(QA_PASSWORD_NEW);
    await page.getByLabel("Confirmar contraseña nueva").fill(QA_PASSWORD_NEW);
    await page.getByRole("button", { name: "Actualizar contraseña" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("La contraseña actual no es correcta");
    await expect(alert).toContainText("¿Olvidaste tu contraseña?");
  });

  await test.step("6. Caso exitoso: contraseña actual correcta + nueva válida", async () => {
    await page.getByLabel("Contraseña actual").fill(QA_PASSWORD_INITIAL!);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(QA_PASSWORD_NEW);
    await page.getByLabel("Confirmar contraseña nueva").fill(QA_PASSWORD_NEW);
    await page.getByRole("button", { name: "Actualizar contraseña" }).click();
    await expect(page.getByRole("heading", { name: "Cambiar contraseña" })).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  await test.step("7. Prueba real end-to-end: logout y login con la CONTRASEÑA NUEVA", async () => {
    await page.request.post("/api/v1/auth/logout");
    await page.goto("/login");
    await login(page, QA_EMAIL!, QA_PASSWORD_NEW);
    // Llegar más allá de /login confirma que el backend aplicó el cambio.
    await expect(page).not.toHaveURL(/\/login/);
  });
});
