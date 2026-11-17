import ExcelJS from "exceljs";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { login, type Role } from "./helpers";

// Acceptance of the PO document «Hub-proyectos261110» on screen: one test per «Se acepta si» criterion
// (odd/tasks/e2e-aceptacion-po-261110.md, S1–S35). The spec builds its own project with exact numbers, so the
// criteria's figures (4 of 30 weeks, $15.000.000 + $8.000.000, saldo $3.000.000, …) are the ones on screen.
//
// The clock is the real one (Bogotá), so the project is anchored on today: it starts on the Monday on or before
// today − 70 days and runs 20 weeks. Today then falls in week 11 or 12, the previous month is closed, the current
// month is the report period and the next one is a future month. Run in November 2026, the PO's own dates come out
// (October closed, «28 de octubre», «3 de noviembre», November → December); on any other date the same rules are
// checked one month later.
//
// Weeks (week n starts on INICIO + 7(n-1)); the technical weight is the duration in weeks:
//   O1  A1.1 weeks 9–12 (4)   R04 Promoción y divulgación 2.000.000
//       A1.2 weeks 7–14 (8)   R08 Formación 15.000.000 · R12 Transporte 8.000.000
//       A1.3 weeks 5–10 (6)   R12 Transporte 5.000.000
//   O2  A2.1 weeks 9–16 (8)   R01 Personal 10.000.000
//       A2.2 weeks 15–18 (4)  R13 Suministros 3.000.000
//   Gestión del proyecto: T1 TRANSVERSAL weeks 1–17 (17) R01 Personal 6.800.000
// Normal weights add up to 30 weeks, as in AJ-07's example; T1 has the 17 weeks of EV-02's example.

const RUN = Date.now();
const hoyIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const lunesEnOAntes = (iso: string) => sumarDias(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
const mesActual = () => hoyIso().slice(0, 7);
const mesSiguiente = (periodo: string) => {
  const [y, m] = periodo.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const mesAnterior = (periodo: string) => {
  const [y, m] = periodo.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «nov 2026», as the grid headers and the curve table write a month. */
const mesCorto = (periodo: string) => `${MESES_CORTOS[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}`;
const mesLargo = (periodo: string) => `${MESES_LARGOS[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}`;
/** The months of [inicio, fin] as YYYY-MM. */
const mesesEntre = (inicio: string, fin: string) => {
  const meses = [inicio.slice(0, 7)];
  while (meses[meses.length - 1] < fin.slice(0, 7)) meses.push(mesSiguiente(meses[meses.length - 1]));
  return meses;
};
const filaMes = (mes: string) => new RegExp(`^${mesCorto(mes)}`);

const FECHA_INICIO = lunesEnOAntes(sumarDias(hoyIso(), -70));
const FECHA_FIN = sumarDias(FECHA_INICIO, 20 * 7 - 1);
const ACTUAL = mesActual();
const ANTERIOR = mesAnterior(ACTUAL);

test.describe.configure({ mode: "serial" });

type Ctx = { page: Page; close: () => Promise<void> };

/** A page logged in as `role`, in its own browser context (page.request carries that role's cookies). */
async function como(browser: Browser, role: Role): Promise<Ctx> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, role, "/proyectos");
  return { page, close: () => context.close() };
}

async function api<T>(page: Page, method: "GET" | "POST" | "PUT" | "PATCH", url: string, data?: unknown): Promise<T> {
  const res = await page.request.fetch(url, { method, data: data === undefined ? undefined : data });
  const body = await res.text();
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()}: ${body}`);
  return (body ? JSON.parse(body) : {}) as T;
}

/** «$ 15.000.000» with any kind of space after the sign. */
const cop = (monto: number) => new RegExp(`\\$\\s?${monto.toLocaleString("de-DE")}(?!\\d)`);

const OBJETIVOS = [
  ["O1", "Fortalecer las capacidades productivas"],
  ["O2", "Consolidar la operación comercial"],
];
const ACTIVIDADES: [string, string, string, number, number, string][] = [
  ["A1.1", "O1", "Campaña de convocatoria", 9, 12, "Normal"],
  ["A1.2", "O1", "Taller de formación técnica", 7, 14, "Normal"],
  ["A1.3", "O1", "Visitas a unidades productivas", 5, 10, "Normal"],
  ["A2.1", "O2", "Acompañamiento comercial", 9, 16, "Normal"],
  ["A2.2", "O2", "Dotación de puntos de venta", 15, 18, "Normal"],
  ["T1", "", "Coordinación del proyecto", 1, 17, "Transversal"],
];
const PRESUPUESTO: [string, string, number][] = [
  ["A1.1", "R04", 2_000_000],
  ["A1.2", "R08", 15_000_000],
  ["A1.2", "R12", 8_000_000],
  ["A1.3", "R12", 5_000_000],
  ["A2.1", "R01", 10_000_000],
  ["A2.2", "R13", 3_000_000],
  ["T1", "R01", 6_800_000],
];

let proyectoId = "";

/** Fill the template the app generated for this project and return the xlsx bytes. */
async function plantillaLlena(plantilla: Buffer, presupuesto: [string, string, number][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(plantilla as never);
  const llenar = (nombre: string, filas: (string | number)[][]) => {
    const hoja = wb.getWorksheet(nombre);
    if (!hoja) throw new Error(`template without sheet ${nombre}`);
    for (let r = hoja.actualRowCount; r >= 2; r--) hoja.spliceRows(r, 1);
    filas.forEach((fila, i) => {
      const row = hoja.getRow(i + 2);
      fila.forEach((valor, c) => (row.getCell(c + 1).value = valor));
      row.commit();
    });
  };
  llenar("3. Objetivos", OBJETIVOS);
  llenar(
    "4. Actividades",
    ACTIVIDADES.map(([codigo, objetivo, nombre, inicio, fin, tipo]) => [codigo, objetivo, nombre, inicio, fin, "", tipo]),
  );
  llenar(
    "5. Entregables",
    ACTIVIDADES.map(([codigo], i) => [`E${i + 1}`, codigo, `Informe de ${codigo}`, 1, "Informe"]),
  );
  llenar("7. Presupuesto", presupuesto);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function abrirImportar(page: Page): Promise<Locator> {
  await page.goto(`/proyectos/${proyectoId}`);
  await page.getByRole("tablist").first().getByRole("tab", { name: /^Actividades/ }).click();
  // An empty structure offers «Cargar desde Excel»; one with objectives, «Importar plantilla». Same dialog.
  await page.getByRole("button", { name: /^(Importar plantilla|Cargar desde Excel)$/ }).first().click();
  return page.getByRole("dialog", { name: "Importar plantilla de proyecto" });
}

async function subirPlantilla(dialog: Locator, bytes: Buffer) {
  await dialog.locator('input[type="file"]').setInputFiles({
    name: `plantilla-${RUN}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await dialog.getByRole("button", { name: "Validar plantilla" }).click();
}

async function abrirProgramacion(page: Page): Promise<Locator> {
  await page.goto(`/proyectos/${proyectoId}`);
  await page.getByRole("tablist").first().getByRole("tab", { name: /^Finanzas/ }).click();
  await page.getByRole("tab", { name: "Presupuesto" }).click();
  const grid = page.getByTestId("programacion-grid");
  await expect(grid).toBeVisible({ timeout: 60_000 });
  return grid;
}

let plantillaBase: Buffer;

