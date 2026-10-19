import { expect, test, type Page } from "@playwright/test";
import { login, portfolioRows } from "./helpers";

// Role matrix of 2026-10-19 (odd/tasks/permisos-proyectos-por-rol.md):
//   - any role creates a project;
//   - Coordinador and Colaborador read and write only where they are team members;
//   - Administración and Gerencia keep approvals and expense validation;
//   - every role reads every client.
//
// The demo seed leaves PRY-2026-001 (En ejecución) and PRY-2026-002 (Borrador)
// with the coordinador as responsable and member. The colaborador starts with no
// membership, which is what makes the "stranger" assertions meaningful; one test
// adds them to 001 through the product and then checks the member side.

const NOMBRE_COLABORADOR = "Andrés Torres";
const SIN_ACCESO = "No tienes acceso a este proyecto";

type Ids = { p001: string; p002: string };
const ids: Partial<Ids> = {};

/** Resolve the two demo project ids through the admin session (serial tests share this). */
async function resolveIds(page: Page): Promise<Ids> {
  if (ids.p001 && ids.p002) return ids as Ids;
  const res = await page.request.get("/api/v1/projects");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { proyectos: Array<{ id: string; codigo: string }> };
  const p001 = body.proyectos.find((p) => p.codigo === "PRY-2026-001")?.id;
  const p002 = body.proyectos.find((p) => p.codigo === "PRY-2026-002")?.id;
  expect(p001, "PRY-2026-001 must exist in the demo seed").toBeTruthy();
  expect(p002, "PRY-2026-002 must exist in the demo seed").toBeTruthy();
  ids.p001 = p001!;
  ids.p002 = p002!;
  return ids as Ids;
}

async function openFicha(page: Page, id: string) {
  await page.goto(`/proyectos/${id}`);
  await expect(page.getByTestId("ficha-header")).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

test("gerencia: sees every project, may create, and approves baselines", async ({ page }) => {
  await login(page, "gerencia", "/proyectos");
  const { p002 } = await resolveIds(page);
  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).toContain("PRY-2026-001");
  expect(rows).toContain("PRY-2026-002");
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();

  // 002 is still a draft: the manager sees the baseline action.
  await openFicha(page, p002);
  await expect(page.getByRole("button", { name: /Aprobar línea base/ }).first()).toBeVisible();
});

test("coordinador: own projects only, may create, executes but never approves nor validates", async ({ page }) => {
  await login(page, "coordinador", "/proyectos");
  const { p001, p002 } = await resolveIds(page);
  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).toContain("PRY-2026-001");
  expect(rows).toContain("PRY-2026-002");

  // S1: creation is open to every role now.
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();

  // S7: approval stays with Administración and Gerencia, even for a draft.
  await openFicha(page, p002);
  await expect(page.getByRole("button", { name: /Aprobar línea base/ })).toHaveCount(0);

  // S6: a member executes; S7: validation is not theirs.
  await openFicha(page, p001);
  await expect(page.getByRole("button", { name: "Registrar avance", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar gasto", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Finanzas", exact: true }).click();
  await page.getByRole("tab", { name: "Gastos", exact: true }).click();
  await expect(page.getByTestId("gastos-lista")).toBeVisible();
  await expect(page.getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar" })).toHaveCount(0);
});

test("colaborador: the list never shows a foreign project, both tabs, may create, ficha denied", async ({ page }) => {
  await login(page, "colaborador", "/proyectos");
  const { p002 } = await resolveIds(page);
  // S4: the board is visible to both member roles, scoped to their projects.
  await expect(page.getByRole("tab", { name: "Portafolio" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Tablero" })).toBeVisible();
  // S1: creation is open to every role.
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();

  // S3: 002 never belongs to the colaborador in the seed, so it can never show
  // up in their portfolio (empty before they join 001, absent after).
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).not.toContain("PRY-2026-002");

  const api = await page.request.get(`/api/v1/projects/${p002}`);
  expect([403, 404]).toContain(api.status());
  await page.goto(`/proyectos/${p002}`);
  await expect(page.getByRole("heading", { name: SIN_ACCESO })).toBeVisible({ timeout: 60_000 });
});

test("admin adds the colaborador to 001 through the team panel", async ({ page }) => {
  await login(page, "admin", "/proyectos");
  const { p001 } = await resolveIds(page);
  await openFicha(page, p001);

  // The team panel loads asynchronously: wait for a known member first, then
  // decide. The remove button is the member-only affordance that proves it.
  const quitar = page.getByRole("button", { name: `Quitar a ${NOMBRE_COLABORADOR}` });
  const agregarCombo = page.getByRole("combobox", { name: "Agregar integrante" });
  await expect(page.getByRole("button", { name: /^Quitar a / }).first()).toBeVisible({ timeout: 30_000 });

  if ((await quitar.count()) === 0) {
    // Selecting only fills the select; "Agregar" creates the membership.
    await agregarCombo.click();
    await page.getByRole("option", { name: NOMBRE_COLABORADOR }).first().click();
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
  }
  await expect(quitar).toBeVisible({ timeout: 30_000 });
});

test("colaborador member: reads their project, executes, cannot validate nor approve", async ({ page }) => {
  await page.context().clearCookies();
  await login(page, "colaborador", "/proyectos");
  const { p001, p002 } = await resolveIds(page);

  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).toContain("PRY-2026-001");
  expect(rows, "002 has no colaborador membership").not.toContain("PRY-2026-002");

  await openFicha(page, p001);
  await expect(page.getByRole("button", { name: /Aprobar línea base/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar avance", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar gasto", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Finanzas", exact: true }).click();
  await page.getByRole("tab", { name: "Gastos", exact: true }).click();
  await expect(page.getByTestId("gastos-lista")).toBeVisible();
  await expect(page.getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar" })).toHaveCount(0);

  // The API is the authority: a member may edit the allowed field of an
  // executing project, and a project without membership stays 403.
  const propio = await page.request.patch(`/api/v1/projects/${p001}`, {
    data: { descripcion: "Actualizada por el E2E de permisos" },
  });
  expect(propio.status()).toBe(200);

  const ajeno = await page.request.patch(`/api/v1/projects/${p002}`, {
    data: { descripcion: "no debería" },
  });
  expect([403, 404]).toContain(ajeno.status());
});

test("S8: every role reads every client, so the contact feeds are global", async ({ page }) => {
  for (const role of ["colaborador", "coordinador"] as const) {
    await page.context().clearCookies();
    await login(page, role, "/clientes");
    for (const [url, key] of [
      ["/api/v1/contacts", "contactos"],
      ["/api/v1/interactions", "interacciones"],
    ] as const) {
      const res = await page.request.get(url);
      expect(res.status(), `${role} ${url}`).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body[key]), `${role} ${url} shape`).toBe(true);
    }
  }
});
