// Pure rules of the expense money split (AJ-04): Subtotal + IVA = Total, and the view/audit shape.

import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import {
  CAMPOS_AUDITABLES_GASTO,
  GASTO_CREATE_SCHEMA,
  GASTO_PATCH_SCHEMA,
  PERIODO_DOCUMENTO_FUERA_MESSAGE,
  PERIODO_FUERA_MESSAGE,
  REPARTO_LINEA_MESSAGE,
  REPARTO_MEZCLA_MESSAGE,
  REPARTO_SIN_FILAS_MESSAGE,
  REPARTO_SUMA_MESSAGE,
  REPARTO_VALOR_MESSAGE,
  SOBREGASTO_MENSAJE,
  SOBREGASTO_PROGRAMADO_ADVERTENCIA,
  alertaSobregasto,
  cargarSobregastos,
  evaluarMontosGasto,
  evaluarPeriodo,
  evaluarRepartos,
  gastoAuditable,
  nivelSobregasto,
  superaAsignado,
  toGastoView,
} from "@/lib/api/gastos";
import { toCents } from "@/lib/proyectos/money";

describe("evaluarMontosGasto", () => {
  it("adds Subtotal 1.000.000 and IVA 190.000 into a Total of 1.190.000 (S2)", () => {
    const result = evaluarMontosGasto("1000000", "190000");
    expect(result).toEqual({
      ok: true,
      subtotal: toCents("1000000"),
      iva: toCents("190000"),
      total: toCents("1190000"),
    });
  });

  it("accepts an IVA of 0 (S1)", () => {
    expect(evaluarMontosGasto("250000.50", 0)).toMatchObject({ ok: true, iva: BigInt(0), total: toCents("250000.50") });
  });

  it("keeps exact cents, with no float noise", () => {
    expect(evaluarMontosGasto("0.10", "0.20")).toMatchObject({ ok: true, total: toCents("0.30") });
  });

  it("rejects a Subtotal that is zero, negative or not a money amount", () => {
    for (const subtotal of ["0", "-5", "abc", "10.001", null]) {
      expect(evaluarMontosGasto(subtotal, "0"), String(subtotal)).toMatchObject({ ok: false, campo: "Subtotal" });
    }
    expect(evaluarMontosGasto("0", "0")).toMatchObject({ message: "El subtotal debe ser mayor que cero." });
  });

  it("rejects a negative IVA with its own message, and a non-numeric one", () => {
    expect(evaluarMontosGasto("100", "-1")).toEqual({
      ok: false,
      campo: "IVA",
      message: "El IVA no puede ser negativo.",
    });
    expect(evaluarMontosGasto("100", "abc")).toMatchObject({ ok: false, campo: "IVA" });
    expect(evaluarMontosGasto("100", undefined)).toMatchObject({ ok: false, campo: "IVA" });
  });

  it("rejects a Total above the 15,2 column maximum", () => {
    expect(evaluarMontosGasto("9999999999999.99", "0.01")).toMatchObject({ ok: false, campo: "Total" });
  });
});

