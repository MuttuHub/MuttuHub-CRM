import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    bitacoraEntrada: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function getRequest(query = ""): Request {
  return new Request(`http://localhost/api/v1/interactions${query}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/interactions", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
    expect(db.bitacoraEntrada.findMany).not.toHaveBeenCalled();
  });

  it("returns the cross-client feed with cliente and oportunidad context (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([
      {
        id: "bit-1",
        cliente_id: "cli-1",
        cliente: { nombre: "Aliado Uno" },
        oportunidad_id: "op-1",
        oportunidad: { nombre: "Oportunidad Uno" },
        autor_id: "gerencia-1",
        autor: { nombre: "Gerencia Uno" },
        texto: "Reunión de seguimiento",
        tipo: "REUNION",
        proximo_paso: "Enviar propuesta",
        created_at: new Date("2026-01-01"),
      },
    ] as never);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.interacciones).toEqual([
      {
        id: "bit-1",
        cliente_id: "cli-1",
        cliente_nombre: "Aliado Uno",
        oportunidad_id: "op-1",
        oportunidad_nombre: "Oportunidad Uno",
        autor_id: "gerencia-1",
        autor_nombre: "Gerencia Uno",
        texto: "Reunión de seguimiento",
        tipo: "REUNION",
        proximo_paso: "Enviar propuesta",
        created_at: new Date("2026-01-01").toISOString(),
      },
    ]);
    // The feed is a global read, ordered newest-first.
    expect(db.bitacoraEntrada.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: "desc" } }),
    );
  });

  it("returns a null oportunidad_nombre for a client-only entry", async () => {
    authAs(gerencia);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([
      {
        id: "bit-1",
        cliente_id: "cli-1",
        cliente: { nombre: "Aliado Uno" },
        oportunidad_id: null,
        oportunidad: null,
        autor_id: "gerencia-1",
        autor: { nombre: "Gerencia Uno" },
        texto: "Llamada",
        tipo: "LLAMADA",
        proximo_paso: null,
        created_at: new Date("2026-01-01"),
      },
    ] as never);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.interacciones[0]).toMatchObject({
      oportunidad_id: null,
      oportunidad_nombre: null,
    });
  });

  it("filters by cliente_id and tipo", async () => {
    authAs(gerencia);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([]);

    const res = await GET(getRequest("?cliente_id=cli-1&tipo=CORREO"));

    expect(res.status).toBe(200);
    expect(db.bitacoraEntrada.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cliente_id: "cli-1", tipo: "CORREO" }),
      }),
    );
  });

  it("returns 400 for an unknown tipo", async () => {
    authAs(gerencia);

    const res = await GET(getRequest("?tipo=FAX"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.bitacoraEntrada.findMany).not.toHaveBeenCalled();
  });

  it("scopes a COLABORADOR to interactions of the clients they are responsable for", async () => {
    authAs(colaborador);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([]);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    expect(db.bitacoraEntrada.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cliente: expect.objectContaining({ responsable_id: "colab-1" }),
        }),
      }),
    );
  });

  it("does not scope a full-access role by responsable", async () => {
    authAs(gerencia);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([]);

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const call = vi.mocked(db.bitacoraEntrada.findMany).mock.calls[0][0];
    expect(call?.where?.cliente).not.toHaveProperty("responsable_id");
  });
});
