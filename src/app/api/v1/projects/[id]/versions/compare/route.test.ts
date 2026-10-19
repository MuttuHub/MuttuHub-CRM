// GET /api/v1/projects/:id/versions/compare?from=0&to=vigente (S8 U5, E-27).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";
import { liveF_V1 } from "@/lib/proyectos/__fixtures__/versiones";
import { applyModificacion } from "@/lib/proyectos/modificaciones";
import { buildSnapshot } from "@/lib/proyectos/versiones";

const mocks = vi.hoisted(() => ({ proyectoFindFirst: vi.fn(), versionFindFirst: vi.fn(), loadVigente: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { proyecto: { findFirst: mocks.proyectoFindFirst }, versionProyecto: { findFirst: mocks.versionFindFirst } },
}));
vi.mock("@/lib/api/versiones", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/versiones")>();
  return { ...actual, loadSnapshotVigente: mocks.loadVigente };
});

import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;

const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const get = (query = "") => new Request(`http://localhost/api/v1/projects/pry-1/versions/compare${query}`);

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

const v0 = buildSnapshot(liveF_V1());
const vigente = applyModificacion(liveF_V1(), {
  tipo: "TRASLADO",
  detalle: [
    { elemento: "presupuesto", clave: "R12", campo: "asignado", antes: "24000000", despues: "23000000" },
    { elemento: "presupuesto", clave: "R13", campo: "asignado", antes: "12800000", despues: "13800000" },
    { elemento: "programacion", clave: "R12|2027-01", campo: "valor", antes: "6000000", despues: "5000000" },
    { elemento: "programacion", clave: "R13|2027-01", campo: "valor", antes: "3200000", despues: "4200000" },
  ],
});

beforeEach(() => {
  authAs(gerencia);
  mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", valor_total: null, fecha_inicio: null, fecha_fin: null, miembros: [] });
  mocks.versionFindFirst.mockImplementation(async ({ where }: { where: { numero: number } }) =>
    where.numero === 0 ? { numero: 0, snapshot: v0 } : null,
  );
  mocks.loadVigente.mockResolvedValue(buildSnapshot(vigente));
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/v1/projects/:id/versions/compare", () => {
  it("compares v0 against the vigente by default", async () => {
    const res = await GET(get(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.desde).toBe("0");
    expect(json.hasta).toBe("vigente");
    expect(json.diferencias.filter((d: { elemento: string }) => d.elemento === "presupuesto").map((d: { clave: string; desde: string; hasta: string }) => `${d.clave}:${d.desde}->${d.hasta}`)).toEqual([
      "R12:24000000.00->23000000.00",
      "R13:12800000.00->13800000.00",
    ]);
    expect(json.diferencias.filter((d: { elemento: string }) => d.elemento === "programacion")).toHaveLength(2);
  });

  it("compares two stored versions and answers [] when they are the same", async () => {
    const res = await GET(get("?from=0&to=0"), ctx);
    expect((await res.json()).diferencias).toEqual([]);
    expect(mocks.loadVigente).not.toHaveBeenCalled();
  });

  it("answers 404 for a version that does not exist and 400 for a token that is not valid", async () => {
    const missing = await GET(get("?from=0&to=9"), ctx);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe("La versión no existe.");
    for (const query of ["?from=abc", "?to=-1", "?from=1.5&to=0"]) {
      const bad = await GET(get(query), ctx);
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toBe("Versión no válida.");
    }
  });

  it("answers 404 and 403 first", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(get(), ctx)).status).toBe(404);
    mocks.proyectoFindFirst.mockResolvedValue({ id: "pry-1", estado: "EN_EJECUCION", valor_total: null, fecha_inicio: null, fecha_fin: null, miembros: [] });
    authAs(colaborador);
    expect((await GET(get(), ctx)).status).toBe(403);
  });
});