describe("expense body schemas", () => {
  const base = {
    rubro_id: "rub-1",
    fecha_documento: "2026-10-15",
    tipo_soporte: "FACTURA_PROVEEDOR",
    tercero_nombre: "Proveedor SAS",
    numero_documento: "FE-1",
    descripcion: "Tiquetes",
    soportes: [{}],
  };

  it("create takes subtotal and iva and no longer takes valor", () => {
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...base, subtotal: "100", iva: "19" }).success).toBe(true);
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...base, valor: "119" }).success).toBe(false);
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...base, subtotal: "100" }).success).toBe(false);
  });

  // S9 / T14.1: the form sends the exact line (actividad + rubro); it stays optional so a caller that only
  // knows the rubro keeps working.
  it("create takes the optional linea_id of the exact budget line (S9)", () => {
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...base, subtotal: "100", iva: "0", linea_id: "lin-1" }).success).toBe(true);
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...base, subtotal: "100", iva: "0" }).success).toBe(true);
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...base, subtotal: "100", iva: "0", linea_id: "" }).success).toBe(false);
  });

  it("patch takes subtotal and iva and no longer takes valor", () => {
    expect(GASTO_PATCH_SCHEMA.safeParse({ iva: "0" }).success).toBe(true);
    expect(GASTO_PATCH_SCHEMA.safeParse({ valor: "1" }).success).toBe(false);
  });

  // S9 / T14.2-B1: la factura distribuida se registra por sus líneas; si el cuerpo mezcla el reparto con el
  // rubro o la línea de la cabecera, la ambigüedad es el error que esta rebanada quita.
  it("create takes repartos instead of rubro_id and linea_id, and rejects mixing them (S9)", () => {
    const repartos = [
      { linea_id: "lin-12", valor: "350000" },
      { linea_id: "lin-13", valor: "650000" },
    ];
    const { rubro_id: _r, ...sinRubro } = base;
    void _r;
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...sinRubro, subtotal: "1000000", iva: "0", repartos }).success).toBe(true);

    const conRubro = GASTO_CREATE_SCHEMA.safeParse({ ...base, subtotal: "1000000", iva: "0", repartos });
    expect(conRubro.success).toBe(false);
    expect(conRubro.error?.issues[0]?.message).toBe(REPARTO_MEZCLA_MESSAGE);

    const conLinea = GASTO_CREATE_SCHEMA.safeParse({
      ...sinRubro,
      subtotal: "1000000",
      iva: "0",
      linea_id: "lin-12",
      repartos,
    });
    expect(conLinea.success).toBe(false);
    expect(conLinea.error?.issues[0]?.message).toBe(REPARTO_MEZCLA_MESSAGE);
  });

  it("create still demands rubro_id without repartos and at least one distribution row (S9)", () => {
    const { rubro_id: _r, ...sinRubro } = base;
    void _r;
    expect(GASTO_CREATE_SCHEMA.safeParse({ ...sinRubro, subtotal: "100", iva: "0" }).error?.issues[0]?.message).toBe(
      "El rubro es obligatorio.",
    );
    expect(
      GASTO_CREATE_SCHEMA.safeParse({ ...sinRubro, subtotal: "100", iva: "0", repartos: [] }).error?.issues[0]?.message,
    ).toBe(REPARTO_SIN_FILAS_MESSAGE);
  });

  it("patch accepts repartos and rejects them next to rubro_id (S9)", () => {
    const repartos = [{ linea_id: "lin-12", valor: "350000" }];
    expect(GASTO_PATCH_SCHEMA.safeParse({ repartos }).success).toBe(true);
    const mezcla = GASTO_PATCH_SCHEMA.safeParse({ rubro_id: "rub-1", repartos });
    expect(mezcla.success).toBe(false);
    expect(mezcla.error?.issues[0]?.message).toBe(REPARTO_MEZCLA_MESSAGE);
  });
});

const row = {
  id: "gas-1",
  proyecto_id: "pry-1",
  linea_id: "lin-1",
  fecha_documento: new Date("2026-10-28"),
  periodo: "2026-10",
  tipo_soporte: "FACTURA_PROVEEDOR" as const,
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: "NIT" as const,
  tercero_numero_id: "900.123.456-7",
  tercero_id_norm: "900123456",
  numero_documento: "FE-1",
  numero_documento_norm: "FE1",
  descripcion: "Tiquetes",
  subtotal_cop: new Prisma.Decimal("1000000"),
  iva_cop: new Prisma.Decimal("190000"),
  monto_cop: new Prisma.Decimal("1190000"),
  estado: "REGISTRADO" as const,
  alerta_sobregasto: false,
  registrado_por_id: "u-1",
  created_at: new Date("2026-10-28T12:00:00.000Z"),
  updated_at: new Date("2026-10-28T12:00:00.000Z"),
  validado_por_id: null,
  validado_at: null,
  rechazado_por_id: null,
  rechazado_at: null,
  motivo_rechazo: null,
  anulado_por_id: null,
  anulado_at: null,
  motivo_anulacion: null,
  linea: { rubro: { id: "rub-1", codigo: "R1", nombre: "Transporte" } },
  repartos: [
    {
      linea_id: "lin-1",
      valor: new Prisma.Decimal("1190000"),
      linea: { actividad_id: "act-1", rubro: { id: "rub-1", codigo: "R1", nombre: "Transporte" } },
    },
  ],
  soportes: [],
};

