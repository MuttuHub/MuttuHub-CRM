import { expect, test } from "@playwright/test";

// Narrated rehearsal of the Friday demo's real path: create the first project
// from a GANADA opportunity and watch it land in /proyectos with a real
// `PRY-2026-001` code. Unlike the other project tests, this one does NOT mock
// `fetch`: it drives the real UI against the running dev server and the real
// local Postgres. That is the point — no project row has ever been rendered
// end-to-end until now.
//
// Single ordered test -> single video, same shape as crm-demo.spec.ts:
// login -> empty list -> open dialog -> pick the won opportunity -> complete
// the creation contract by hand -> submit -> assert the row and the
// eligibility invalidation.
//
// Precondition: the database must be in the reset state (zero projects, two
// GANADA opportunities without project). Run
// `npm run db:demo:reset:local -- --apply` before rehearsing; step 4 fails
// with that exact instruction when the state is dirty.

const GERENCIA_EMAIL = "gerencia@demo.muttuhub.local";
const GERENCIA_PASSWORD = "MuttuDemo2026!";

// Seeded in prisma/seed.ts. The demo converts the first one; the second must
// stay eligible so the invalidation assertion has something to compare against.
const OPP_NOMBRE = "Renovación convenio de investigación aplicada";
const OPP_CLIENTE = "Universidad Central del Valle";
const OPP_VALOR = "180000000";
const OPP_RESTANTE = "Informe de impacto — cooperación 2027";

// The dialog prefills the signed-in user; the operator hands the project over.
const RESPONSABLE = "Laura Jiménez";

// Deliberate "reading time" between beats, like crm-demo.spec.ts, so the video
// reads as a person working instead of a bot blur (slowMo already slows every
// action; these pauses are the section breaks).
async function beat(page: import("@playwright/test").Page, ms = 1600) {
  await page.waitForTimeout(ms);
}

test.describe.configure({ mode: "serial" });

// Cold Turbopack routes on the shared 9p mount can take 30-60s to compile, and
// this spec deliberately pauses between beats for the recording.
test.setTimeout(240_000);

