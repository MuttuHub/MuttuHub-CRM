// B7 (S3, S4): the estado writer under the row lock, with a fake transaction client.
// The live lock/rollback behaviour shares `lockProyecto` with the baseline writer
// (proven in prisma/linea-base.invariant.test.ts).

import { describe, expect, it, vi } from "vitest";
import { RespuestaAbortada } from "@/lib/api/errors";
import { CAMBIO_ESTADO_SCHEMA, cambiarEstadoProyecto } from "./estado-proyecto";

function fakeTx(estado: string | null) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(estado === null ? [] : [{ estado }]),
    proyecto: { update: vi.fn().mockResolvedValue({}) },
    auditoriaCambio: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

const entrada = { proyectoId: "pry-1", usuarioId: "ger-1", accion: "SUSPENDER" as const, motivo: "Sin fondos" };

async function abortada(promesa: Promise<unknown>): Promise<Response> {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RespuestaAbortada);
  return (error as RespuestaAbortada).response;
}

describe("cambiarEstadoProyecto", () => {
  it("writes the new estado and two audit rows (estado, motivo) in one lote", async () => {
    const tx = fakeTx("EN_EJECUCION");
    const resultado = await cambiarEstadoProyecto(tx as never, entrada);

    expect(resultado).toEqual({ proyecto: { id: "pry-1", estado: "SUSPENDIDO" } });
    expect(tx.proyecto.update).toHaveBeenCalledWith({ where: { id: "pry-1" }, data: { estado: "SUSPENDIDO" } });
    const filas = tx.auditoriaCambio.createMany.mock.calls[0][0].data;
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      usuario_id: "ger-1",
      accion: "EDITAR",
      entidad: "proyecto",
      entidad_id: "pry-1",
      proyecto_id: "pry-1",
      campo: "estado",
      valor_anterior: "EN_EJECUCION",
      valor_nuevo: "SUSPENDIDO",
    });
    expect(filas[1]).toMatchObject({ campo: "motivo", valor_nuevo: "Sin fondos" });
    expect(filas[0].lote_id).toBe(filas[1].lote_id);
  });

  it("re-checks the transition under the lock: 409 and nothing written", async () => {
    const tx = fakeTx("CERRADO");
    const response = await abortada(cambiarEstadoProyecto(tx as never, entrada));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "INVALID_STATE",
      error: "Solo se puede suspender un proyecto en ejecución.",
    });
    expect(tx.proyecto.update).not.toHaveBeenCalled();
    expect(tx.auditoriaCambio.createMany).not.toHaveBeenCalled();
  });

  it("404 when the project disappeared before the lock", async () => {
    const tx = fakeTx(null);
    expect((await abortada(cambiarEstadoProyecto(tx as never, entrada))).status).toBe(404);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.proyecto.update).not.toHaveBeenCalled();
    expect(tx.auditoriaCambio.createMany).not.toHaveBeenCalled();
  });
});

describe("CAMBIO_ESTADO_SCHEMA", () => {
  it("accepts every accion with a trimmed motivo", () => {
    expect(CAMBIO_ESTADO_SCHEMA.parse({ accion: "REABRIR", motivo: "  Falta un informe " })).toEqual({
      accion: "REABRIR",
      motivo: "Falta un informe",
    });
  });

  it.each([
    [{ accion: "BORRAR", motivo: "x" }, "La acción no es válida."],
    [{ accion: "CERRAR" }, "El motivo es obligatorio."],
    [{ accion: "CERRAR", motivo: "   " }, "El motivo no puede estar vacío."],
    [{ accion: "CERRAR", motivo: "x".repeat(1001) }, "El motivo es demasiado largo."],
  ])("rejects %j with its message", (body, mensaje) => {
    const resultado = CAMBIO_ESTADO_SCHEMA.safeParse(body);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe(mensaje);
  });
});
