// @vitest-environment node
// POST /api/v1/projects/:id/budget/import — the PO's simple budget workbook:
// gate order (same as the manual budget write), file guards, the 400 report,
// the validate-only preview and the apply (lines + one audit entry per change).
// The database is mocked; parsing, matching and the writer are the real ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  queryRaw: vi.fn(),
  rubroFindMany: vi.fn(),
  lineaFindMany: vi.fn(),
  lineaCreate: vi.fn(),
  lineaUpdate: vi.fn(),
  proyectoUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => {
  const models = {
    rubro: { findMany: mocks.rubroFindMany },
    lineaPresupuestal: { findMany: mocks.lineaFindMany, create: mocks.lineaCreate, update: mocks.lineaUpdate },
    proyecto: { update: mocks.proyectoUpdate },
    $queryRaw: mocks.queryRaw,
  };
  return {
    db: {
      ...models,
      proyecto: { findFirst: mocks.proyectoFindFirst, update: mocks.proyectoUpdate },
      $transaction: mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(models)),
    },
  };
});

import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { RUBROS_V2 } from "@/lib/catalogs";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { POST } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const rubros = RUBROS_V2.map((r) => ({ id: `r-${r.codigo}`, codigo: r.codigo, nombre: r.nombre, activo: true, orden: r.orden }));

const linea = (rubro_id: string, monto: string) => ({
  id: `l-${rubro_id}`,
  proyecto_id: "pry-1",
  rubro_id,
  monto_proyectado_cop: new Prisma.Decimal(monto),
});

function proyecto(estado = "BORRADOR", over: object = {}) {
  return {
    id: "pry-1",
    estado,
    valor_total: new Prisma.Decimal(20_000_000),
    fecha_inicio: null,
    fecha_fin: null,
    oportunidad: null,
    miembros: [],
    ...over,
  };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

/** The PO's sheet: `Hoja1`, header `valor (COP)}`, `Viaticos` without an accent. */
async function libroPO(valores: Record<string, string | number> = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Hoja1");
  hoja.addRow(["rubro", "valor (COP)}"]);
  for (const r of RUBROS_V2) {
    const nombre = r.codigo === "R10" ? "Viaticos" : r.nombre;
    hoja.addRow([nombre, valores[nombre] ?? null]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function libroCon(filas: (string | number | null)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Hoja1");
  for (const fila of filas) hoja.addRow(fila);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function subida(
  contenido: Buffer | string,
  opciones: { nombre?: string; tipo?: string; campo?: string; modo?: string } = {},
): Request {
  const form = new FormData();
  form.set(
    opciones.campo ?? "archivo",
    new File([typeof contenido === "string" ? contenido : new Uint8Array(contenido)], opciones.nombre ?? "presupuesto.xlsx", {
      type: opciones.tipo ?? XLSX_MIME,
    }),
  );
  if (opciones.modo) form.set("modo", opciones.modo);
  return new Request("http://localhost/api/v1/projects/pry-1/budget/import", { method: "POST", body: form });
}

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.rubroFindMany.mockResolvedValue(rubros);
  mocks.lineaFindMany.mockResolvedValue([linea("r-R01", "8000000"), linea("r-R02", "500000")]);
  mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: "20000000.00" }]);
  mocks.lineaCreate.mockImplementation(async ({ data }: { data: { rubro_id: string } }) => ({ id: `new-${data.rubro_id}` }));
  mocks.lineaUpdate.mockResolvedValue({});
  mocks.proyectoUpdate.mockResolvedValue({});
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("POST budget/import — gate order (same as the manual budget write)", () => {
  it("404 when the project does not exist", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    const response = await POST(subida(await libroPO()), ctx);
    expect(response.status).toBe(404);
  });

  it("403 for a COORDINADOR or COLABORADOR who is not a member", async () => {
    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      const response = await POST(subida(await libroPO()), ctx);
      expect(response.status, usuario.rol).toBe(403);
    }
  });

  // S5 (PO matrix 2026-10-19): the budget belongs to the team, so a member imports it.
  it("lets a member COORDINADOR or COLABORADOR import", async () => {
    for (const usuario of [coordinador, colaborador]) {
      authAs(usuario);
      mocks.proyectoFindFirst.mockResolvedValue(proyecto("BORRADOR", { miembros: [{ id: "m-1" }] }));
      const response = await POST(subida(await libroPO()), ctx);
      expect(response.status, usuario.rol).toBe(200);
    }
  });

  it("409 INVALID_STATE outside BORRADOR, before reading the file", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION"));
    const response = await POST(subida(Buffer.alloc(IMPORT_MAX_BYTES + 10)), ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("INVALID_STATE");
  });

  it("allows ADMINISTRADOR as well as GERENCIA", async () => {
    authAs(admin);
    const response = await POST(subida(await libroPO(), { modo: "validar" }), ctx);
    expect(response.status).toBe(200);
  });

  it("re-checks BORRADOR under the row lock when applying", async () => {
    mocks.queryRaw.mockResolvedValue([{ estado: "EN_EJECUCION", valor_total: "20000000.00" }]);
    const response = await POST(subida(await libroPO({ Personal: 1 })), ctx);
    expect(response.status).toBe(409);
    expect(mocks.lineaUpdate).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });
});

