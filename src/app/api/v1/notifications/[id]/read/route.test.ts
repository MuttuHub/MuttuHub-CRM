import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    notificacion: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { DELETE } from "./route";

const usuario = {
  id: "user-1",
  rol: "COORDINADOR",
} as Usuario;

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/v1/notifications/:id/read", () => {
  it("marks a read notification as unread", async () => {
    vi.mocked(db.notificacion.findFirst).mockResolvedValue({
      id: "n-1",
      leida: true,
    } as never);
    vi.mocked(db.notificacion.update).mockResolvedValue({} as never);

    const res = await DELETE(new Request("http://localhost/api/v1/notifications/n-1/read"), {
      params: Promise.resolve({ id: "n-1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificacion: { id: "n-1", leida: false } });
    expect(db.notificacion.update).toHaveBeenCalledWith({
      where: { id: "n-1" },
      data: { leida: false },
    });
  });

  it("is idempotent: an already unread notification returns 200 without changes", async () => {
    vi.mocked(db.notificacion.findFirst).mockResolvedValue({
      id: "n-1",
      leida: false,
    } as never);

    const res = await DELETE(new Request("http://localhost/api/v1/notifications/n-1/read"), {
      params: Promise.resolve({ id: "n-1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notificacion: { id: "n-1", leida: false } });
    expect(db.notificacion.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the notification does not exist or belongs to another user", async () => {
    vi.mocked(db.notificacion.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost/api/v1/notifications/n-1/read"), {
      params: Promise.resolve({ id: "n-1" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.notificacion.update).not.toHaveBeenCalled();
  });
});