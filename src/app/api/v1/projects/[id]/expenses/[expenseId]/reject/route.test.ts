// POST /api/v1/projects/:id/expenses/:expenseId/reject (S6 U4): a manager other than the
// registrant rejects a REGISTRADO expense with a motivo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), reread: vi.fn(), notifUpsert: vi.fn(), queryRaw: vi.fn() }));

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
        notificacion: { upsert: mocks.notifUpsert },
      }),
    ),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { POST } from "./route";

const gerencia = { id: "ger-2", rol: "GERENCIA" } as Usuario;
const registrante = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1", expenseId: "gas-1" }) };

const existente = (data: Record<string, unknown> = {}) => ({
  id: "gas-1",
  proyecto_id: "pry-1",
  linea_id: "lin-1",
  fecha_documento: new Date("2026-10-15"),
  periodo: "2026-10",
  tipo_soporte: "FACTURA_PROVEEDOR",
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: null,
  tercero_numero_id: null,
  tercero_id_norm: null,
  numero_documento: "FE-1",
  numero_documento_norm: "FE1",
  descripcion: "Tiquetes",
  monto_cop: new Prisma.Decimal("1000000"),
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-16T12:00:00.000Z"),
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
let estadoProyectoBajoLock: string | null = "EN_EJECUCION";
function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const post = (body: unknown) =>
  new Request("http://localhost/x/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  current = existente();
  estadoProyectoBajoLock = "EN_EJECUCION";
  mocks.queryRaw.mockImplementation(async () =>
    estadoProyectoBajoLock === null ? [] : [{ estado: estadoProyectoBajoLock }],
  );
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION" } as never);
  vi.mocked(db.gasto.findFirst).mockImplementation((async () => current) as never);
  mocks.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    current = { ...current, ...data } as typeof current;
    return { count: 1 };
  });
  mocks.reread.mockImplementation(async () => current);
});
afterEach(() => vi.clearAllMocks());

describe("POST reject", () => {
  it("rejects with a motivo: RECHAZADO, rejector, motivo and audit RECHAZAR (identification not required)", async () => {
    const res = await POST(post({ motivo: "Soporte ilegible" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.gasto).toMatchObject({ estado: "RECHAZADO", rechazado_por_id: "ger-2", motivo_rechazo: "Soporte ilegible" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "gas-1", proyecto_id: "pry-1", estado: "REGISTRADO" },
      data: expect.objectContaining({ estado: "RECHAZADO", rechazado_por_id: "ger-2", motivo_rechazo: "Soporte ilegible" }),
    });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accion: "RECHAZAR", entidad: "gasto", entidad_id: "gas-1", usuario_id: "ger-2" }),
    );
  });

  it("notifies the expense author inside the transaction, and the reason travels with the expense row", async () => {
    await POST(post({ motivo: "Soporte ilegible" }), ctx);
    expect(mocks.notifUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.notifUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuario_id_tipo_gasto_id: { usuario_id: "ger-1", tipo: "GASTO_RECHAZADO", gasto_id: "gas-1" } },
        create: { usuario_id: "ger-1", tipo: "GASTO_RECHAZADO", proyecto_id: "pry-1", gasto_id: "gas-1" },
      }),
    );
  });

  it("creates no notification when the rejection is refused (own expense, racing validation)", async () => {
    authAs(registrante);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(403);
    authAs(gerencia);
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(409);
    expect(mocks.notifUpsert).not.toHaveBeenCalled();
  });

  it("requires a non-empty motivo (400) and rejects unknown keys", async () => {
    for (const body of [{}, { motivo: "   " }, { motivo: "x", extra: 1 }]) {
      expect((await POST(post(body), ctx)).status).toBe(400);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 403 to the registrant and to non-managers", async () => {
    for (const actor of [registrante, coordinador]) {
      authAs(actor);
      expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(403);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing expense and 409 for a non-REGISTRADO one", async () => {
    vi.mocked(db.gasto.findFirst).mockResolvedValueOnce(null as never);
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(404);
    current = existente({ estado: "VALIDADO" });
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(409);
  });

  it("answers 409 when a racing validation won (guarded write updates nothing)", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(409);
  });
});

describe("POST reject: project estado gate (D1)", () => {
  it.each(["BORRADOR", "CERRADO", "CANCELADO"])("answers 409 when the project is %s and touches nothing", async (estado) => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado } as never);
    const res = await POST(post({ motivo: "Soporte ilegible" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toMatch(/ejecución o suspendido/);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects while the project is SUSPENDIDO", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", estado: "SUSPENDIDO" } as never);
    estadoProyectoBajoLock = "SUSPENDIDO";
    expect((await POST(post({ motivo: "x" }), ctx)).status).toBe(200);
  });

  it("re-checks the project estado under lock: a close that raced the gate answers 409 and writes nothing", async () => {
    estadoProyectoBajoLock = "CERRADO";
    const res = await POST(post({ motivo: "x" }), ctx);
    expect(res.status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.notifUpsert).not.toHaveBeenCalled();
  });
});
