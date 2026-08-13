import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      count: vi.fn(),
    },
    tarea: {
      count: vi.fn(),
    },
    documento: {
      count: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const colaborador = {
  id: "colab-1",
  rol: "COLABORADOR",
} as Usuario;

const coordinador = {
  id: "coord-1",
  rol: "COORDINADOR",
} as Usuario;

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function mockCounts(clientes: number, tablero: number, documentos: number) {
  vi.mocked(db.cliente.count).mockResolvedValue(clientes as never);
  vi.mocked(db.tarea.count).mockResolvedValue(tablero as never);
  vi.mocked(db.documento.count).mockResolvedValue(documentos as never);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/nav/counts", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("reflects the mocked counts in the response", async () => {
    mockAuth(coordinador);
    mockCounts(3, 5, 7);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ clientes: 3, tablero: 5, documentos: 7 });
  });

  it("scopes clientes and tablero counts to responsable_id for COLABORADOR", async () => {
    mockAuth(colaborador);
    mockCounts(0, 0, 0);

    await GET();

    const clienteWhere = vi.mocked(db.cliente.count).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(clienteWhere.responsable_id).toBe("colab-1");
    const tareaWhere = vi.mocked(db.tarea.count).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(tareaWhere.responsable_id).toBe("colab-1");
  });

  it("does not scope by responsable_id for full-access roles (sees platform-wide counts)", async () => {
    mockAuth(coordinador);
    mockCounts(0, 0, 0);

    await GET();

    const clienteWhere = vi.mocked(db.cliente.count).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(clienteWhere.responsable_id).toBeUndefined();
    const tareaWhere = vi.mocked(db.tarea.count).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(tareaWhere.responsable_id).toBeUndefined();
  });
});
