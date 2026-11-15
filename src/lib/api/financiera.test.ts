// loadGastosEjecutados (AJ-08): the seam that feeds E of the financial ficha. Every expense that
// counts as executed — REGISTRADO or VALIDADO; RECHAZADO and ANULADO never do — each mapped to
// the rubro of its budget line, keeping its real estado for the pure lib to filter by period.
// S10: the row also carries the activity of its budget line, so the per-activity view is built from
// this same list and the executed total cannot disagree between the two views.
// S9/T14.2-B1: one element per distribution row, not the whole invoice on its header line. An
// expense without distribution rows — the Excel import and the seeds write that way — keeps
// counting its total on its header line, exactly as before.

import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: { gasto: { findMany: vi.fn() } } }));

import { db } from "@/lib/db";
import { loadGastosEjecutados } from "./financiera";
import { toCents } from "@/lib/proyectos/money";

const linea = (id: string, rubroId: string, actividadId: string | null) => ({
  id,
  rubro_id: rubroId,
  actividad_id: actividadId,
});

describe("loadGastosEjecutados", () => {
  it("reads the executed expenses (REGISTRADO and VALIDADO) with their distribution rows and real estado", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      {
        periodo: "2026-10",
        monto_cop: new Prisma.Decimal("1500000.50"),
        estado: "REGISTRADO",
        linea: linea("lin-1", "rub-1", "act-1"),
        repartos: [{ valor: new Prisma.Decimal("1500000.50"), linea: linea("lin-1", "rub-1", "act-1") }],
      },
      {
        periodo: "2026-11",
        monto_cop: new Prisma.Decimal("200"),
        estado: "VALIDADO",
        linea: linea("lin-2", "rub-2", null),
        repartos: [{ valor: new Prisma.Decimal("200"), linea: linea("lin-2", "rub-2", null) }],
      },
    ] as never);

    const fuente = await loadGastosEjecutados("pry-1");

    expect(db.gasto.findMany).toHaveBeenCalledWith({
      where: { proyecto_id: "pry-1", estado: { in: ["REGISTRADO", "VALIDADO"] } },
      select: {
        periodo: true,
        monto_cop: true,
        estado: true,
        linea: { select: { id: true, rubro_id: true, actividad_id: true } },
        repartos: {
          select: { valor: true, linea: { select: { id: true, rubro_id: true, actividad_id: true } } },
        },
      },
    });
    expect(fuente.disponible).toBe(true);
    expect(fuente.gastos).toEqual([
      { rubroId: "rub-1", lineaId: "lin-1", actividadId: "act-1", periodo: "2026-10", valor: toCents("1500000.50"), estado: "REGISTRADO" },
      // D4: una línea sin actividad («Sin actividad») llega con null, no se inventa un id.
      { rubroId: "rub-2", lineaId: "lin-2", actividadId: null, periodo: "2026-11", valor: toCents("200"), estado: "VALIDADO" },
    ]);
  });

  // S9: 350.000 en la actividad 1.2 y 650.000 en la 1.3 no se atribuyen enteras a la línea de la cabecera.
  it("attributes each row to its own line: 350.000 on 1.2 and 650.000 on 1.3, never 1.000.000 on the header's line (S9)", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      {
        periodo: "2026-10",
        monto_cop: new Prisma.Decimal("1000000"),
        estado: "REGISTRADO",
        // The header points at 1.2; the invoice is split between 1.2 and 1.3.
        linea: linea("lin-12", "rub-12", "act-12"),
        repartos: [
          { valor: new Prisma.Decimal("350000"), linea: linea("lin-12", "rub-12", "act-12") },
          { valor: new Prisma.Decimal("650000"), linea: linea("lin-13", "rub-13", "act-13") },
        ],
      },
    ] as never);

    const fuente = await loadGastosEjecutados("pry-1");

    expect(fuente.gastos).toEqual([
      { rubroId: "rub-12", lineaId: "lin-12", actividadId: "act-12", periodo: "2026-10", valor: toCents("350000"), estado: "REGISTRADO" },
      { rubroId: "rub-13", lineaId: "lin-13", actividadId: "act-13", periodo: "2026-10", valor: toCents("650000"), estado: "REGISTRADO" },
    ]);
    // The whole invoice is never attributed to the line of the first row.
    expect(fuente.gastos.filter((gasto) => gasto.valor === toCents("1000000"))).toEqual([]);
    expect(fuente.gastos.reduce((suma, gasto) => suma + gasto.valor, BigInt(0))).toBe(toCents("1000000"));
  });

  // T14.2-B1: a single-row invoice produces exactly the element it produced before the split existed.
  it("produces the same single element for an invoice with one row (regression S9/T14.2-B1)", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      {
        periodo: "2026-10",
        monto_cop: new Prisma.Decimal("1500000.50"),
        estado: "REGISTRADO",
        linea: linea("lin-1", "rub-1", "act-1"),
        repartos: [{ valor: new Prisma.Decimal("1500000.50"), linea: linea("lin-1", "rub-1", "act-1") }],
      },
    ] as never);

    expect(await loadGastosEjecutados("pry-1")).toEqual({
      disponible: true,
      gastos: [
        { rubroId: "rub-1", lineaId: "lin-1", actividadId: "act-1", periodo: "2026-10", valor: toCents("1500000.50"), estado: "REGISTRADO" },
      ],
    });
  });

  // The Excel import and the seeds write `gastos` without distribution rows: their total keeps counting
  // on the header's line, so E does not lose a single peso while those writers are migrated.
  it("keeps a gasto without distribution rows counting its total on its header line", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      {
        periodo: "2026-10",
        monto_cop: new Prisma.Decimal("500000"),
        estado: "VALIDADO",
        linea: linea("lin-9", "rub-9", null),
        repartos: [],
      },
    ] as never);

    const fuente = await loadGastosEjecutados("pry-1");

    expect(fuente.gastos).toEqual([
      { rubroId: "rub-9", lineaId: "lin-9", actividadId: null, periodo: "2026-10", valor: toCents("500000"), estado: "VALIDADO" },
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
