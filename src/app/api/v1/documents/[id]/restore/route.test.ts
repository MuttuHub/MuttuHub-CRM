import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: { findUnique: vi.fn() },
    documento: { findFirst: vi.fn(), updateMany: vi.fn() },
    carpeta: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { logAudit } from "@/lib/api/audit";
import { POST } from "./route";

const colaborador = { id: "user-1", nombre: "Colab Uno", rol: "COLABORADOR" } as Usuario;
const admin = { id: "admin-1", nombre: "Admin Uno", rol: "ADMINISTRADOR" } as Usuario;

function deletedRow(
  overrides: Partial<{ categoria: string; autor_id: string; carpeta_id: string | null }> = {},
) {
  return {
    id: "doc-1",
    titulo: "Propuesta.pdf",
    categoria: overrides.categoria ?? "Comercial",
    autor_id: overrides.autor_id ?? "user-1",
    carpeta_id: overrides.carpeta_id ?? null,
  };
}

function asUser(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

/** The trashed row the gate loads; the duplicate-title lookup that follows finds `twin`. */
function trashed(row: ReturnType<typeof deletedRow>, twin: { id: string; titulo: string } | null = null) {
  vi.mocked(db.documento.findFirst)
    .mockResolvedValueOnce(row as never)
    .mockResolvedValueOnce(twin as never);
}

function restore(id = "doc-1", body?: unknown) {
  return POST(
    new Request(`http://localhost/api/v1/documents/${id}/restore`, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  asUser(admin);
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
  vi.mocked(db.documento.updateMany).mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/v1/documents/:id/restore", () => {
  it("returns 404 when the document is not in the trash (live or missing)", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(null);

    const res = await restore();

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    // The gate only looks for deleted rows.
    expect(vi.mocked(db.documento.findFirst).mock.calls[0]![0]!.where).toEqual({
      id: "doc-1",
      deleted_at: { not: null },
    });
    expect(db.documento.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("returns 403 to a COLABORADOR who is not the author", async () => {
    asUser(colaborador);
    trashed(deletedRow({ autor_id: "someone-else" }));

    const res = await restore();

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.documento.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("returns 403 to the author COLABORADOR when the category is restricted", async () => {
    asUser(colaborador);
    trashed(deletedRow({ categoria: "Legal" }));

    const res = await restore();

    expect(res.status).toBe(403);
    expect(db.documento.updateMany).not.toHaveBeenCalled();
  });

  it("lets the author COLABORADOR restore their own document", async () => {
    asUser(colaborador);
    trashed(deletedRow());

    const res = await restore();

    expect(res.status).toBe(204);
    expect(db.documento.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", deleted_at: { not: null } },
      data: { deleted_at: null },
    });
  });

  it("keeps the folder when it still exists", async () => {
    trashed(
      deletedRow({ autor_id: "someone-else", carpeta_id: "folder-1" })
    );
    vi.mocked(db.carpeta.findFirst).mockResolvedValue({ id: "folder-1" } as never);

    const res = await restore();

    expect(res.status).toBe(204);
    expect(db.carpeta.findFirst).toHaveBeenCalledWith({
      where: { id: "folder-1", deleted_at: null },
      select: { id: true },
    });
    expect(db.documento.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", deleted_at: { not: null } },
      data: { deleted_at: null },
    });
  });

  it("moves the document to the root when its folder was deleted", async () => {
    trashed(
      deletedRow({ autor_id: "someone-else", carpeta_id: "folder-gone" })
    );
    vi.mocked(db.carpeta.findFirst).mockResolvedValue(null);

    const res = await restore();

    expect(res.status).toBe(204);
    expect(db.documento.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", deleted_at: { not: null } },
      data: { deleted_at: null, carpeta_id: null },
    });
  });

  it("answers 404 and writes no audit when a concurrent restore already brought the document back", async () => {
    trashed(deletedRow());
    vi.mocked(db.documento.updateMany).mockResolvedValue({ count: 0 });

    const res = await restore();

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("answers 409 when a live document already has the same title, and restores nothing", async () => {
    trashed(deletedRow(), { id: "doc-2", titulo: "propuesta.PDF" });

    const res = await restore();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Ya existe un documento llamado "propuesta.PDF".',
      code: "CONFLICT",
      documento: { id: "doc-2", titulo: "propuesta.PDF" },
    });
    expect(vi.mocked(db.documento.findFirst).mock.calls[1]![0]!.where).toEqual({
      titulo: { equals: "Propuesta.pdf", mode: "insensitive" },
      deleted_at: null,
      id: { not: "doc-1" },
    });
    expect(db.documento.updateMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("leaves restricted categories out of the duplicate lookup for a COLABORADOR", async () => {
    asUser(colaborador);
    trashed(deletedRow());

    const res = await restore();

    expect(res.status).toBe(204);
    const where = vi.mocked(db.documento.findFirst).mock.calls[1]![0]!.where as { categoria?: unknown };
    expect(where.categoria).toEqual({ notIn: expect.arrayContaining([expect.any(String)]) });
  });

  it("restores despite a same-title document when force is true", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValueOnce(deletedRow() as never);

    const res = await restore("doc-1", { force: true });

    expect(res.status).toBe(204);
    expect(db.documento.findFirst).toHaveBeenCalledTimes(1);
    expect(db.documento.updateMany).toHaveBeenCalledTimes(1);
  });

  it("writes a 'restaurar' audit entry the same way DELETE writes 'eliminar'", async () => {
    trashed(deletedRow());

    await restore();

    expect(logAudit).toHaveBeenCalledWith({
      entidad: "documento",
      entidad_id: "doc-1",
      accion: "restaurar",
      usuario_id: "admin-1",
      cambios: { titulo: "Propuesta.pdf" },
    });
  });
});
