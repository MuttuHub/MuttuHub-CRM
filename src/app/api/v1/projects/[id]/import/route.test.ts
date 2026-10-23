// @vitest-environment node
// POST /api/v1/projects/:id/import (S7 U5, E-24): gate order, upload limits,
// dry run, apply-once and the validation report. The writer and the catalog
// loader are mocked; parsing and validation are the real ones over a generated
// F-X1 workbook.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  transaction: vi.fn(),
  cargarContexto: vi.fn(),
  contarReemplazo: vi.fn(),
  importarPlantilla: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: mocks.proyectoFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/api/plantilla-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/plantilla-import")>();
  return {
    ...actual,
    cargarContexto: mocks.cargarContexto,
    contarReemplazo: mocks.contarReemplazo,
    importarPlantilla: mocks.importarPlantilla,
  };
});

import { apiError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/supabase/server";
import { RespuestaAbortada } from "@/lib/api/presupuesto";
import { IMPORT_MAX_BYTES } from "@/lib/proyectos/plantilla/columns";
import { generarPlantilla } from "@/lib/proyectos/plantilla/generate";
import { fixtureContextoFX1, fixtureF_X1 } from "@/lib/proyectos/__fixtures__/plantilla-cedetextil";
import { POST } from "./route";

const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let valido: Buffer;
let v12: Buffer;
let v13: Buffer;

beforeAll(async () => {
  valido = await generarPlantilla(fixtureF_X1("valido"));
  v12 = await generarPlantilla(fixtureF_X1("v12"));
  v13 = await generarPlantilla(fixtureF_X1("v13"));
});

function proyecto(estado = "BORRADOR") {
  return {
    id: "pry-1",
    estado,
    fecha_inicio: new Date("2026-10-05T00:00:00Z"),
    fecha_fin: new Date("2027-01-29T00:00:00Z"),
  };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function subida(
  contenido: Buffer | string,
  opciones: { nombre?: string; tipo?: string; campo?: string; modo?: string; query?: string } = {},
): Request {
  const form = new FormData();
  form.set(
    opciones.campo ?? "archivo",
    new File([typeof contenido === "string" ? contenido : new Uint8Array(contenido)], opciones.nombre ?? "plantilla.xlsx", { type: opciones.tipo ?? XLSX_MIME }),
  );
  if (opciones.modo) form.set("modo", opciones.modo);
  return new Request(`http://localhost/api/v1/projects/pry-1/import${opciones.query ?? ""}`, {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authAs(admin);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.cargarContexto.mockResolvedValue(fixtureContextoFX1());
  mocks.contarReemplazo.mockResolvedValue({ objetivos: 2, actividades: 3, entregables: 4, indicadores: 1 });
  mocks.importarPlantilla.mockResolvedValue({
    objetivos: 1,
    actividades: 4,
    entregables: 7,
    indicadores: 2,
    rubros: 8,
    celdas_programacion: 32,
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({ marca: "tx" }));
});

describe("POST /projects/:id/import — gate order", () => {
  it("404 when the project does not exist, before any other check", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    authAs(coordinador);
    const response = await POST(subida(valido), ctx);
    expect(response.status).toBe(404);
  });

  it("403 for a non-manager, even when the project is not a draft", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION"));
    const response = await POST(subida(valido), ctx);
    expect(response.status).toBe(403);
  });

  it("409 INVALID_STATE outside BORRADOR, before reading the body", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION"));
    const response = await POST(subida(Buffer.alloc(IMPORT_MAX_BYTES + 10)), ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("INVALID_STATE");
  });

  it("413 FILE_TOO_LARGE before any 400 (an oversized non-xlsx is 413, not a type error)", async () => {
    const response = await POST(subida(Buffer.alloc(IMPORT_MAX_BYTES + 1), { nombre: "grande.txt" }), ctx);
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("FILE_TOO_LARGE");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("413 from the declared Content-Length without reading the body", async () => {
    const request = new Request("http://localhost/api/v1/projects/pry-1/import", {
      method: "POST",
      headers: { "content-length": String(IMPORT_MAX_BYTES * 3), "content-type": "multipart/form-data; boundary=x" },
      body: "x",
    });
    const response = await POST(request, ctx);
    expect(response.status).toBe(413);
  });

  it("400 when the multipart body is not parseable", async () => {
    const request = new Request("http://localhost/api/v1/projects/pry-1/import", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hola",
    });
    const response = await POST(request, ctx);
    expect(response.status).toBe(400);
  });

  it("400 when the file field is missing", async () => {
    const form = new FormData();
    form.set("modo", "validar");
    const response = await POST(
      new Request("http://localhost/api/v1/projects/pry-1/import", { method: "POST", body: form }),
      ctx,
    );
    expect(response.status).toBe(400);
  });

  it("400 for a file that is not .xlsx", async () => {
    const response = await POST(subida(valido, { nombre: "plantilla.pdf", tipo: "application/pdf" }), ctx);
    expect(response.status).toBe(400);
  });

  it("400 for an .xlsx that is not a real workbook", async () => {
    const response = await POST(subida("no soy un zip"), ctx);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("El archivo no es una plantilla válida.");
  });
});

describe("POST /projects/:id/import — validation report", () => {
  it("400 VALIDATION_ERROR with the report when V-13 fails, and nothing is written", async () => {
    const response = await POST(subida(v13), ctx);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.reporte.errores.map((e: { regla: string }) => e.regla)).toEqual(["V-13"]);
    expect(body.reporte.truncado).toBe(false);
    expect(body.reporte.resumen["V-13"]).toBe(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.importarPlantilla).not.toHaveBeenCalled();
  });

  it("applies the same report to a dry run", async () => {
    const response = await POST(subida(v13, { modo: "validar" }), ctx);
    expect(response.status).toBe(400);
    expect((await response.json()).reporte.errores.length).toBeGreaterThan(0);
  });
});

describe("POST /projects/:id/import — budget that differs from the total (PO feedback 2026-10-23)", () => {
  it("the dry run is valid and reports only the W-02 warning", async () => {
    const response = await POST(subida(v12, { modo: "validar" }), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valido).toBe(true);
    expect(body.importado).toBe(false);
    expect(body.advertencias.map((a: { regla: string }) => a.regla)).toEqual(["W-02"]);
    expect(mocks.importarPlantilla).not.toHaveBeenCalled();
  });

  it("imports with the budget sum as the project total", async () => {
    const response = await POST(subida(v12), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.importado).toBe(true);
    expect(body.advertencias.map((a: { regla: string }) => a.regla)).toEqual(["W-02"]);
    expect(mocks.importarPlantilla).toHaveBeenCalledTimes(1);
    const [, args] = mocks.importarPlantilla.mock.calls[0] as [unknown, { plan: { proyecto: { valorTotalCents: bigint } } }];
    expect(args.plan.proyecto.valorTotalCents).toBe(BigInt(17_736_000_000));
  });
});

describe("POST /projects/:id/import — dry run", () => {
  it("modo=validar answers the summary and writes nothing", async () => {
    const response = await POST(subida(valido, { modo: "validar" }), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      importado: false,
      valido: true,
      resumen: { objetivos: 1, actividades: 4, entregables: 7, indicadores: 2, rubros: 8, celdas_programacion: 32 },
      reemplaza: { objetivos: 2, actividades: 3, entregables: 4, indicadores: 1 },
      advertencias: [],
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.importarPlantilla).not.toHaveBeenCalled();
  });

  it("?dry_run=1 is the same dry run", async () => {
    const response = await POST(subida(valido, { query: "?dry_run=1" }), ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).importado).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("POST /projects/:id/import — apply", () => {
  it("runs the writer exactly once in one transaction and returns the lote", async () => {
    authAs(gerencia);
    const response = await POST(subida(valido), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.importado).toBe(true);
    expect(body.lote_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.resumen.actividades).toBe(4);
    expect(body.advertencias).toEqual([]);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.mock.calls[0]?.[1]).toEqual({ timeout: 60_000, maxWait: 10_000 });
    expect(mocks.importarPlantilla).toHaveBeenCalledTimes(1);
    const [tx, args] = mocks.importarPlantilla.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(tx).toEqual({ marca: "tx" });
    expect(args.proyectoId).toBe("pry-1");
    expect(args.usuarioId).toBe("ger-1");
    expect(args.loteId).toBe(body.lote_id);
    expect((args.plan as { actividades: unknown[] }).actividades).toHaveLength(4);
  });

  it("accepts the legacy `file` field name", async () => {
    const response = await POST(subida(valido, { campo: "file" }), ctx);
    expect(response.status).toBe(200);
  });

  it("maps an abort raised inside the writer to its own response", async () => {
    mocks.importarPlantilla.mockRejectedValue(
      new RespuestaAbortada(apiError("Solo se puede editar.", 409, "INVALID_STATE")),
    );
    const response = await POST(subida(valido), ctx);
    expect(response.status).toBe(409);
  });

  it("answers the 500 envelope when the writer fails unexpectedly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.importarPlantilla.mockRejectedValue(new Error("boom"));
    const response = await POST(subida(valido), ctx);
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("INTERNAL_ERROR");
  });
});