test("Projects demo: convert a won opportunity into PRY-2026-001 and see it listed", async ({
  page,
}) => {
  await test.step("1. Login as gerencia (full project access)", async () => {
    // ?next=/proyectos sends the redirect straight to the module, so this
    // navigation also satisfies "go to /proyectos".
    await page.goto("/login?next=%2Fproyectos", { timeout: 90_000 });
    await page.getByLabel("Correo corporativo").fill(GERENCIA_EMAIL);
    // Not getByLabel("Contraseña"): the show/hide toggle shares that <label>
    // wrapper, so the accessible-name match is ambiguous. The password field
    // is the only one on the page.
    await page.locator('input[type="password"]').fill(GERENCIA_PASSWORD);
    // Not a plain name match: the "Entrar"/"Solicitar acceso" tab above the
    // form also renders a button named "Entrar". Scope to the real submit.
    await page.locator('button[type="submit"]', { hasText: "Entrar" }).click();
    await page.waitForURL(/\/proyectos/, { timeout: 60_000 });
  });

  await test.step("2. The list renders its heading and the truthful empty state", async () => {
    // The h1 comes from the app shell's PAGE_HEADERS, not from the page file.
    await expect(
      page.getByRole("heading", { level: 1, name: "Proyectos" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("0 proyectos")).toBeVisible();
    // gerencia can view the portfolio, so this is the "no data yet" copy (not
    // the role-scoped one).
    await expect(page.getByText("Todavía no hay proyectos")).toBeVisible({
      timeout: 20_000,
    });
    await beat(page, 2400); // let the viewer read that the portafolio is empty
  });

  await test.step("3. Open the creation dialog (origin defaults to the won opportunity)", async () => {
    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Nuevo proyecto" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Desde una oportunidad ganada" }),
    ).toHaveAttribute("aria-pressed", "true");
    await beat(page, 1500);
  });

  const oppButton = page.getByRole("button", { name: new RegExp(OPP_NOMBRE) });

  await test.step("4. Guard the precondition: at least one eligible won opportunity", async () => {
    // The dialog renders "No hay oportunidades ganadas sin proyecto." both while
    // the eligible query is in flight and when it resolves empty, so never
    // accept that message as final: wait for the eligible card first and only
    // read the placeholder after the card never showed up.
    try {
      await expect(oppButton).toBeVisible({ timeout: 45_000 });
    } catch {
      await expect(
        page.getByText("No hay oportunidades ganadas sin proyecto."),
      ).toBeVisible({ timeout: 10_000 });
      throw new Error(
        'Precondition failed: the dialog shows "No hay oportunidades ganadas sin proyecto.". ' +
          "The local database is not in the demo reset state. Run " +
          "`npm run db:demo:reset:local -- --apply` before rehearsing, then re-run this spec.",
      );
    }
    await beat(page, 1200);
  });

  await test.step("5. Choose the opportunity and assert the real prefills", async () => {
    await oppButton.click();
    await expect(oppButton).toHaveAttribute("aria-pressed", "true");
    // Nombre and Valor total are prefilled from the opportunity row, Cliente is
    // shown as resolved text (the E-05 path takes the client from the URL).
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(
      OPP_NOMBRE,
    );
    await expect(page.getByLabel("Valor total")).toHaveValue(OPP_VALOR);
    await expect(page.getByText(OPP_CLIENTE, { exact: true }).first()).toBeVisible();
    await beat(page, 2000); // let the prefills register on camera
  });

  await test.step("6. Complete the creation contract by hand", async () => {
    // Responsable: confirm/adjust the operator's default with the real Select.
    await page.getByRole("combobox", { name: "Responsable" }).click();
    await beat(page, 600);
    await page.getByRole("option", { name: RESPONSABLE }).click();
    await expect(page.getByRole("combobox", { name: "Responsable" })).toContainText(
      RESPONSABLE,
    );
    await beat(page, 800);

    // The seeded catalog's first row (Empleabilidad) starts included and
    // principal; move the principal flag to Emprendimiento the way a person
    // would, leaving exactly one principal line.
    await expect(page.getByLabel("Principal Empleabilidad")).toBeChecked();
    await page.getByLabel("Principal Empleabilidad").click();
    await page.getByLabel("Principal Emprendimiento").click();
    await expect(page.getByLabel("Principal Emprendimiento")).toBeChecked();
    await beat(page, 900);

    // At least one municipio is required.
    await page.getByLabel("Municipio Medellín").click();
    await expect(page.getByLabel("Municipio Medellín")).toBeChecked();
    await beat(page, 700);

    // The dates keep their prefill; the operator does not touch them.
    await expect(page.getByLabel("Fecha de inicio")).not.toHaveValue("");
    await expect(page.getByLabel("Fecha de fin")).not.toHaveValue("");
    await beat(page, 900);
  });

  await test.step("7. Submit and assert the demo's promise with real data", async () => {
    await page.getByRole("button", { name: "Crear proyecto" }).click();

    // The dialog closes only after the POST round-trips through the real API.
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 45_000 });
    await beat(page, 1500);

    // The real, persisted row: allocated code, real client and BORRADOR state.
    const row = page.getByRole("row", { name: /PRY-2026-001/ });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(OPP_NOMBRE);
    await expect(row).toContainText(OPP_CLIENTE);
    await expect(row).toContainText("Borrador");
    await beat(page, 2600); // let the viewer read the first project in the list

    // The conversion invalidated the eligible list: reopen the dialog and prove
    // the opportunity just used is gone while the untouched one stays.
    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(OPP_RESTANTE)).toBeVisible({ timeout: 20_000 });
    await expect(oppButton).toHaveCount(0, { timeout: 20_000 });
    await beat(page, 2000);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await beat(page, 1200);
  });
});
