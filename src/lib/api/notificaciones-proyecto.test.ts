import { describe, expect, it, vi } from "vitest";
import { notificarSobregasto } from "./notificaciones-proyecto";

describe("notificarSobregasto", () => {
  it("creates one SOBREGASTO_RUBRO row per active GERENCIA user, skipping duplicates", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "g-1" }, { id: "g-2" }]);
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { usuario: { findMany }, notificacion: { createMany } };
    const count = await notificarSobregasto(tx as never, { gastoId: "gas-1", proyectoId: "pry-1" });
    expect(count).toBe(2);
    expect(findMany).toHaveBeenCalledWith({ where: { rol: "GERENCIA", activo: true }, select: { id: true } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { usuario_id: "g-1", tipo: "SOBREGASTO_RUBRO", proyecto_id: "pry-1", gasto_id: "gas-1" },
        { usuario_id: "g-2", tipo: "SOBREGASTO_RUBRO", proyecto_id: "pry-1", gasto_id: "gas-1" },
      ],
      skipDuplicates: true,
    });
  });

  it("does nothing without recipients", async () => {
    const createMany = vi.fn();
    const tx = { usuario: { findMany: vi.fn().mockResolvedValue([]) }, notificacion: { createMany } };
    expect(await notificarSobregasto(tx as never, { gastoId: "g", proyectoId: "p" })).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});
