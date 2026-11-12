import { expect, test, type Page } from "@playwright/test";
import { loginToProject } from "./helpers";

// Guide §3, §5, §6, §7, §11 on PRY-2026-001 (EN_EJECUCION). Serial: the expense lifecycle spans roles.
// AJ-08 removed the approval step: a registered expense already counts as executed and the only correction is
// Anular, with a motivo. Every run creates uniquely named expenses/avances so reruns never collide.
const RUN = Date.now();
const DOC_PROPIO = `E2E-V-${RUN}`;
const DOC_SOBRE = `E2E-S-${RUN}`;
const MOTIVO_ANULA = `Registro duplicado ${RUN}`;
const ARCHIVO = `e2e-soporte-${RUN}.pdf`;

test.describe.configure({ mode: "serial" });

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** The ficha's OUTER tabs (Finanzas also renders an inner Resumen/Gastos/Presupuesto tablist). */
const tab = (page: Page, name: string, selected?: boolean) =>
  // «Documentos · N» carries its count (T10 C6): match the name with or without it.
  page
    .getByRole("tablist")
    .first()
    .getByRole("tab", { name: new RegExp(`^${name}( · \\d+)?$`), ...(selected ? { selected: true } : {}) });

async function openGastos(page: Page) {
  await tab(page, "Finanzas").click();
  await page.getByRole("tab", { name: "Gastos" }).click();
}

async function registrarGasto(
  page: Page,
  v: { rubro: RegExp; subtotal: string; doc: string; tercero: string },
) {
  await page.getByTestId("gastos").getByRole("button", { name: "Registrar gasto" }).click();
  const form = page.getByRole("form", { name: "Registrar gasto" });
  await form.getByLabel("Rubro").selectOption({ label: (await form.getByLabel("Rubro").locator("option").allTextContents()).find((t) => v.rubro.test(t))! });
  // AJ-04: the total is Subtotal + IVA; IVA starts at 0, so the total equals the subtotal here.
  await form.getByLabel("Subtotal", { exact: true }).fill(v.subtotal);
  await form.getByLabel("Fecha del documento").fill(new Date().toISOString().slice(0, 10));
  await form.getByLabel("Número de documento").fill(v.doc);
  await form.getByLabel("Tercero", { exact: true }).fill(v.tercero);
  // Without the third party's id the expense is «Datos incompletos» (observed, cannot be validated).
  await form.getByLabel("Tipo de identificación").selectOption("NIT");
  await form.getByLabel("Número de identificación").fill("900123456");
  await form.getByLabel("Descripción").fill(`Gasto de prueba E2E ${v.doc}`);
  await form.getByLabel("Enlace").check();
  await form.getByLabel("URL").fill("https://example.com/soporte-e2e.pdf");
  await form.getByLabel("Nombre del enlace").fill(`Soporte ${v.doc}`);
  return form;
}

test("header: semáforos link to tabs; header actions open their dialogs on any tab (S9)", async ({ page }) => {
  await loginToProject(page, "coordinador", "PRY-2026-001");
  await expect(page.getByRole("heading", { name: "Demo CedeTextil · Programa de confección", level: 1 })).toBeVisible();
  // The Resumen carries the colours in its three figures, so the header chips stay out of it (T5).
  await expect(page.getByRole("button", { name: /^Semáforo técnico/ })).toHaveCount(0);
  await tab(page, "Actividades").click();
  await page.getByRole("button", { name: /^Semáforo financiero/ }).click();
  await expect(tab(page, "Finanzas", true)).toBeVisible();
  await page.getByRole("button", { name: /^Semáforo técnico/ }).click();
  await expect(tab(page, "Actividades", true)).toBeVisible();
  // «Registrar avance» / «Registrar gasto» open a dialog on top of the current tab, without switching it.
  for (const pestana of ["Resumen", "Documentos"]) {
    await tab(page, pestana).click();
    await page.getByRole("button", { name: "Registrar avance", exact: true }).first().click();
    const avance = page.getByRole("dialog", { name: "Registrar avance" });
    await expect(avance.getByLabel("Actividad", { exact: true })).toBeVisible();
    await expect(avance.getByTestId("registrar-avance-resumen")).toContainText("% registrado · tope");
    await expect(avance.getByRole("button", { name: "Guardar avance" })).toBeVisible();
    await avance.getByRole("button", { name: "Cancelar" }).click();
    await expect(avance).toBeHidden();
    await expect(tab(page, pestana, true)).toBeVisible();

    await page.getByRole("button", { name: "Registrar gasto", exact: true }).first().click();
    const gasto = page.getByRole("dialog", { name: "Registrar gasto" });
    await expect(gasto.getByRole("form", { name: "Registrar gasto" }).getByLabel("Rubro")).toBeVisible();
    await gasto.getByRole("button", { name: "Cancelar" }).click();
    await expect(gasto).toBeHidden();
    await expect(tab(page, pestana, true)).toBeVisible();
  }
});

