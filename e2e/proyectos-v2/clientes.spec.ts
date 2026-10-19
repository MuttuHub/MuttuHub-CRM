import { expect, test } from "@playwright/test";
import { login, openCliente } from "./helpers";

// Guide §10 (what changed in Clientes).

test("sub-navigation has no «Oportunidades»/«Mapa» and the old routes redirect to /clientes", async ({ page }) => {
  await login(page, "gerencia", "/clientes");
  const nav = page.getByRole("navigation", { name: "Secciones de clientes" });
  for (const s of ["Aliados", "Interacciones", "Relaciones", "Salud", "Automatizaciones"]) {
    await expect(nav.getByRole("link", { name: s, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Oportunidades" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Mapa" })).toHaveCount(0);
  for (const old of ["/clientes/oportunidades", "/clientes/mapa"]) {
    await page.goto(old);
    await expect(page).toHaveURL(/\/clientes$/);
    await expect(page.getByRole("heading", { name: "Aliados y clientes", level: 1 })).toBeVisible();
  }
});

test("gerencia: first-contact date is human readable; «Crear proyecto» opens the stepper with the client preselected", async ({ page }) => {
  await login(page, "gerencia", "/clientes");
  const dialog = await openCliente(page, "Universidad Central del Valle");
  const general = dialog.getByRole("tabpanel", { name: "General" });
  const fecha = general.locator("dt", { hasText: "Fecha de primer contacto" }).locator("xpath=following-sibling::*[1]");
  const text = (await fecha.innerText()).trim();
  expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(text).toMatch(/^\d{1,2} de \p{L}+\.? de \d{4}$/u);

  await dialog.getByRole("link", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(/\/proyectos\/nuevo\?cliente=/);
  await expect(page.getByRole("combobox", { name: "Cliente" })).toContainText("Universidad Central del Valle");
  await expect(page.getByLabel("Datos del cliente")).toBeVisible();
});

test("colaborador: reads any client, General tab shows values (not «—»), and may create a project", async ({ page }) => {
  await login(page, "colaborador", "/clientes");
  // A client the colaborador does NOT own (responsable: Laura Jiménez).
  const dialog = await openCliente(page, "Grupo Empresarial Hilos del Valle de Aburrá");
  const general = dialog.getByRole("tabpanel", { name: "General" });
  await expect(general.getByRole("combobox", { name: "Tipo de cliente" })).toBeDisabled();
  await expect(general.getByRole("combobox", { name: "Tipo de cliente" })).toContainText("Empresa privada");
  await expect(general.getByRole("combobox", { name: "Prioridad" })).toContainText("Media");
  await expect(general.getByRole("combobox", { name: "Estado" })).toContainText("Prospecto");
  await expect(general.getByRole("combobox", { name: "Responsable interno" })).toContainText("Laura Jiménez");
  for (const label of ["Nombre", "Ubicación", "Canal de contacto inicial", "Fecha de primer contacto"]) {
    const dd = general.locator("dt", { hasText: label, }).first().locator("xpath=following-sibling::*[1]");
    const t = (await dd.innerText()).trim();
    expect(t, `${label} must show a value`).not.toBe("");
    expect(t, `${label} must not be «—»`).not.toBe("—");
  }
  await expect(dialog.getByRole("button", { name: "Editar" })).toHaveCount(0);
  // S1/S8: every role creates projects and reads every client.
  await expect(dialog.getByRole("link", { name: "Crear proyecto" })).toBeVisible();
  // The commercial cycle keeps its own gate.
  await expect(dialog.getByRole("tab", { name: "Oportunidades" })).toHaveCount(0);
});

test("coordinador sees «Crear proyecto» on a client ficha (S1)", async ({ page }) => {
  await login(page, "coordinador", "/clientes");
  const dialog = await openCliente(page, "Universidad Central del Valle");
  await expect(dialog.getByRole("link", { name: "Crear proyecto" })).toBeVisible();
});
