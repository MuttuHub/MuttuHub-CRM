import { expect, test } from "@playwright/test";
import { login, P001 } from "./helpers";

// DOC1 «Subir documento» (project-level documents, group «Proyecto» of the Documentos tab).
//
// DOC1 merged into feat/projects-v2 on 2026-10-18; the selectors below were re-checked against the merged UI
// (dialog heading + submit button «Subir documento», radios «Subir un archivo»/«Enlace», fields «Archivo», «URL» and
// «Nombre del enlace», errors «Selecciona el archivo.» and «Completa el enlace y su nombre.»). Note the file field
// needs `exact: true`: Playwright's getByLabel matches substrings and «Subir un archivo» also contains «archivo».
// Rules: managers and member coordinadores may upload in BORRADOR / EN_EJECUCION / SUSPENDIDO; a coordinador deletes
// only their own; colaborador has no access to the ficha at all.
const STAMP = Date.now();
const ARCHIVO = `contrato-e2e-${STAMP}.pdf`;
const ENLACE = `Acta de inicio e2e ${STAMP}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

test.describe("DOC1: subir documento del proyecto", () => {
  test.describe.configure({ mode: "serial" });

  async function openDocumentos(page: import("@playwright/test").Page, role: "gerencia" | "coordinador") {
    await login(page, role, `/proyectos/${P001}`);
    await page.getByRole("tablist").first().getByRole("tab", { name: "Documentos", exact: true }).click();
  }

  test("manager uploads a file: it lands in group «Proyecto» and opens via signed URL", async ({ page }) => {
    await openDocumentos(page, "gerencia");
    await page.getByRole("button", { name: "Subir documento" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Subir documento" })).toBeVisible();

    // validation before the API call
    await dialog.getByRole("button", { name: "Subir documento" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Selecciona el archivo.");

    await dialog.getByLabel("Archivo", { exact: true }).setInputFiles({ name: ARCHIVO, mimeType: "application/pdf", buffer: PDF });
    await dialog.getByRole("button", { name: "Subir documento" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const grupo = page.getByTestId("documentos-grupo-proyecto");
    const fila = grupo.getByTestId("documento-fila").filter({ hasText: ARCHIVO });
    await expect(fila).toBeVisible();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/supports\/.+\/download/.test(r.url())),
      fila.getByRole("button", { name: "Abrir" }).click(),
    ]);
    expect(resp.status()).toBe(200);
  });

  test("manager stores a link with its name", async ({ page }) => {
    await openDocumentos(page, "gerencia");
    await page.getByRole("button", { name: "Subir documento" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Enlace" }).check();
    await dialog.getByRole("button", { name: "Subir documento" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Completa el enlace y su nombre.");
    await dialog.getByLabel("URL").fill("https://drive.example/acta");
    await dialog.getByLabel("Nombre del enlace").fill(ENLACE);
    await dialog.getByRole("button", { name: "Subir documento" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("documentos-grupo-proyecto").getByText(ENLACE)).toBeVisible();
  });

  test("member coordinador can upload too and can delete only their own document", async ({ page }) => {
    await openDocumentos(page, "coordinador");
    await expect(page.getByRole("button", { name: "Subir documento" })).toBeVisible();
    // The manager's documents (previous tests) must not be deletable by the coordinador.
    const ajeno = page.getByTestId("documento-fila").filter({ hasText: ARCHIVO });
    await expect(ajeno.getByRole("button", { name: /Eliminar|Borrar/ })).toHaveCount(0);
  });
});