describe("POST budget/import — file guards", () => {
  it("413 for a file above the cap", async () => {
    const response = await POST(subida(Buffer.alloc(IMPORT_MAX_BYTES + 1)), ctx);
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("FILE_TOO_LARGE");
  });

  it("413 from the declared Content-Length without reading the body", async () => {
    const request = new Request("http://localhost/api/v1/projects/pry-1/budget/import", {
      method: "POST",
      headers: { "content-length": String(IMPORT_MAX_BYTES * 3), "content-type": "multipart/form-data; boundary=x" },
      body: "x",
    });
    expect((await POST(request, ctx)).status).toBe(413);
  });

  it("400 when the body is not multipart or the file field is missing", async () => {
    const texto = new Request("http://localhost/api/v1/projects/pry-1/budget/import", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hola",
    });
    expect((await POST(texto, ctx)).status).toBe(400);
    const form = new FormData();
    form.set("modo", "validar");
    const sinArchivo = new Request("http://localhost/api/v1/projects/pry-1/budget/import", { method: "POST", body: form });
    expect((await POST(sinArchivo, ctx)).status).toBe(400);
  });

  it("400 for a file that is not .xlsx (name or type)", async () => {
    const libro = await libroPO();
    expect((await POST(subida(libro, { nombre: "presupuesto.pdf", tipo: "application/pdf" }), ctx)).status).toBe(400);
    expect((await POST(subida(libro, { tipo: "text/html" }), ctx)).status).toBe(400);
  });

  it("400 for an .xlsx that is not a real workbook (zip guard)", async () => {
    const response = await POST(subida("no soy un zip"), ctx);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("El archivo no es un Excel válido.");
  });
});

describe("POST budget/import — the 400 report", () => {
  it("reports every row error and writes nothing", async () => {
    const libro = await libroCon([
      ["rubro", "valor (COP)"],
      ["Personal", -5],
      ["Material POP", 100],
      ["Oficina", 100],
      ["oficina", 200],
    ]);
    const response = await POST(subida(libro), ctx);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.reporte.errores.map((e: { fila: number }) => e.fila)).toEqual([2, 3, 5]);
    expect(body.reporte.errores[1]).toMatchObject({ fila: 3, rubro: "Material POP" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("reports a file-level error (headers not found) without a row", async () => {
    const response = await POST(subida(await libroCon([["nombre", "monto x"], ["Personal", 1]]), { modo: "validar" }), ctx);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.reporte.errores).toEqual([{ fila: null, rubro: null, mensaje: expect.stringMatching(/Rubro/) }]);
  });

  it("matches only active rubros: a suspended one is an unknown rubro", async () => {
    mocks.rubroFindMany.mockResolvedValue(rubros.map((r) => (r.codigo === "R15" ? { ...r, activo: false } : r)));
    const response = await POST(subida(await libroPO(), { modo: "validar" }), ctx);
    expect(mocks.rubroFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: true } }));
    // The mock ignores the filter; the route must still pass only active rubros to the matcher.
    expect(response.status).toBe(400);
    expect((await response.json()).reporte.errores[0]).toMatchObject({ fila: 16, rubro: "Dotación" });
  });
});

