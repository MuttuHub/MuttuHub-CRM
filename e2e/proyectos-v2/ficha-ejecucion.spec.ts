import { expect, test, type Page } from "@playwright/test";
import { login, loginToProject } from "./helpers";

// Guide §3, §5, §6, §7, §11 on PRY-2026-001 (EN_EJECUCION). Serial: the expense lifecycle spans roles.
// Every run creates uniquely named expenses/avances so reruns never collide.
const RUN = Date.now();
const DOC_VALIDAR = `E2E-V-${RUN}`;
const DOC_SOBRE = `E2E-S-${RUN}`;
const MOTIVO_RECHAZO = `Soporte ilegible ${RUN}`;
const MOTIVO_ANULA = `Registro duplicado ${RUN}`;
const ARCHIVO = `e2e-soporte-${RUN}.pdf`;

test.describe.configure({ mode: "serial" });

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** The ficha's OUTER tabs (Finanzas also renders an inner Resumen/Gastos/Presupuesto tablist). */
const tab = (page: Page, name: string, selected?: boolean) =>
  page.getByRole("tablist").first().getByRole("tab", { name, exact: true, ...(selected ? { selected: true } : {}) });

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

test("header: semáforos link to tabs; header actions go to Actividades / Finanzas", async ({ page }) => {
  await loginToProject(page, "coordinador", "PRY-2026-001");
  await expect(page.getByRole("heading", { name: "Demo CedeTextil · En ejecución", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /^Semáforo técnico/ }).click();
  await expect(tab(page, "Actividades", true)).toBeVisible();
  await tab(page, "Resumen").click();
  await page.getByRole("button", { name: /^Semáforo financiero/ }).click();
  await expect(tab(page, "Finanzas", true)).toBeVisible();
  await tab(page, "Resumen").click();
  await page.getByRole("button", { name: "Registrar avance", exact: true }).first().click();
  await expect(tab(page, "Actividades", true)).toBeVisible();
  await tab(page, "Resumen").click();
  await page.getByRole("button", { name: "Registrar gasto", exact: true }).first().click();
  await expect(tab(page, "Finanzas", true)).toBeVisible();
});

test("Registrar avance with a generated file → Documentos (Actividades) → opens via signed URL", async ({ page }) => {
  await loginToProject(page, "coordinador", "PRY-2026-001");
  await tab(page, "Actividades").click();
  // 1.4-E2 has target 4 and 0 counted: room for several runs; the form asks for a justification past the target.
  await page.getByRole("button", { name: "Registrar avance 1.4-E2" }).click();
  const form = page.getByRole("form", { name: "Registrar avance 1.4-E2" });
  await form.getByLabel("Cantidad").fill("1");
  const just = form.getByLabel("Justificación del exceso");
  if (await just.isVisible()) await just.fill("Prueba E2E repetida");
  await form.getByLabel("Archivo", { exact: true }).check();
  await form.locator('input[type="file"]').setInputFiles({ name: ARCHIVO, mimeType: "application/pdf", buffer: PDF });
  await form.getByRole("button", { name: "Registrar avance" }).click();
  await expect(page.getByRole("form", { name: "Registrar avance 1.4-E2" })).toBeHidden({ timeout: 30_000 });

  await tab(page, "Documentos").click();
  const grupo = page.getByTestId("documentos-grupo-avance");
  await expect(grupo.getByText("Actividades")).toBeVisible();
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

test("Finanzas (coordinador): es-CO value, bad format error, overspend → Pendiente por revisión", async ({ page }) => {
  await loginToProject(page, "coordinador", "PRY-2026-001");
  await openGastos(page);

  // invalid format
  let form = await registrarGasto(page, { rubro: /R13/, subtotal: "1500000.50", doc: DOC_VALIDAR, tercero: `E2E Proveedor ${RUN}` });
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText(/Ingresa un subtotal válido con máximo dos decimales/)).toBeVisible();

  // valid small expense (to be validated later)
  await form.getByLabel("Subtotal", { exact: true }).fill("10.000,50");
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByRole("form", { name: "Registrar gasto" })).toBeHidden({ timeout: 30_000 });
  const filaV = page.getByRole("row", { name: new RegExp(DOC_VALIDAR) });
  await expect(filaV).toBeVisible();
  await expect(filaV).toContainText("Registrado");
  await expect(filaV).toContainText("10.000");

  // overspend: R11 Varios is assigned only 300.000
  form = await registrarGasto(page, { rubro: /R11/, subtotal: "1.500.000,50", doc: DOC_SOBRE, tercero: `E2E Proveedor ${RUN}` });
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gasto registrado, con avisos" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Entendido" }).click();
  const filaS = page.getByRole("row", { name: new RegExp(DOC_SOBRE) });
  await expect(filaS).toContainText("Supera el asignado");
  await expect(filaS).toContainText("1.500.000");

  // filter
  await page.getByRole("group", { name: "Filtrar gastos" }).getByRole("button", { name: /Pendiente por revisión/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(DOC_SOBRE) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(DOC_VALIDAR) })).toHaveCount(0);

  // coordinador (member) has no validation buttons
  await page.getByRole("group", { name: "Filtrar gastos" }).getByRole("button", { name: /^Todos/ }).click();
  await expect(page.getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar" })).toHaveCount(0);
});