test.beforeAll(async ({ browser }) => {
  // The coordinador creates the project, so it is its responsable and member: the «Gestor» of the PO's text.
  const gestor = await como(browser, "coordinador");
  try {
    const { items: clientes } = await api<{ items: { id: string }[] }>(gestor.page, "GET", "/api/v1/clients");
    const { lineas } = await api<{ lineas: { id: string }[] }>(gestor.page, "GET", "/api/v1/strategic-lines");
    const { municipios } = await api<{ municipios: { id: string }[] }>(gestor.page, "GET", "/api/v1/municipalities");
    const { proyecto } = await api<{ proyecto: { id: string } }>(gestor.page, "POST", "/api/v1/projects", {
      nombre: `E2E aceptación PO 261110 · ${RUN}`,
      cliente_id: clientes[0].id,
      lineas: [{ id: lineas[0].id, principal: true }],
      municipio_ids: [municipios[0].id],
      fecha_inicio: FECHA_INICIO,
      fecha_fin: FECHA_FIN,
      beneficiarios_meta: 40,
    });
    proyectoId = proyecto.id;
    const res = await gestor.page.request.get(`/api/v1/projects/${proyectoId}/template`);
    expect(res.ok(), await res.text().catch(() => "")).toBeTruthy();
    plantillaBase = Buffer.from(await res.body());
  } finally {
    await gestor.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// EV-01 · EV-02 · EV-03: the template import, the budget per activity line and the proposed programming
// ---------------------------------------------------------------------------------------------------------------

test("S18 EV-01 «Una plantilla con la misma actividad y rubro en dos filas se rechaza con fila y columna.»", async ({ page }) => {
  await login(page, "coordinador");
  const dialog = await abrirImportar(page);
  // Row 4 of «7. Presupuesto» repeats A1.2 + R08 (row 3).
  const conDuplicado = await plantillaLlena(plantillaBase, [...PRESUPUESTO.slice(0, 2), ["A1.2", "R08", 1_000_000], ...PRESUPUESTO.slice(2)]);
  await subirPlantilla(dialog, conDuplicado);
  // The only error is the repeated line, on row 4, column B of «7. Presupuesto» (the template's total is the
  // 0 a new project comes with: EV-01 never asks to type it).
  await expect(dialog.getByRole("alert")).toContainText("La plantilla tiene 1 error", { timeout: 60_000 });
  await expect(dialog.getByRole("heading", { name: "7. Presupuesto · 1 error" })).toBeVisible();
  const fila = dialog.getByRole("row").filter({ hasText: "ya tiene el rubro" });
  await expect(fila).toHaveCount(1);
  await expect(fila.getByRole("cell").nth(0)).toHaveText("4");
  await expect(fila.getByRole("cell").nth(1)).toHaveText("B");
  await expect(fila.getByRole("cell").nth(3)).toHaveText(
    "La actividad «A1.2» ya tiene el rubro «R08» en la fila 3: cada combinación de actividad y rubro va en una sola fila.",
  );
  await expect(dialog.getByRole("button", { name: "Confirmar importación" })).toHaveCount(0);
});

test("S17 EV-01 «Una actividad con Formación $15.000.000 y Transporte $8.000.000 aparece con las dos líneas, y esos valores suman en sus rubros.» + S21 EV-03 «Al importar la plantilla, todas las líneas tienen una programación propuesta que suma su valor.»", async ({ page }) => {
  await login(page, "coordinador");
  const dialog = await abrirImportar(page);
  await subirPlantilla(dialog, await plantillaLlena(plantillaBase, PRESUPUESTO));
  await expect(dialog.getByText("La plantilla es válida.")).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  const grid = await abrirProgramacion(page);
  // S17: A1.2 has its two lines.
  const filas = grid.getByTestId("programacion-fila");
  await expect(filas).toHaveCount(PRESUPUESTO.length);
  await expect(filas.filter({ hasText: "A1.2" })).toHaveCount(2);
  await expect(filas.filter({ hasText: "A1.2" }).filter({ hasText: "R08" })).toBeVisible();
  await expect(filas.filter({ hasText: "A1.2" }).filter({ hasText: "R12" })).toBeVisible();

  // S17: the rubro totals on top are the sum of the lines (Formación 15M; Transporte 8M + 5M of A1.3).
  const totales = page.getByTestId("programacion-totales");
  await expect(totales.getByRole("row").filter({ hasText: "Formación" }).getByRole("cell").last()).toHaveText(cop(15_000_000));
  await expect(totales.getByRole("row").filter({ hasText: "Transporte" }).getByRole("cell").last()).toHaveText(cop(13_000_000));

  // S21: every line comes with a proposal that adds up to its value — nothing left to program.
  for (let i = 0; i < PRESUPUESTO.length; i++) {
    await expect(filas.nth(i).getByRole("cell").last()).toHaveText(cop(0));
  }
  await expect(totales.getByRole("row").filter({ hasText: /^Total/ }).getByRole("cell").last()).toHaveText(
    cop(PRESUPUESTO.reduce((s, [, , v]) => s + v, 0)),
  );
});

test("S22 EV-03 «Al editar un mes, el total por rubro y por mes de arriba se actualiza.» + S23 «No se puede confirmar si alguna línea tiene un valor pendiente por programar.»", async ({ page }) => {
  await login(page, "coordinador");
  await abrirProgramacion(page);
  const totales = page.getByTestId("programacion-totales");
  const formacion = totales.getByRole("row").filter({ hasText: "Formación" });
  const antes = await formacion.getByRole("cell").last().textContent();
  expect(antes).toMatch(cop(15_000_000));

  // Lower A1.2 Formación's current month by 1.000.000 without saving.
  // A1.2 runs from about four weeks before today to four weeks after: the current month always has Formación.
  const celda = page.getByLabel(`Programado A1.2 R08 ${mesCorto(ACTUAL)}`, { exact: true });
  await celda.click();
  const valor = Number((await celda.inputValue()).replace(/\D/g, "")) / ((await celda.inputValue()).includes(",") ? 100 : 1);
  await celda.fill(String(valor - 1_000_000));
  await celda.blur();

  // S22: the rubro total and the month total on top change before saving.
  await expect(formacion.getByRole("cell").last()).toHaveText(cop(14_000_000));
  // S23: a line with 1.000.000 still to program cannot be confirmed.
  await expect(page.getByTestId("programacion-fila").filter({ hasText: "A1.2" }).filter({ hasText: "R08" }).getByRole("cell").last()).toHaveText(
    cop(1_000_000),
  );
  const guardado = page.waitForResponse((r) => r.url().endsWith("/programming") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "Guardar programación" }).click();
  expect((await guardado).ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: "Confirmar programación" })).toBeDisabled();
  // And the server refuses it too.
  const res = await page.request.post(`/api/v1/projects/${proyectoId}/programming/confirm`);
  expect(res.status()).toBe(409);

  // Put the million back and confirm: «Falta por programar» is $0 everywhere again.
  await celda.click();
  await celda.fill(String(valor));
  await celda.blur();
  await page.getByRole("button", { name: "Guardar programación" }).click();
  await expect(page.getByRole("button", { name: "Confirmar programación" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar programación" }).click();
  await expect(page.getByText("Programación confirmada")).toBeVisible({ timeout: 30_000 });
});

test("baseline: Gerencia approves the line base, the project runs", async ({ browser }) => {
  const gerencia = await como(browser, "gerencia");
  try {
    await api(gerencia.page, "POST", `/api/v1/projects/${proyectoId}/baseline/approve`);
  } finally {
    await gerencia.close();
  }
});

test("S20 EV-02 «La actividad transversal aparece en el grupo “Gestión del proyecto” …» (structure)", async ({ page }) => {
  await login(page, "coordinador");
  await page.goto(`/proyectos/${proyectoId}`);
  await page.getByRole("tablist").first().getByRole("tab", { name: /^Actividades/ }).click();
  const lista = page.getByRole("tabpanel", { name: "Lista" });
  const grupo = lista.getByText("Gestión del proyecto").first();
  await expect(grupo).toBeVisible({ timeout: 30_000 });
  await expect(lista.getByText("Coordinación del proyecto").first()).toBeVisible();
});

// ---------------------------------------------------------------------------------------------------------------
// Shared screen helpers of the execution part
// ---------------------------------------------------------------------------------------------------------------

/** «24,7 %» as the es-CO formatter writes it (one decimal at most). */
const pctTexto = (valor: number) => `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(valor)} %`;

const pestana = (page: Page, nombre: string) =>
  page.getByRole("tablist").first().getByRole("tab", { name: new RegExp(`^${nombre}( · \\d+)?$`) });

async function abrirFicha(page: Page, role: Role, id = proyectoId) {
  await login(page, role, "/proyectos");
  await page.goto(`/proyectos/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
}

async function abrirFinanzas(page: Page, segmento: "Resumen" | "Gastos" | "Presupuesto") {
  await pestana(page, "Finanzas").click();
  await page.getByRole("tabpanel", { name: "Finanzas" }).getByRole("tab", { name: new RegExp(`^${segmento}`) }).click();
}

/** Select the option whose visible text matches, whatever its value is. */
async function elegir(select: Locator, texto: RegExp) {
  await expect
    .poll(async () => (await select.locator("option").allTextContents()).some((t) => texto.test(t)), { timeout: 15_000 })
    .toBe(true);
  const opciones = await select.locator("option").evaluateAll((os) =>
    os.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent ?? "" })),
  );
  const opcion = opciones.find((o) => texto.test(o.text));
  if (!opcion) throw new Error(`no option ${texto}`);
  await select.selectOption(opcion.value);
}

type LineaGasto = { objetivo: RegExp; actividad: RegExp; rubro: RegExp; valor?: string };
type Soporte = { tipo: "enlace"; url: string; nombre: string } | { tipo: "archivo"; nombre: string };

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/** Fill «Registrar gasto» on the Gastos tab; it does not submit. */
async function llenarGasto(
  page: Page,
  g: { lineas: LineaGasto[]; subtotal: string; doc: string; tercero: string; nit?: string; soportes?: Soporte[] },
): Promise<Locator> {
  await page.getByTestId("gastos").getByRole("button", { name: "Registrar gasto" }).click();
  const form = page.getByRole("form", { name: "Registrar gasto" });
  for (let i = 0; i < g.lineas.length; i++) {
    const suf = i === 0 ? "" : ` ${i + 1}`;
    if (i > 0) await form.getByRole("button", { name: "Agregar línea de la distribución" }).click();
    const l = g.lineas[i];
    await elegir(form.getByLabel(`Objetivo${suf}`, { exact: true }), l.objetivo);
    await elegir(form.getByLabel(`Actividad${suf}`, { exact: true }), l.actividad);
    await elegir(form.getByLabel(`Rubro${suf}`, { exact: true }), l.rubro);
  }
  await form.getByLabel("Subtotal", { exact: true }).fill(g.subtotal);
  if (g.lineas.length > 1) {
    for (let i = 0; i < g.lineas.length; i++) {
      await form.getByLabel(`Valor${i === 0 ? "" : ` ${i + 1}`}`, { exact: true }).fill(g.lineas[i].valor ?? "");
    }
  }
  await form.getByLabel("Fecha del documento").fill(hoyIso());
  const periodo = form.getByLabel("Periodo", { exact: true });
  if ((await periodo.inputValue()) === "") await periodo.selectOption(mesActual());
  await form.getByLabel("Número de documento").fill(g.doc);
  await form.getByLabel("Tercero", { exact: true }).fill(g.tercero);
  await form.getByLabel("Tipo de identificación").selectOption("NIT");
  await form.getByLabel("Número de identificación").fill(g.nit ?? `900${String(RUN).slice(-6)}`);
  await form.getByLabel("Descripción").fill(`Gasto E2E ${g.doc}`);
  const soportes = g.soportes ?? [{ tipo: "enlace", url: "https://example.com/soporte.pdf", nombre: `Soporte ${g.doc}` }];
  for (let i = 0; i < soportes.length; i++) {
    const suf = i === 0 ? "" : ` ${i + 1}`;
    if (i > 0) await form.getByRole("button", { name: "Agregar otro soporte" }).click();
    const s = soportes[i];
    if (s.tipo === "enlace") {
      await form.getByLabel(`Enlace${suf}`, { exact: true }).check();
      await form.getByLabel(`URL${suf}`, { exact: true }).fill(s.url);
      await form.getByLabel(`Nombre del enlace${suf}`, { exact: true }).fill(s.nombre);
    } else {
      await form.getByLabel(`Archivo${suf}`, { exact: true }).check();
      await form.locator(`input[type="file"]`).nth(i === 0 ? 0 : await form.locator('input[type="file"]').count() - 1).setInputFiles({
        name: s.nombre,
        mimeType: "application/pdf",
        buffer: PDF,
      });
    }
  }
  return form;
}

/** Submit the form and dismiss the «con avisos» notice if the API answered alerts; returns the notice text. */
async function registrar(page: Page, form: Locator): Promise<string> {
  const respuesta = page.waitForResponse((r) => /\/expenses$/.test(new URL(r.url()).pathname) && r.request().method() === "POST");
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  const res = await respuesta;
  expect(res.status(), await res.text()).toBe(201);
  const { alertas } = (await res.json()) as { alertas?: unknown[] };
  let texto = "";
  if (alertas && alertas.length > 0) {
    // The API answered alerts: the screen shows them in the «con avisos» notice until it is dismissed.
    const aviso = page.getByRole("status").filter({ hasText: "Gasto registrado, con avisos" });
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    const contenedor = page.getByRole("dialog").filter({ hasText: "con avisos" });
    texto = ((await contenedor.count()) > 0 ? await contenedor.first().textContent() : await aviso.textContent()) ?? "";
    await page.getByRole("button", { name: "Entendido" }).click();
  }
  await expect(page.getByRole("form", { name: "Registrar gasto" })).toBeHidden({ timeout: 30_000 });
  return texto;
}

/** The «Ejecutado» cell of a rubro in the Finanzas › Resumen › «Por rubro» view (assert on it: it refetches). */
async function ejecutadoRubro(page: Page, rubro: string): Promise<Locator> {
  await abrirFinanzas(page, "Resumen");
  await page.getByRole("radio", { name: "Por rubro" }).check();
  const fila = page.locator('table[data-testid="financiero-rubros"] tr[data-testid="financiero-rubro"]').filter({ hasText: rubro });
  await expect(fila).toBeVisible({ timeout: 30_000 });
  return fila.getByRole("cell").nth(2);
}

/** A row of the Finanzas › Resumen › «Por actividad» table (desktop table, not the phone list). */
async function filaActividad(page: Page, codigo: string): Promise<Locator> {
  await abrirFinanzas(page, "Resumen");
  await page.getByRole("radio", { name: "Por actividad" }).check();
  const fila = page.locator('table[data-testid="actividad-tabla"] tr[data-testid="actividad-fila"]').filter({ hasText: codigo });
  await expect(fila).toBeVisible({ timeout: 30_000 });
  return fila;
}

const celda = async (fila: Locator, i: number) => ((await fila.getByRole("cell").nth(i).textContent()) ?? "").trim();
const montoDe = (texto: string) => Number(texto.replace(/[^\d,-]/g, "").replace(",", "."));

/** The curve S table row of a month (Actividades › Lista › Opciones avanzadas). */
async function abrirCurva(page: Page) {
  await pestana(page, "Actividades").click();
  const avanzadas = page.getByTestId("ejecucion-avanzadas");
  await expect(avanzadas).toBeVisible({ timeout: 30_000 });
  const boton = avanzadas.getByRole("button", { name: "Opciones avanzadas" });
  if ((await boton.getAttribute("aria-expanded")) !== "true") await boton.click();
  await expect(page.getByTestId("curve-s-tabla")).toBeVisible({ timeout: 30_000 });
}
const tecEjecutado = (page: Page, mes: RegExp) =>
  page.getByTestId("curve-s-tabla").getByRole("row").filter({ hasText: mes }).getByRole("cell").nth(2);

async function registrarAvance(page: Page, actividad: string, fecha: string, porcentaje: number) {
  // The header's «Registrar avance» lives outside Actividades (that tab has one button per activity).
  await pestana(page, "Resumen").click();
  await page.getByRole("button", { name: "Registrar avance", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Registrar avance" });
  await elegir(dialog.getByLabel("Actividad", { exact: true }), new RegExp(`^${actividad.replace(".", "\\.")} ·`));
  await dialog.getByLabel("Fecha del avance").fill(fecha);
  await dialog.getByLabel("Avance total de la actividad (%)").fill(String(porcentaje));
  await dialog.getByLabel("Qué se hizo").fill(`Avance E2E ${actividad} al ${porcentaje} %`);
  const respuesta = page.waitForResponse((r) => r.url().includes("/progress") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Guardar avance" }).click();
  const res = await respuesta;
  expect(res.status(), await res.text()).toBe(201);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------------------------------------------
// AJ-07 · EV-02: the technical progress reads the reports; the transversal stays out
// ---------------------------------------------------------------------------------------------------------------

test("S3 AJ-07 «Un reporte del 28 de octubre se refleja en octubre; uno del 3 de noviembre, solo desde noviembre.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  // In November 2026: 28 October and 3 November (the 3rd, or today when the month is younger than that).
  const dia3 = String(Math.min(3, Number(hoyIso().slice(8, 10)))).padStart(2, "0");
  await registrarAvance(page, "A1.3", `${ANTERIOR}-28`, 50);
  await registrarAvance(page, "A1.2", `${ACTUAL}-${dia3}`, 30);
  await page.reload();
  await abrirCurva(page);
  // October holds only A1.3: 6 × 0,50 / 30 = 10 %. The 3 November report of A1.2 is not in it.
  await expect(tecEjecutado(page, filaMes(ANTERIOR))).toHaveText(pctTexto(10));
  // November adds A1.2: 10 + 8 × 0,30 / 30 = 18 %.
  await expect(tecEjecutado(page, filaMes(ACTUAL))).toHaveText(pctTexto(18));
});

test("S1 AJ-07 «Una actividad que pesa 4 de 30 semanas reporta 50 % en noviembre: el ejecutado técnico de noviembre sube 4 × 0,50 / 30 = 6,7 puntos.» + S19 EV-02 «Un proyecto con una actividad transversal de 17 semanas tiene el mismo avance técnico que sin ella.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirCurva(page);
  await expect(tecEjecutado(page, filaMes(ACTUAL))).toHaveText(pctTexto(18));
  await registrarAvance(page, "A1.1", hoyIso(), 50);
  await page.reload();
  await abrirCurva(page);
  // 18 + 4 × 0,50 / 30 = 18 + 6,7 = 24,7 %.
  await expect(tecEjecutado(page, filaMes(ACTUAL))).toHaveText(pctTexto(24.7));
  // S19: 24,7 % is (6×0,5 + 8×0,3 + 4×0,5) / 30, the five normal activities alone. Counting the 17-week
  // transversal T1 would divide by 47 weeks and give 15,7 %.
  await expect(tecEjecutado(page, filaMes(ACTUAL))).not.toHaveText(pctTexto(15.7));
});

test("S2 AJ-07 «La tarjeta, la curva y la tabla muestran el mismo valor para el mismo periodo.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirCurva(page);
  const esperado = pctTexto(24.7);
  // The table, November (the report period).
  await expect(tecEjecutado(page, filaMes(ACTUAL))).toHaveText(esperado);
  // The card «Periodo del reporte · noviembre 2026» (the current month).
  const tarjeta = page.getByTestId("seguimiento-lateral");
  await expect(tarjeta).toContainText(`Periodo del reporte · ${mesLargo(ACTUAL)}`);
  await expect(tarjeta).toContainText(`${esperado} ejecutado`);
  // The technical S-curve: its last executed point sits at y = 10 + (1 − v/100) × 144 in the SVG.
  const puntos = page.getByTestId("curve-s-tecnico-svg").locator("circle");
  const cy = Number(await puntos.last().getAttribute("cy"));
  const valorCurva = Math.round((1 - (cy - 10) / 144) * 1000) / 10;
  expect(valorCurva).toBe(24.7);
});

// ---------------------------------------------------------------------------------------------------------------
// AJ-08 · EV-05 · EV-06 · EV-02: expenses
// ---------------------------------------------------------------------------------------------------------------

const TERCERO = `Litografía E2E ${RUN}`;
const NIT = `901${String(RUN).slice(-6)}`;
const DOC_938 = `FV-938-${RUN}`;

test("S4 AJ-08 «Al registrar un gasto, el ejecutado del rubro sube de inmediato, sin otro paso.» + S5 «Los $938.000 de Promoción y divulgación aparecen como ejecutado.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await expect(await ejecutadoRubro(page, "Promoción y divulgación")).toHaveText(cop(0));
  await abrirFinanzas(page, "Gastos");
  const form = await llenarGasto(page, {
    lineas: [{ objetivo: /O1/, actividad: /A1\.1/, rubro: /R04/ }],
    subtotal: "938.000",
    doc: DOC_938,
    tercero: TERCERO,
    nit: NIT,
  });
  await registrar(page, form);
  // No validation step: the row is «Registrado» and the rubro already shows it as executed.
  await expect(page.getByRole("row", { name: new RegExp(DOC_938) })).toContainText("Registrado");
  await expect(await ejecutadoRubro(page, "Promoción y divulgación")).toHaveText(cop(938_000));
  await expect(page.getByText(/por validar/i)).toHaveCount(0);
});

test("S7 AJ-08 «Registrar dos veces la misma factura del mismo tercero muestra la advertencia antes de guardar.» + S8 «Un gasto anulado aparece en el historial y no suma.»", async ({ browser }) => {
  const gestor = await como(browser, "coordinador");
  try {
    const page = gestor.page;
    await page.goto(`/proyectos/${proyectoId}`);
    await abrirFinanzas(page, "Gastos");
    const form = await llenarGasto(page, {
      lineas: [{ objetivo: /O1/, actividad: /A1\.1/, rubro: /R04/ }],
      subtotal: "938.000",
      doc: DOC_938,
      tercero: TERCERO,
      nit: NIT,
    });
    // S7: the warning shows up in the form, before saving.
    const aviso = form.getByRole("status").filter({ hasText: "Posible duplicado" });
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText("Ya existe un gasto con el mismo NIT/cédula y número de documento");
    // It does not block: the team can still register it (and here the manager annuls it next).
    await registrar(page, form);
    await expect(page.getByRole("row", { name: new RegExp(DOC_938) })).toHaveCount(2);
    await expect(await ejecutadoRubro(page, "Promoción y divulgación")).toHaveText(cop(1_876_000));
  } finally {
    await gestor.close();
  }

  // S8: Gerencia annuls the duplicate with a motivo; it stays in the list as «Anulado» and stops adding up.
  const gerencia = await como(browser, "gerencia");
  try {
    const page = gerencia.page;
    await page.goto(`/proyectos/${proyectoId}`);
    await abrirFinanzas(page, "Gastos");
    const fila = page.getByRole("row", { name: new RegExp(DOC_938) }).last();
    await fila.getByRole("button", { name: "Anular" }).click();
    const motivo = `Factura registrada dos veces ${RUN}`;
    await fila.getByLabel("Motivo de anulación").fill(motivo);
    await fila.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(page.getByRole("row", { name: new RegExp(DOC_938) }).filter({ hasText: "Anulado" })).toContainText(motivo, {
      timeout: 30_000,
    });
    await expect(page.getByRole("row", { name: new RegExp(DOC_938) })).toHaveCount(2);
    await expect(await ejecutadoRubro(page, "Promoción y divulgación")).toHaveText(cop(938_000));
  } finally {
    await gerencia.close();
  }
});

test("S6 AJ-08 «Un gasto que deja el rubro por encima de su asignado se guarda y muestra la alerta crítica.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirFinanzas(page, "Gastos");
  // A1.1 Promoción y divulgación: 2.000.000 assigned, 938.000 executed; 1.500.000 more leaves it at 2.438.000.
  const doc = `FV-SOBRE-${RUN}`;
  const form = await llenarGasto(page, {
    lineas: [{ objetivo: /O1/, actividad: /A1\.1/, rubro: /R04/ }],
    subtotal: "1.500.000",
    doc,
    tercero: TERCERO,
    nit: NIT,
  });
  const aviso = await registrar(page, form);
  expect(aviso).toContain("Solicita un traslado al Gerente");
  await expect(page.getByRole("row", { name: new RegExp(doc) })).toContainText("Supera lo asignado");
  await expect(await ejecutadoRubro(page, "Promoción y divulgación")).toHaveText(cop(2_438_000));
});

test("S9 AJ-08 «Un gasto se guarda con 2 archivos y 1 enlace, y muestra los 3.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirFinanzas(page, "Gastos");
  const doc = `FV-3SOP-${RUN}`;
  const form = await llenarGasto(page, {
    lineas: [{ objetivo: /O1/, actividad: /A1\.3/, rubro: /R12/ }],
    subtotal: "120.000",
    doc,
    tercero: `Transportes E2E ${RUN}`,
    soportes: [
      { tipo: "archivo", nombre: `factura-${RUN}.pdf` },
      { tipo: "archivo", nombre: `planilla-${RUN}.pdf` },
      { tipo: "enlace", url: "https://example.com/acta.pdf", nombre: `Acta ${RUN}` },
    ],
  });
  await registrar(page, form);
  const fila = page.getByRole("row", { name: new RegExp(doc) });
  await expect(fila.getByRole("button", { name: /^Ver soporte / })).toHaveCount(3);
  await expect(fila.getByRole("button", { name: `Ver soporte factura-${RUN}.pdf` })).toBeVisible();
  await expect(fila.getByRole("button", { name: `Ver soporte planilla-${RUN}.pdf` })).toBeVisible();
  await expect(fila.getByRole("button", { name: `Ver soporte Acta ${RUN}` })).toBeVisible();
});

test("S10 AJ-08 «Una fila de la plantilla sin enlace se rechaza.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  const res = await page.request.get(`/api/v1/projects/${proyectoId}/expenses/template`);
  expect(res.ok()).toBeTruthy();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.body()) as never);
  // The «Rubros» sheet lists the project's rubros by name; A1.1 carries «Promoción y divulgación».
  const rubros = Array.from(wb.getWorksheet("Rubros")!.getColumn(1).values, (v) => String(v ?? ""));
  const rubro = rubros.find((r) => r.includes("Promoción y divulgación"));
  if (!rubro) throw new Error(`no «Promoción y divulgación» in ${rubros.join(", ")}`);
  const hoja = wb.getWorksheet("Gastos")!;
  const fila = (enlace: string, doc: string) =>
    [rubro, hoyIso(), "Factura de proveedor", TERCERO, "NIT", NIT, doc, "Plantilla E2E", 50_000, 0, 50_000, mesActual(), enlace, "A1.1"];
  hoja.getRow(2).values = fila("https://example.com/con-enlace.pdf", `PL-OK-${RUN}`);
  hoja.getRow(3).values = fila("", `PL-SIN-${RUN}`);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());

  await abrirFinanzas(page, "Gastos");
  await page.getByRole("button", { name: "Importar gastos" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar gastos" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: `gastos-${RUN}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await dialog.getByRole("button", { name: "Validar" }).click();
  // Row 2 (with its link) is valid; row 3 (without it) is rejected naming the row and the column.
  const resumen = dialog.getByTestId("gastos-import-resumen");
  await expect(resumen).toContainText("1 fila válida", { timeout: 60_000 });
  await expect(resumen).toContainText("1 con error");
  const filaSinEnlace = dialog.getByRole("row").filter({ has: page.getByRole("cell", { name: "3", exact: true }) });
  await expect(filaSinEnlace).toContainText("Con error");
  await expect(filaSinEnlace).toContainText("«Enlace del soporte»: es obligatorio.");
  const filaConEnlace = dialog.getByRole("row").filter({ has: page.getByRole("cell", { name: "2", exact: true }) });
  await expect(filaConEnlace).not.toContainText("Con error");
  await expect(dialog.getByRole("button", { name: "Importar 1 gasto" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

test("S27 EV-05 «Al elegir el objetivo 2, la lista de actividades muestra solo las del objetivo 2.» + S20 EV-02 «… y se puede elegir al registrar gastos.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirFinanzas(page, "Gastos");
  await page.getByTestId("gastos").getByRole("button", { name: "Registrar gasto" }).click();
  const form = page.getByRole("form", { name: "Registrar gasto" });
  await elegir(form.getByLabel("Objetivo", { exact: true }), /O2/);
  const actividades = (await form.getByLabel("Actividad", { exact: true }).locator("option").allTextContents()).filter(
    (t) => t !== "Elige una actividad",
  );
  expect(actividades.length).toBe(2);
  expect(actividades.every((t) => /A2\.[12]/.test(t))).toBe(true);
  // S20: «Gestión del proyecto» is an option of Objetivo and offers the transversal T1.
  await elegir(form.getByLabel("Objetivo", { exact: true }), /Gestión del proyecto/);
  await elegir(form.getByLabel("Actividad", { exact: true }), /T1/);
  await elegir(form.getByLabel("Rubro", { exact: true }), /R01/);
  await page.getByRole("form", { name: "Registrar gasto" }).getByRole("button", { name: "Cancelar" }).click();
});

const DOC_FACTURA = `FV-REP-${RUN}`;

test("S29 EV-05 «Una distribución que suma $990.000 para una factura de $1.000.000 no se guarda.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirFinanzas(page, "Gastos");
  const form = await llenarGasto(page, {
    lineas: [
      { objetivo: /O1/, actividad: /A1\.2/, rubro: /R12/, valor: "350.000" },
      { objetivo: /O1/, actividad: /A1\.3/, rubro: /R12/, valor: "640.000" },
    ],
    subtotal: "1.000.000",
    doc: DOC_FACTURA,
    tercero: `Transportes E2E ${RUN}`,
  });
  await expect(form).toContainText("Faltan $ 10.000 para el total de la factura.");
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/expenses$/.test(new URL(r.url()).pathname)) posts++;
  });
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(form).toContainText("Las líneas de la distribución deben sumar exactamente el total de la factura.");
  expect(posts).toBe(0);
  await page.getByRole("form", { name: "Registrar gasto" }).getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(DOC_FACTURA) })).toHaveCount(0);
});

