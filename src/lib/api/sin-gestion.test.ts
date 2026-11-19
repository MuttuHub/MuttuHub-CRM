import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { bitacoraEntrada: { groupBy: vi.fn() } },
}));

import { db } from "@/lib/db";
import { diasSinGestion, ultimoContactoPorCliente } from "./sin-gestion";

beforeEach(() => {
  vi.mocked(db.bitacoraEntrada.groupBy).mockReset();
});

describe("diasSinGestion", () => {
  it("is null when the client was never contacted", () => {
    expect(diasSinGestion(null, "2026-11-19")).toBeNull();
  });

  it("counts Bogotá calendar days, so a late-night UTC entry belongs to the previous day", () => {
    // 2026-10-21T03:00Z is 2026-10-20 22:00 in Bogotá: 30 days before 2026-11-19.
    expect(diasSinGestion(new Date("2026-10-21T03:00:00Z"), "2026-11-19")).toBe(30);
  });

  it("never goes negative", () => {
    expect(diasSinGestion(new Date("2026-12-01T15:00:00Z"), "2026-11-19")).toBe(0);
  });
});

describe("ultimoContactoPorCliente", () => {
  it("maps every id to its latest entry, or null without entries", async () => {
    const fecha = new Date("2026-11-01T15:00:00Z");
    vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
      { cliente_id: "c1", _max: { created_at: fecha } },
    ] as never);

    const result = await ultimoContactoPorCliente(["c1", "c2"]);

    expect([...result.entries()]).toEqual([
      ["c1", fecha],
      ["c2", null],
    ]);
    expect(db.bitacoraEntrada.groupBy).toHaveBeenCalledWith({
      by: ["cliente_id"],
      where: { cliente_id: { in: ["c1", "c2"] } },
      _max: { created_at: true },
    });
  });

  it("does not query for an empty id list", async () => {
    expect((await ultimoContactoPorCliente([])).size).toBe(0);
    expect(db.bitacoraEntrada.groupBy).not.toHaveBeenCalled();
  });
});
