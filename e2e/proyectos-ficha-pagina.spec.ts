import { expect, test, type Locator } from "@playwright/test";
import { login } from "./proyectos-v2/helpers";

// Read-only check of the project ficha as its own page (S12): "Ver detalle"
// opens `/proyectos/<id>` in the SAME browser tab. This spec WRITES NOTHING.
//
// Precondition: the S11 demo seed (scripts/seed-projects-demo.ts --apply, which
// CI runs), providing PRY-2026-001 (EN_EJECUCION, approved, with avances and
// gastos). It is the counterpart of proyectos-demo.spec.ts, which needs a CLEAN
// demo instead (zero projects); the two cannot run against the same DB state.
//
// Screenshots (ficha at 1440 and 390 px, tablero at 1440 px) go to
// SCREENSHOT_DIR when set, otherwise to the test's output directory; they are
// never committed.

const CODIGO = "PRY-2026-001";
const UUID_URL = /\/proyectos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Cold routes can take 30-60 s to compile on a dev server's first load.
test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

// The five top-level tabs of the ficha (project-ficha.tsx FICHA_TABS) and an
// element each panel renders, proving the section mounted. Finanzas, Historial
// and Actividades open on a default segment of their own.
const TABS: Array<{ tab: string; proof: (panel: Locator) => Locator }> = [
  { tab: "Resumen", proof: (panel) => panel.getByTestId("datos-generales") },
  { tab: "Actividades", proof: (panel) => panel.getByRole("tab", { name: "Lista", selected: true }) },
  { tab: "Finanzas", proof: (panel) => panel.getByRole("tab", { name: "Resumen", selected: true }) },
  { tab: "Documentos", proof: (panel) => panel.getByTestId("documentos") },
  { tab: "Historial", proof: (panel) => panel.getByRole("tab", { name: "Modificaciones", selected: true }) },
];

test("Ficha page: opens in the same tab with header, semaforos, five tabs and not-found state", async ({
  page,
  context,
}, testInfo) => {
  const screenshotDir = process.env.SCREENSHOT_DIR ?? testInfo.outputDir;
  await test.step("1. Login as admin and open the project list", async () => {
    await login(page, "admin", "/proyectos");
    await expect(page).toHaveURL(/\/proyectos/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Proyectos" }),
    ).toBeVisible({ timeout: 60_000 });
  });

  const row = page.getByRole("row", { name: new RegExp(CODIGO) });

  const ficha = await test.step("2. Ver detalle opens the ficha page in the SAME tab", async () => {
    await expect(row).toBeVisible({
      timeout: 60_000,
    });
    const link = row.getByRole("link", { name: "Ver detalle" });
    await expect(link).not.toHaveAttribute("target");
    const pages = context.pages().length;
    await link.click();
    await expect(page).toHaveURL(UUID_URL, { timeout: 60_000 });
    // Same tab, no dialog, no extra browser page.
    expect(context.pages()).toHaveLength(pages);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return page;
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

  await test.step("4. Five tabs, each opens and shows its section", async () => {
    // The first tablist is the ficha's own; panels nest segment tablists of their own.
    const tabs = ficha.getByRole("tablist").first();
    await expect(tabs.getByRole("tab")).toHaveCount(TABS.length);
    for (const { tab } of TABS) {
      await expect(tabs.getByRole("tab", { name: tab, exact: true })).toBeVisible();
    }
    for (const { tab, proof } of TABS) {
      const trigger = tabs.getByRole("tab", { name: tab, exact: true });
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-selected", "true");
      const panel = ficha.getByRole("tabpanel", { name: tab, exact: true });
      await expect(proof(panel)).toBeVisible({ timeout: 60_000 });
      await expect(ficha.getByText("No pudimos abrir la ficha")).toHaveCount(0);
      await expect(ficha.getByText("Proyecto no encontrado")).toHaveCount(0);
    }
    await tabs.getByRole("tab", { name: "Resumen", exact: true }).click();
  });

  await test.step("5. Screenshots: ficha 1440 and 390, tablero 1440", async () => {
    await ficha.setViewportSize({ width: 1440, height: 900 });
    await expect(ficha.getByTestId("ficha-header")).toBeVisible();
    await ficha.screenshot({ path: `${screenshotDir}/ficha-1440.png`, fullPage: true });
    await ficha.setViewportSize({ width: 390, height: 844 });
    await expect(ficha.getByTestId("ficha-header")).toBeVisible();
    await ficha.screenshot({ path: `${screenshotDir}/ficha-390.png`, fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/proyectos?vista=tablero", { timeout: 90_000 });
    await expect(page.getByText(CODIGO).first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${screenshotDir}/tablero-1440.png`, fullPage: true });
  });

  await test.step("6. Unknown id renders the not-found state, not a crash", async () => {
    await page.goto("/proyectos/00000000-0000-0000-0000-000000000000", { timeout: 90_000 });
    await expect(page.getByText("Proyecto no encontrado")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Volver a proyectos" })).toBeVisible();
  });
});
