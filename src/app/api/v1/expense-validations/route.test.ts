// GET /api/v1/expense-validations (S6 U4): the cross-project validation queue for ADM/GER.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/db", () => ({
  db: {
    gasto: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-2", rol: "GERENCIA" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;

const fila = (id: string, data: Record<string, unknown> = {}) => ({
  id,
  proyecto_id: id === "gas-1" ? "pry-1" : "pry-2",
  proyecto: { codigo: id === "gas-1" ? "PRY-001" : "PRY-002", nombre: "Proyecto" },
  linea: { rubro: { id: "rub-1", codigo: "R12", nombre: "Transporte" } },
  fecha_documento: new Date("2026-10-15"),
  periodo: "2026-10",
  tercero_nombre: "Proveedor SAS",
  tercero_tipo_id: "NIT",
  tercero_numero_id: "900123456",
  numero_documento: "FE-1",
  descripcion: "Tiquetes",
  monto_cop: new Prisma.Decimal("1000000"),
  estado: "REGISTRADO",
  alerta_sobregasto: false,
  registrado_por_id: "ger-1",
  created_at: new Date("2026-10-16T12:00:00.000Z"),
  _count: { soportes: 1 },
  ...data,
});

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const get = (qs = "") => new Request(`http://localhost/api/v1/expense-validations${qs}`);

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.gasto.findMany).mockResolvedValue([
    fila("gas-1"),
    fila("gas-2", { registrado_por_id: "ger-2", alerta_sobregasto: true, tercero_numero_id: null }),
  ] as never);
  vi.mocked(db.usuario.findMany).mockResolvedValue([
    { id: "ger-1", nombre: "Ana" },
    { id: "ger-2", nombre: "Beto" },
  ] as never);
});
afterEach(() => vi.clearAllMocks());

describe("GET expense-validations", () => {
  it("lists REGISTRADO expenses of live EN_EJECUCION projects across projects, oldest first", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(db.gasto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: "REGISTRADO", proyecto: { deleted_at: null, estado: { in: ["EN_EJECUCION"] } } },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        take: 50,
      }),
    );
    const json = await res.json();
    expect(json.gastos).toHaveLength(2);
    expect(json.gastos[0]).toMatchObject({
      id: "gas-1",
      proyecto_id: "pry-1",
      proyecto_codigo: "PRY-001",
      rubro: { nombre: "Transporte" },
      valor: "1000000.00",
      registrado_por_nombre: "Ana",
      propio: false,
      datos_incompletos: false,
      alerta_sobregasto: false,
      sin_soporte: false,
    });
  });

  it("marks expenses without a live support, which cannot be validated yet (B8)", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([fila("gas-1", { _count: { soportes: 0 } })] as never);
    const json = await (await GET(get())).json();
    expect(db.gasto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ _count: { select: { soportes: { where: { deleted_at: null } } } } }),
      }),
    );
    expect(json.gastos[0]).toMatchObject({ id: "gas-1", sin_soporte: true });
    expect(json.gastos[0]).not.toHaveProperty("_count");
  });

  it("marks the actor's own expenses and the incomplete ones", async () => {
    const json = await (await GET(get())).json();
    expect(json.gastos[1]).toMatchObject({ id: "gas-2", propio: true, datos_incompletos: true, alerta_sobregasto: true });
  });

  it("never exposes the third-party identification number", async () => {
    const text = JSON.stringify(await (await GET(get())).json());
    expect(text).not.toContain("900123456");
  });

  it("is available to ADMINISTRADOR and forbidden to everyone else", async () => {
    authAs(admin);
    expect((await GET(get())).status).toBe(200);
    authAs(coordinador);
    expect((await GET(get())).status).toBe(403);
    authAs({ id: "c", rol: "COLABORADOR" } as Usuario);
    expect((await GET(get())).status).toBe(403);
  });

  it("whitelists estado and bounds limit", async () => {
    expect((await GET(get("?estado=BORRADOR"))).status).toBe(400);
    expect((await GET(get("?limit=abc"))).status).toBe(400);
    expect((await GET(get("?limit=0"))).status).toBe(400);
    await GET(get("?estado=RECHAZADO&limit=10"));
    expect(db.gasto.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { estado: "RECHAZADO", proyecto: { deleted_at: null, estado: { in: ["EN_EJECUCION", "SUSPENDIDO"] } } }, take: 10 }),
    );
  });
});
