// @vitest-environment node
// GET /api/v1/projects/:id/expenses/template — the blank expenses workbook, listing the rubros of the
// project that take expenses (assigned value above zero). Gated like the expenses read (404 -> 403).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ proyectoFindFirst: vi.fn(), lineaFindMany: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { proyecto: { findFirst: mocks.proyectoFindFirst }, lineaPresupuestal: { findMany: mocks.lineaFindMany } },
}));

import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const request = () => new Request("http://localhost/api/v1/projects/pry-1/expenses/template");

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.lineaFindMany.mockResolvedValue([
    { monto_proyectado_cop: new Prisma.Decimal("1000"), rubro: { nombre: "Transporte" } },
    { monto_proyectado_cop: new Prisma.Decimal("0"), rubro: { nombre: "Sin asignar" } },
    { monto_proyectado_cop: new Prisma.Decimal("500.50"), rubro: { nombre: "Viáticos" } },
  ]);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("GET expenses/template", () => {
  it("returns the workbook as an attachment, listing only the rubros with an assigned value", async () => {
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="plantilla-gastos.xlsx"');
    expect(mocks.lineaFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { proyecto_id: "pry-1" } }));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await response.arrayBuffer()) as never);
    expect(workbook.worksheets[0].getCell("A1").value).toBe("Rubro");
    expect(["I1", "J1", "K1"].map((c) => workbook.worksheets[0].getCell(c).value)).toEqual(["Subtotal", "IVA", "Total"]);
    const rubros = workbook.worksheets[1];
    expect([1, 2, 3, 4].map((r) => rubros.getRow(r).getCell(1).value)).toEqual(["Rubro", "Transporte", "Viáticos", null]);
  });

  it("is readable in any estado by a member COORDINADOR", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto("CERRADO", true));
    expect((await GET(request(), ctx)).status).toBe(200);
  });

  it("404 for an unknown project, 403 for a non-member COORDINADOR", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(request(), ctx)).status).toBe(404);
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto());
    expect((await GET(request(), ctx)).status).toBe(403);
    expect(mocks.lineaFindMany).not.toHaveBeenCalled();
  });
});
