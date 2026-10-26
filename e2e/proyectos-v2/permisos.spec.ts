import { expect, test, type Page } from "@playwright/test";
import { login, portfolioRows } from "./helpers";

// Role matrix of 2026-10-19 (odd/tasks/permisos-proyectos-por-rol.md):
//   - any role creates a project;
//   - Coordinador and Colaborador read and write only where they are team members;
//   - Administración and Gerencia keep approvals and expense validation;
//   - every role reads every client.
//
// The demo seed leaves PRY-2026-001 (En ejecución) and PRY-2026-002 (Borrador)
// with the coordinador as responsable and member. The colaborador starts with no
// membership, which is what makes the "stranger" assertions meaningful; one test
// adds them to 001 through the product and then checks the member side.

const NOMBRE_COLABORADOR = "Andrés Torres";
const SIN_ACCESO = "No tienes acceso a este proyecto";

type Ids = { p001: string; p002: string };
const ids: Partial<Ids> = {};
/** Proyecto que el colaborador NO integra; se calcula en cada corrida (la base persiste). */
let ajeno: { id: string; codigo: string } | null = null;

/** Resolve the two demo project ids through the admin session (serial tests share this). */
async function resolveIds(page: Page): Promise<Ids> {
  if (ids.p001 && ids.p002) return ids as Ids;
  const res = await page.request.get("/api/v1/projects");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { proyectos: Array<{ id: string; codigo: string }> };
  const p001 = body.proyectos.find((p) => p.codigo === "PRY-2026-001")?.id;
  const p002 = body.proyectos.find((p) => p.codigo === "PRY-2026-002")?.id;
  expect(p001, "PRY-2026-001 must exist in the demo seed").toBeTruthy();
  expect(p002, "PRY-2026-002 must exist in the demo seed").toBeTruthy();
  ids.p001 = p001!;
  ids.p002 = p002!;
  return ids as Ids;
}

async function openFicha(page: Page, id: string) {
  await page.goto(`/proyectos/${id}`);
  await expect(page.getByTestId("ficha-header")).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

/** Un proyecto cuyo equipo no incluye al colaborador. Requiere sesión de administrador. */
async function proyectoAjenoAlColaborador(page: Page): Promise<{ id: string; codigo: string } | null> {
  const res = await page.request.get("/api/v1/projects");
  const { proyectos } = (await res.json()) as {
    proyectos: Array<{ id: string; codigo: string }>;
  };
  // PRY-2026-001 never qualifies: a later test adds the colaborador to it, and
  // the API gives no ordering guarantee, so the first listed project may be it.
  for (const proyecto of proyectos) {
    if (proyecto.codigo === "PRY-2026-001") continue;
    const miembrosRes = await page.request.get(`/api/v1/projects/${proyecto.id}/members`);
    const { miembros } = (await miembrosRes.json()) as {
      miembros: Array<{ usuario: { nombre: string } }>;
    };
    if (!miembros.some((m) => m.usuario.nombre === NOMBRE_COLABORADOR)) {
      return { id: proyecto.id, codigo: proyecto.codigo };
    }
  }
  return null;
}
/** Añade al colaborador al equipo desde el panel (idempotente entre corridas). */
async function agregarIntegrante(page: Page, projectId: string) {
  await openFicha(page, projectId);
  const quitar = page.getByRole("button", { name: `Quitar a ${NOMBRE_COLABORADOR}` });
  const agregarCombo = page.getByRole("combobox", { name: "Agregar integrante" });
  // El panel carga asíncrono: espera a un integrante conocido antes de decidir.
  await expect(page.getByRole("button", { name: /^Quitar a / }).first()).toBeVisible({ timeout: 30_000 });
  if ((await quitar.count()) === 0) {
    await agregarCombo.click();
    await page.getByRole("option", { name: NOMBRE_COLABORADOR }).first().click();
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
  }
  await expect(quitar).toBeVisible({ timeout: 30_000 });
}


test("gerencia: sees every project, may create, and approves baselines", async ({ page }) => {
  await login(page, "gerencia", "/proyectos");
  const { p002 } = await resolveIds(page);
  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).toContain("PRY-2026-001");
  expect(rows).toContain("PRY-2026-002");
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();

  // 002 is still a draft: the manager sees the baseline action.
  await openFicha(page, p002);
  await expect(page.getByRole("button", { name: /Aprobar línea base/ }).first()).toBeVisible();
});

