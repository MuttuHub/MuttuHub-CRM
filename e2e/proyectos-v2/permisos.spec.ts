import { expect, test, type Page } from "@playwright/test";
import { login, P001, P003, portfolioRows, type Role } from "./helpers";

// Guide §9 (role matrix), P1 (contacts/interactions scoping) and P2 (health subscore).

const SIN_ACCESO = "No tienes acceso a este proyecto";

/** Usable from any logged-in page: id -> nombre of every client. */
async function clientNames(page: Page): Promise<Map<string, string>> {
  const res = await page.request.get("/api/v1/clients?limit=100");
  expect(res.status()).toBe(200);
  const { items } = (await res.json()) as { items: Array<{ id: string; nombre: string }> };
  return new Map(items.map((c) => [c.id, c.nombre]));
}

async function feedClients(page: Page, url: string, key: string): Promise<{ names: Set<string | null>; count: number }> {
  const res = await page.request.get(url);
  expect(res.status(), url).toBe(200);
  const body = await res.json();
  const rows = body[key] as Array<{ cliente_id: string | null }>;
  const names = await clientNames(page);
  return { names: new Set(rows.map((r) => (r.cliente_id ? (names.get(r.cliente_id) ?? r.cliente_id) : null))), count: rows.length };
}

const COLABORADOR_CLIENTES = new Set([
  "Alcaldía de Puerto Esperanza",
  "Constructora Río Claro S.A.S.",
  "Universidad Central del Valle",
]);

test("colaborador: empty project list, no Portafolio/Tablero tabs", async ({ page }) => {
  await login(page, "colaborador", "/proyectos");
  await expect(page.getByText("Aún no tienes proyectos visibles")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Portafolio" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Tablero" })).toHaveCount(0);
});

test("colaborador: ficha 001 by URL says «No tienes acceso» (API 403); cannot post an expense", async ({ page }) => {
  await login(page, "colaborador", "/proyectos");
  expect((await page.request.get(`/api/v1/projects/${P001}`)).status()).toBe(403);
  const post = await page.request.post(`/api/v1/projects/${P001}/expenses`, { data: {} });
  expect([401, 403], "colaborador must be rejected before validation").toContain(post.status());

  const t0 = Date.now();
  await page.goto(`/proyectos/${P001}`);
  await expect(page.getByRole("heading", { name: SIN_ACCESO })).toBeVisible({ timeout: 60_000 });
  test.info().annotations.push({ type: "time-to-no-access-message", description: `${Date.now() - t0} ms` });
  await expect(page.getByRole("button", { name: /Registrar gasto/ })).toHaveCount(0);
});

test("coordinador: portfolio shows only their projects; non-member 003 is denied; no Validar/Rechazar", async ({ page }) => {
  await login(page, "coordinador", "/proyectos");
  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).toContain("PRY-2026-001");
  expect(rows).toContain("PRY-2026-002");
  expect(rows).not.toContain("PRY-2026-003");
  expect(rows).not.toContain("PRY-2026-004");
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toHaveCount(0);

  expect((await page.request.get(`/api/v1/projects/${P003}`)).status()).toBe(403);
  await page.goto(`/proyectos/${P003}`);
  await expect(page.getByRole("heading", { name: SIN_ACCESO })).toBeVisible({ timeout: 60_000 });

  // Member of 001: can register, cannot validate/reject
  await page.goto(`/proyectos/${P001}`);
  await expect(page.getByRole("button", { name: "Registrar gasto", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Registrar avance", exact: true }).first()).toBeVisible();
  await page.getByRole("tablist").first().getByRole("tab", { name: "Finanzas", exact: true }).click();
  await page.getByRole("tab", { name: "Gastos", exact: true }).click();
  await expect(page.getByTestId("gastos-lista")).toBeVisible();
  await expect(page.getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar" })).toHaveCount(0);
});

test("gerencia: sees every project and may create one", async ({ page }) => {
  await login(page, "gerencia", "/proyectos");
  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  for (const c of ["001", "002", "003", "004"]) expect(rows).toContain(`PRY-2026-${c}`);
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();
});

test("P1: /contacts and /interactions are scoped for colaborador, global for coordinador", async ({ page }) => {
  const result: Record<Role, { contacts: Awaited<ReturnType<typeof feedClients>>; inter: Awaited<ReturnType<typeof feedClients>> }> = {} as never;
  for (const role of ["colaborador", "coordinador"] as const) {
    await page.context().clearCookies();
    await login(page, role, "/clientes");
    result[role] = {
      contacts: await feedClients(page, "/api/v1/contacts", "contactos"),
      inter: await feedClients(page, "/api/v1/interactions", "interacciones"),
    };
  }
  for (const feed of ["contacts", "inter"] as const) {
    const col = result.colaborador[feed];
    expect(col.count, `colaborador ${feed} not empty`).toBeGreaterThan(0);
    for (const n of col.names) expect(COLABORADOR_CLIENTES.has(n as string), `colaborador ${feed} leaks client «${n}»`).toBeTruthy();
    const coord = result.coordinador[feed];
    expect(coord.count, `coordinador sees more ${feed}`).toBeGreaterThan(col.count);
    expect([...coord.names].some((n) => !COLABORADOR_CLIENTES.has(n as string))).toBeTruthy();
  }
});

test("P2: health «proyectos» subscore hidden for colaborador (total still computed), present for gerencia", async ({ page }) => {
  await login(page, "colaborador", "/clientes/salud");
  const colRes = await page.request.get("/api/v1/clients/health");
  expect(colRes.status()).toBe(200);
  const col = (await colRes.json()).data.clientes as Array<{ score: number | null; subscores: { proyectos: number | null } }>;
  expect(col.length).toBeGreaterThan(0);
  for (const c of col) {
    expect(c.subscores.proyectos).toBeNull();
    expect(typeof c.score).toBe("number");
  }
  await expect(page.getByRole("heading", { name: "Salud de la cartera" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Promedio \d/)).toBeVisible();

  await page.context().clearCookies();
  await login(page, "gerencia", "/clientes/salud");
  const ger = (await (await page.request.get("/api/v1/clients/health")).json()).data.clientes as Array<{ subscores: { proyectos: number | null } }>;
  expect(ger.some((c) => c.subscores.proyectos !== null), "gerencia sees the proyectos subscore").toBeTruthy();
});

// UX threshold (not stated in the guide): a 403/404 ficha should explain itself quickly instead of showing the
// loading skeleton. KNOWN APP DEFECT (see odd/tasks/e2e-proyectos-v2.md, D1): useProject() keeps react-query's default
// 3 retries on 403/404, so the message takes ~11 s. Left failing on purpose.
test("coordinador non-member: the «No tienes acceso» message shows within 5 s", async ({ page }) => {
  await login(page, "coordinador", "/proyectos");
  await page.goto(`/proyectos/${P003}`);
  await expect(page.getByRole("heading", { name: SIN_ACCESO })).toBeVisible({ timeout: 5_000 });
});
