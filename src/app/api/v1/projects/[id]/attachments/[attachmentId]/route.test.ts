import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    proyecto: {
      findFirst: vi.fn(),
    },
    soporteProyecto: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { DELETE } from "./route";

const responsable = { id: "colab-2", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;
const ajeno = { id: "colab-3", rol: "COLABORADOR", puede_ver_tablero_gerencial: false } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

const routeContext = { params: Promise.resolve({ id: "proy-1", attachmentId: "sop-1" }) };

afterEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/v1/projects/:id/attachments/:attachmentId", () => {
  it("returns 404 when the project does not exist", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns 403 for a COLABORADOR who is not the project's responsable (delete gated by canManageProject)", async () => {
    authAs(ajeno);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);

    const res = await DELETE(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.soporteProyecto.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the soporte does not exist or belongs to another project", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue(null);

    const res = await DELETE(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft-deletes the soporte for the project's responsable", async () => {
    authAs(responsable);
    vi.mocked(db.proyecto.findFirst).mockResolvedValue({ id: "proy-1", responsable_id: "colab-2" } as never);
    vi.mocked(db.soporteProyecto.findFirst).mockResolvedValue({ id: "sop-1" } as never);

    const res = await DELETE(new Request("http://localhost"), routeContext);

    expect(res.status).toBe(204);
    expect(db.soporteProyecto.update).toHaveBeenCalledWith({
      where: { id: "sop-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
