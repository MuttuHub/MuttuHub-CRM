import { describe, expect, it, vi } from "vitest";
import {
  listarNotificacionesProyecto,
  marcarNotificacionesProyectoLeidas,
  notificarGastoRechazado,
  notificarSobregasto,
} from "./notificaciones-proyecto";

vi.mock("@/lib/db", () => ({ db: { notificacion: { findMany: vi.fn(), updateMany: vi.fn() } } }));

import { db } from "@/lib/db";

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

describe("notificarGastoRechazado", () => {
  const input = { gastoId: "gas-1", proyectoId: "pry-1", autorId: "u-1", rechazadoPorId: "ger-2" };

  it("upserts one GASTO_RECHAZADO row for the author and re-arms it as unread on a repeated rejection", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    expect(await notificarGastoRechazado({ notificacion: { upsert } } as never, input)).toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      where: { usuario_id_tipo_gasto_id: { usuario_id: "u-1", tipo: "GASTO_RECHAZADO", gasto_id: "gas-1" } },
      create: { usuario_id: "u-1", tipo: "GASTO_RECHAZADO", proyecto_id: "pry-1", gasto_id: "gas-1" },
      update: { leida: false, proyecto_id: "pry-1", created_at: expect.any(Date) },
    });
  });

  it("does not notify when the rejecter is the author", async () => {
    const upsert = vi.fn();
    expect(await notificarGastoRechazado({ notificacion: { upsert } } as never, { ...input, rechazadoPorId: "u-1" })).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("reads of project notifications", () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    id: "n1",
    tipo: "GASTO_RECHAZADO",
    leida: false,
    proyecto_id: "pry-1",
    gasto_id: "gas-1",
    created_at: new Date("2026-10-16T12:00:00.000Z"),
    proyecto: { codigo: "PRY-001" },
    gasto: {
      tercero_nombre: "Proveedor SAS",
      numero_documento: "FE-1",
      monto_cop: { toString: () => "1000000" },
      motivo_rechazo: "Soporte ilegible",
    },
    ...extra,
  });

  it("a non-GERENCIA author sees only GASTO_RECHAZADO, with the expense and the reason in the message", async () => {
    vi.mocked(db.notificacion.findMany).mockResolvedValue([fila()] as never);
    const items = await listarNotificacionesProyecto({ id: "u-1", rol: "COLABORADOR" });
    expect(db.notificacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuario_id: "u-1", tipo: { in: ["GASTO_RECHAZADO"] } } }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ tipo: "GASTO_RECHAZADO", proyecto_id: "pry-1", proyecto_codigo: "PRY-001" });
    expect(items[0].mensaje).toContain("Proveedor SAS");
    expect(items[0].mensaje).toContain("FE-1");
    expect(items[0].mensaje).toContain("Soporte ilegible");
  });

  it("GERENCIA sees both types; the overspend message stays the fixed one", async () => {
    vi.mocked(db.notificacion.findMany).mockResolvedValue([fila({ id: "n2", tipo: "SOBREGASTO_RUBRO", gasto: null })] as never);
    const items = await listarNotificacionesProyecto({ id: "g-1", rol: "GERENCIA" });
    expect(db.notificacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuario_id: "g-1", tipo: { in: ["SOBREGASTO_RUBRO", "GASTO_RECHAZADO"] } } }),
    );
    expect(items[0]).toMatchObject({ tipo: "SOBREGASTO_RUBRO", mensaje: "Gasto supera el asignado del rubro" });
  });

  it("falls back to a bare message when the rejected expense no longer carries a reason", async () => {
    vi.mocked(db.notificacion.findMany).mockResolvedValue([fila({ gasto: null })] as never);
    const items = await listarNotificacionesProyecto({ id: "u-1", rol: "COORDINADOR" });
    expect(items[0].mensaje).toBe("Gasto rechazado");
  });

  it("read-all marks only the types the actor receives", async () => {
    vi.mocked(db.notificacion.updateMany).mockResolvedValue({ count: 1 } as never);
    await marcarNotificacionesProyectoLeidas({ id: "u-1", rol: "COLABORADOR" });
    expect(db.notificacion.updateMany).toHaveBeenCalledWith({
      where: { usuario_id: "u-1", tipo: { in: ["GASTO_RECHAZADO"] }, leida: false },
      data: { leida: true },
    });
  });
});
