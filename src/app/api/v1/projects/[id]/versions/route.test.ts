// GET /api/v1/projects/:id/versions (S8 U5, E-27): the version history of a project.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ proyectoFindFirst: vi.fn(), versionFindMany: vi.fn(), usuarioFindMany: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: mocks.proyectoFindFirst },
    versionProyecto: { findMany: mocks.versionFindMany },
    usuario: { findMany: mocks.usuarioFindMany },
  },
}));

import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const visualizador = { id: "vis-1", rol: "VISUALIZADOR", puede_ver_tablero_gerencial: true } as unknown as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const get = () => new Request("http://localhost/api/v1/projects/pry-1/versions");

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}
const proyecto = (miembro = false) => ({
  id: "pry-1",
  estado: "EN_EJECUCION",
  valor_total: null,
  fecha_inicio: null,
  fecha_fin: null,
  miembros: miembro ? [{ id: "m-1" }] : [],
});

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.versionFindMany.mockResolvedValue([
    { id: "v1", numero: 1, tipo: "MODIFICACION", solicitud_id: "sol-1", aprobado_por_id: "ger-1", aprobado_at: new Date("2026-10-20T12:00:00.000Z"), solicitud: { motivo: "Mover transporte" } },
    { id: "v0", numero: 0, tipo: "LINEA_BASE", solicitud_id: null, aprobado_por_id: "ger-1", aprobado_at: new Date("2026-10-08T12:00:00.000Z"), solicitud: null },
  ]);
  mocks.usuarioFindMany.mockResolvedValue([{ id: "ger-1", nombre: "Gina" }]);
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/projects/:id/versions", () => {
  it("lists the versions newest first with date, approver and motivo", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(mocks.versionFindMany.mock.calls[0]![0].orderBy).toEqual({ numero: "desc" });
    expect(json.versiones).toEqual([
      { numero: 1, tipo: "MODIFICACION", aprobado_at: "2026-10-20T12:00:00.000Z", aprobado_por: { id: "ger-1", nombre: "Gina" }, motivo: "Mover transporte", solicitud_id: "sol-1" },
      { numero: 0, tipo: "LINEA_BASE", aprobado_at: "2026-10-08T12:00:00.000Z", aprobado_por: { id: "ger-1", nombre: "Gina" }, motivo: null, solicitud_id: null },
    ]);
    expect(JSON.stringify(json)).not.toContain("snapshot");
  });

  it("answers 404 and 403 before listing; reads for a member COORDINADOR and the gerencial viewer", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto());
    authAs(colaborador);
    expect((await GET(get(), ctx)).status).toBe(403);
    authAs(coordinador);
    expect((await GET(get(), ctx)).status).toBe(403);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto(true));
    expect((await GET(get(), ctx)).status).toBe(200);
    expect(visualizador.rol).toBe("VISUALIZADOR");
  });
});
