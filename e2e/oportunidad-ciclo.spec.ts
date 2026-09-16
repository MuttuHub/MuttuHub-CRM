import { expect, test } from "@playwright/test";

// oportunidades-comerciales — full commercial cycle end-to-end sentinel
// (Phase 5, task 5.6): create → link an existing task → PRESENTADA → GANADA
// → convert → the Kanban chip flips from Prospección to Ejecución.
//
// Pairs with the unit-level tests:
//   src/app/api/v1/clients/[id]/opportunities/[opportunityId]/convert/route.test.ts
//   src/app/api/v1/clients/[id]/opportunities/[opportunityId]/route.test.ts (D7, write-once)
//   src/components/crm/entity-dialogs.test.tsx (Convertir action visibility)
//   src/components/kanban/task-card.test.tsx (RNF-C01 chip)
// to prove the same contract end-to-end on a live browser.
//
// Seed reference (prisma/seed.ts):
//   Cliente[7] = "Fundación Horizonte Nuevo" (responsable gerencia)
//   TAREAS: "Validar entregable con equipo técnico" (clienteIndex 7,
//     responsableKey gerencia) — no oportunidad_id at seed time (D1: no
//     backfill), so it is available to link from the lifecycle view.
//
// CI only: this spec runs against the running dev server
// (playwright.config.ts has no `webServer` block). Do not run it locally
// without `pnpm dev` first.

const GERENCIA_EMAIL = "gerencia@demo.muttuhub.local";
const GERENCIA_PASSWORD = "MuttuDemo2026!";
const CLIENTE_DEMO = "Fundación Horizonte Nuevo";
const TAREA_A_VINCULAR = "Validar entregable con equipo técnico";
const NOMBRE_OPORTUNIDAD = `Ciclo E2E ${Date.now()}`;

test.describe.configure({ mode: "serial" });

test("commercial cycle: create, link a task, present, win, convert, chip flips", async ({
  page,
}) => {
  await test.step("1. Login as gerencia (full commercial access)", async () => {
    await page.goto("/login?next=%2Fclientes");
    await page.getByLabel("Correo corporativo").fill(GERENCIA_EMAIL);
    await page.locator('input[type="password"]').fill(GERENCIA_PASSWORD);
    await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
    await page.waitForURL(/\/clientes/, { timeout: 30_000 });
  });

  const ficha = page.getByRole("dialog");

  await test.step("2. Open the demo client's ficha and go to Oportunidades", async () => {
    await page.getByLabel("Buscar clientes").fill("Horizonte Nuevo");
    const card = page.getByRole("article", { name: `Abrir ficha de ${CLIENTE_DEMO}` });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole("button", { name: "Ver detalle" }).click();
    await expect(ficha).toBeVisible();
    await ficha.getByRole("tab", { name: "Oportunidades" }).click();
  });

  await test.step("3. Create a new opportunity (starts in PROSPECCION)", async () => {
    await ficha.getByRole("button", { name: "Nueva oportunidad" }).click();
    const formDialog = page.getByRole("dialog", { name: "Nueva oportunidad" });
    await formDialog.getByLabel(/Nombre/).fill(NOMBRE_OPORTUNIDAD);
    await formDialog.getByRole("button", { name: "Crear oportunidad" }).click();
    await expect(ficha.getByText(NOMBRE_OPORTUNIDAD)).toBeVisible();
  });

  const filaOportunidad = ficha.locator("li", { has: page.getByText(NOMBRE_OPORTUNIDAD) });
  const lifecycle = page.getByRole("dialog", { name: NOMBRE_OPORTUNIDAD });

  await test.step("4. Open the lifecycle view: starts in Prospección, no linked tasks", async () => {
    await filaOportunidad.getByRole("button", { name: `Ver ciclo comercial de ${NOMBRE_OPORTUNIDAD}` }).click();
    await expect(lifecycle).toBeVisible();
    await expect(lifecycle.getByText("Prospección")).toBeVisible();
    await expect(lifecycle.getByText("Sin tareas vinculadas todavía.")).toBeVisible();
    // Not yet GANADA — no Convert action offered.
    await expect(lifecycle.getByRole("button", { name: /Convertir/ })).toHaveCount(0);
  });

  await test.step("5. Link the existing seeded task to this opportunity", async () => {
    await lifecycle.getByRole("combobox").click();
    await page.getByRole("option", { name: TAREA_A_VINCULAR }).click();
    await lifecycle.getByRole("button", { name: "Vincular" }).click();
    await expect(lifecycle.getByText(TAREA_A_VINCULAR)).toBeVisible();
    await expect(lifecycle.getByText("Tareas vinculadas (1)")).toBeVisible();
    await lifecycle.getByRole("button", { name: "Cerrar" }).click();
  });

  await test.step("6. Move the opportunity to PRESENTADA, then GANADA", async () => {
    await filaOportunidad.getByRole("button", { name: `Editar ${NOMBRE_OPORTUNIDAD}` }).click();
    const editDialog = page.getByRole("dialog", { name: "Editar oportunidad" });
    await editDialog.getByRole("combobox").filter({ hasText: "Diseñando propuesta" }).click();
    await page.getByRole("option", { name: "Presentada", exact: true }).click();
    await editDialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(editDialog).toHaveCount(0);

    await filaOportunidad.getByRole("button", { name: `Editar ${NOMBRE_OPORTUNIDAD}` }).click();
    const editDialog2 = page.getByRole("dialog", { name: "Editar oportunidad" });
    await editDialog2.getByRole("combobox").filter({ hasText: "Presentada" }).click();
    await page.getByRole("option", { name: "Ganada", exact: true }).click();
    await editDialog2.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(editDialog2).toHaveCount(0);
  });

  await test.step("7. Convert the GANADA opportunity — fase flips to Ejecución", async () => {
    await filaOportunidad.getByRole("button", { name: `Ver ciclo comercial de ${NOMBRE_OPORTUNIDAD}` }).click();
    await expect(lifecycle).toBeVisible();
    await lifecycle.getByRole("button", { name: /Convertir a ejecución/ }).click();
    await expect(lifecycle.getByText("Ejecución")).toBeVisible();
    // D7/D5: idempotent — the action disappears once already converted.
    await expect(lifecycle.getByRole("button", { name: /Convertir/ })).toHaveCount(0);
    await lifecycle.getByRole("button", { name: "Cerrar" }).click();
    await ficha.getByRole("button", { name: "Cerrar" }).click();
  });

  await test.step("8. The Kanban card for the linked task now shows the Ejecución chip", async () => {
    await page.goto("/tablero");
    const clienteFilter = page.getByRole("combobox").filter({ hasText: "Cliente" });
    await clienteFilter.click();
    await page.getByRole("option", { name: CLIENTE_DEMO }).click();

    const card = page
      .locator('[data-dnd-disabled]', {
        has: page.getByText(TAREA_A_VINCULAR),
      })
      .first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText("Ejecución")).toBeVisible();
    await expect(card.getByText("Prospección")).toHaveCount(0);
  });
});
