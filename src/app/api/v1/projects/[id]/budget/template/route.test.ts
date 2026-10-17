// @vitest-environment node
// GET /api/v1/projects/:id/budget/template — the blank workbook in the PO format
// (`Rubro | Valor (COP)`, one row per active rubro), gated like the budget read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ proyectoFindFirst: vi.fn(), rubroFindMany: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { proyecto: { findFirst: mocks.proyectoFindFirst }, rubro: { findMany: mocks.rubroFindMany } },
}));

import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const request = () => new Request("http://localhost/api/v1/projects/pry-1/budget/template");

function proyecto(estado = "BORRADOR", miembro = false) {
  return { id: "pry-1", estado, valor_total: null, fecha_inicio: null, fecha_fin: null, miembros: miembro ? [{ id: "m-1" }] : [] };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.rubroFindMany.mockResolvedValue([
    { nombre: "Personal", activo: true },
    { nombre: "Viáticos", activo: true },
  ]);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("GET budget/template", () => {
  it("returns the blank PO-format workbook with the active rubros as an attachment", async () => {
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="plantilla-presupuesto.xlsx"');
    expect(mocks.rubroFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] }),
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await response.arrayBuffer()) as never);
    const hoja = workbook.worksheets[0];
    expect([hoja.getCell("A1").value, hoja.getCell("B1").value]).toEqual(["Rubro", "Valor (COP)"]);
    expect([hoja.getCell("A2").value, hoja.getCell("A3").value]).toEqual(["Personal", "Viáticos"]);
    expect(hoja.getCell("B2").value).toBeNull();
  });

  it("is readable in any estado by whoever can read the budget (a member COORDINADOR)", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await GET(request(), ctx)).status).toBe(200);
  });

  it("404 for an unknown project, 403 for a non-member COORDINADOR", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(request(), ctx)).status).toBe(404);
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto());
    expect((await GET(request(), ctx)).status).toBe(403);
  });
});
