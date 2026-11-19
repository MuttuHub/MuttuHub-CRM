// V5 (S3, decision L8): GET /api/v1/clients/map, the server-side aggregation by departamento.
// It counts only clients with a departamento, groups the rest as «sin departamento», applies the
// clients list's own filter params and sees exactly the clients the list sees.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: { findMany: vi.fn() },
    municipio: { findMany: vi.fn() },
    oportunidad: { groupBy: vi.fn() },
    tarea: { groupBy: vi.fn(), findMany: vi.fn() },
    bitacoraEntrada: { groupBy: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { buildClientWhere } from "@/app/api/v1/clients/route";
import { GET } from "./route";

const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function row(id: string, departamento: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id,
    nombre: `Aliado ${id}`,
    estado: "CLIENTE_ACTIVO",
    departamento,
    ubicacion: "Manizales, Caldas",
    responsable: { nombre: "Ana" },
    _count: { proyectos: 1 },
    ...overrides,
  };
}

function get(query = "") {
  return GET(new Request(`http://localhost/api/v1/clients/map${query}`));
}

beforeEach(() => {
  vi.mocked(db.municipio.findMany).mockResolvedValue([
    { departamento: "Antioquia", codigo_dane: "05001" },
    { departamento: "Caldas", codigo_dane: "17001" },
  ] as never);
  vi.mocked(db.oportunidad.groupBy).mockResolvedValue([]);
  vi.mocked(db.tarea.groupBy).mockResolvedValue([]);
  vi.mocked(db.tarea.findMany).mockResolvedValue([]);
  vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/map", () => {
  it("returns 401 when unauthenticated and does not touch the DB", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), { status: 401 }),
    });
    const res = await get();
    expect(res.status).toBe(401);
    expect(db.cliente.findMany).not.toHaveBeenCalled();
  });

  it("counts only clients with a departamento and puts the rest in «sin departamento»", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([
      row("a", "Antioquia"),
      row("b", "Antioquia", { _count: { proyectos: 2 } }),
      row("c", null),
    ] as never);

    const res = await get();

    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.total).toBe(3);
    expect(data.con_departamento).toBe(2);
    expect(data.departamentos.map((d: { departamento: string; aliados: number; proyectos: number }) => [
      d.departamento,
      d.aliados,
      d.proyectos,
    ])).toEqual([
      ["Antioquia", 2, 3],
      // Client c's ubicacion says Caldas, but without a departamento it never counts there.
      ["Caldas", 0, 0],
    ]);
    expect(data.sin_departamento.aliados).toBe(1);
    expect(data.sin_departamento.clientes[0]).toMatchObject({ id: "c", responsable_nombre: "Ana", proyectos: 1 });
  });

  it("applies the clients list's filter params (estado, responsable) to the query", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([] as never);

    const res = await get("?estado=PROSPECTO&responsable=u-2");

    expect(res.status).toBe(200);
    const where = vi.mocked(db.cliente.findMany).mock.calls[0][0]?.where;
    expect(where).toMatchObject({ estado: "PROSPECTO", responsable_id: "u-2" });
  });

  it("sees exactly the clients the list sees: same where, soft-deleted clients excluded", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([] as never);

    await get("?tipo=FUNDACION&q=acme");

    const where = vi.mocked(db.cliente.findMany).mock.calls[0][0]?.where;
    expect(where).toEqual(buildClientWhere({ tipo: "FUNDACION", q: "acme" }, colaborador));
    expect(where).toMatchObject({ deleted_at: null });
  });

  it("applies the per-client aggregate filters (sinGestion) after enrichment, like the list", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findMany).mockResolvedValue([row("a", "Antioquia"), row("b", "Caldas")] as never);
    // Client a was contacted today, so «sin gestión hace 30 días» keeps only b.
    vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
      { cliente_id: "a", _max: { created_at: new Date() } },
    ] as never);

    const { data } = await (await get("?sinGestion=30")).json();

    expect(data.total).toBe(1);
    expect(data.departamentos.find((d: { departamento: string }) => d.departamento === "Caldas").aliados).toBe(1);
  });

  it("rejects an invalid estado filter with the list's 400", async () => {
    authAs(colaborador);
    const res = await get("?estado=NOPE");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR", error: "Estado de cliente no válido." });
  });
});
