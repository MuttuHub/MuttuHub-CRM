import path from "node:path";
import { expect, test } from "@playwright/test";
import { fichaHref, login } from "./helpers";

// Guide §5 (borrador) + §2 «Importar plantilla». The fixture targets PRY-2026-002 and REPLACES its
// structure (idempotent: re-importing yields the same 3 objectives). Local demo DB only.
const FIXTURE = path.join(__dirname, "..", "fixtures", "plantilla-po-ejemplo-importable.xlsx");

test("PRY-2026-002: validate then import the PO template; 3 objectives, activities and Gantt by week", async ({ page }) => {
  await login(page, "admin");
  await page.goto(await fichaHref(page, "PRY-2026-002"));
  await page.getByRole("tab", { name: "Actividades" }).click();
  await page.getByRole("button", { name: "Importar plantilla" }).click();

  const dialog = page.getByRole("dialog", { name: "Importar plantilla de proyecto" });
  await expect(dialog.getByRole("button", { name: "Validar plantilla" })).toBeDisabled();
  await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);
  await dialog.getByRole("button", { name: "Validar plantilla" }).click();

  await expect(dialog.getByText("La plantilla es válida.")).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByTestId("import-errores")).toHaveCount(0);
  await expect(dialog.getByTestId("import-resumen")).toContainText(/3 objetivos/);

  await dialog.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  // 3 objectives (O1..O3) with their activities (A1.1 … A3.3 = 12 activities)
  const lista = page.getByRole("tabpanel", { name: "Lista" });
  await expect(lista.getByRole("button", { name: /^Editar objetivo / })).toHaveCount(3, { timeout: 30_000 });
  await expect(lista.getByRole("button", { name: /^Editar actividad / })).toHaveCount(12);
  await expect(lista.getByText("Formalizar bajo la figura jurídica idónea").first()).toBeVisible();

  // Gantt by week
  await page.getByRole("tab", { name: "Gantt" }).click();
  const gantt = page.getByRole("tabpanel", { name: "Gantt" });
  await expect(gantt.getByText(/S1\b/).first()).toBeVisible();
  await expect(gantt.getByText(/S17\b/).first()).toBeVisible();
  for (const code of ["O1", "O2", "O3", "A1.1", "A3.3"]) await expect(gantt.getByText(code, { exact: true })).toBeVisible();
});
