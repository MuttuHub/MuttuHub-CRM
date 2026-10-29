// GET/PATCH /api/v1/projects/:id/expenses/:expenseId (S6 U3): read one expense; the registrant
// edits a REGISTRADO or RECHAZADO one (a rejected expense returns to REGISTRADO).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  reread: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return { ...actual, canViewFinancialSupports: vi.fn(actual.canViewFinancialSupports) };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    lineaPresupuestal: { findFirst: vi.fn() },
    gasto: { findFirst: vi.fn(), findMany: vi.fn() },
    proyectoMiembro: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        gasto: { aggregate: mocks.aggregate, updateMany: mocks.updateMany, findFirstOrThrow: mocks.reread },
      }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChanges } from "@/lib/api/audit-cambios";
import { canViewFinancialSupports } from "@/lib/permissions";
import { GET, PATCH } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const otraGerencia = { id: "ger-2", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({
    id: "pry-1",
    estado,
    fecha_inicio: new Date("2026-10-05"),
    fecha_fin: new Date("2027-01-29"),
    miembros: miembro ? [{ id: "m-1" }] : [],
  }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", expenseId: "gas-1" }) };

const existente = (data: Record<string, unknown> = {}) => ({
  id: "gas-1",
  proyecto_id: "pry-1",
  linea_id: "lin-1",
  fecha_documento: new Date("2026-10-15"),
  periodo: "2026-10",
  tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: "NIT",
  tercero_numero_id: "900.123.456-7",
  tercero_id_norm: "900123456",
  numero_documento: "FE-0123",
  numero_documento_norm: "FE0123",
  descripcion: "Tiquetes del equipo",
  subtotal_cop: new Prisma.Decimal("1500000.50"),
  iva_cop: new Prisma.Decimal("0"),
  monto_cop: new Prisma.Decimal("1500000.50"),
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-16T12:00:00.000Z"),
  updated_at: new Date("2026-10-16T12:00:00.000Z"),
  validado_por_id: null,
  validado_at: null,
  rechazado_por_id: null,
  rechazado_at: null,
  motivo_rechazo: null,
  anulado_por_id: null,
  anulado_at: null,
  motivo_anulacion: null,
  linea: { id: "lin-1", monto_proyectado_cop: new Prisma.Decimal("24000000"), rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
  soportes: [],
  ...data,
});

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
function patch(body: unknown): Request {
  return new Request("http://localhost/x/expenses/gas-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const get = () => new Request("http://localhost/x/expenses/gas-1");
const updatedData = () => mocks.updateMany.mock.calls[0][0].data as Record<string, unknown>;

let current = existente();

beforeEach(() => {
  current = existente();
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.gasto.findFirst).mockImplementation((async () => current) as never);
  vi.mocked(db.gasto.findMany).mockResolvedValue([]);
  vi.mocked(db.proyectoMiembro.findMany).mockResolvedValue([]);
  vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValue({
    id: "lin-1",
    monto_proyectado_cop: new Prisma.Decimal("24000000"),
    rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" },
  } as never);
  mocks.aggregate.mockResolvedValue({ _sum: { monto_cop: null } });
  mocks.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    current = { ...current, ...data } as typeof current;
    return { count: 1 };
  });
  mocks.reread.mockImplementation(async () => current);
});
afterEach(() => vi.clearAllMocks());

describe("GET expenses/:expenseId", () => {
  it("returns the expense scoped to the project", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.gasto).toMatchObject({ id: "gas-1", valor: "1500000.50", tercero_numero_id: "900.123.456-7" });
    expect(db.gasto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gas-1", proyecto_id: "pry-1" } }),
    );
  });

  it("answers 404 for an expense of another project", async () => {
    vi.mocked(db.gasto.findFirst).mockResolvedValue(null as never);
    expect((await GET(get(), ctx)).status).toBe(404);
  });

  it("redacts the identification and supports without financial-support access", async () => {
    vi.mocked(canViewFinancialSupports).mockReturnValue(false);
    const json = await (await GET(get(), ctx)).json();
    expect(json.gasto).not.toHaveProperty("tercero_numero_id");
    expect(json.gasto).not.toHaveProperty("soportes");
  });
});

