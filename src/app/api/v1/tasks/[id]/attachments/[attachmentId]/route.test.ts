// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    adjuntoTarea: { findFirst: vi.fn(), delete: vi.fn() },
    documento: { update: vi.fn() },
  },
}));

vi.mock("@/lib/api/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/crm")>();
  return { ...actual, getTaskForWrite: vi.fn() };
});

vi.mock("@/lib/api/audit", () => ({ logAudit: vi.fn() }));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { getTaskForWrite } from "@/lib/api/crm";
import { logAudit } from "@/lib/api/audit";
import { DELETE } from "./route";

const ctx = (id = "t1", attachmentId = "a1") => ({
  params: Promise.resolve({ id, attachmentId }),
});

describe("DELETE /api/v1/tasks/:id/attachments/:attachmentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: true,
      usuario: { id: "u1", rol: "ADMINISTRADOR" } as never,
      supabaseUser: {} as never,
    });
    vi.mocked(getTaskForWrite).mockResolvedValue({ ok: true } as never);
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue({
      id: "a1",
      nombre: "acta.pdf",
      documento_id: "d1",
    } as never);
  });

  it("deletes the attachment and soft-deletes its mirrored document", async () => {
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx());

    expect(res.status).toBe(204);
    expect(db.adjuntoTarea.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(db.documento.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { deleted_at: expect.any(Date) as Date },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "documento", entidad_id: "d1", accion: "eliminar" }),
    );
  });

  it("does not touch documents when the attachment has no mirror", async () => {
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue({
      id: "a1",
      nombre: "acta.pdf",
      documento_id: null,
    } as never);

    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx());

    expect(res.status).toBe(204);
    expect(db.documento.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the attachment does not belong to the task", async () => {
    vi.mocked(db.adjuntoTarea.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx());

    expect(res.status).toBe(404);
    expect(db.adjuntoTarea.delete).not.toHaveBeenCalled();
  });

  it("returns 403 when the user cannot edit the task", async () => {
    vi.mocked(getTaskForWrite).mockResolvedValue({ ok: false, code: "FORBIDDEN" } as never);

    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), ctx());

    expect(res.status).toBe(403);
    expect(db.adjuntoTarea.findFirst).not.toHaveBeenCalled();
  });
});
