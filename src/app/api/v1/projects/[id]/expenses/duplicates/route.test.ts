// GET /api/v1/projects/:id/expenses/duplicates (S2, L16 b): read-only duplicate check for the
// expense form, with the same normalized keys, wording and project-readability gate as
// `buscarDuplicados` (RF-21). It never blocks and never writes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    gasto: { findMany: vi.fn() },
    proyectoMiembro: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({
    id: "pry-1",
    estado,
    fecha_inicio: new Date("2026-10-05"),
    fecha_fin: new Date("2027-01-29"),
    miembros: miembro ? [{ id: "m-1" }] : [],
  }) as never;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };

function consulta(params: Record<string, string> = {}): Request {
  const query = new URLSearchParams(params).toString();
  return new Request(`http://localhost/api/v1/projects/pry-1/expenses/duplicates?${query}`);
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.gasto.findMany).mockResolvedValue([]);
  vi.mocked(db.proyectoMiembro.findMany).mockResolvedValue([]);
});
afterEach(() => vi.clearAllMocks());

describe("GET expenses/duplicates", () => {
  it("finds a live expense with the same normalized identification and document number", async () => {
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { id: "gas-9", proyecto_id: "pry-1", proyecto: { codigo: "PRY-2026-001" } },
    ] as never);

    const res = await GET(
      consulta({ tercero_tipo_id: "NIT", tercero_numero_id: "900.123.456-7", numero_documento: "fe 0123" }),
      ctx,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.alertas).toEqual([
      {
        tipo: "DUPLICADO",
        gasto_id: "gas-9",
        proyecto_codigo: "PRY-2026-001",
        mensaje: "Ya existe un gasto con el mismo NIT/cédula y número de documento (proyecto PRY-2026-001).",
      },
    ]);
    expect(db.gasto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tercero_id_norm: "900123456",
          numero_documento_norm: "FE0123",
          estado: { in: ["REGISTRADO", "VALIDADO"] },
          id: { not: "" },
        },
      }),
    );
  });

  it("answers an empty list when there is no duplicate", async () => {
    const json = await (await GET(consulta({ tercero_numero_id: "900123456", numero_documento: "FE-1" }), ctx)).json();
    expect(json).toEqual({ alertas: [] });
  });

  it("skips the lookup when the third-party number is missing (RF-21)", async () => {
    const json = await (await GET(consulta({ numero_documento: "FE-1" }), ctx)).json();
    expect(json).toEqual({ alertas: [] });
    expect(db.gasto.findMany).not.toHaveBeenCalled();
  });

  it("hides the project of a duplicate the actor cannot read", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    vi.mocked(db.gasto.findMany).mockResolvedValue([
      { id: "gas-9", proyecto_id: "pry-2", proyecto: { codigo: "PRY-2026-002" } },
    ] as never);

    const json = await (await GET(consulta({ tercero_numero_id: "900123456", numero_documento: "FE-1" }), ctx)).json();
    expect(json.alertas[0]).toMatchObject({ tipo: "DUPLICADO", gasto_id: null, proyecto_codigo: null });
    expect(json.alertas[0].mensaje).toContain("(en otro proyecto)");
    expect(JSON.stringify(json)).not.toContain("PRY-2026-002");
  });

  it("answers 400 without the document number", async () => {
    const res = await GET(consulta({ tercero_numero_id: "900123456" }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "El número de documento es obligatorio.",
    });
    expect(db.gasto.findMany).not.toHaveBeenCalled();
  });

  it("uses the project-readability gate: 404 for a missing project and 403 without read access", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValueOnce(null);
    expect((await GET(consulta({ numero_documento: "FE-1" }), ctx)).status).toBe(404);

    authAs(colaborador);
    expect((await GET(consulta({ numero_documento: "FE-1" }), ctx)).status).toBe(403);

    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", false));
    expect((await GET(consulta({ numero_documento: "FE-1" }), ctx)).status).toBe(403);
    expect(db.gasto.findMany).not.toHaveBeenCalled();
  });
});