test("S28 EV-05 «La factura de $1.000.000 queda con $350.000 en la actividad 1.2 y $650.000 en la 1.3, y se puede consultar como un solo documento.» + S31 EV-06 «Un gasto registrado en la actividad 1.2 sube el ejecutado de esa actividad y el de su rubro.» + S30 «El ejecutado total es igual en las dos vistas.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  const a12Antes = montoDe(await celda(await filaActividad(page, "A1.2"), 3));
  const transporteAntes = montoDe((await (await ejecutadoRubro(page, "Transporte")).textContent()) ?? "");

  await abrirFinanzas(page, "Gastos");
  const form = await llenarGasto(page, {
    lineas: [
      { objetivo: /O1/, actividad: /A1\.2/, rubro: /R12/, valor: "350.000" },
      { objetivo: /O1/, actividad: /A1\.3/, rubro: /R12/, valor: "650.000" },
    ],
    subtotal: "1.000.000",
    doc: DOC_FACTURA,
    tercero: `Transportes E2E ${RUN}`,
  });
  await registrar(page, form);
  // S28: one document in the list, with its two lines.
  const filas = page.getByRole("row", { name: new RegExp(DOC_FACTURA) });
  await expect(filas).toHaveCount(1);
  await expect(filas.getByTestId("gasto-distribuido")).toHaveText(/Distribuida en 2 líneas · \$\s?1\.000\.000/);
  await expect(filas.getByTestId("gasto-reparto-linea")).toHaveText([
    /^A1\.2 · R12 Transporte · \$\s?350\.000$/,
    /^A1\.3 · R12 Transporte · \$\s?650\.000$/,
  ]);

  // S31: A1.2 goes up 350.000 and Transporte (its rubro) goes up the whole 1.000.000 (A1.2 + A1.3).
  await expect.poll(async () => montoDe(await celda(await filaActividad(page, "A1.2"), 3))).toBe(a12Antes + 350_000);
  await expect.poll(async () => montoDe((await (await ejecutadoRubro(page, "Transporte")).textContent()) ?? "")).toBe(transporteAntes + 1_000_000);

  // S30: the executed total is the same in both views.
  await page.getByRole("radio", { name: "Por rubro" }).check();
  const porRubro = ((await page.getByTestId("cifra-ejecutado").getByText(/^\$/).first().textContent()) ?? "").trim();
  await page.getByRole("radio", { name: "Por actividad" }).check();
  const porActividad = ((await page.getByTestId("actividad-total-ejecutado").locator("dd").first().textContent()) ?? "").trim();
  expect(montoDe(porActividad)).toBe(montoDe(porRubro));
  expect(montoDe(porActividad)).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------------------------------------------
// AJ-09: traslados requested by the Gestor
// ---------------------------------------------------------------------------------------------------------------

async function abrirTraslado(page: Page): Promise<Locator> {
  await abrirFinanzas(page, "Resumen");
  await page.getByRole("button", { name: "Solicitar traslado" }).click();
  return page.getByRole("dialog", { name: "Solicitar traslado" });
}

test("S13 AJ-09 «No se puede trasladar un valor que deje el rubro de origen por debajo de lo ya ejecutado.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  const dialog = await abrirTraslado(page);
  // A1.1 Promoción y divulgación: 2.000.000 assigned, 2.438.000 executed. Any value taken leaves it below.
  await elegir(dialog.getByLabel("Actividad y rubro de origen"), /A1\.1.*R04|R04.*A1\.1/);
  await elegir(dialog.getByLabel("Actividad y rubro de destino"), /A2\.2.*R13|R13.*A2\.2/);
  await dialog.getByLabel("Valor", { exact: true }).fill("100.000");
  await dialog.getByLabel("Motivo").fill(`Traslado que no cabe ${RUN}`);
  const reglas = dialog.getByTestId("traslado-reglas");
  const enviar = dialog.getByRole("button", { name: "Enviar solicitud" });
  if (await enviar.isEnabled()) await enviar.click();
  await expect(reglas.or(dialog.getByRole("alert")).first()).toContainText(/ejecutado/i, { timeout: 30_000 });
  await expect(dialog).toBeVisible();
});

