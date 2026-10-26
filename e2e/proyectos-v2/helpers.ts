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

/** Resolve a project id by its code through the API the session already reads. */
export async function projectId(page: Page, codigo: string): Promise<string> {
  const res = await page.request.get("/api/v1/projects");
  if (!res.ok()) throw new Error(`projects API answered ${res.status()}`);
  const { proyectos } = (await res.json()) as {
    proyectos: Array<{ id: string; codigo: string }>;
  };
  const found = proyectos.find((p) => p.codigo === codigo);
  if (!found) throw new Error(`project ${codigo} not found for this session`);
  return found.id;
}

/** Log in and land on a ficha resolved by code: the seed ids change on every reseed. */
export async function loginToProject(page: Page, role: Role, codigo: string): Promise<string> {
  await login(page, role, "/proyectos");
  const id = await projectId(page, codigo);
  await page.goto(`/proyectos/${id}`);
  return id;
}

/** Open the client ficha dialog from the /clientes cards (search first so the card is in the DOM). */
export async function openCliente(page: Page, nombre: string) {
  await page.goto("/clientes");
  // The list hydrates late on the dev server: wait for its cards before typing.
  await expect(page.getByRole("article").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("textbox", { name: "Buscar clientes" }).fill(nombre);
  // The search box mirrors itself into the URL after a 350 ms debounce
  // (router.replace); clicking before that can lose a later navigation to it.
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(nombre);
  const card = page.getByRole("article", { name: `Abrir ficha de ${nombre}` });
  await expect(card).toBeVisible({ timeout: 30_000 });

  const dialog = page.getByRole("dialog", { name: `Ficha de ${nombre}` });
  // Opening is URL-driven (?cliente=...); a search re-render can swallow the
  // first click, so the click is retried once.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await card.getByRole("button", { name: "Ver detalle" }).click();
    try {
      await expect(page).toHaveURL(/cliente=/, { timeout: 10_000 });
      break;
    } catch {
      if (attempt === 1) throw new Error(`the ficha of ${nombre} did not open`);
    }
  }
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  return dialog;
}
