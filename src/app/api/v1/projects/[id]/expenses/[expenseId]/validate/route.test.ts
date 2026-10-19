// POST /api/v1/projects/:id/expenses/:expenseId/validate (S6 U4): a manager other than the
// registrant validates a REGISTRADO expense; validating beyond the assigned amount of the rubro
// is blocked (409 OVERSPEND_BLOCKED) but the flag and the notifications are COMMITTED.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  reread: vi.fn(),
  usuarioFindMany: vi.fn(),
  notifCreateMany: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    gasto: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: mocks.queryRaw,
        gasto: { updateMany: mocks.updateMany, findFirstOrThrow: mocks.reread },
        usuario: { findMany: mocks.usuarioFindMany },
        notificacion: { createMany: mocks.notifCreateMany },
      }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { gateGastoGestion } from "@/lib/api/validacion-gastos";
import { POST } from "./route";

const gerencia = { id: "ger-2", rol: "GERENCIA" } as Usuario;
const registrante = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

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
  tercero_numero_id: "900123456",
  tercero_id_norm: "900123456",
  numero_documento: "FE-1",
  numero_documento_norm: "FE1",
  descripcion: "Tiquetes",
  monto_cop: new Prisma.Decimal("1000000"),
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
  linea: { rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
  soportes: [],
  ...data,
});

let current = existente();
let asignado = "24000000.00";
let validado = "23500000.00";
let estadoBajoLock = "REGISTRADO";
let estadoProyectoBajoLock: string | null = "EN_EJECUCION";
// What the expense row looks like under FOR UPDATE; overrides simulate a PATCH that landed after the gate read.
let filaBajoLock: Record<string, unknown> = {};
let lineaBloqueada: string | null = null;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const post = () => new Request("http://localhost/x/validate", { method: "POST" });
const sqlOf = (strings: TemplateStringsArray) => strings.join("?");

beforeEach(() => {
  current = existente();
  asignado = "24000000.00";
  validado = "23500000.00";
  estadoBajoLock = "REGISTRADO";
  estadoProyectoBajoLock = "EN_EJECUCION";
  filaBajoLock = {};
  lineaBloqueada = null;
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION" } as never);
  vi.mocked(db.gasto.findFirst).mockImplementation((async () => current) as never);
  mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = sqlOf(strings);
    if (sql.includes('FROM "proyectos"')) {
      return estadoProyectoBajoLock === null ? [] : [{ estado: estadoProyectoBajoLock }];
    }
    if (sql.includes('FROM "lineas_presupuestales"') && sql.includes("FOR UPDATE")) {
      lineaBloqueada = String(values[0]);
      return [{ monto: asignado }];
    }
    if (sql.includes('FROM "gastos"') && sql.includes("FOR UPDATE")) {
      return [
        {
          estado: estadoBajoLock,
          monto: current.monto_cop.toString(),
          linea_id: current.linea_id,
          tercero_tipo_id: current.tercero_tipo_id,
          tercero_numero_id: current.tercero_numero_id,
          ...filaBajoLock,
        },
      ];
    }
    if (sql.includes("SUM")) return [{ total: validado }];
    return [];
  });
  mocks.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    current = { ...current, ...data } as typeof current;
    return { count: 1 };
  });
  mocks.reread.mockImplementation(async () => current);
  mocks.usuarioFindMany.mockResolvedValue([{ id: "g-1" }, { id: "g-2" }]);
  mocks.notifCreateMany.mockResolvedValue({ count: 2 });
});
afterEach(() => vi.clearAllMocks());

