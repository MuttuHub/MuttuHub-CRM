// loadGastosValidados (S6 U5): the seam that feeds E of the financial ficha. Only VALIDADO
// expenses count, each mapped to the rubro of its budget line.

import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: { gasto: { findMany: vi.fn() } } }));

import { db } from "@/lib/db";
import { loadGastosValidados } from "./financiera";
import { toCents } from "@/lib/proyectos/money";

describe("loadGastosValidados", () => {
  it("reads only VALIDADO rows of the project and maps them to rubroId, periodo and cents", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { periodo: "2026-10", monto_cop: new Prisma.Decimal("1500000.50"), linea: { rubro_id: "rub-1" } },
      { periodo: "2026-11", monto_cop: new Prisma.Decimal("200"), linea: { rubro_id: "rub-2" } },
    ] as never);

    const fuente = await loadGastosValidados("pry-1");

    expect(db.gasto.findMany).toHaveBeenCalledWith({
      where: { proyecto_id: "pry-1", estado: "VALIDADO" },
      select: { periodo: true, monto_cop: true, linea: { select: { rubro_id: true } } },
    });
    expect(fuente.disponible).toBe(true);
    expect(fuente.gastos).toEqual([
      { rubroId: "rub-1", periodo: "2026-10", valor: toCents("1500000.50"), estado: "VALIDADO" },
      { rubroId: "rub-2", periodo: "2026-11", valor: toCents("200"), estado: "VALIDADO" },
    ]);
  });

  it("is available even when the project has no validated expenses", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([]);
    expect(await loadGastosValidados("pry-1")).toEqual({ disponible: true, gastos: [] });
  });

  it("uses the client it is given (transaction-friendly)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await loadGastosValidados("pry-9", { gasto: { findMany } } as never);
    expect(findMany).toHaveBeenCalled();
  });
});
