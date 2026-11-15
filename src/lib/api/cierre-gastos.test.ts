// S11/T14.5-A — the server side of «Cerrar gastos de la actividad»: the closure state of an activity, the two
// writers (the mandatory nota, the reopening with its motivo) and the single predicate the three expense writers
// use to refuse a closed activity. The database is mocked: the writers are pinned against the SQL they issue
// (the state-pinned `updateMany` and the audit rows they leave behind); prisma/cierre-gastos.invariant.test.ts
// proves the same writers against the live schema.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CambioInput } from "@/lib/api/audit-cambios";
import { RespuestaAbortada } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({ lineaFindMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { lineaPresupuestal: { findMany: mocks.lineaFindMany } },
}));

import {
  ACTIVIDAD_SIN_CIERRE_MESSAGE,
  ACTIVIDAD_YA_CERRADA_MESSAGE,
  CIERRE_GASTOS_SCHEMA,
  GASTOS_CERRADOS_MESSAGE,
  MOTIVO_REAPERTURA_LARGO,
  MOTIVO_REAPERTURA_OBLIGATORIO,
  NOTA_CIERRE_LARGA,
  NOTA_CIERRE_OBLIGATORIA,
  REAPERTURA_GASTOS_SCHEMA,
  cerrarGastosActividad,
  lineasEnActividadesCerradas,
  lineasQueEntran,
  reabrirGastosActividad,
  rechazarGastosCerrados,
  toCierreGastosView,
  type CierreGastosRow,
} from "./cierre-gastos";

const CERRADA_AT = new Date("2026-11-16T15:00:00.000Z");
const NOTA = "No se requirió transporte porque el taller fue en el mismo municipio.";
const MOTIVO = "Llegó una factura de noviembre que faltaba.";

const abierta: CierreGastosRow = {
  id: "act-12",
  gastos_cerrados_at: null,
  gastos_cerrados_nota: null,
  gastos_cerrados_por: null,
};

const cerrada: CierreGastosRow = {
  id: "act-12",
  gastos_cerrados_at: CERRADA_AT,
  gastos_cerrados_nota: NOTA,
  gastos_cerrados_por: "coord-1",
};

type UpdateArgs = { where: Record<string, unknown>; data: Record<string, unknown> };

/**
 * The transaction the writers receive. `count` is what the state-pinned `updateMany` matches: 0 models the
 * race where the activity changed under the request.
 */
function fakeTx(options: { count?: number; despues?: CierreGastosRow } = {}) {
  const updates: UpdateArgs[] = [];
  const audit: CambioInput[] = [];
  const tx = {
    actividad: {
      updateMany: vi.fn(async (args: UpdateArgs) => {
        updates.push(args);
        return { count: options.count ?? 1 };
      }),
      findFirstOrThrow: vi.fn(async () => options.despues ?? cerrada),
    },
    auditoriaCambio: {
      createMany: vi.fn(async ({ data }: { data: CambioInput[] }) => {
        audit.push(...data);
        return { count: data.length };
      }),
    },
  };
  return { tx, updates, audit };
}

/** The 409 a writer raises inside the transaction; the route wrapper turns it into the response. */
async function rechazo(promise: Promise<unknown>): Promise<{ status: number; json: { error: string; code: string } }> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(RespuestaAbortada);
  const response = (error as RespuestaAbortada).response;
  return { status: response.status, json: (await response.json()) as { error: string; code: string } };
}

