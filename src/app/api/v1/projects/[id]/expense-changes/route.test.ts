// GET /api/v1/projects/:id/expense-changes?periodo=AAAA-MM — T7 (S2, AJ-08 «Propuesto»): «en la ficha financiera, un
// resumen de cambios del periodo (gastos editados y anulados) con acceso al detalle y los motivos, para que el Gerente
// pueda revisarlos sin entrar a la operación diaria». The reader runs for real against the mocked `@/lib/db`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    auditoriaCambio: { findMany: vi.fn() },
    gasto: { findMany: vi.fn() },
    usuario: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const get = (query = "?periodo=2026-11") => new Request(`http://localhost/api/v1/projects/pry-1/expense-changes${query}`);

// One correction (one PATCH = one lote: two field rows plus its motive) and one annulment, both in November.
const filas = [
  {
    id: "aud-1",
    created_at: new Date("2026-11-10T15:00:00.000Z"),
    usuario_id: "ger-1",
    accion: "EDITAR",
    entidad: "gasto",
    entidad_id: "gas-1",
    campo: "valor",
    valor_anterior: "1500000.00",
    valor_nuevo: "1000000.00",
    lote_id: "lote-1",
  },
  {
    id: "aud-2",
    created_at: new Date("2026-11-10T15:00:00.000Z"),
    usuario_id: "ger-1",
    accion: "EDITAR",
    entidad: "gasto",
    entidad_id: "gas-1",
    campo: "subtotal",
    valor_anterior: "1500000.00",
    valor_nuevo: "1000000.00",
    lote_id: "lote-1",
  },
  {
    id: "aud-3",
    created_at: new Date("2026-11-10T15:00:00.000Z"),
    usuario_id: "ger-1",
    accion: "EDITAR",
    entidad: "gasto",
    entidad_id: "gas-1",
    campo: "motivo_correccion",
    valor_anterior: null,
    valor_nuevo: "El proveedor facturó de más",
    lote_id: "lote-1",
  },
  {
    id: "aud-4",
    created_at: new Date("2026-11-12T20:00:00.000Z"),
    usuario_id: "borrado",
    accion: "ANULAR",
    entidad: "gasto",
    entidad_id: "gas-2",
    campo: "estado",
    valor_anterior: "REGISTRADO",
    valor_nuevo: { estado: "ANULADO", motivo: "Factura duplicada" },
    lote_id: null,
  },
];

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "pry-1", miembros: [] } as never);
  vi.mocked(db.auditoriaCambio.findMany).mockResolvedValue(filas as never);
  vi.mocked(db.gasto.findMany).mockResolvedValue([
    { id: "gas-1", numero_documento: "FE-10", tercero_nombre: "Proveedor SAS", estado: "REGISTRADO" },
    { id: "gas-2", numero_documento: "FE-11", tercero_nombre: "Otro SAS", estado: "ANULADO" },
  ] as never);
  vi.mocked(db.usuario.findMany).mockResolvedValue([{ id: "ger-1", nombre: "Laura Jiménez" }] as never);
});
afterEach(() => vi.clearAllMocks());

describe("GET expense-changes (T7)", () => {
  it("lists the period's edited and annulled expenses, one entry per change, with its detail and motive", async () => {
    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.periodo).toBe("2026-11");
    expect(json.cambios).toEqual([
      {
        id: "lote-1",
        accion: "EDITAR",
        fecha: "2026-11-10T15:00:00.000Z",
        usuario_nombre: "Laura Jiménez",
        motivo: "El proveedor facturó de más",
        gasto: { id: "gas-1", numero_documento: "FE-10", tercero_nombre: "Proveedor SAS", estado: "REGISTRADO" },
        detalle: [
          { campo: "valor", antes: "1500000.00", despues: "1000000.00" },
          { campo: "subtotal", antes: "1500000.00", despues: "1000000.00" },
        ],
      },
      {
        id: "aud-4",
        accion: "ANULAR",
        fecha: "2026-11-12T20:00:00.000Z",
        usuario_nombre: null,
        motivo: "Factura duplicada",
        gasto: { id: "gas-2", numero_documento: "FE-11", tercero_nombre: "Otro SAS", estado: "ANULADO" },
        detalle: [{ campo: "estado", antes: "REGISTRADO", despues: "ANULADO" }],
      },
    ]);
  });

  it("reads only gasto corrections and annulments made in the Bogotá month of the period", async () => {
    await GET(get(), ctx);
    expect(db.auditoriaCambio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          proyecto_id: "pry-1",
          entidad: "gasto",
          accion: { in: ["EDITAR", "ANULAR"] },
          // 2026-11-01 00:00 and 2026-12-01 00:00 in Bogotá (UTC-5).
          created_at: { gte: new Date("2026-11-01T05:00:00.000Z"), lt: new Date("2026-12-01T05:00:00.000Z") },
        },
      }),
    );
  });

  it("answers 403 to a role that is not the Gerente's and reads nothing", async () => {
    authAs(coordinador);
    const res = await GET(get(), ctx);
    expect(res.status).toBe(403);
    expect(db.auditoriaCambio.findMany).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing project", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    const res = await GET(get(), ctx);
    expect(res.status).toBe(404);
  });

  it.each(["", "?periodo=2026-13", "?periodo=nov"])("answers 400 for a missing or malformed period (%s)", async (q) => {
    const res = await GET(get(q), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Indica el periodo como AAAA-MM.");
    expect(db.auditoriaCambio.findMany).not.toHaveBeenCalled();
  });
});
