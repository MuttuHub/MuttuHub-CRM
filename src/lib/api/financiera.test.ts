// loadGastosEjecutados (AJ-08): the seam that feeds E of the financial ficha. Every expense that
// counts as executed — REGISTRADO or VALIDADO; RECHAZADO and ANULADO never do — each mapped to
// the rubro of its budget line, keeping its real estado for the pure lib to filter by period.

import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: { gasto: { findMany: vi.fn() } } }));

import { db } from "@/lib/db";
import { loadGastosEjecutados } from "./financiera";
import { toCents } from "@/lib/proyectos/money";

describe("loadGastosEjecutados", () => {
  it("reads the expenses that count as executed (REGISTRADO and VALIDADO) with their real estado", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { periodo: "2026-10", monto_cop: new Prisma.Decimal("1500000.50"), estado: "REGISTRADO", linea: { rubro_id: "rub-1" } },
      { periodo: "2026-11", monto_cop: new Prisma.Decimal("200"), estado: "VALIDADO", linea: { rubro_id: "rub-2" } },
    ] as never);

    const fuente = await loadGastosEjecutados("pry-1");

    expect(db.gasto.findMany).toHaveBeenCalledWith({
      where: { proyecto_id: "pry-1", estado: { in: ["REGISTRADO", "VALIDADO"] } },
      select: { periodo: true, monto_cop: true, estado: true, linea: { select: { rubro_id: true } } },
    });
    expect(fuente.disponible).toBe(true);
    expect(fuente.gastos).toEqual([
      { rubroId: "rub-1", periodo: "2026-10", valor: toCents("1500000.50"), estado: "REGISTRADO" },
      { rubroId: "rub-2", periodo: "2026-11", valor: toCents("200"), estado: "VALIDADO" },
    ]);
  });

  it("is available even when the project has no expenses that count", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([]);
    expect(await loadGastosEjecutados("pry-1")).toEqual({ disponible: true, gastos: [] });
  });

  it("uses the client it is given (transaction-friendly)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await loadGastosEjecutados("pry-9", { gasto: { findMany } } as never);
    expect(findMany).toHaveBeenCalled();
  });
});
