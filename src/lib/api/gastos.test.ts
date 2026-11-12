// Pure rules of the expense money split (AJ-04): Subtotal + IVA = Total, and the view/audit shape.

import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import {
  CAMPOS_AUDITABLES_GASTO,
  GASTO_CREATE_SCHEMA,
  GASTO_PATCH_SCHEMA,
  PERIODO_DOCUMENTO_FUERA_MESSAGE,
  PERIODO_FUERA_MESSAGE,
  SOBREGASTO_MENSAJE,
  SOBREGASTO_PROGRAMADO_ADVERTENCIA,
  alertaSobregasto,
  evaluarMontosGasto,
  evaluarPeriodo,
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

  it("patch takes subtotal and iva and no longer takes valor", () => {
    expect(GASTO_PATCH_SCHEMA.safeParse({ iva: "0" }).success).toBe(true);
    expect(GASTO_PATCH_SCHEMA.safeParse({ valor: "1" }).success).toBe(false);
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
  soportes: [],
};

describe("toGastoView", () => {
  it("keeps valor as the Total and adds subtotal and iva", () => {
    const view = toGastoView(row, { puedeVerSoportes: true });
    expect(view).toMatchObject({ valor: "1190000.00", subtotal: "1000000.00", iva: "190000.00" });
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
    // 9.000.000 already spent (a mix of REGISTRADO and VALIDADO) + 2.000.000 new > 10.000.000.
    const aggregate = vi.fn().mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("9000000") } });
    const tx = { gasto: { aggregate } } as never;
    const excede = await superaAsignado(tx, { id: "lin-1", asignado: toCents("10000000") }, toCents("2000000"));
    expect(excede).toBe(true);
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ estado: { in: ["REGISTRADO", "VALIDADO"] } }) }),
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

  it("compares the executed accumulated up to the period with the programmed one", async () => {
    const ejecutado = vi.fn().mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("3000000") } });
    const programado = vi.fn().mockResolvedValue({ _sum: { valor: new Prisma.Decimal("2500000") } });
    const tx = { gasto: { aggregate: ejecutado }, programacionPeriodo: { aggregate: programado } };

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
        }),
      }),
    );
  });

  it("stays quiet while the executed does not exceed the programmed, adding `nuevo` only when predicting", async () => {
    const ejecutado = vi.fn().mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("2000000") } });
    const programado = vi.fn().mockResolvedValue({ _sum: { valor: new Prisma.Decimal("2500000") } });
    const tx = { gasto: { aggregate: ejecutado }, programacionPeriodo: { aggregate: programado } };

    await expect(nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: false })).resolves.toBeNull();
    await expect(
      nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: false, nuevo: toCents("600000") }),
    ).resolves.toBe("PROGRAMADO");
  });

  it("the critical level wins and skips the programmed query", async () => {
    const ejecutado = vi.fn();
    const programado = vi.fn();
    const tx = { gasto: { aggregate: ejecutado }, programacionPeriodo: { aggregate: programado } };

    await expect(nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: true })).resolves.toBe(
      "ASIGNADO",
    );
    expect(ejecutado).not.toHaveBeenCalled();
    expect(programado).not.toHaveBeenCalled();
  });

  it("reads a line with no programming as $0 and warns on any executed amount", async () => {
    const ejecutado = vi.fn().mockResolvedValue({ _sum: { monto_cop: new Prisma.Decimal("1") } });
    const programado = vi.fn().mockResolvedValue({ _sum: { valor: null } });
    const tx = { gasto: { aggregate: ejecutado }, programacionPeriodo: { aggregate: programado } };

    await expect(nivelSobregasto(tx as never, { id: "lin-1" }, { periodo: "2026-10", critico: false })).resolves.toBe(
      "PROGRAMADO",
    );
  });
});
