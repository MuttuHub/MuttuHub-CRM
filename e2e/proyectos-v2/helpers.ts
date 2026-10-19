import { expect, type Page } from "@playwright/test";

export const PASSWORD = "MuttuDemo2026!";
export type Role = "admin" | "gerencia" | "coordinador" | "colaborador";
export const EMAILS: Record<Role, string> = {
  admin: "admin@demo.muttuhub.local",
  gerencia: "gerencia@demo.muttuhub.local",
  coordinador: "coordinador@demo.muttuhub.local",
  colaborador: "colaborador@demo.muttuhub.local",
};

/** Log in through the UI. Each Playwright test has a fresh context, so no logout is needed. */
export async function login(page: Page, role: Role, next = "/proyectos") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`, { timeout: 90_000 });
  await page.getByLabel("Correo corporativo").fill(EMAILS[role]);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 });
}

/** Pick an option of a base-ui Select by the trigger's accessible name. */
export async function pickOption(page: Page, comboName: string | RegExp, option: string | RegExp) {
  await page.getByRole("combobox", { name: comboName }).click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Visible data rows of the portfolio table. */
export const portfolioRows = (page: Page) => page.locator("table tbody tr");

/** Resolve a project ficha URL for a code through the portfolio table link. */
export async function fichaHref(page: Page, codigo: string): Promise<string> {
  await page.goto("/proyectos");
  const row = page.getByRole("row", { name: new RegExp(codigo) });
  await expect(row).toBeVisible({ timeout: 60_000 });
  const href = await row.getByRole("link", { name: "Ver detalle" }).getAttribute("href");
  if (!href) throw new Error(`no ficha link for ${codigo}`);
  return href;
}

export const P001 = "ad060dca-de1c-4c74-a2ac-4b2493ef852e";
export const P003 = "e15511fb-bebd-4924-8a21-387178212fb2";

/** Open the client ficha dialog from the /clientes cards (search first so the card is in the DOM). */
export async function openCliente(page: Page, nombre: string) {
  await page.goto("/clientes");
  await page.getByRole("textbox", { name: "Buscar clientes" }).fill(nombre);
  const card = page.getByRole("article", { name: `Abrir ficha de ${nombre}` });
  await card.getByRole("button", { name: "Ver detalle" }).click();
  const dialog = page.getByRole("dialog", { name: `Ficha de ${nombre}` });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}