describe("PATCH expenses/:expenseId", () => {
  it("lets the registrant edit a REGISTRADO expense and audits the changed fields", async () => {
    const res = await PATCH(patch({ descripcion: "Tiquetes aéreos", subtotal: "2000000" }), ctx);
    expect(res.status).toBe(200);
    expect(updatedData()).toMatchObject({ descripcion: "Tiquetes aéreos", monto_cop: expect.anything() });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gas-1", proyecto_id: "pry-1", estado: { in: ["REGISTRADO", "RECHAZADO"] } } }),
    );
    const rows = vi.mocked(logChanges).mock.calls[0][1];
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accion: "EDITAR", entidad: "gasto", entidad_id: "gas-1", campo: "descripcion" }),
        expect.objectContaining({ accion: "EDITAR", campo: "valor", valor_nuevo: "2000000.00" }),
      ]),
    );
  });

  it("recomputes the Total from the new Subtotal and IVA and audits both (S1, S2)", async () => {
    const res = await PATCH(patch({ subtotal: "1000000", iva: "190000" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(updatedData()).toMatchObject({
      subtotal_cop: new Prisma.Decimal("1000000"),
      iva_cop: new Prisma.Decimal("190000"),
      monto_cop: new Prisma.Decimal("1190000"),
    });
    expect(json.gasto).toMatchObject({ subtotal: "1000000.00", iva: "190000.00", valor: "1190000.00" });
    const rows = vi.mocked(logChanges).mock.calls[0][1];
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: "subtotal", valor_anterior: "1500000.50", valor_nuevo: "1000000.00" }),
        expect.objectContaining({ campo: "iva", valor_anterior: "0.00", valor_nuevo: "190000.00" }),
        expect.objectContaining({ campo: "valor", valor_anterior: "1500000.50", valor_nuevo: "1190000.00" }),
      ]),
    );
  });

  it("keeps the stored IVA when only the Subtotal is sent, and the Subtotal when only the IVA is sent", async () => {
    current = existente({
      subtotal_cop: new Prisma.Decimal("1000000"),
      iva_cop: new Prisma.Decimal("190000"),
      monto_cop: new Prisma.Decimal("1190000"),
    });
    await PATCH(patch({ subtotal: "2000000" }), ctx);
    expect(updatedData()).toMatchObject({ iva_cop: new Prisma.Decimal("190000"), monto_cop: new Prisma.Decimal("2190000") });
    mocks.updateMany.mockClear();
    current = existente({
      subtotal_cop: new Prisma.Decimal("1000000"),
      iva_cop: new Prisma.Decimal("190000"),
      monto_cop: new Prisma.Decimal("1190000"),
    });
    await PATCH(patch({ iva: "0" }), ctx);
    expect(updatedData()).toMatchObject({ subtotal_cop: new Prisma.Decimal("1000000"), monto_cop: new Prisma.Decimal("1000000") });
  });

  it("audits a periodo change and marks the edited expense «periodo_modificado» (S5, S6)", async () => {
    const res = await PATCH(patch({ periodo: "2026-12" }), ctx);
    expect(res.status).toBe(200);
    expect(updatedData().periodo).toBe("2026-12");
    expect((await res.json()).gasto).toMatchObject({ periodo: "2026-12", periodo_modificado: true });
    expect(vi.mocked(logChanges).mock.calls[0][1]).toEqual([
      expect.objectContaining({ accion: "EDITAR", entidad: "gasto", campo: "periodo", valor_anterior: "2026-10", valor_nuevo: "2026-12" }),
    ]);
  });

  it("resets the periodo to the new document month when the date changes without a periodo (S5)", async () => {
    current = existente({ periodo: "2026-12" });
    const res = await PATCH(patch({ fecha_documento: "2026-11-20" }), ctx);
    expect(res.status).toBe(200);
    expect(updatedData().periodo).toBe("2026-11");
    expect((await res.json()).gasto.periodo_modificado).toBe(false);
  });

  it("asks to choose the periodo when the new date is outside the project months and none is sent (S5)", async () => {
    const res = await PATCH(patch({ fecha_documento: "2027-03-10" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("La fecha del documento está fuera de los meses del proyecto: elige el periodo.");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    const elegido = await PATCH(patch({ fecha_documento: "2027-03-10", periodo: "2027-01" }), ctx);
    expect(elegido.status).toBe(200);
    expect(updatedData().periodo).toBe("2027-01");
  });

  it("keeps the stored periodo when other fields change", async () => {
    current = existente({ periodo: "2026-12" });
    await PATCH(patch({ descripcion: "Otra" }), ctx);
    expect(updatedData().periodo).toBe("2026-12");
  });

  it("never audits the third-party number in clear (RNF-04)", async () => {
    await PATCH(patch({ tercero_numero_id: "800.555.111-2" }), ctx);
    const audit = JSON.stringify(vi.mocked(logChanges).mock.calls);
    expect(audit).not.toContain("800.555.111");
    expect(audit).not.toContain("900.123.456");
    expect(updatedData()).toMatchObject({ tercero_numero_id: "800.555.111-2", tercero_id_norm: "800555111" });
  });

  it("answers 403 when the actor is not the registrant, even a manager", async () => {
    authAs(otraGerencia);
    expect((await PATCH(patch({ descripcion: "x" }), ctx)).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 403 for a member COORDINADOR who did not register it", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await PATCH(patch({ descripcion: "x" }), ctx)).status).toBe(403);
  });

  it("answers 409 for a VALIDADO expense and never updates", async () => {
    current = existente({ estado: "VALIDADO", validado_por_id: "ger-2", validado_at: new Date() });
    const res = await PATCH(patch({ descripcion: "x" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Un gasto validado no se puede editar.");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("returns a RECHAZADO expense to REGISTRADO and clears the rejection", async () => {
    current = existente({
      estado: "RECHAZADO",
      rechazado_por_id: "ger-2",
      rechazado_at: new Date(),
      motivo_rechazo: "Falta el soporte",
    });
    const res = await PATCH(patch({ descripcion: "Con soporte completo" }), ctx);
    expect(res.status).toBe(200);
    expect(updatedData()).toMatchObject({
      estado: "REGISTRADO",
      motivo_rechazo: null,
      rechazado_por_id: null,
      rechazado_at: null,
    });
    expect((await res.json()).gasto.estado).toBe("REGISTRADO");
    expect(vi.mocked(logChanges).mock.calls[0][1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: "estado", valor_anterior: "RECHAZADO", valor_nuevo: "REGISTRADO" })]),
    );
  });

  it("answers 409 when a racer moved the expense out of the editable estados", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await PATCH(patch({ descripcion: "x" }), ctx)).status).toBe(409);
    expect(logChanges).not.toHaveBeenCalled();
  });

  it("re-resolves the line when the rubro changes and rejects a rubro without assigned amount", async () => {
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValueOnce(null);
    expect((await PATCH(patch({ rubro_id: "rub-9" }), ctx)).status).toBe(400);
    vi.mocked(db.lineaPresupuestal.findFirst).mockResolvedValueOnce({
      id: "lin-9",
      monto_proyectado_cop: new Prisma.Decimal("5000000"),
      rubro: { id: "rub-9", codigo: "R09", nombre: "Equipos" },
    } as never);
    expect((await PATCH(patch({ rubro_id: "rub-9" }), ctx)).status).toBe(200);
    expect(updatedData().linea_id).toBe("lin-9");
  });

  it("validates the periodo, the subtotal, the IVA and an empty body", async () => {
    expect((await PATCH(patch({ periodo: "2027-05" }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ subtotal: "0" }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ iva: "-1" }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ valor: "1" }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ estado: "VALIDADO" }), ctx)).status).toBe(400);
    expect((await PATCH(patch({}), ctx)).status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing expense and 409 outside EN_EJECUCION", async () => {
    vi.mocked(db.gasto.findFirst).mockResolvedValue(null as never);
    expect((await PATCH(patch({ descripcion: "x" }), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("SUSPENDIDO"));
    expect((await PATCH(patch({ descripcion: "x" }), ctx)).status).toBe(409);
  });
});
