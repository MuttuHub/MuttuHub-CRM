import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: { findUnique: vi.fn() },
    documento: { findFirst: vi.fn(), update: vi.fn() },
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
    categoria: overrides.categoria ?? "Comercial",
    autor_id: overrides.autor_id ?? "user-1",
    carpeta_id: overrides.carpeta_id ?? null,
  };
}

function asUser(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function restore(id = "doc-1") {
  return POST(new Request(`http://localhost/api/v1/documents/${id}/restore`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  asUser(admin);
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
  vi.mocked(db.documento.update).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.clearAllMocks();
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
    expect(db.documento.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("returns 403 to a COLABORADOR who is not the author", async () => {
    asUser(colaborador);
    vi.mocked(db.documento.findFirst).mockResolvedValue(deletedRow({ autor_id: "someone-else" }) as never);

    const res = await restore();

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.documento.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("returns 403 to the author COLABORADOR when the category is restricted", async () => {
    asUser(colaborador);
    vi.mocked(db.documento.findFirst).mockResolvedValue(deletedRow({ categoria: "Legal" }) as never);

    const res = await restore();

    expect(res.status).toBe(403);
    expect(db.documento.update).not.toHaveBeenCalled();
  });

  it("lets the author COLABORADOR restore their own document", async () => {
    asUser(colaborador);
    vi.mocked(db.documento.findFirst).mockResolvedValue(deletedRow() as never);

    const res = await restore();

    expect(res.status).toBe(204);
    expect(db.documento.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { deleted_at: null },
    });
  });

  it("keeps the folder when it still exists", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(
      deletedRow({ autor_id: "someone-else", carpeta_id: "folder-1" }) as never,
    );
    vi.mocked(db.carpeta.findFirst).mockResolvedValue({ id: "folder-1" } as never);

    const res = await restore();

    expect(res.status).toBe(204);
    expect(db.carpeta.findFirst).toHaveBeenCalledWith({
      where: { id: "folder-1", deleted_at: null },
      select: { id: true },
    });
    expect(db.documento.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { deleted_at: null },
    });
  });

  it("moves the document to the root when its folder was deleted", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(
      deletedRow({ autor_id: "someone-else", carpeta_id: "folder-gone" }) as never,
    );
    vi.mocked(db.carpeta.findFirst).mockResolvedValue(null);

    const res = await restore();

    expect(res.status).toBe(204);
    expect(db.documento.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { deleted_at: null, carpeta_id: null },
    });
  });

  it("writes a 'restaurar' audit entry the same way DELETE writes 'eliminar'", async () => {
    vi.mocked(db.documento.findFirst).mockResolvedValue(deletedRow() as never);

    await restore();

    expect(logAudit).toHaveBeenCalledWith({
      entidad: "documento",
      entidad_id: "doc-1",
      accion: "restaurar",
      usuario_id: "admin-1",
    });
  });
});
