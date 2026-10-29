// DELETE /api/v1/projects/:id/supports/:supportId: soft-deletes a project-origin document.
// Managers delete any project document; a member COORDINADOR only their own uploads. Supports of
// avances, measurements and expenses are not addressable here (404).
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn(), isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/api/audit-cambios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/audit-cambios")>();
  return { ...actual, logChange: vi.fn(), logChanges: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  db: {
    proyecto: { findFirst: vi.fn() },
    soporteProyecto: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ soporteProyecto: { updateMany: mocks.updateMany } })),
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logChange } from "@/lib/api/audit-cambios";
import { DELETE } from "./route";

const gerencia = { id: "ger-1", rol: "GERENCIA" } as Usuario;
const admin = { id: "adm-1", rol: "ADMINISTRADOR" } as Usuario;
const coordinador = { id: "coord-1", rol: "COORDINADOR" } as Usuario;
const colaborador = { id: "col-1", rol: "COLABORADOR" } as Usuario;
const proyecto = (estado = "EN_EJECUCION", miembro = false) =>
  ({ id: "pry-1", estado, miembros: miembro ? [{ id: "m-1" }] : [] }) as never;
const ctx = { params: Promise.resolve({ id: "pry-1", supportId: "doc-1" }) };
const del = () => new Request("http://localhost/x", { method: "DELETE" });
const documento = (over: object = {}) =>
  ({
    id: "doc-1",
    nombre: "Contrato.pdf",
    storage_path: "proyectos/pry-1/soportes/u_contrato.pdf",
    url_externa: null,
    subido_por_id: "coord-1",
    ...over,
  }) as never;

const PROJECT_ORIGIN = { avance_id: null, medicion_id: null, gasto_id: null };

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

beforeEach(() => {
  authAs(gerencia);
  vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
  vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue(documento());
  mocks.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.clearAllMocks());

describe("DELETE /projects/:id/supports/:supportId", () => {
  it("soft-deletes a live project-origin document of THIS project and audits it", async () => {
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(200);
    expect(db.soporteProyecto.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "doc-1", proyecto_id: "pry-1", deleted_at: null, ...PROJECT_ORIGIN } }),
    );
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", proyecto_id: "pry-1", deleted_at: null, ...PROJECT_ORIGIN },
      data: { deleted_at: expect.any(Date) },
    });
    expect(logChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usuario_id: "ger-1",
        accion: "ANULAR",
        entidad: "proyecto",
        entidad_id: "pry-1",
        proyecto_id: "pry-1",
        campo: "documento",
        valor_anterior: expect.objectContaining({ documento_id: "doc-1", nombre: "Contrato.pdf", tipo: "archivo" }),
      }),
    );
  });

  it("lets managers delete any project document", async () => {
    for (const usuario of [admin, gerencia]) {
      authAs(usuario);
      expect((await DELETE(del(), ctx)).status, usuario.rol).toBe(200);
    }
  });

  it("lets a member COORDINADOR delete their own upload but not someone else's", async () => {
    authAs(coordinador);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto("EN_EJECUCION", true));
    expect((await DELETE(del(), ctx)).status).toBe(200);
    mocks.updateMany.mockClear();
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue(documento({ subido_por_id: "ger-1" }));
    expect((await DELETE(del(), ctx)).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 403 to a non-member COORDINADOR and a COLABORADOR, even for their own upload", async () => {
    authAs(coordinador);
    expect((await DELETE(del(), ctx)).status).toBe(403);
    authAs(colaborador);
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue(documento({ subido_por_id: "col-1" }));
    expect((await DELETE(del(), ctx)).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 409 in SUSPENDIDO, CERRADO and CANCELADO, and 200 in BORRADOR and EN_EJECUCION", async () => {
    for (const estado of ["SUSPENDIDO", "CERRADO", "CANCELADO"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(estado));
      expect((await DELETE(del(), ctx)).status, estado).toBe(409);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
    for (const estado of ["BORRADOR", "EN_EJECUCION"]) {
      vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto(estado));
      expect((await DELETE(del(), ctx)).status, estado).toBe(200);
    }
  });

  it("answers 404 for an unknown project, or a support of another project or another origin", async () => {
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);
    expect((await DELETE(del(), ctx)).status).toBe(404);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(proyecto());
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue(null);
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("answers 404 when a concurrent delete won the race, writing no audit", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(del(), ctx)).status).toBe(404);
    expect(logChange).not.toHaveBeenCalled();
  });
});