describe("toGastoView", () => {
  it("keeps valor as the Total and adds subtotal and iva", () => {
    const view = toGastoView(row, { puedeVerSoportes: true });
    expect(view).toMatchObject({ valor: "1190000.00", subtotal: "1000000.00", iva: "190000.00" });
  });

  // S9 / T14.2-B1: el gasto publica su reparto (línea, actividad, rubro y valor) para que la pantalla lo muestre;
  // la primera fila es la del primer reparto, que es la línea que guarda la cabecera.
  it("publishes the distribution rows with their activity, header row first (S9)", () => {
    const conReparto = {
      ...row,
      linea_id: "lin-12",
      repartos: [
        {
          linea_id: "lin-13",
          valor: new Prisma.Decimal("650000"),
          linea: { actividad_id: "act-13", rubro: { id: "rub-2", codigo: "R13", nombre: "Alimentación" } },
        },
        {
          linea_id: "lin-12",
          valor: new Prisma.Decimal("540000"),
          linea: { actividad_id: "act-12", rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
        },
      ],
    };

    expect(toGastoView(conReparto, { puedeVerSoportes: true }).repartos).toEqual([
      {
        linea_id: "lin-12",
        actividad_id: "act-12",
        rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" },
        valor: "540000.00",
      },
      {
        linea_id: "lin-13",
        actividad_id: "act-13",
        rubro: { id: "rub-2", codigo: "R13", nombre: "Alimentación" },
        valor: "650000.00",
      },
    ]);
  });
});

describe("periodo from the document date (AJ-05)", () => {
  it("marks the view «periodo_modificado» only when the period differs from the month of the document date (S6)", () => {
    expect(toGastoView(row, { puedeVerSoportes: true }).periodo_modificado).toBe(false);
    expect(toGastoView({ ...row, periodo: "2026-12" }, { puedeVerSoportes: true })).toMatchObject({
      periodo: "2026-12",
      periodo_modificado: true,
    });
  });

  const proyecto = { fecha_inicio: new Date("2026-10-05"), fecha_fin: new Date("2027-01-29") };

  it("defaults to the document month: 28/10/2026 gives 2026-10 with nothing done (S6)", () => {
    expect(evaluarPeriodo(proyecto, "2026-10-28", undefined)).toEqual({ ok: true, value: "2026-10" });
  });

  it("asks to choose the period when the document month is not a project month and none was sent (S5)", () => {
    expect(evaluarPeriodo(proyecto, "2027-03-10", undefined)).toEqual({
      ok: false,
      message: "La fecha del documento está fuera de los meses del proyecto: elige el periodo.",
    });
    expect(PERIODO_DOCUMENTO_FUERA_MESSAGE).toBe("La fecha del documento está fuera de los meses del proyecto: elige el periodo.");
  });

  it("accepts a chosen project month for a document outside the project, and one different from the date's", () => {
    expect(evaluarPeriodo(proyecto, "2027-03-10", "2026-12")).toEqual({ ok: true, value: "2026-12" });
    expect(evaluarPeriodo(proyecto, "2026-10-28", "2026-12")).toEqual({ ok: true, value: "2026-12" });
  });

  it("keeps rejecting an explicit period outside the project months", () => {
    expect(evaluarPeriodo(proyecto, "2026-10-28", "2027-03")).toEqual({ ok: false, message: PERIODO_FUERA_MESSAGE });
  });
});

// S9 / T14.2-B1: la suma del reparto es exactamente el total de la factura (subtotal + IVA), en centavos.
describe("evaluarRepartos", () => {
  it("does not save a distribution of 990.000 for a 1.000.000 invoice (S9)", () => {
    const result = evaluarRepartos(
      [
        { linea_id: "lin-12", valor: "350000" },
        { linea_id: "lin-13", valor: "640000" },
      ],
      toCents("1000000"),
    );
    expect(result).toEqual({ ok: false, message: REPARTO_SUMA_MESSAGE });
  });

  it("splits 1.000.000 into 350.000 for 1.2 and 650.000 for 1.3 in exact cents (S9)", () => {
    const result = evaluarRepartos(
      [
        { linea_id: "lin-12", valor: "350000" },
        { linea_id: "lin-13", valor: "650000" },
      ],
      toCents("1000000"),
    );
    expect(result).toEqual({
      ok: true,
      value: [
        { linea_id: "lin-12", valor: toCents("350000") },
        { linea_id: "lin-13", valor: toCents("650000") },
      ],
    });
  });

  it("compares against the invoice total, IVA included, and keeps cents exact (S9)", () => {
    const filas = [
      { linea_id: "lin-12", valor: "350000.10" },
      { linea_id: "lin-13", valor: "649999.90" },
    ];
    expect(evaluarRepartos(filas, toCents("1000000"))).toMatchObject({ ok: true });
    expect(evaluarRepartos(filas, toCents("1190000"))).toEqual({ ok: false, message: REPARTO_SUMA_MESSAGE });
    expect(
      evaluarRepartos(
        [
          { linea_id: "lin-12", valor: "350000" },
          { linea_id: "lin-13", valor: "840000" },
        ],
        toCents("1190000"),
      ),
    ).toEqual({ ok: true, value: expect.any(Array) });
  });

  // The texts the screen shows, pinned here so a refactor cannot soften them.
  it("names the distribution errors as the screen shows them (S9)", () => {
    expect(REPARTO_MEZCLA_MESSAGE).toBe("Una factura distribuida no lleva rubro ni línea en la cabecera.");
    expect(REPARTO_SUMA_MESSAGE).toBe("Las líneas de la distribución deben sumar exactamente el total de la factura.");
    expect(REPARTO_SIN_FILAS_MESSAGE).toBe("Indica al menos una línea de la distribución.");
    expect(REPARTO_VALOR_MESSAGE).toBe("El valor de cada línea de la distribución debe ser mayor que cero.");
    expect(REPARTO_LINEA_MESSAGE).toBe("Cada línea de la distribución debe ser una línea del proyecto con valor asignado.");
  });

  it("rejects a zero, negative, float-noise or oversized row", () => {
    for (const valor of ["0", "-1", "10.001", "abc", "9999999999999999.99"]) {
      expect(evaluarRepartos([{ linea_id: "lin-12", valor }], toCents("1000000")), valor).toEqual({
        ok: false,
        message: REPARTO_VALOR_MESSAGE,
      });
    }
  });
});

describe("gastoAuditable", () => {
  it("records subtotal and iva next to the total so an edit of either is audited", () => {
    expect(CAMPOS_AUDITABLES_GASTO).toEqual(expect.arrayContaining(["subtotal", "iva", "valor"]));
    expect(gastoAuditable({ ...row, rubro_id: "rub-1" })).toMatchObject({
      subtotal: "1000000.00",
      iva: "190000.00",
      valor: "1190000.00",
    });
  });
});

describe("superaAsignado (AJ-08)", () => {
  it("counts every expense that counts as executed, not only VALIDADO", async () => {
    // 9.000.000 already spent (a mix of REGISTRADO and VALIDADO) + 2.000.000 new > 10.000.000. The money sits on
    // the header line of gastos without rows, which is the legacy shape the alert must keep counting.
    const aggregate = vi.fn().mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("9000000") } });
    const repartido = vi.fn().mockResolvedValue({ _sum: { valor: null } });
    const tx = { gasto: { aggregate }, gastoReparto: { aggregate: repartido } } as never;
    const excede = await superaAsignado(tx, { id: "lin-1", asignado: toCents("10000000") }, toCents("2000000"));
    expect(excede).toBe(true);
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: { in: ["REGISTRADO", "VALIDADO"] },
          // Un gasto con filas cuenta por sus filas, no por su total en la línea de la cabecera.
          repartos: { none: {} },
        }),
        _sum: { monto_cop: true },
      }),
    );
  });

  // S9 / T14.2-B2: la factura repartida mueve 350.000 en la actividad 1.2 (la de la cabecera) y 650.000 en la
  // 1.3. El aviso tiene que ver las dos líneas: la 1.3 no aparece en `gastos.linea_id` en ninguna fila.
  it("counts each distribution row on its own line, never the invoice total on the header line (S9)", async () => {
    const sinFilas = vi.fn().mockResolvedValue({ _sum: { monto_cop: null } });
    const porLinea = vi.fn(async ({ where }: { where: { linea_id: string } }) => ({
      _sum: { valor: new Prisma.Decimal(where.linea_id === "lin-12" ? "350000" : "650000") },
    }));
    const tx = { gasto: { aggregate: sinFilas }, gastoReparto: { aggregate: porLinea } } as never;

    // Cada línea ya tiene exactamente su asignado: un peso más en cualquiera de las dos supera el asignado.
    await expect(superaAsignado(tx, { id: "lin-12", asignado: toCents("350000") }, toCents("1"))).resolves.toBe(true);
    await expect(superaAsignado(tx, { id: "lin-13", asignado: toCents("650000") }, toCents("1"))).resolves.toBe(true);
    // Y el total de la factura (1.000.000) no se cuenta en la línea de la cabecera.
    await expect(superaAsignado(tx, { id: "lin-12", asignado: toCents("1000000") }, toCents("1"))).resolves.toBe(false);
    expect(sinFilas).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ linea_id: "lin-12", repartos: { none: {} } }) }),
    );
    expect(porLinea).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          linea_id: "lin-13",
          gasto: expect.objectContaining({ estado: { in: ["REGISTRADO", "VALIDADO"] } }),
        }),
        _sum: { valor: true },
      }),
    );
  });

  it("leaves the corrected invoice out of the counted rows too (S2/T6, S9)", async () => {
    const sinFilas = vi.fn().mockResolvedValue({ _sum: { monto_cop: null } });
    const porLinea = vi.fn().mockResolvedValue({ _sum: { valor: new Prisma.Decimal("350000") } });
    const tx = { gasto: { aggregate: sinFilas }, gastoReparto: { aggregate: porLinea } } as never;

    await superaAsignado(tx, { id: "lin-12", asignado: toCents("1000000") }, toCents("1"), "gas-1");
    expect(sinFilas).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: "gas-1" } }) }),
    );
    expect(porLinea).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ gasto: expect.objectContaining({ id: { not: "gas-1" } }) }) }),
    );
  });
});

