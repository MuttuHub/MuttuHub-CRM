import { expect, test } from "@playwright/test";

// Narrated walkthrough of "las funciones del CRM" (client list, filters,
// saved views, and the client ficha) against the running local dev server.
// Single ordered test -> single video: login -> list -> filter -> save view
// -> clear -> open a seeded client's ficha -> walk its tabs -> close -> logout.
//
// Seed reference (prisma/seed.ts): "Fundación Horizonte Nuevo" is the 8th
// seeded client (estado CLIENTE_ACTIVO, responsable "gerencia"). Every
// seeded client gets exactly 2 contactos and 2 bitácora entries; this one
// also has its own opportunity ("Informe trimestral de gestión Q3"), so all
// three tabs (Contactos / Oportunidades / Bitácora) show real content.

const GERENCIA_EMAIL = "gerencia@demo.muttuhub.local";
const GERENCIA_PASSWORD = "MuttuDemo2026!";
const CLIENTE_DEMO = "Fundación Horizonte Nuevo";

// Deliberate "reading time" between beats. This spec exists to produce a
// watchable demo video (paired with playwright.config.ts's slowMo on every
// action) — without these, a passing assertion moves on instantly and the
// recording reads as a blur instead of a progressive, section-by-section walk.
async function beat(page: import("@playwright/test").Page, ms = 1600) {
  await page.waitForTimeout(ms);
}

test.describe.configure({ mode: "serial" });

test("CRM demo: login, filter/save/clear a view, and walk a client's ficha", async ({
  page,
}) => {
  await test.step("1. Login as gerencia (full-access role)", async () => {
    // ?next=/clientes sends the redirect straight to the CRM module, which
    // also satisfies "go to /clientes" from the same navigation.
    await page.goto("/login?next=%2Fclientes");
    await page.getByLabel("Correo corporativo").fill(GERENCIA_EMAIL);
    // Not getByLabel("Contraseña"): the "Ver"/"Mostrar contraseña" toggle
    // button shares the same <label> wrapper, so the accessible-name match
    // is ambiguous (strict mode). The password field is the only one on
    // this page, so type[password] is unambiguous and stable.
    await page.locator('input[type="password"]').fill(GERENCIA_PASSWORD);
    // Not a plain name match: the "Entrar"/"Solicitar acceso" segmented tab
    // above the form also renders a button named "Entrar". Scope to the
    // actual submit button.
    await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
    // Cold Turbopack route compile + the login POST round trip can be slow.
    await page.waitForURL(/\/clientes/, { timeout: 30_000 });
  });

  await test.step("2. Client list renders real rows", async () => {
    await expect(
      page.getByRole("article", { name: /Abrir ficha de/ }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await beat(page, 2000); // let the viewer take in the populated grid
  });

  const showing = page.getByText(/^Mostrando \d/);
  let totalBeforeFilter = "";

  await test.step("3. Apply a filter (estado = Cliente activo) and show the count change", async () => {
    await expect(showing).toBeVisible();
    totalBeforeFilter = (await showing.textContent()) ?? "";

    await page.getByRole("button", { name: /Filtros/ }).click();
    await beat(page, 700); // panel opening

    // Combobox order in the filter grid: Tipo, Estado, Prioridad, Responsable
    // (the placeholder text carries no accessible name of its own).
    const estadoCombo = page.getByRole("combobox").nth(1);
    await estadoCombo.click();
    await beat(page, 500); // options open
    await page.getByRole("option", { name: "Cliente activo" }).click();
    await beat(page, 500);
    await page.getByRole("button", { name: "Aplicar" }).click();

    await expect(page.getByText("Estado: Cliente activo")).toBeVisible();
    await expect(showing).not.toHaveText(totalBeforeFilter);
    await beat(page, 2200); // read the filtered result before moving on
  });

  await test.step("4. Save the current filter as a saved view", async () => {
    await page.getByRole("button", { name: /Vistas/ }).click();
    await beat(page, 600);
    await page
      .getByRole("menuitem", { name: "Guardar filtros actuales" })
      .click();
    await beat(page, 600);
    await page
      .getByLabel("Nombre de la vista")
      .fill("Clientes activos (demo)");
    await beat(page, 600);
    await page.getByRole("button", { name: "Guardar vista" }).click();
    // The "Vistas" trigger's badge now counts the saved view.
    await expect(page.getByRole("button", { name: /Vistas/ })).toContainText(
      "1",
    );
    await beat(page, 1800);
  });

  await test.step("5. Clear the applied filter", async () => {
    await page.getByRole("button", { name: /Filtros/ }).click();
    await beat(page, 700);
    await page.getByRole("button", { name: "Limpiar todo" }).click();
    await expect(page.getByText("Estado: Cliente activo")).toHaveCount(0);
    await beat(page, 1600);
  });

  const ficha = page.getByRole("dialog");

  await test.step("6. Open the ficha for a client with contacts, an opportunity and bitácora", async () => {
    await page.getByLabel("Buscar clientes").fill("Horizonte Nuevo");
    const card = page.getByRole("article", {
      name: `Abrir ficha de ${CLIENTE_DEMO}`,
    });
    // Search is debounced 350ms server-side.
    await expect(card).toBeVisible({ timeout: 10_000 });
    await beat(page, 1200); // let the narrowed-down search result register
    // Not the card itself: its own <h3> title has the identical accessible
    // name as the ficha's heading, so click the explicit "Ver detalle"
    // action and assert against the opened dialog specifically.
    await card.getByRole("button", { name: "Ver detalle" }).click();
    await expect(ficha).toBeVisible();
    await expect(
      ficha.getByRole("heading", { name: CLIENTE_DEMO, exact: true }),
    ).toBeVisible();
    await beat(page, 2000); // ficha overview before diving into tabs
  });

  await test.step("7a. Contactos tab shows the seeded contacts", async () => {
    await ficha.getByRole("tab", { name: "Contactos" }).click();
    await expect(ficha.getByText(/^2 contactos$/)).toBeVisible();
    await expect(
      ficha.getByText("Aún no hay contactos para este cliente."),
    ).toHaveCount(0);
    await beat(page, 2200);
  });

  await test.step("7b. Oportunidades tab shows the seeded opportunity", async () => {
    await ficha.getByRole("tab", { name: "Oportunidades" }).click();
    await expect(ficha.getByText(/^1 oportunidad$/)).toBeVisible();
    await expect(
      ficha.getByText("Informe trimestral de gestión Q3"),
    ).toBeVisible();
    await beat(page, 2200);
  });

  await test.step("7c. Bitácora tab shows the seeded log entries", async () => {
    await ficha.getByRole("tab", { name: "Bitácora" }).click();
    await expect(
      ficha.getByText(new RegExp(`Reunión de seguimiento con ${CLIENTE_DEMO}`)),
    ).toBeVisible();
    await expect(
      ficha.getByText(
        new RegExp(`Llamada de actualización con ${CLIENTE_DEMO}`),
      ),
    ).toBeVisible();
    await beat(page, 2200);
  });

  await test.step("8. Close the ficha and log out", async () => {
    await ficha.getByRole("button", { name: "Cerrar" }).click();
    await expect(ficha).toHaveCount(0);
    await beat(page, 1000);

    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await beat(page, 600);
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await beat(page, 1200); // rest on the login screen before the video ends
  });
});
