import { expect, test } from "@playwright/test";

// Read-only check of the project ficha as its own page (S12): "Ver detalle"
// opens `/proyectos/<id>` in a NEW browser tab. This spec WRITES NOTHING.
//
// Precondition: the local database holds the S11 demo seed
// (`npm run db:demo:seed-projects:local -- --apply` on a fresh local DB), which
// provides PRY-2026-001 (EN_EJECUCION, approved, with avances and gastos).
// It is the counterpart of proyectos-demo.spec.ts, which needs a CLEAN demo
// instead (zero projects); the two cannot run against the same DB state.
//
// Screenshots (ficha at 1440 and 390 px, tablero at 1440 px) go to
// SCREENSHOT_DIR (default: os tmp dir) and are never committed.

const ADMIN_EMAIL = "admin@demo.muttuhub.local";
const PASSWORD = "MuttuDemo2026!";
const CODIGO = "PRY-2026-001";
const UUID_URL = /\/proyectos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? "/tmp";

// Cold Turbopack routes can take 30-60 s to compile on first load.
test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

// First heading/text each tab renders (exact), proving the section mounted.
const TABS: Array<{ tab: string; section: string }> = [
  { tab: "Resumen", section: "Líneas estratégicas" },
  { tab: "Estructura", section: "Estructura técnica" },
  { tab: "Avance", section: "Ejecución técnica" },
  { tab: "Presupuesto", section: "Ficha financiera" },
  { tab: "Gastos", section: "Gastos" },
  { tab: "Cambios", section: "Historial" },
];

test("Ficha page: opens in a new tab with header, semaforos, six tabs and not-found state", async ({
  page,
  context,
}) => {
  await test.step("1. Login as admin and open the project list", async () => {
    await page.goto("/login?next=%2Fproyectos", { timeout: 90_000 });
    await page.getByLabel("Correo corporativo").fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
    await page.waitForURL(/\/proyectos/, { timeout: 60_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Proyectos" }),
    ).toBeVisible({ timeout: 60_000 });
  });

  const row = page.getByRole("row", { name: new RegExp(CODIGO) });

  const ficha = await test.step("2. Ver detalle opens the ficha page in a NEW tab", async () => {
    await expect(row).toBeVisible({
      timeout: 60_000,
    });
    const link = row.getByRole("link", { name: "Ver detalle" });
    await expect(link).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState("domcontentloaded", { timeout: 90_000 });
    await expect(popup).toHaveURL(UUID_URL, { timeout: 60_000 });
    // The original tab still shows the list and no dialog.
    await expect(page).toHaveURL(/\/proyectos(\?.*)?$/);
    await expect(row).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return popup;
  });

  await test.step("3. Header: codigo, estado, semaforo chips, back link", async () => {
    const header = ficha.getByTestId("ficha-header");
    await expect(header).toBeVisible({ timeout: 60_000 });
    await expect(header).toContainText(CODIGO);
    await expect(header).toContainText("En ejecución");
    await expect(ficha.getByText(/Semáforo técnico: (Verde|Amarillo|Rojo)/)).toBeVisible({
      timeout: 60_000,
    });
    await expect(ficha.getByText(/Semáforo financiero: (Verde|Amarillo|Rojo)/)).toBeVisible();
    const back = ficha.getByRole("link", { name: "Volver a proyectos" });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/proyectos");
    await expect(ficha.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("4. Six tabs, each opens and shows its section", async () => {
    await expect(ficha.getByRole("tab")).toHaveCount(6);
    for (const { tab } of TABS) {
      await expect(ficha.getByRole("tab", { name: tab })).toBeVisible();
    }
    for (const { tab, section } of TABS) {
      await ficha.getByRole("tab", { name: tab, exact: true }).click();
      await expect(ficha.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(
        ficha.getByRole("tabpanel").getByText(section, { exact: true }).first(),
      ).toBeVisible({ timeout: 60_000 });
      await expect(ficha.getByText("No pudimos abrir la ficha")).toHaveCount(0);
      await expect(ficha.getByText("Proyecto no encontrado")).toHaveCount(0);
    }
    await ficha.getByRole("tab", { name: "Resumen", exact: true }).click();
  });

  await test.step("5. Screenshots: ficha 1440 and 390, tablero 1440", async () => {
    await ficha.setViewportSize({ width: 1440, height: 900 });
    await expect(ficha.getByTestId("ficha-header")).toBeVisible();
    await ficha.screenshot({ path: `${SCREENSHOT_DIR}/ficha-1440.png`, fullPage: true });
    await ficha.setViewportSize({ width: 390, height: 844 });
    await expect(ficha.getByTestId("ficha-header")).toBeVisible();
    await ficha.screenshot({ path: `${SCREENSHOT_DIR}/ficha-390.png`, fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/proyectos?vista=tablero", { timeout: 90_000 });
    await expect(page.getByText(CODIGO).first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tablero-1440.png`, fullPage: true });
    await ficha.close();
  });

  await test.step("6. Unknown id renders the not-found state, not a crash", async () => {
    await page.goto("/proyectos/00000000-0000-0000-0000-000000000000", { timeout: 90_000 });
    await expect(page.getByText("Proyecto no encontrado")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Volver a proyectos" })).toBeVisible();
  });
});
