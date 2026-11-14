import { expect, test } from "@playwright/test";
import { login, pickOption } from "./helpers";

// Guide §2. Creates ONE draft project per run on the local demo DB (no opportunity consumed).

test("stepper starts with the client; client card; opportunity gated by client", async ({ page }) => {
  await login(page, "gerencia");
  await page.getByRole("link", { name: "Nuevo proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo proyecto", level: 1 })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Pasos para crear el proyecto" });
  for (const paso of ["General", "Estructura", "Cronograma", "Presupuesto", "Revisión"]) {
    await expect(nav.getByRole("button", { name: paso })).toBeVisible();
  }
  // One field searches and selects the client (PO 2026-10-23): no separate search box.
  await expect(page.getByRole("searchbox", { name: "Buscar cliente" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Cliente" })).toBeEditable();
  await expect(page.getByRole("combobox", { name: "Oportunidad" })).toBeDisabled();

  await pickOption(page, "Cliente", "Fundación Tejiendo Caribe");
  const card = page.getByLabel("Datos del cliente");
  await expect(card).toBeVisible();
  for (const dato of ["Tipo de cliente", "Oportunidades", "Contacto principal"]) {
    await expect(card.getByText(dato)).toBeVisible();
  }
  // The opportunity select unlocks once a client is chosen and always offers the
  // independent path; this client also has a won opportunity without a project.
  const opp = page.getByRole("combobox", { name: "Oportunidad" });
  await expect(opp).toBeEnabled();
  await opp.click();
  await expect(page.getByRole("option", { name: /Sin oportunidad \(proyecto independiente\)/ })).toBeVisible();
  expect(await page.getByRole("option").count()).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
});

test("validations: date range; the value is derived; then create lands on the new draft", async ({ page }) => {
  await login(page, "gerencia", "/proyectos/nuevo");
  await pickOption(page, "Cliente", "Universidad Central del Valle");
  const nombre = `E2E borrador ${Date.now()}`;
  await page.getByRole("textbox", { name: "Nombre" }).fill(nombre);
  // El catálogo se elige en dos pasos: departamento y después municipio.
  await pickOption(page, "Departamento", "Antioquia");
  await pickOption(page, "Municipio", "Medellín");
  const submit = page.getByRole("button", { name: "Crear proyecto y continuar" });
  const inicio = page.getByRole("textbox", { name: "Fecha de inicio" });
  const fin = page.getByRole("textbox", { name: "Fecha de fin" });

  // T11 S2: the value is not typed; it is the sum of the budget lines.
  await expect(page.getByRole("textbox", { name: "Valor total" })).toHaveCount(0);
  await expect(page.getByText(/Se calcula sumando las líneas del presupuesto/)).toBeVisible();

  // date range checks
  await fin.fill("2026-10-17");
  await inicio.fill("2026-10-17");
  await submit.click();
  await expect(page.getByText("La fecha de fin debe ser posterior a la fecha de inicio.")).toBeVisible();
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
  // The wizard continues on the Estructura step (paso=2) with the new project name as title.
  await expect(page.getByRole("heading", { name: nombre, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estructura del proyecto", level: 2 })).toBeVisible();

  // The new draft: its ficha shows «Próximos pasos» and the typed name.
  await page.goto(`/proyectos/${id}`);
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Borrador").first()).toBeVisible();
  await expect(page.getByText("Próximos pasos").first()).toBeVisible();
  // T11 S2: no budget lines yet, so the derived value is $ 0 (the stepper no longer types one).
  await expect(page.getByText("$ 0", { exact: true }).first()).toBeVisible();
});

test("coordinador reaches the creation stepper (S1: any role creates)", async ({ page }) => {
  await login(page, "coordinador", "/proyectos/nuevo");
  await expect(page.getByText("No tienes acceso para crear proyectos")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Nuevo proyecto", level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: "Pasos para crear el proyecto" })).toBeVisible();
});