test("coordinador: own projects only, may create, executes but never approves nor validates", async ({ page }) => {
  await login(page, "coordinador", "/proyectos");
  const { p001, p002 } = await resolveIds(page);
  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).toContain("PRY-2026-001");
  expect(rows).toContain("PRY-2026-002");

  // S1: creation is open to every role now.
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();

  // S7: approval stays with Administración and Gerencia, even for a draft.
  await openFicha(page, p002);
  await expect(page.getByRole("button", { name: /Aprobar línea base/ })).toHaveCount(0);

  // S6: a member executes; S7: validation is not theirs.
  await openFicha(page, p001);
  await expect(page.getByRole("button", { name: "Registrar avance", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar gasto", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Finanzas", exact: true }).click();
  await page.getByRole("tab", { name: "Gastos", exact: true }).click();
  await expect(page.getByTestId("gastos-lista")).toBeVisible();
  await expect(page.getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar" })).toHaveCount(0);
});

test("colaborador: the list never shows a foreign project, both tabs, may create, ficha denied", async ({ page }) => {
  // La base local persiste entre corridas, así que el "ajeno" se calcula: un
  // proyecto cuyo equipo no incluya al colaborador.
  await login(page, "admin", "/proyectos");
  const candidato = await proyectoAjenoAlColaborador(page);
  test.skip(!candidato, "no hay un proyecto ajeno disponible en esta base");
  ajeno = candidato;
  await page.context().clearCookies();
  await login(page, "colaborador", "/proyectos");

  // S4: the board is visible to both member roles, scoped to their projects.
  await expect(page.getByRole("tab", { name: "Portafolio" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Tablero" })).toBeVisible();
  // S1: creation is open to every role.
  await expect(page.getByRole("link", { name: "Nuevo proyecto" })).toBeVisible();

  // S3: un proyecto sin pertenencia nunca aparece en su portafolio.
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).not.toContain(ajeno!.codigo);

  const api = await page.request.get(`/api/v1/projects/${ajeno!.id}`);
  expect([403, 404]).toContain(api.status());
  await page.goto(`/proyectos/${ajeno!.id}`);
  await expect(page.getByRole("heading", { name: SIN_ACCESO })).toBeVisible({ timeout: 60_000 });
});

test("admin adds the colaborador to 001 through the team panel", async ({ page }) => {
  await login(page, "admin", "/proyectos");
  const { p001 } = await resolveIds(page);
  await agregarIntegrante(page, p001);
});

test("colaborador member: reads their project, executes, cannot validate nor approve", async ({ page }) => {
  await page.context().clearCookies();
  await login(page, "colaborador", "/proyectos");
  const { p001 } = await resolveIds(page);

  await expect(portfolioRows(page).first()).toBeVisible({ timeout: 60_000 });
  const rows = (await portfolioRows(page).allInnerTexts()).join("\n");
  expect(rows).toContain("PRY-2026-001");
  expect(rows, "the foreign project stays out").not.toContain(ajeno!.codigo);

  await openFicha(page, p001);
  await expect(page.getByRole("button", { name: /Aprobar línea base/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar avance", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar gasto", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Finanzas", exact: true }).click();
  await page.getByRole("tab", { name: "Gastos", exact: true }).click();
  await expect(page.getByTestId("gastos-lista")).toBeVisible();
  await expect(page.getByRole("button", { name: "Validar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rechazar" })).toHaveCount(0);

  // The API is the authority: a member may edit the allowed field of an
  // executing project, and a project without membership stays 403.
  const propio = await page.request.patch(`/api/v1/projects/${p001}`, {
    data: { descripcion: "Actualizada por el E2E de permisos" },
  });
  expect(propio.status()).toBe(200);

  // El proyecto sin pertenencia se calcula: p002 puede ser suyo en otra corrida.
  const rechazado = await page.request.patch(`/api/v1/projects/${ajeno!.id}`, {
    data: { descripcion: "no debería" },
  });
  expect([403, 404]).toContain(rechazado.status());
});

test("S8: every role reads every client, so the contact feeds are global", async ({ page }) => {
  for (const role of ["colaborador", "coordinador"] as const) {
    await page.context().clearCookies();
    await login(page, role, "/clientes");
    for (const [url, key] of [
      ["/api/v1/contacts", "contactos"],
      ["/api/v1/interactions", "interacciones"],
    ] as const) {
      const res = await page.request.get(url);
      expect(res.status(), `${role} ${url}`).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body[key]), `${role} ${url} shape`).toBe(true);
    }
  }
});

test("D1: a non-member ficha explains «No tienes acceso» within 5 s", async ({ page }) => {
  // El proyecto ajeno se calcula con sesión de administrador: el colaborador no
  // puede listar uno que no integra, y la base local persiste entre corridas.
  await login(page, "admin", "/proyectos");
  const ajenoProyecto = await proyectoAjenoAlColaborador(page);
  test.skip(!ajenoProyecto, "no hay un proyecto ajeno disponible en esta base");
  await page.context().clearCookies();
  await login(page, "colaborador", "/proyectos");

  const t0 = Date.now();
  await page.goto(`/proyectos/${ajenoProyecto!.id}`);
  await expect(page.getByRole("heading", { name: SIN_ACCESO })).toBeVisible({ timeout: 5_000 });
  test.info().annotations.push({
    type: "time-to-no-access-message",
    description: `${Date.now() - t0} ms`,
  });
});

test("colaborador member of a draft sees the structure controls (S5)", async ({ page }) => {
  // El admin agrega al colaborador a 002 (Borrador); sin eso el panel no aparece.
  await login(page, "admin", "/proyectos");
  await resolveIds(page);
  const p002 = ids.p002!;
  await agregarIntegrante(page, p002);

  await page.context().clearCookies();
  await login(page, "colaborador", "/proyectos");
  await openFicha(page, p002);
  await page.getByRole("tab", { name: "Actividades", exact: true }).click();

  // S5: el integrante ve la plantilla y las entradas del borrador.
  await expect(page.getByRole("button", { name: /Importar plantilla/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Descargar plantilla/ })).toBeVisible();

  // En ejecución la estructura no se edita: la pestaña muestra el seguimiento y no la plantilla.
  const p001 = ids.p001!;
  await openFicha(page, p001);
  await page.getByRole("tab", { name: "Actividades", exact: true }).click();
  await expect(page.getByRole("button", { name: /Importar plantilla/ })).toHaveCount(0);
});