beforeEach(() => {
  mocks.lineaFindMany.mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe("toCierreGastosView", () => {
  it("reads an open activity as open and a closed one as closed, with the note (S11)", () => {
    expect(toCierreGastosView(abierta)).toEqual({
      id: "act-12",
      gastos_cerrados: false,
      gastos_cerrados_at: null,
      gastos_cerrados_nota: null,
      gastos_cerrados_por: null,
    });
    expect(toCierreGastosView(cerrada)).toEqual({
      id: "act-12",
      gastos_cerrados: true,
      gastos_cerrados_at: "2026-11-16T15:00:00.000Z",
      gastos_cerrados_nota: NOTA,
      gastos_cerrados_por: "coord-1",
    });
  });
});

describe("CIERRE_GASTOS_SCHEMA / REAPERTURA_GASTOS_SCHEMA", () => {
  it("demands the nota of the closure and trims it, with the 1000-character ceiling (S11)", () => {
    expect(CIERRE_GASTOS_SCHEMA.safeParse({}).error?.issues[0]?.message).toBe(NOTA_CIERRE_OBLIGATORIA);
    expect(CIERRE_GASTOS_SCHEMA.safeParse({ nota: "   " }).error?.issues[0]?.message).toBe(NOTA_CIERRE_OBLIGATORIA);
    expect(CIERRE_GASTOS_SCHEMA.safeParse({ nota: "x".repeat(1001) }).error?.issues[0]?.message).toBe(NOTA_CIERRE_LARGA);
    expect(CIERRE_GASTOS_SCHEMA.safeParse({ nota: `  ${NOTA}  ` }).success).toBe(true);
    expect(CIERRE_GASTOS_SCHEMA.parse({ nota: `  ${NOTA}  ` })).toEqual({ nota: NOTA });
    expect(CIERRE_GASTOS_SCHEMA.safeParse({ nota: "x".repeat(1000) }).success).toBe(true);
  });

  it("demands the motivo of the reopening and rejects anything else (S11, D4)", () => {
    expect(REAPERTURA_GASTOS_SCHEMA.safeParse({}).error?.issues[0]?.message).toBe(MOTIVO_REAPERTURA_OBLIGATORIO);
    expect(REAPERTURA_GASTOS_SCHEMA.safeParse({ motivo: "  " }).error?.issues[0]?.message).toBe(
      MOTIVO_REAPERTURA_OBLIGATORIO,
    );
    expect(REAPERTURA_GASTOS_SCHEMA.safeParse({ motivo: "x".repeat(1001) }).error?.issues[0]?.message).toBe(
      MOTIVO_REAPERTURA_LARGO,
    );
    expect(REAPERTURA_GASTOS_SCHEMA.parse({ motivo: ` ${MOTIVO} ` })).toEqual({ motivo: MOTIVO });
    expect(REAPERTURA_GASTOS_SCHEMA.safeParse({ nota: NOTA }).success).toBe(false);
  });
});

describe("lineasQueEntran", () => {
  it("keeps only the lines that are not already on the expense, once each", () => {
    expect(lineasQueEntran(["lin-12", "lin-13", "lin-12"], ["lin-12"])).toEqual(["lin-13"]);
    expect(lineasQueEntran(["lin-12"], ["lin-12"])).toEqual([]);
  });
});

describe("lineasEnActividadesCerradas / rechazarGastosCerrados", () => {
  it("finds the closed activity behind a line with one bounded query, whatever the number of lines (S11)", async () => {
    mocks.lineaFindMany.mockResolvedValue([
      { id: "lin-13", actividad: { gastos_cerrados_at: CERRADA_AT } },
      { id: "lin-14", actividad: { gastos_cerrados_at: null } },
      { id: "lin-15", actividad: null },
    ]);

    const cerradas = await lineasEnActividadesCerradas(["lin-12", "lin-13", "lin-14", "lin-15", "lin-13"]);

    expect(cerradas).toEqual(new Set(["lin-13"]));
    expect(mocks.lineaFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.lineaFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["lin-12", "lin-13", "lin-14", "lin-15"] } },
      select: { id: true, actividad: { select: { gastos_cerrados_at: true } } },
    });
  });

  it("answers 409 INVALID_STATE with the reason and how to undo it, and writes nothing (S11)", async () => {
    mocks.lineaFindMany.mockResolvedValue([{ id: "lin-13", actividad: { gastos_cerrados_at: CERRADA_AT } }]);

    const response = await rechazarGastosCerrados(["lin-13"]);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({
      error: "Esta actividad tiene los gastos cerrados: no admite gastos nuevos. Reábrela con un motivo para registrar más.",
      code: "INVALID_STATE",
    });
    expect(GASTOS_CERRADOS_MESSAGE).toBe(
      "Esta actividad tiene los gastos cerrados: no admite gastos nuevos. Reábrela con un motivo para registrar más.",
    );
  });

  it("lets an open activity and a legacy line without activity through, and asks nothing when no line is named", async () => {
    mocks.lineaFindMany.mockResolvedValue([
      { id: "lin-12", actividad: { gastos_cerrados_at: null } },
      { id: "lin-15", actividad: null },
    ]);

    expect(await rechazarGastosCerrados(["lin-12", "lin-15"])).toBeNull();
    mocks.lineaFindMany.mockClear();
    expect(await rechazarGastosCerrados([])).toBeNull();
    expect(mocks.lineaFindMany).not.toHaveBeenCalled();
  });
});

