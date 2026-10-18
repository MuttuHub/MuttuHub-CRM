import { expect, test } from "@playwright/test";
import { login, pickOption, portfolioRows } from "./helpers";

// Guide §1. Assertions are state-robust: the demo DB may hold extra projects
// (e.g. PRY-2026-005), so counts are compared relatively, never hardcoded.

test.beforeEach(async ({ page }) => {
  await login(page, "gerencia");
  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
});

test("KPIs: four cards and the Portafolio/Tablero tabs", async ({ page }) => {
  for (const kpi of ["Proyectos", "Presupuesto activo", "Beneficiarios", "Actividades atrasadas"]) {
    await expect(page.getByRole("tabpanel", { name: "Portafolio" }).getByText(kpi, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("tab", { name: "Portafolio" })).toBeVisible();
  await page.getByRole("tab", { name: "Tablero" }).click();
  await expect(page.getByRole("tab", { name: "Tablero", selected: true })).toBeVisible();
});

test("new filters (cliente, línea, municipio, responsable) reduce rows; Limpiar filtros resets", async ({ page }) => {
  const total = await portfolioRows(page).count();
  expect(total).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole("button", { name: "Limpiar filtros" })).toHaveCount(0);

  const cases: Array<[string, string, string]> = [
    ["Filtrar por cliente", "Universidad Central del Valle", "Universidad Central del Valle"],
    ["Filtrar por línea estratégica", "Empleabilidad", "Empleabilidad"],
    ["Filtrar por municipio", "Medellín", "Medellín"],
    ["Filtrar por responsable", "Camila Restrepo", "Camila Restrepo"],
  ];
  for (const [combo, option, expectedText] of cases) {
    await pickOption(page, combo, option);
    await expect(page.getByRole("button", { name: "Limpiar filtros" })).toBeVisible();
    await expect
      .poll(async () => {
        const rows = await portfolioRows(page).allInnerTexts();
        return rows.length > 0 && rows.length < total && rows.every((r) => r.includes(expectedText));
      }, { message: `${combo} filters rows to ${expectedText}` })
      .toBeTruthy();
    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect.poll(async () => portfolioRows(page).count()).toBe(total);
    await expect(page.getByRole("button", { name: "Limpiar filtros" })).toHaveCount(0);
  }
});

test("combining two filters narrows further; no-result message", async ({ page }) => {
  await pickOption(page, "Filtrar por estado", "Borrador");
  await expect.poll(async () => (await portfolioRows(page).allInnerTexts()).every((t) => t.includes("Borrador"))).toBeTruthy();
  const soloBorrador = await portfolioRows(page).count();
  await pickOption(page, "Filtrar por responsable", "Camila Restrepo");
  await expect.poll(async () => portfolioRows(page).count()).toBeLessThan(soloBorrador);
  // En ejecución + Camila (responsable only of drafts) => empty state
  await pickOption(page, "Filtrar por estado", "En ejecución");
  await expect(page.getByText("No encontramos proyectos con estos filtros")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(portfolioRows(page).first()).toBeVisible();
});

test("validation queue lists only expenses of EN_EJECUCION/SUSPENDIDO projects", async ({ page }) => {
  const queue = page.getByRole("region", { name: "Gastos por validar" });
  await expect(queue.getByRole("heading", { name: /Gastos por validar · \d+/ })).toBeVisible();
  const items = await queue.getByRole("listitem").allInnerTexts();
  const codes = items.map((t) => t.match(/PRY-\d{4}-\d{3}/)?.[0]).filter(Boolean) as string[];
  // Map code -> estado from the portfolio table.
  const estados = new Map<string, string>();
  for (const row of await portfolioRows(page).all()) {
    const t = await row.innerText();
    const code = t.match(/PRY-\d{4}-\d{3}/)?.[0];
    if (code) estados.set(code, /En ejecución|Suspendido/.test(t) ? "ok" : "no");
  }
  for (const c of codes) expect(estados.get(c), `${c} must be EN_EJECUCION/SUSPENDIDO`).toBe("ok");
  // Drafts never appear.
  for (const draft of ["PRY-2026-002", "PRY-2026-003", "PRY-2026-004"]) expect(codes).not.toContain(draft);
});
