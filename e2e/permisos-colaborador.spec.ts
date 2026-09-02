import { expect, test } from "@playwright/test";

// PR 4 (Slice B2) — UI write-gate end-to-end sentinel.
//
// Pairs with the unit-level gate tests in
//   src/components/kanban/task-card.test.tsx
//   src/components/kanban/task-dialog.test.tsx
//   src/components/crm/client-sheet-write-gate.test.tsx
// to prove the contract on a live browser: a COLABORADOR who lands on
// the global kanban must SEE every task (the read scope is now
// org-wide per PR 3) but must NOT find any control on a foreign task
// — and a direct PATCH against the task API must still be rejected
// with 403, because the server is the authority (PR 2 + design D3/D2).
//
// Seed reference (prisma/seed.ts):
//   PERSONAS[3] = colaborador / Andrés Torres / COLABORADOR
//   TAREAS[2]   = "Revisar contrato marco" / responsableKey: gerencia
//   So this COLABORADOR has NO relation to that task (not the
//   responsable, not the linked client's responsable) — canEditTask
//   returns false, puede_editar is false on the row.
//
// CI only: this spec runs against the running dev server
// (playwright.config.ts has no `webServer` block). Do not run it
// locally without `pnpm dev` first; the brief explicitly defers E2E
// to CI for this slice.

const COLABORADOR_EMAIL = "colaborador@demo.muttuhub.local";
const COLABORADOR_PASSWORD = "MuttuDemo2026!";
const TITULO_FOREIGN = "Revisar contrato marco";

test.describe.configure({ mode: "serial" });

test("COLABORADOR sees every kanban card but no write controls on a foreign task", async ({
  page,
  request,
}) => {
  await test.step("1. Login as COLABORADOR", async () => {
    await page.goto("/login?next=%2Ftablero");
    await page.getByLabel("Correo corporativo").fill(COLABORADOR_EMAIL);
    await page.locator('input[type="password"]').fill(COLABORADOR_PASSWORD);
    await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
    await page.waitForURL(/\/tablero/, { timeout: 30_000 });
  });

  await test.step("2. The foreign GERENCIA task is visible on the global board", async () => {
    // The kanban is global (PR 3 + PR 5) — every role sees every task.
    // The card must render, otherwise PR 4 has nothing to gate on.
    const card = page
      .locator('[data-dnd-disabled]', {
        has: page.getByRole("button", { name: TITULO_FOREIGN }),
      })
      .first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    // And the data-dnd-disabled flag must be "true" — the drag affordance
    // is off. This is the contract the kanban-card.test.tsx unit
    // verifies in jsdom; the e2e proves the same shape reaches the DOM
    // that a real user gets.
    await expect(card).toHaveAttribute("data-dnd-disabled", "true");
    await expect(card).toHaveAttribute("aria-disabled", "true");
  });

  await test.step("3. Opening the card shows a read-only dialog with no destructive controls", async () => {
    // The card body itself is still a button (clickable to open the
    // dialog) — the gate is on the dialog's write affordances, not on
    // the read path.
    const cardBody = page
      .getByRole("button", { name: TITULO_FOREIGN })
      .first();
    await cardBody.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Editar tarea/ }),
    ).toBeVisible();

    // Spec: every editable field MUST be `disabled` and the write-only
    // sub-entity sections (Subtareas / Comentarios / Adjuntos) MUST NOT
    // render. The destructive "Zona de peligro" + its Eliminar tarea
    // button MUST NOT render either.
    await expect(dialog.getByLabel(/Título/)).toBeDisabled();
    await expect(dialog.getByLabel(/Descripción/)).toBeDisabled();
    await expect(
      dialog.getByRole("heading", { name: /Zona de peligro/ }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: /Eliminar tarea/ }),
    ).toHaveCount(0);
    // The submit "Guardar cambios" is hidden, not disabled — see
    // design.md D9 (hide, not disable) and the unit test of the same
    // name.
    await expect(
      dialog.getByRole("button", { name: /Guardar cambios/ }),
    ).toHaveCount(0);
    // The Subtask/Comment/Attachment sections are also write paths.
    await expect(
      dialog.getByRole("heading", { name: /^Subtareas$/ }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("heading", { name: /^Comentarios$/ }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("heading", { name: /^Adjuntos$/ }),
    ).toHaveCount(0);

    // Close the dialog so the rest of the spec can issue the request.
    await dialog.getByRole("button", { name: /Cerrar|Cancelar/ }).click();
    await expect(dialog).toHaveCount(0);
  });

  await test.step("4. The server is the authority: a direct PATCH returns 403 even after the UI gate", async () => {
    // Find the foreign task id by listing tasks (the kanban fetched it
    // already; a fresh list call mirrors what the UI sees and gives us
    // the id without scraping the DOM).
    const list = await request.get("/api/v1/tasks?limit=100");
    expect(list.ok()).toBeTruthy();
    const body = (await list.json()) as {
      items: Array<{ id: string; titulo: string; puede_editar: boolean }>;
    };
    const target = body.items.find((t) => t.titulo === TITULO_FOREIGN);
    expect(target, "seeded foreign task must be in the list").toBeDefined();
    // The UI contract: the server says puede_editar=false. The e2e
    // request below uses the COLABORADOR's session cookie (carried
    // over from the page.request context), so the server must echo
    // the same gate.
    expect(target!.puede_editar).toBe(false);

    // Now the actual server-authority proof: PATCH the foreign task
    // anyway. The server is the authority — a UI gate is not enough.
    const patch = await request.patch(`/api/v1/tasks/${target!.id}`, {
      data: { titulo: "Spoof attempt from e2e" },
    });
    expect(patch.status()).toBe(403);
  });
});