test("gerencia validates one expense and rejects another with a reason; annuls the validated one", async ({ page }) => {
  await loginToProject(page, "gerencia", "PRY-2026-001");
  await openGastos(page);

  const filaV = page.getByRole("row", { name: new RegExp(DOC_VALIDAR) });
  await expect(filaV).toBeVisible();
  await filaV.getByRole("button", { name: "Validar" }).click();
  await expect(filaV).toContainText("Validado", { timeout: 30_000 });

  const filaS = page.getByRole("row", { name: new RegExp(DOC_SOBRE) });
  await filaS.getByRole("button", { name: "Rechazar" }).click();
  const confirmar = filaS.getByRole("button", { name: "Confirmar rechazo" });
  await expect(confirmar).toBeDisabled();
  await filaS.getByLabel("Motivo del rechazo").fill(MOTIVO_RECHAZO);
  await confirmar.click();
  await expect(filaS).toContainText("Rechazado", { timeout: 30_000 });
  await expect(filaS).toContainText(MOTIVO_RECHAZO);

  // annul the validated one
  await filaV.getByRole("button", { name: "Anular" }).click();
  const anular = filaV.getByRole("button", { name: "Confirmar anulación" });
  await expect(anular).toBeDisabled();
  await filaV.getByLabel("Motivo de anulación").fill(MOTIVO_ANULA);
  await anular.click();
  await expect(filaV).toContainText("Anulado", { timeout: 30_000 });
  await expect(filaV).toContainText(MOTIVO_ANULA);
});

test("M7: the coordinador receives the «Gasto rechazado» notification with the reason", async ({ page }) => {
  await login(page, "coordinador", "/proyectos");
  await page.getByRole("button", { name: /^Notificaciones/ }).click();
  const panel = page.getByRole("dialog", { name: "Notificaciones" });
  const item = panel.getByText(new RegExp(`Motivo: ${MOTIVO_RECHAZO}`));
  await expect(item.first()).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("Gasto rechazado").first()).toBeVisible();
});

test("a manager cannot validate their own expense (admin registers, sees «Tú lo registraste»)", async ({ page }) => {
  await loginToProject(page, "admin", "PRY-2026-001");
  await openGastos(page);
  const doc = `E2E-P-${RUN}`;
  const form = await registrarGasto(page, { rubro: /R13/, subtotal: "5.000", doc, tercero: `E2E Propio ${RUN}` });
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  const fila = page.getByRole("row", { name: new RegExp(doc) });
  await expect(fila).toBeVisible({ timeout: 30_000 });
  await expect(fila).toContainText("Tú lo registraste");
  await expect(fila.getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(fila.getByRole("button", { name: "Rechazar" })).toHaveCount(0);
});
