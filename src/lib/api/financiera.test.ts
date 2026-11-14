// loadGastosEjecutados (AJ-08): the seam that feeds E of the financial ficha. Every expense that
// counts as executed — REGISTRADO or VALIDADO; RECHAZADO and ANULADO never do — each mapped to
// the rubro of its budget line, keeping its real estado for the pure lib to filter by period.
// S10: the row also carries the activity of its budget line, so the per-activity view is built from
// this same list and the executed total cannot disagree between the two views.

import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: { gasto: { findMany: vi.fn() } } }));

import { db } from "@/lib/db";
import { loadGastosEjecutados } from "./financiera";
import { toCents } from "@/lib/proyectos/money";

describe("loadGastosEjecutados", () => {
  it("reads the expenses that count as executed (REGISTRADO and VALIDADO) with their real estado", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { periodo: "2026-10", monto_cop: new Prisma.Decimal("1500000.50"), estado: "REGISTRADO", linea: { id: "lin-1", rubro_id: "rub-1", actividad_id: "act-1" } },
      { periodo: "2026-11", monto_cop: new Prisma.Decimal("200"), estado: "VALIDADO", linea: { id: "lin-2", rubro_id: "rub-2", actividad_id: null } },
    ] as never);

    const fuente = await loadGastosEjecutados("pry-1");

    expect(db.gasto.findMany).toHaveBeenCalledWith({
      where: { proyecto_id: "pry-1", estado: { in: ["REGISTRADO", "VALIDADO"] } },
      select: {
        periodo: true,
        monto_cop: true,
        estado: true,
        linea: { select: { id: true, rubro_id: true, actividad_id: true } },
      },
    });
    expect(fuente.disponible).toBe(true);
    expect(fuente.gastos).toEqual([
      { rubroId: "rub-1", lineaId: "lin-1", actividadId: "act-1", periodo: "2026-10", valor: toCents("1500000.50"), estado: "REGISTRADO" },
      // D4: una línea sin actividad («Sin actividad») llega con null, no se inventa un id.
      { rubroId: "rub-2", lineaId: "lin-2", actividadId: null, periodo: "2026-11", valor: toCents("200"), estado: "VALIDADO" },
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