describe("overspend alerts after saving (S2, L16)", () => {
  it("uses the exact «Solicita un traslado al Gerente» message for the critical alert", () => {
    expect(SOBREGASTO_MENSAJE).toBe("Solicita un traslado al Gerente");
    expect(alertaSobregasto("ASIGNADO")).toEqual({ tipo: "SOBREGASTO", mensaje: "Solicita un traslado al Gerente" });
  });

  it("emits the programmed-level warning below the critical one, and nothing when neither applies", () => {
    expect(alertaSobregasto("PROGRAMADO")).toEqual({
      tipo: "SOBREGASTO_PROGRAMADO",
      mensaje: SOBREGASTO_PROGRAMADO_ADVERTENCIA,
    });
    expect(alertaSobregasto(null)).toBeNull();
  });

  /** The tx a single-line answer needs: gastos without rows on their header, plus the distribution rows. */
  function txNivel(opciones: {
    ejecutado?: unknown;
    programado?: { _sum: { valor: Prisma.Decimal | null } };
    repartido?: { _sum: { valor: Prisma.Decimal | null } };
  }) {
    const ejecutado = vi.fn().mockResolvedValue(opciones.ejecutado ?? { _sum: { monto_cop: null } });
    const programado = vi.fn().mockResolvedValue(opciones.programado ?? { _sum: { valor: null } });
    const repartido = vi.fn().mockResolvedValue(opciones.repartido ?? { _sum: { valor: null } });
    return {
      ejecutado,
      programado,
      repartido,
      tx: { gasto: { aggregate: ejecutado }, programacionPeriodo: { aggregate: programado }, gastoReparto: { aggregate: repartido } },
    };
  }

  it("compares the executed accumulated up to the period with the programmed one", async () => {
    const { tx, ejecutado, programado } = txNivel({
      ejecutado: { _sum: { monto_cop: new Prisma.Decimal("3000000") } },
      programado: { _sum: { valor: new Prisma.Decimal("2500000") } },
    });

    await expect(nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: false })).resolves.toBe(
      "PROGRAMADO",
    );
    expect(programado).toHaveBeenCalledWith({
      where: { linea_id: "lin-1", periodo: { lte: "2026-10" } },
      _sum: { valor: true },
    });
    expect(ejecutado).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          linea_id: "lin-1",
          periodo: { lte: "2026-10" },
          estado: { in: ["REGISTRADO", "VALIDADO"] },
          repartos: { none: {} },
        }),
      }),
    );
  });

  // S9 / T14.2-B2: lo ejecutado hasta el corte también sale del reparto; si no, la línea 1.3 de la factura
  // repartida no existe para el aviso.
  it("reads the executed up to the period from the distribution rows of each line (S9)", async () => {
    const { tx, repartido } = txNivel({
      programado: { _sum: { valor: new Prisma.Decimal("2500000") } },
      repartido: { _sum: { valor: new Prisma.Decimal("3000000") } },
    });

    await expect(nivelSobregasto(tx as never, { id: "lin-13" }, { periodo: "2026-10", critico: false })).resolves.toBe(
      "PROGRAMADO",
    );
    expect(repartido).toHaveBeenCalledWith({
      where: expect.objectContaining({
        linea_id: "lin-13",
        gasto: expect.objectContaining({
          estado: { in: ["REGISTRADO", "VALIDADO"] },
          periodo: { lte: "2026-10" },
        }),
      }),
      _sum: { valor: true },
    });
  });

  it("stays quiet while the executed does not exceed the programmed, adding `nuevo` only when predicting", async () => {
    const { tx } = txNivel({
      ejecutado: { _sum: { monto_cop: new Prisma.Decimal("2000000") } },
      programado: { _sum: { valor: new Prisma.Decimal("2500000") } },
    });

    await expect(nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: false })).resolves.toBeNull();
    await expect(
      nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: false, nuevo: toCents("600000") }),
    ).resolves.toBe("PROGRAMADO");
  });

  it("the critical level wins and skips the programmed query", async () => {
    const { tx, ejecutado, programado } = txNivel({});

    await expect(nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: true })).resolves.toBe(
      "ASIGNADO",
    );
    expect(ejecutado).not.toHaveBeenCalled();
    expect(programado).not.toHaveBeenCalled();
  });

  it("reads a line with no programming as $0 and warns on any executed amount", async () => {
    const { tx } = txNivel({ ejecutado: { _sum: { monto_cop: new Prisma.Decimal("1") } } });

    await expect(nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: false })).resolves.toBe(
      "PROGRAMADO",
    );
  });
});