test("Registrar avance with a generated file → Documentos (Actividades) → opens via signed URL", async ({ page }) => {
  await loginToProject(page, "coordinador", "PRY-2026-001");
  await tab(page, "Actividades").click();
  // 1.4-E2 has target 4 and 0 counted: room for several runs; the form asks for a justification past the target.
  // The deliverables of an activity in progress start folded: unfold them first.
  if (!(await page.getByRole("button", { name: "Registrar cantidad 1.4-E2" }).isVisible())) {
    await page.getByRole("button", { name: /^Ver \d+ entregables?$/ }).filter({ visible: true }).last().click();
  }
  await page.getByRole("button", { name: "Registrar cantidad 1.4-E2" }).click();
  const form = page.getByRole("form", { name: "Registrar cantidad 1.4-E2" });
  await form.getByLabel("Cantidad").fill("1");
  const just = form.getByLabel("Justificación del exceso");
  if (await just.isVisible()) await just.fill("Prueba E2E repetida");
  await form.getByLabel("Archivo", { exact: true }).check();
  await form.locator('input[type="file"]').setInputFiles({ name: ARCHIVO, mimeType: "application/pdf", buffer: PDF });
  await form.getByRole("button", { name: "Registrar cantidad" }).click();
  await expect(page.getByRole("form", { name: "Registrar cantidad 1.4-E2" })).toBeHidden({ timeout: 30_000 });

  await tab(page, "Documentos").click();
  const grupo = page.getByTestId("documentos-grupo-avance");
  await expect(grupo.getByRole("heading", { name: /^Soportes de entregables/ })).toBeVisible();
  const fila = grupo.getByTestId("documento-fila").filter({ hasText: ARCHIVO });
  await expect(fila).toBeVisible({ timeout: 30_000 });

  // search + filter
  await page.getByLabel("Buscar por nombre").fill("zzz-no-existe");
  await expect(page.getByText("No hay documentos con este filtro.")).toBeVisible();
  await page.getByLabel("Buscar por nombre").fill(ARCHIVO);
  await expect(fila).toBeVisible();

  // open: the download route answers 200 with a signed URL that itself resolves
  const [resp] = await Promise.all([
    page.waitForResponse((r) => /\/attachments\/.+\/download/.test(r.url())),
    fila.getByRole("button", { name: "Abrir" }).click(),
  ]);
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  const payload = body.data ?? body;
  expect(payload.tipo).toBe("archivo");
  expect(payload.url).toBeTruthy();
  const file = await page.request.get(payload.url);
  expect(file.status()).toBe(200);
});

test("Finanzas (coordinador): es-CO value, bad format error and an overspend that saves with the alert (AJ-08)", async ({ page }) => {
  await loginToProject(page, "coordinador", "PRY-2026-001");
  await openGastos(page);

  // invalid format
  let form = await registrarGasto(page, { rubro: /R13/, subtotal: "1500000.50", doc: DOC_PROPIO, tercero: `E2E Proveedor ${RUN}` });
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText(/Ingresa un subtotal válido con máximo dos decimales/)).toBeVisible();

  // valid small expense
  await form.getByLabel("Subtotal", { exact: true }).fill("10.000,50");
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByRole("form", { name: "Registrar gasto" })).toBeHidden({ timeout: 30_000 });
  const filaPropia = page.getByRole("row", { name: new RegExp(DOC_PROPIO) });
  await expect(filaPropia).toBeVisible();
  await expect(filaPropia).toContainText("Registrado");
  await expect(filaPropia).toContainText("10.000");

  // overspend: R11 Varios is assigned only 300.000. AJ-08: it saves with the alert and counts as executed.
  form = await registrarGasto(page, { rubro: /R11/, subtotal: "1.500.000,50", doc: DOC_SOBRE, tercero: `E2E Proveedor ${RUN}` });
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gasto registrado, con avisos" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Entendido" }).click();
  const fila = page.getByRole("row", { name: new RegExp(DOC_SOBRE) });
  await expect(fila).toContainText("Supera lo asignado");
  await expect(fila).toContainText("1.500.000");

  // No approval any more: only Todos / Registrado / Anulado, and no «Revisar» for a member.
  const filtros = page.getByRole("group", { name: "Filtrar gastos" });
  await expect(filtros.getByRole("button", { name: /^Registrado/ })).toBeVisible();
  await expect(filtros.getByRole("button", { name: /^Validado/ })).toHaveCount(0);
  await expect(filtros.getByRole("button", { name: /^Rechazado/ })).toHaveCount(0);
  await expect(filtros.getByRole("button", { name: /Pendiente por revisión/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Revisar el gasto/ })).toHaveCount(0);

  await filtros.getByRole("button", { name: /^Registrado/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(DOC_SOBRE) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(DOC_PROPIO) })).toBeVisible();
});

test("gerencia annuls a registered expense with a motivo, which drops it from the executed total", async ({ page }) => {
  await loginToProject(page, "gerencia", "PRY-2026-001");
  await openGastos(page);

  const fila = page.getByRole("row", { name: new RegExp(DOC_PROPIO) });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText("Registrado");

  // AJ-08: a REGISTRADO expense is already executed, so the manager can annul it directly.
  await fila.getByRole("button", { name: "Anular" }).click();
  const anular = fila.getByRole("button", { name: "Confirmar anulación" });
  await expect(anular).toBeDisabled();
  await fila.getByLabel("Motivo de anulación").fill(MOTIVO_ANULA);
  await anular.click();
  await expect(fila).toContainText("Anulado", { timeout: 30_000 });
  await expect(fila).toContainText(MOTIVO_ANULA);
  // The row is kept: an annulled expense never disappears from the ledger.
  await expect(page.getByRole("row", { name: new RegExp(DOC_PROPIO) })).toBeVisible();
});
