// GET /api/v1/projects/:id/versions/:numero (S8 U5, E-27): one frozen snapshot.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ proyectoFindFirst: vi.fn(), versionFindFirst: vi.fn(), usuarioFindMany: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: mocks.proyectoFindFirst },
    versionProyecto: { findFirst: mocks.versionFindFirst },
    usuario: { findMany: mocks.usuarioFindMany },
  },
}));

import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const ctx = (numero: string) => ({ params: Promise.resolve({ id: "pry-1", numero }) });
const get = () => new Request("http://localhost/api/v1/projects/pry-1/versions/0");

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", valor_total: null, fecha_inicio: null, fecha_fin: null, miembros: [] });
  mocks.versionFindFirst.mockResolvedValue({
    numero: 0,
    tipo: "LINEA_BASE",
    solicitud_id: null,
    aprobado_por_id: "ger-1",
    aprobado_at: new Date("2026-10-08T12:00:00.000Z"),
    snapshot: { schema: 1, proyecto: { valor_total: "100.00" } },
    solicitud: null,
  });
  mocks.usuarioFindMany.mockResolvedValue([{ id: "ger-1", nombre: "Gina" }]);
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/projects/:id/versions/:numero", () => {
  it("returns the version with its snapshot", async () => {
    const res = await GET(get(), ctx("0"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(mocks.versionFindFirst.mock.calls[0]![0].where).toEqual({ proyecto_id: "pry-1", numero: 0 });
    expect(json.version).toMatchObject({ numero: 0, tipo: "LINEA_BASE", aprobado_por: { id: "ger-1", nombre: "Gina" }, snapshot: { schema: 1 } });
  });

  it("answers 404 for a version that does not exist and 400 for a token that is not a number", async () => {
    mocks.versionFindFirst.mockResolvedValue(null);
    const res = await GET(get(), ctx("7"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("La versión no existe.");
    for (const token of ["abc", "-1", "1.5", "vigente"]) {
      const bad = await GET(get(), ctx(token));
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toBe("Versión no válida.");
    }
  });

  it("answers 404 and 403 before reading the version", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(get(), ctx("0"))).status).toBe(404);
    mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", valor_total: null, fecha_inicio: null, fecha_fin: null, miembros: [] });
    authAs(colaborador);
    expect((await GET(get(), ctx("0"))).status).toBe(403);
    expect(mocks.versionFindFirst).not.toHaveBeenCalled();
  });

  it("keeps `compare` as its own static route so the dynamic [numero] never shadows it", () => {
    expect(existsSync(join(__dirname, "..", "compare", "route.ts"))).toBe(true);
  });
});
