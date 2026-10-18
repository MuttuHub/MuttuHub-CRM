import { expect, test } from "@playwright/test";
import { login, pickOption } from "./helpers";

// Guide §2. Creates ONE draft project per run on the local demo DB (no opportunity consumed).

test("stepper starts with the client; client card; opportunity gated by client", async ({ page }) => {
  await login(page, "gerencia");
  await page.getByRole("link", { name: "Nuevo proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo proyecto", level: 1 })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Pasos para crear el proyecto" });
  for (const paso of ["General", "Metas", "Cronograma", "Presupuesto", "Revisión"]) {
    await expect(nav.getByRole("button", { name: paso })).toBeVisible();
  }
  await expect(page.getByRole("searchbox", { name: "Buscar cliente" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Oportunidad" })).toBeDisabled();

  await pickOption(page, "Cliente", "Universidad Central del Valle");
  const card = page.getByLabel("Datos del cliente");
  await expect(card).toBeVisible();
  for (const dato of ["Tipo de cliente", "Oportunidades", "Contacto principal"]) {
    await expect(card.getByText(dato)).toBeVisible();
  }
  const opp = page.getByRole("combobox", { name: "Oportunidad" });
  await expect(opp).toBeEnabled();
  await opp.click();
  await expect(page.getByRole("option", { name: /Sin oportunidad \(proyecto independiente\)/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Programa de formación técnica/ })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("validations: valor total, date range; then create lands on the new draft", async ({ page }) => {
  await login(page, "gerencia", "/proyectos/nuevo");
  await pickOption(page, "Cliente", "Universidad Central del Valle");
  const nombre = `E2E borrador ${Date.now()}`;
  await page.getByRole("textbox", { name: "Nombre" }).fill(nombre);
  await page.getByRole("checkbox", { name: "Municipio Medellín" }).check();
  const submit = page.getByRole("button", { name: "Crear proyecto y continuar" });
  const valor = page.getByRole("textbox", { name: "Valor total" });
  const inicio = page.getByRole("textbox", { name: "Fecha de inicio" });
  const fin = page.getByRole("textbox", { name: "Fecha de fin" });

  // valor total empty / 0
  await submit.click();
  await expect(page.getByText("El valor total debe ser mayor que cero.")).toBeVisible();
  await valor.fill("0");
  await submit.click();
  await expect(page.getByText("El valor total debe ser mayor que cero.")).toBeVisible();

  // valid es-CO value is accepted (the error disappears); then date range checks
  await valor.fill("250.000");
  await fin.fill("2026-10-17");
  await inicio.fill("2026-10-17");
  await submit.click();
  await expect(page.getByText("La fecha de fin debe ser posterior a la fecha de inicio.")).toBeVisible();
  await expect(page.getByText("El valor total debe ser mayor que cero.")).toHaveCount(0);
  await inicio.fill("2026-11-01");
  await fin.fill("2026-10-17");
  await submit.click();
  await expect(page.getByText("La fecha de fin debe ser posterior a la fecha de inicio.")).toBeVisible();

  // create
  await inicio.fill("2026-11-01");
  await fin.fill("2027-02-01");
  await submit.click();
  await page.waitForURL(/proyecto=[0-9a-f-]{36}/, { timeout: 60_000 });
  const id = new URL(page.url()).searchParams.get("proyecto")!;
  // The wizard continues on the Metas step (paso=2) with the new project name as title.
  await expect(page.getByRole("heading", { name: nombre, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Metas e indicadores", level: 2 })).toBeVisible();

  // The new draft: its ficha shows «Próximos pasos» and the typed name.
  await page.goto(`/proyectos/${id}`);
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Borrador").first()).toBeVisible();
  await expect(page.getByText("Próximos pasos").first()).toBeVisible();
  await expect(page.getByText("$ 250.000").first()).toBeVisible();
});

test("coordinador cannot create projects", async ({ page }) => {
  await login(page, "coordinador", "/proyectos/nuevo");
  await expect(page.getByText("No tienes acceso para crear proyectos")).toBeVisible();
});