describe("POST validate: permissions and guards", () => {
  it("validates another user's expense: VALIDADO, validator and audit VALIDAR", async () => {
    validado = "0.00";
    const res = await POST(post(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.gasto).toMatchObject({ id: "gas-1", estado: "VALIDADO", validado_por_id: "ger-2", alerta_sobregasto: false });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "gas-1", proyecto_id: "pry-1", estado: "REGISTRADO" },
      data: expect.objectContaining({ estado: "VALIDADO", validado_por_id: "ger-2", alerta_sobregasto: false }),
    });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "VALIDAR", entidad: "gasto", entidad_id: "gas-1", proyecto_id: "pry-1", usuario_id: "ger-2" }),
    );
    expect(mocks.notifCreateMany).not.toHaveBeenCalled();
  });

  it("lets an ADMINISTRADOR validate too", async () => {
    authAs(admin);
    validado = "0.00";
    expect((await POST(post(), ctx)).status).toBe(200);
  });

  it("answers 403 to the registrant (segregation of duties) and leaves the row untouched", async () => {
    authAs(registrante);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("No puedes validar un gasto que tú registraste.");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 403 to COORDINADOR and COLABORADOR", async () => {
    for (const actor of [coordinador, colaborador]) {
      authAs(actor);
      expect((await POST(post(), ctx)).status).toBe(403);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing project or expense", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await POST(post(), ctx)).status).toBe(404);
    vi.mocked(db.gasto.findFirst).mockResolvedValueOnce(null as never);
    expect((await POST(post(), ctx)).status).toBe(404);
  });

  it("answers 409 INVALID_STATE for a non-REGISTRADO expense", async () => {
    for (const estado of ["VALIDADO", "RECHAZADO", "ANULADO"]) {
      current = existente({ estado });
      const res = await POST(post(), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("INVALID_STATE");
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 409 when the third-party identification is incomplete", async () => {
    current = existente({ tercero_tipo_id: null });
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Completa el tipo y número de identificación del tercero antes de validar.");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 409 when a racing validation already took the expense (state re-read under lock)", async () => {
    estadoBajoLock = "VALIDADO";
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("INVALID_STATE");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST validate: data re-read under the expense lock", () => {
  it("judges the overspend with the amount of the locked row, not the gate snapshot", async () => {
    asignado = "10000000.00";
    validado = "9900000.00";
    current = existente({ monto_cop: new Prisma.Decimal("50000") }); // gate sees 50,000
    filaBajoLock = { monto: "5000000.00" }; // a PATCH raised it to 5,000,000 before the lock
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("OVERSPEND_BLOCKED");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "gas-1", proyecto_id: "pry-1", estado: "REGISTRADO" },
      data: { alerta_sobregasto: true },
    });
  });

  it("locks and sums the budget line of the locked row when the line changed after the gate", async () => {
    filaBajoLock = { linea_id: "lin-2" };
    validado = "0.00";
    await POST(post(), ctx);
    expect(lineaBloqueada).toBe("lin-2");
  });

  it("refuses with 409 when the third-party data was cleared after the gate", async () => {
    filaBajoLock = { tercero_numero_id: null };
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Completa el tipo y número de identificación del tercero antes de validar.");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("POST validate: overspend", () => {
  it("locks the budget line row before summing the validated total", async () => {
    await POST(post(), ctx);
    const sqls = mocks.queryRaw.mock.calls.map(([strings]) => sqlOf(strings as TemplateStringsArray));
    const lock = sqls.findIndex((sql) => sql.includes('"lineas_presupuestales"') && sql.includes("FOR UPDATE"));
    const sum = sqls.findIndex((sql) => sql.includes("SUM"));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(sum).toBeGreaterThan(lock);
  });

  it("blocks with 409 OVERSPEND_BLOCKED, keeps REGISTRADO, flags it and notifies, all committed", async () => {
    const res = await POST(post(), ctx); // 23.5M + 1M > 24M
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe("OVERSPEND_BLOCKED");
    expect(json.error).toBe("Validar este gasto superaría el valor asignado al rubro. Se notificó a Gerencia.");
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "gas-1", proyecto_id: "pry-1", estado: "REGISTRADO" },
      data: { alerta_sobregasto: true },
    });
    expect(current.estado).toBe("REGISTRADO");
    expect(mocks.usuarioFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rol: "GERENCIA", activo: true } }),
    );
    expect(mocks.notifCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ usuario_id: "g-1", tipo: "SOBREGASTO_RUBRO", proyecto_id: "pry-1", gasto_id: "gas-1" }),
        expect.objectContaining({ usuario_id: "g-2", tipo: "SOBREGASTO_RUBRO", proyecto_id: "pry-1", gasto_id: "gas-1" }),
      ],
      skipDuplicates: true,
    });
  });

  it("returns a result instead of throwing, so the transaction commits the flag", async () => {
    const tx = vi.mocked(db.$transaction);
    await POST(post(), ctx);
    await expect(tx.mock.results[0]?.value).resolves.toMatchObject({ blocked: true });
  });

  it("a second blocked attempt answers 409 again and relies on skipDuplicates for a single row", async () => {
    await POST(post(), ctx);
    await POST(post(), ctx);
    expect(mocks.notifCreateMany).toHaveBeenCalledTimes(2);
    for (const [args] of mocks.notifCreateMany.mock.calls) expect(args.skipDuplicates).toBe(true);
  });

  it("allows equality with the assigned amount (strict greater-than)", async () => {
    validado = "23000000.00"; // + 1M = 24M
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    expect(mocks.notifCreateMany).not.toHaveBeenCalled();
  });

  it("succeeds after the assigned amount is raised and clears the flag", async () => {
    current = existente({ alerta_sobregasto: true });
    asignado = "25000000.00";
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).gasto).toMatchObject({ estado: "VALIDADO", alerta_sobregasto: false });
  });

  it("notifies nobody when there is no active GERENCIA user but still blocks", async () => {
    mocks.usuarioFindMany.mockResolvedValue([]);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect(mocks.notifCreateMany).not.toHaveBeenCalled();
  });
});

describe("POST validate: project estado gate (D1)", () => {
  it.each(["BORRADOR", "CERRADO", "CANCELADO"])("answers 409 when the project is %s and touches nothing", async (estado) => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado } as never);
    const res = await POST(post(), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toMatch(/ejecución o suspendido/);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("validates while the project is SUSPENDIDO", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "SUSPENDIDO" } as never);
    estadoProyectoBajoLock = "SUSPENDIDO";
    validado = "0.00";
    expect((await POST(post(), ctx)).status).toBe(200);
  });

  it("re-checks the project estado under lock: a close that raced the gate answers 409 and writes nothing", async () => {
    estadoProyectoBajoLock = "CERRADO";
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(["CERRADO", "CANCELADO"])("void keeps its gate: gateGastoGestion still passes for a %s project", async (estado) => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado } as never);
    const gate = await gateGastoGestion(gerencia, "pry-1", "gas-1");
    expect(gate.ok).toBe(true);
  });
});