describe("cargarSobregastos (importación)", () => {
  // S9 / T14.2-B2: el lote del importador también suma el reparto, con la misma regla que la costura: un gasto
  // con filas cuenta por sus filas y uno sin filas sigue contando su total en la línea de la cabecera.
  it("counts the distribution rows and the gastos without rows, each on its line (S9)", async () => {
    const programados = vi.fn().mockResolvedValue([]);
    const ejecutados = vi.fn().mockResolvedValue([
      { linea_id: "lin-99", periodo: "2026-10", _sum: { monto_cop: new Prisma.Decimal("900000") } },
    ]);
    const filas = vi.fn().mockResolvedValue([
      { linea_id: "lin-12", valor: new Prisma.Decimal("350000"), gasto: { periodo: "2026-10" } },
      { linea_id: "lin-13", valor: new Prisma.Decimal("650000"), gasto: { periodo: "2026-10" } },
    ]);
    const tx = {
      gasto: { groupBy: ejecutados },
      programacionPeriodo: { groupBy: programados },
      gastoReparto: { findMany: filas },
    };

    const lote = await cargarSobregastos(tx as never, [{ id: "lin-12" }, { id: "lin-13" }]);

    // La línea 1.3 solo recibe dinero por una fila del reparto: el aviso la ve.
    expect(lote.critico({ id: "lin-13", asignado: toCents("650000") }, toCents("1"))).toBe(true);
    expect(lote.critico({ id: "lin-12", asignado: toCents("1000000") }, toCents("0"))).toBe(false);
    // Y el gasto sin filas sigue contando su total en su cabecera.
    expect(lote.critico({ id: "lin-99", asignado: toCents("900000") }, toCents("1"))).toBe(true);
    expect(ejecutados).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ repartos: { none: {} } }) }),
    );
  });
});