describe("cerrarGastosActividad", () => {
  it("sets the three closure fields, keeps the nota and audits the closure (S11)", async () => {
    const { tx, updates, audit } = fakeTx();

    const view = await cerrarGastosActividad(tx as never, {
      actividad: abierta,
      proyectoId: "pry-1",
      usuarioId: "coord-1",
      nota: NOTA,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].where).toEqual({ id: "act-12", proyecto_id: "pry-1", deleted_at: null, gastos_cerrados_at: null });
    expect(updates[0].data).toMatchObject({
      gastos_cerrados_nota: NOTA,
      gastos_cerrados_por: "coord-1",
    });
    expect(updates[0].data.gastos_cerrados_at).toBeInstanceOf(Date);
    expect(view).toEqual(toCierreGastosView(cerrada));

    expect(audit.map((fila) => fila.campo)).toEqual([
      "gastos_cerrados_at",
      "gastos_cerrados_nota",
      "gastos_cerrados_por",
    ]);
    expect(audit).toContainEqual(
      expect.objectContaining({
        usuario_id: "coord-1",
        accion: "EDITAR",
        entidad: "actividad",
        entidad_id: "act-12",
        proyecto_id: "pry-1",
        campo: "gastos_cerrados_nota",
        valor_anterior: null,
        valor_nuevo: NOTA,
      }),
    );
    // One lote for the whole closure: the ledger reads it back as one operation.
    expect(new Set(audit.map((fila) => fila.lote_id)).size).toBe(1);
    expect(audit[0].valor_nuevo).toBe((updates[0].data.gastos_cerrados_at as Date).toISOString());
  });

  it("refuses to close twice: the state-pinned update is the rule and the audit is never written (S11)", async () => {
    const { tx, audit } = fakeTx({ count: 0 });

    const respuesta = await rechazo(
      cerrarGastosActividad(tx as never, { actividad: abierta, proyectoId: "pry-1", usuarioId: "coord-1", nota: NOTA }),
    );

    expect(respuesta.status).toBe(409);
    expect(respuesta.json).toEqual({ error: ACTIVIDAD_YA_CERRADA_MESSAGE, code: "CONFLICT" });
    expect(audit).toEqual([]);
    expect(tx.auditoriaCambio.createMany).not.toHaveBeenCalled();
  });
});

describe("reabrirGastosActividad", () => {
  it("clears the closure, records the motivo and answers the open state (S11, D4)", async () => {
    const { tx, updates, audit } = fakeTx({ despues: abierta });

    const view = await reabrirGastosActividad(tx as never, {
      actividad: cerrada,
      proyectoId: "pry-1",
      usuarioId: "coord-1",
      motivo: MOTIVO,
    });

    expect(updates[0].where).toEqual({
      id: "act-12",
      proyecto_id: "pry-1",
      deleted_at: null,
      gastos_cerrados_at: { not: null },
    });
    expect(updates[0].data).toEqual({ gastos_cerrados_at: null, gastos_cerrados_nota: null, gastos_cerrados_por: null });
    expect(view).toEqual(toCierreGastosView(abierta));

    expect(audit.map((fila) => fila.campo)).toEqual([
      "gastos_cerrados_at",
      "gastos_cerrados_nota",
      "gastos_cerrados_por",
      "motivo_reapertura",
    ]);
    expect(audit).toContainEqual(
      expect.objectContaining({
        accion: "EDITAR",
        entidad: "actividad",
        entidad_id: "act-12",
        proyecto_id: "pry-1",
        campo: "gastos_cerrados_nota",
        valor_anterior: NOTA,
        valor_nuevo: null,
      }),
    );
    expect(audit).toContainEqual(
      expect.objectContaining({ campo: "motivo_reapertura", valor_anterior: null, valor_nuevo: MOTIVO }),
    );
  });

  it("refuses to reopen an activity that is not closed (S11)", async () => {
    const { tx, audit } = fakeTx({ count: 0 });

    const respuesta = await rechazo(
      reabrirGastosActividad(tx as never, {
        actividad: abierta,
        proyectoId: "pry-1",
        usuarioId: "coord-1",
        motivo: MOTIVO,
      }),
    );

    expect(respuesta.status).toBe(409);
    expect(respuesta.json).toEqual({ error: ACTIVIDAD_SIN_CIERRE_MESSAGE, code: "CONFLICT" });
    expect(audit).toEqual([]);
  });
});
