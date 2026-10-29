import { expect, test } from "@playwright/test";
import { loginToProject } from "./helpers";

// Guide §3 (Más acciones / Imprimir) and §8 (Historial segments). Read-only.
// The modification request/approval flow (§8) is intentionally NOT automated: it changes the baseline of PRY-2026-001.

test("Historial has Modificaciones, Versiones and Auditoría segments that each render", async ({ page }) => {
  await loginToProject(page, "gerencia", "PRY-2026-001");
  await page.getByRole("tablist").first().getByRole("tab", { name: "Historial", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Historial" });
  await expect(panel.getByRole("tab", { name: "Modificaciones", selected: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Modificaciones", level: 3 })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Solicitar modificación" })).toBeVisible();

  await panel.getByRole("tab", { name: "Versiones", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Versiones", level: 3 })).toBeVisible();

  await panel.getByRole("tab", { name: "Auditoría", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Historial", level: 3 })).toBeVisible();
});

test("Más acciones: Exportar a Excel dialog and Imprimir / PDF opens the print view", async ({ page, context }) => {
  const id = await loginToProject(page, "gerencia", "PRY-2026-001");
  await page.getByRole("button", { name: "Más acciones" }).click();
  await expect(page.getByRole("menuitem", { name: "Exportar a Excel" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Exportar a Excel" }).click();
  await expect(page.getByText("Elige el corte y la base, y descarga la ficha.")).toBeVisible();
  await page.keyboard.press("Escape");

  // The print view opens in the same tab (no new browser tab) and «Volver» returns to the ficha.
  await page.getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("menuitem", { name: "Imprimir / PDF" }).click();
  const print = page;
  await expect(print).toHaveURL(new RegExp(`/proyectos/${id}/imprimir$`));
  expect(context.pages()).toHaveLength(1);
  await expect(print.getByRole("link", { name: "Volver" })).toBeVisible({ timeout: 60_000 });
  await expect(print.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeVisible({ timeout: 60_000 });
  const ficha = print.getByRole("article");
  await expect(ficha.getByText("PRY-2026-001")).toBeVisible();
  await expect(ficha.getByRole("heading", { name: "Demo CedeTextil · En ejecución", level: 1 })).toBeVisible();
  await expect(ficha.getByRole("region", { name: "Actividades por objetivo" })).toBeVisible();

  // Print preview shows only the ficha sheet: no sidebar, no top bar (guide expects it under Ctrl+P).
  await print.emulateMedia({ media: "print" });
  await expect(print.getByRole("complementary")).toBeHidden();
  await expect(print.getByRole("button", { name: "Imprimir / Guardar PDF" })).toBeHidden();
  await expect(ficha).toBeVisible();

  await print.emulateMedia({ media: "screen" });
  await print.getByRole("link", { name: "Volver" }).click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${id}$`));
});