describe("POST budget/import — preview (modo=validar)", () => {
  it("answers current vs new per rubro and the sum against valor_total, writing nothing", async () => {
    const response = await POST(subida(await libroPO({ Personal: 10_000_000, Viaticos: "1.500.000,50" }), { modo: "validar" }), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.importado).toBe(false);
    expect(body.valido).toBe(true);
    expect(body.rubros).toHaveLength(15);
    expect(body.rubros[0]).toEqual({
      rubro_id: "r-R01",
      codigo: "R01",
      nombre: "Personal",
      actual: "8000000.00",
      nuevo: "10000000.00",
      diferencia: "2000000.00",
      en_archivo: true,
    });
    expect(body.rubros[1]).toMatchObject({ codigo: "R02", actual: "500000.00", nuevo: "0.00" });
    expect(body.rubros[9]).toMatchObject({ codigo: "R10", nombre: "Viáticos", nuevo: "1500000.50" });
    expect(body.suma_nueva).toBe("11500000.50");
    expect(body.valor_total).toBe("20000000.00");
    expect(body.diferencia).toBe("-8499999.50");
    expect(body.cambios).toBe(3);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.lineaUpdate).not.toHaveBeenCalled();
  });
});

describe("POST budget/import — apply", () => {
  it("writes the same line fields and audit entries as the manual budget edit, in one transaction", async () => {
    const response = await POST(subida(await libroPO({ Personal: 10_000_000, Viaticos: "1.500.000,50" })), ctx);
    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    expect(mocks.lineaUpdate).toHaveBeenCalledWith({
      where: { id: "l-r-R01" },
      data: { monto_proyectado_cop: new Prisma.Decimal("10000000.00") },
    });
    expect(mocks.lineaUpdate).toHaveBeenCalledWith({
      where: { id: "l-r-R02" },
      data: { monto_proyectado_cop: new Prisma.Decimal("0.00") },
    });
    expect(mocks.lineaCreate).toHaveBeenCalledTimes(1);
    expect(mocks.lineaCreate).toHaveBeenCalledWith({
      data: { proyecto_id: "pry-1", rubro_id: "r-R10", monto_proyectado_cop: new Prisma.Decimal("1500000.50") },
      select: { id: true },
    });

    const base = { usuario_id: "ger-1", entidad: "presupuesto", proyecto_id: "pry-1", campo: "asignado" };
    expect(logChanges).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logChanges).mock.calls[0][1]).toEqual([
      { ...base, accion: "EDITAR", entidad_id: "l-r-R01", valor_anterior: "8000000.00", valor_nuevo: "10000000.00" },
      { ...base, accion: "EDITAR", entidad_id: "l-r-R02", valor_anterior: "500000.00", valor_nuevo: "0.00" },
      { ...base, accion: "CREAR", entidad_id: "new-r-R10", valor_anterior: null, valor_nuevo: "1500000.50" },
    ]);
    expect(mocks.proyectoUpdate).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.importado).toBe(true);
    expect(body.cambios).toBe(3);
    expect(body.presupuesto.rubros).toHaveLength(15);
  });

  it("writes nothing when the file matches the current budget", async () => {
    const response = await POST(subida(await libroPO({ Personal: 8_000_000, Consultor: 500_000 })), ctx);
    expect(response.status).toBe(200);
    expect(mocks.lineaUpdate).not.toHaveBeenCalled();
    expect(mocks.lineaCreate).not.toHaveBeenCalled();
    expect(logChanges).not.toHaveBeenCalled();
    expect((await response.json()).cambios).toBe(0);
  });

  it("fills a null valor_total with the sum, exactly like the manual edit", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("BORRADOR", { valor_total: null }));
    mocks.queryRaw.mockResolvedValue([{ estado: "BORRADOR", valor_total: null }]);
    mocks.lineaFindMany.mockResolvedValue([]);
    const response = await POST(subida(await libroPO({ Personal: 1000 })), ctx);
    expect(response.status).toBe(200);
    expect(mocks.proyectoUpdate).toHaveBeenCalledWith({ where: { id: "pry-1" }, data: { valor_total: new Prisma.Decimal("1000.00") } });
    expect(vi.mocked(logChanges).mock.calls[0][1]).toContainEqual(
      expect.objectContaining({ entidad: "proyecto", campo: "valor_total", valor_anterior: null, valor_nuevo: "1000.00" }),
    );
  });
});