/** Historial › Solicitudes: the request with this motivo (a `li[data-testid=solicitud]` with its state). */
async function solicitudDe(page: Page, motivo: string): Promise<Locator> {
  await pestana(page, "Historial").click();
  await page.getByRole("tabpanel", { name: "Historial" }).getByRole("tab", { name: /^Solicitudes/ }).click();
  const solicitud = page.getByTestId("solicitud").filter({ hasText: motivo });
  await expect(solicitud).toBeVisible({ timeout: 30_000 });
  return solicitud;
}

async function aprobar(page: Page, motivo: string) {
  const solicitud = await solicitudDe(page, motivo);
  await expect(solicitud).toHaveAttribute("data-estado", "PENDIENTE");
  await solicitud.getByRole("button", { name: "Aprobar" }).click();
  await expect(solicitud).toHaveAttribute("data-estado", "APROBADA", { timeout: 30_000 });
}

const MOTIVO_TRASLADO = `Refuerzo de la dotación ${RUN}`;

test("S11 AJ-09 «Un usuario Gestor crea una solicitud de traslado.» + S12 «La solicitud no cambia el presupuesto hasta que el Gerente la aprueba.»", async ({ browser }) => {
  const gestor = await como(browser, "coordinador");
  let asignadoA22 = 0;
  try {
    const page = gestor.page;
    await page.goto(`/proyectos/${proyectoId}`);
    asignadoA22 = montoDe(await celda(await filaActividad(page, "A2.2"), 1));
    expect(asignadoA22).toBe(3_000_000);
    const dialog = await abrirTraslado(page);
    await elegir(dialog.getByLabel("Actividad y rubro de origen"), /A1\.2.*R08|R08.*A1\.2/);
    await elegir(dialog.getByLabel("Actividad y rubro de destino"), /A2\.2.*R13|R13.*A2\.2/);
    await dialog.getByLabel("Valor", { exact: true }).fill("500.000");
    await dialog.getByLabel("Motivo").fill(MOTIVO_TRASLADO);
    await dialog.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    // S12: the request is pending and the budget did not move.
    await page.reload();
    await expect.poll(async () => montoDe(await celda(await filaActividad(page, "A2.2"), 1))).toBe(3_000_000);
    await expect.poll(async () => montoDe(await celda(await filaActividad(page, "A1.2"), 1))).toBe(23_000_000);
    // The Gestor sees the request as pending.
    await expect(await solicitudDe(page, MOTIVO_TRASLADO)).toHaveAttribute("data-estado", "PENDIENTE");
  } finally {
    await gestor.close();
  }

  const gerencia = await como(browser, "gerencia");
  try {
    const page = gerencia.page;
    await page.goto(`/proyectos/${proyectoId}`);
    await aprobar(page, MOTIVO_TRASLADO);
    // Approved: now the budget moves, and the project total does not change.
    await expect.poll(async () => montoDe(await celda(await filaActividad(page, "A2.2"), 1))).toBe(3_500_000);
    await expect.poll(async () => montoDe(await celda(await filaActividad(page, "A1.2"), 1))).toBe(22_500_000);
  } finally {
    await gerencia.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// EV-04: moving a value between months after the baseline
// ---------------------------------------------------------------------------------------------------------------

test("S24 EV-04 «El Gestor pasa $2.000.000 de Transporte de noviembre a diciembre en una actividad, sin aprobación, y el total de la línea no cambia.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirProgramacion(page);
  const actual = mesActual();
  const siguiente = mesSiguiente(actual);
  const fila = page.getByTestId("programacion-fila").filter({ hasText: "A1.2" }).filter({ hasText: "R12" });
  const encabezados = await page.getByTestId("programacion-grid").getByRole("columnheader").allTextContents();
  const col = (periodo: string) => encabezados.findIndex((h) => h.trim() === mesCorto(periodo));
  const leer = async (periodo: string) => montoDe(await celda(fila, col(periodo)));
  const antesActual = await leer(actual);
  const antesSiguiente = await leer(siguiente);
  const total = async () => {
    let suma = 0;
    for (const h of encabezados) if (/^[a-z]{3} \d{4}$/.test(h.trim())) suma += montoDe(await celda(fila, encabezados.indexOf(h)));
    return suma;
  };
  const totalAntes = await total();
  expect(totalAntes).toBe(8_000_000);

  const mover = page.getByTestId("programacion-mover");
  await elegir(mover.getByLabel("Línea"), /A1\.2.*R12/);
  await mover.getByLabel("Mes de origen").selectOption(actual);
  await mover.getByLabel("Mes de destino").selectOption(siguiente);
  await mover.getByLabel("Valor a mover").fill("2.000.000");
  await mover.getByRole("button", { name: "Mover valor" }).click();

  await expect.poll(() => leer(siguiente), { timeout: 30_000 }).toBe(antesSiguiente + 2_000_000);
  expect(await leer(actual)).toBe(antesActual - 2_000_000);
  expect(await total()).toBe(8_000_000);
  await expect(fila.getByRole("cell").last()).toHaveText(cop(0));
  // No approval: no modification request was created for it.
  const { solicitudes } = await api<{ solicitudes: { motivo: string; estado: string }[] }>(
    page,
    "GET",
    `/api/v1/projects/${proyectoId}/modifications`,
  );
  expect(solicitudes.filter((s) => s.estado === "PENDIENTE")).toHaveLength(0);
});

test("S25 EV-04 «Un cambio que altere el total de la línea no se permite sin traslado aprobado.» + S26 «En noviembre no se puede mover valor desde octubre.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirProgramacion(page);
  // S25: after the baseline the month cells are read-only, there is no «Guardar programación», and the API refuses
  // a programming that changes a line's total.
  await expect(page.getByLabel(/^Programado A1\.2 R12 /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar programación" })).toHaveCount(0);
  const { control_por_linea } = await api<{ control_por_linea: { linea_id: string }[] }>(
    page,
    "GET",
    `/api/v1/projects/${proyectoId}/programming`,
  );
  const put = await page.request.put(`/api/v1/projects/${proyectoId}/programming`, {
    data: { filas: [{ linea_id: control_por_linea[0].linea_id, periodo: mesActual(), valor: "1" }] },
  });
  expect(put.status()).toBe(409);
  // Moving more than the origin month holds would change the totals: refused.
  const mover = page.getByTestId("programacion-mover");

  // S26: October (closed) is not offered as origin, and the API refuses it.
  const origenes = await mover.getByLabel("Mes de origen").locator("option").allTextContents();
  expect(origenes).not.toContain(mesCorto(ANTERIOR));
  expect(origenes).toContain(mesCorto(mesActual()));
  const linea = control_por_linea[0].linea_id;
  const desdeOctubre = await page.request.post(`/api/v1/projects/${proyectoId}/programming/move`, {
    data: { linea_id: linea, origen: ANTERIOR, destino: mesSiguiente(ACTUAL), valor: "1000" },
  });
  expect(desdeOctubre.ok()).toBeFalsy();
  expect([400, 409, 422]).toContain(desdeOctubre.status());
});

// ---------------------------------------------------------------------------------------------------------------
// EV-07: closing an activity's expenses
// ---------------------------------------------------------------------------------------------------------------

test("S32 EV-07 «Una actividad abierta con asignado $10.000.000 y ejecutado $7.000.000 muestra saldo $3.000.000.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  await abrirFinanzas(page, "Gastos");
  const form = await llenarGasto(page, {
    lineas: [{ objetivo: /O2/, actividad: /A2\.1/, rubro: /R01/ }],
    subtotal: "7.000.000",
    doc: `CC-7M-${RUN}`,
    tercero: `Asesor comercial E2E ${RUN}`,
  });
  await registrar(page, form);
  const fila = await filaActividad(page, "A2.1");
  await expect(fila.getByRole("cell").nth(1)).toHaveText(cop(10_000_000));
  await expect(fila.getByRole("cell").nth(3)).toHaveText(cop(7_000_000));
  await expect(fila.getByRole("cell").nth(4)).toHaveText(cop(3_000_000));
});

const NOTA_CIERRE = `No se requirió el último mes de acompañamiento porque las tres tiendas ya venden solas ${RUN}`;

test("S35 EV-07 «No se puede cerrar sin nota …» + S34 «Al cerrarla con nota, muestra ahorro $3.000.000 y la nota.» + S35 «… no se pueden registrar gastos en una actividad cerrada.»", async ({ page }) => {
  await abrirFicha(page, "coordinador");
  const fila = await filaActividad(page, "A2.1");
  await fila.getByRole("button", { name: "Cerrar gastos de la actividad" }).click();
  const dialog = page.getByRole("dialog", { name: "Cerrar gastos de la actividad" });
  // Without a note nothing is closed.
  await dialog.getByRole("button", { name: "Cerrar gastos" }).click();
  await expect(dialog).toContainText("La nota del cierre es obligatoria.");
  await expect(dialog).toBeVisible();
  // With the note: «Ahorro $ 3.000.000» and the note under the activity.
  await dialog.getByLabel("Nota").fill(NOTA_CIERRE);
  await dialog.getByRole("button", { name: "Cerrar gastos" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const cerrada = await filaActividad(page, "A2.1");
  await expect(cerrada.getByTestId("actividad-cierre")).toContainText("Ahorro");
  await expect(cerrada.getByTestId("actividad-cierre")).toContainText(cop(3_000_000));
  await expect(cerrada.getByTestId("actividad-cierre-nota")).toContainText(NOTA_CIERRE);

  // No new expenses on a closed activity.
  await abrirFinanzas(page, "Gastos");
  const form = await llenarGasto(page, {
    lineas: [{ objetivo: /O2/, actividad: /A2\.1/, rubro: /R01/ }],
    subtotal: "100.000",
    doc: `CC-CERRADA-${RUN}`,
    tercero: `Asesor comercial E2E ${RUN}`,
  });
  const respuesta = page.waitForResponse((r) => /\/expenses$/.test(new URL(r.url()).pathname) && r.request().method() === "POST");
  await form.getByRole("button", { name: "Registrar", exact: true }).click();
  expect((await respuesta).status()).toBe(409);
  await expect(form).toContainText(
    "Esta actividad tiene los gastos cerrados: no admite gastos nuevos. Reábrela con un motivo para registrar más.",
  );
  await page.getByRole("form", { name: "Registrar gasto" }).getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`CC-CERRADA-${RUN}`) })).toHaveCount(0);
});

