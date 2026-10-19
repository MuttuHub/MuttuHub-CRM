// @vitest-environment node
// GET /api/v1/projects/:id/template (S7 U5, E-23).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  proyectoFindFirst: vi.fn(),
  cargarPlantillaInput: vi.fn(),
  logChange: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { proyecto: { findFirst: mocks.proyectoFindFirst } } }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: mocks.logChange };
});
vi.mock("@/lib/api/plantilla-import", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/plantilla-import")>();
  return { ...actual, cargarPlantillaInput: mocks.cargarPlantillaInput };
});

import { requireApiUser } from "@/lib/supabase/server";
import { parsePlantilla } from "@/lib/proyectos/plantilla/parse";
import { fixtureF_X1 } from "@/lib/proyectos/__fixtures__/plantilla-cedetextil";
import { GET } from "./route";

const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const ctx = { params: Promise.resolve({ id: "pry-1" }) };
const request = () => new Request("http://localhost/api/v1/projects/pry-1/template");

function proyecto(over: object = {}) {
  return {
    id: "pry-1",
    estado: "BORRADOR",
    fecha_inicio: new Date("2026-10-05T00:00:00Z"),
    fecha_fin: new Date("2027-01-29T00:00:00Z"),
    ...over,
  };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  vi.clearAllMocks();
  authAs(admin);
  mocks.proyectoFindFirst.mockResolvedValue(proyecto());
  mocks.cargarPlantillaInput.mockResolvedValue(fixtureF_X1("valido"));
  mocks.logChange.mockResolvedValue(undefined);
});

describe("GET /projects/:id/template", () => {
  it("404 when the project does not exist", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(null);
    expect((await GET(request(), ctx)).status).toBe(404);
  });

  it("403 for a non-manager, ahead of the state check", async () => {
    authAs(coordinador);
    mocks.proyectoFindFirst.mockResolvedValue(proyecto({ estado: "EN_EJECUCION" }));
    expect((await GET(request(), ctx)).status).toBe(403);
  });

  it("409 INVALID_STATE outside BORRADOR", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto({ estado: "EN_EJECUCION" }));
    const response = await GET(request(), ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("INVALID_STATE");
  });

  it("409 when the project has no dates yet", async () => {
    mocks.proyectoFindFirst.mockResolvedValue(proyecto({ fecha_fin: null }));
    const response = await GET(request(), ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("Define las fechas del proyecto antes de descargar la plantilla.");
    expect(mocks.cargarPlantillaInput).not.toHaveBeenCalled();
  });

  it("200 streams a real xlsx as an attachment named after the project code", async () => {
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="PRY-2026-001-plantilla.xlsx"');
    const parsed = await parsePlantilla(Buffer.from(await response.arrayBuffer()));
    expect(parsed.version).toBe("2026.1");
    expect(parsed.objetivos).toHaveLength(1);
  });

  it("writes an EXPORTAR audit row, and a failing audit never fails the download", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.logChange.mockRejectedValue(new Error("audit down"));
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(mocks.logChange).toHaveBeenCalledTimes(1);
    expect(mocks.logChange.mock.calls[0]?.[1]).toMatchObject({
      accion: "EXPORTAR",
      entidad: "proyecto",
      entidad_id: "pry-1",
      proyecto_id: "pry-1",
      usuario_id: "adm-1",
    });
  });
});