test("S33 EV-07 «Un ahorro de $3.000.000 trasladado y aprobado reduce el disponible de la actividad de origen y aumenta el de la actividad y rubro de destino; el total del proyecto no cambia.»", async ({ browser }) => {
  const motivo = `Ahorro de A2.1 a la dotación ${RUN}`;
  let totalAntes = 0;
  const gestor = await como(browser, "coordinador");
  try {
    const page = gestor.page;
    await page.goto(`/proyectos/${proyectoId}`);
    await filaActividad(page, "A2.1");
    totalAntes = montoDe(((await page.getByTestId("actividad-totales").locator("dd").first().textContent()) ?? "").trim());
    const dialog = await abrirTraslado(page);
    await elegir(dialog.getByLabel("Actividad y rubro de origen"), /A2\.1.*R01|R01.*A2\.1/);
    await elegir(dialog.getByLabel("Actividad y rubro de destino"), /A2\.2.*R13|R13.*A2\.2/);
    await dialog.getByLabel("Valor", { exact: true }).fill("3.000.000");
    await dialog.getByLabel("Motivo").fill(motivo);
    await expect(dialog.getByTestId("traslado-reglas")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  } finally {
    await gestor.close();
  }

  const gerencia = await como(browser, "gerencia");
  try {
    const page = gerencia.page;
    await page.goto(`/proyectos/${proyectoId}`);
    await aprobar(page, motivo);

    // Origin A2.1: 10.000.000 → 7.000.000 assigned, nothing left (saving moved). Destination A2.2 Suministros:
    // 3.500.000 → 6.500.000. Project total unchanged.
    const origen = await filaActividad(page, "A2.1");
    await expect(origen.getByRole("cell").nth(1)).toHaveText(cop(7_000_000));
    await expect(origen.getByTestId("actividad-cierre")).toContainText(cop(0));
    const destino = await filaActividad(page, "A2.2");
    await expect(destino.getByRole("cell").nth(1)).toHaveText(cop(6_500_000));
    const totalDespues = montoDe(((await page.getByTestId("actividad-totales").locator("dd").first().textContent()) ?? "").trim());
    expect(totalDespues).toBe(totalAntes);
  } finally {
    await gerencia.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// AJ-10: «Posible retraso», on a second project with one line, so E/P is exactly the PO's percentages
// ---------------------------------------------------------------------------------------------------------------

test.describe("AJ-10 «Posible retraso»", () => {
  let retrasoId = "";
  let lineaId = "";
  let rubroId = "";
  let programado = 0;
  let gasto80 = "";

  /** One expense of `valor` pesos on the project's only line, through the API (the form is covered above). */
  async function gastar(page: Page, valor: number, doc: string): Promise<string> {
    const { gasto } = await api<{ gasto: { id: string } }>(page, "POST", `/api/v1/projects/${retrasoId}/expenses`, {
      rubro_id: rubroId,
      linea_id: lineaId,
      fecha_documento: hoyIso(),
      periodo: mesActual(),
      tipo_soporte: "FACTURA_PROVEEDOR",
      tercero_nombre: `Proveedor retraso ${RUN}`,
      tercero_tipo_id: "NIT",
      tercero_numero_id: `902${String(RUN).slice(-6)}`,
      numero_documento: doc,
      descripcion: `Gasto AJ-10 ${doc}`,
      subtotal: String(valor),
      iva: "0",
      soportes: [{ url_externa: "https://example.com/retraso.pdf", nombre: `Soporte ${doc}` }],
    });
    return gasto.id;
  }

  /** The ficha header (outside Resumen, where the chips live) and the Tablero gerencial row. */
  async function verAlerta(page: Page, tecnico: "Rojo" | "Verde", alerta: boolean) {
    await page.goto(`/proyectos/${retrasoId}`);
    await pestana(page, "Actividades").click();
    await expect(page.getByRole("button", { name: new RegExp(`^Semáforo técnico: ${tecnico}`) })).toBeVisible({ timeout: 30_000 });
    const financiero = page.getByRole("button", { name: /^Semáforo financiero/ });
    await expect(financiero).toBeVisible();
    const cabecera = financiero.locator("xpath=..");
    if (alerta) await expect(cabecera.getByText("Posible retraso", { exact: true })).toBeVisible();
    else await expect(cabecera.getByText("Posible retraso", { exact: true })).toHaveCount(0);

    await page.goto("/proyectos?vista=tablero");
    const fila = page.getByTestId(`tablero-fila-${retrasoId}`);
    await expect(fila).toBeVisible({ timeout: 60_000 });
    if (alerta) await expect(fila.getByText("Posible retraso", { exact: true })).toBeVisible();
    else await expect(fila.getByText("Posible retraso", { exact: true })).toHaveCount(0);
  }

  test.beforeAll(async ({ browser }) => {
    const gestor = await como(browser, "coordinador");
    try {
      const p = gestor.page;
      const { items: clientes } = await api<{ items: { id: string }[] }>(p, "GET", "/api/v1/clients");
      const { lineas } = await api<{ lineas: { id: string }[] }>(p, "GET", "/api/v1/strategic-lines");
      const { municipios } = await api<{ municipios: { id: string }[] }>(p, "GET", "/api/v1/municipalities");
      const { rubros } = await api<{ rubros: { id: string; codigo: string }[] }>(p, "GET", "/api/v1/rubros");
      rubroId = rubros.find((r) => r.codigo === "R01")!.id;
      const { proyecto } = await api<{ proyecto: { id: string } }>(p, "POST", "/api/v1/projects", {
        nombre: `E2E posible retraso · ${RUN}`,
        cliente_id: clientes[0].id,
        lineas: [{ id: lineas[0].id, principal: true }],
        municipio_ids: [municipios[0].id],
        fecha_inicio: FECHA_INICIO,
        fecha_fin: FECHA_FIN,
        beneficiarios_meta: 10,
      });
      retrasoId = proyecto.id;
      const base = `/api/v1/projects/${retrasoId}`;
      const { objetivo } = await api<{ objetivo: { id: string } }>(p, "POST", `${base}/objectives`, {
        codigo: "O1",
        descripcion: "Objetivo único",
      });
      const { actividad } = await api<{ actividad: { id: string } }>(p, "POST", `${base}/activities`, {
        objetivo_id: objetivo.id,
        codigo: "A1.1",
        nombre: "Actividad de veinte semanas",
        semana_inicio: 1,
        semana_fin: 20,
      });
      await api(p, "POST", `${base}/deliverables`, {
        actividad_id: actividad.id,
        codigo: "E1",
        descripcion: "Informe final",
        cantidad_meta: 1,
        unidad: "Informe",
        tipo_medio_exigido: "Documento",
      });
      const presupuesto = await api<{ lineas: { linea_id: string }[] }>(p, "PUT", `${base}/budget`, {
        lineas: [{ actividad_id: actividad.id, rubro_id: rubroId, valor: "10000000" }],
      });
      lineaId = presupuesto.lineas[0].linea_id;
      // 10.000.000 spread evenly over the project's months; the last month takes the remainder.
      const meses = mesesEntre(FECHA_INICIO, FECHA_FIN);
      const parte = Math.floor(10_000_000 / meses.length);
      await api(p, "PUT", `${base}/programming`, {
        filas: meses.map((periodo, i) => ({
          linea_id: lineaId,
          periodo,
          valor: String(i === meses.length - 1 ? 10_000_000 - parte * (meses.length - 1) : parte),
        })),
      });
      await api(p, "POST", `${base}/programming/confirm`);
    } finally {
      await gestor.close();
    }
    const gerencia = await como(browser, "gerencia");
    try {
      await api(gerencia.page, "POST", `/api/v1/projects/${retrasoId}/baseline/approve`);
      const ficha = await api<{ total: { programado: string }; parametros: { retraso: number } }>(
        gerencia.page,
        "GET",
        `/api/v1/projects/${retrasoId}/financial-sheet`,
      );
      // AJ-10: «El porcentaje es un parámetro del Administrador. Propuesto: valor inicial de 60 %.» — the value the
      // alert of this very sheet uses.
      expect(ficha.parametros.retraso).toBe(60);
      programado = Number(ficha.total.programado);
      expect(programado).toBeGreaterThan(0);
    } finally {
      await gerencia.close();
    }
  });

  test("S14 AJ-10 «Técnico en rojo y ejecutado del 1 % de lo programado: aparece la alerta.»", async ({ page }) => {
    await login(page, "gerencia");
    await gastar(page, programado * 0.01, `RET-1-${RUN}`);
    await verAlerta(page, "Rojo", true);
  });

  test("S16 AJ-10 «Técnico en rojo y ejecutado del 80 % de lo programado: no aparece la alerta.»", async ({ page }) => {
    await login(page, "gerencia");
    gasto80 = await gastar(page, programado * 0.79, `RET-79-${RUN}`);
    await verAlerta(page, "Rojo", false);
  });

  test("S15 AJ-10 «Técnico en verde y ejecutado del 40 % de lo programado: no aparece la alerta.»", async ({ page }) => {
    await login(page, "gerencia");
    // 1 % + 39 % = 40 %: annul the 79 % expense and register 39 %.
    await api(page, "POST", `/api/v1/projects/${retrasoId}/expenses/${gasto80}/void`, { motivo: `Ajuste de la prueba ${RUN}` });
    await gastar(page, programado * 0.39, `RET-39-${RUN}`);
    // Technical green: the activity reports 80 % against a plan near 50 % at today's date.
    await api(page, "POST", `/api/v1/projects/${retrasoId}/activities/${await actividadId(page)}/progress`, {
      fecha: hoyIso(),
      porcentaje: 80,
      observacion: "Avance adelantado al plan",
    });
    await verAlerta(page, "Verde", false);
  });

  async function actividadId(page: Page): Promise<string> {
    const { actividades } = await api<{ actividades: { id: string; codigo: string }[] }>(
      page,
      "GET",
      `/api/v1/projects/${retrasoId}/activities`,
    );
    return actividades.find((a) => a.codigo === "A1.1")!.id;
  }
});
