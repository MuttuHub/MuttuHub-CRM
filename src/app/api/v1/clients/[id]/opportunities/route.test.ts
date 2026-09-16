import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cliente: {
      findFirst: vi.fn(),
    },
    oportunidad: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaboradorConFlag = {
  id: "colab-1",
  rol: "COLABORADOR",
  gestiona_oportunidades: true,
} as Usuario;
const colaboradorSinFlag = {
  id: "colab-1",
  rol: "COLABORADOR",
  gestiona_oportunidades: false,
} as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "cli-1" }) };

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/opportunities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/:id/opportunities", () => {
  it("returns the opportunity list (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([
      { id: "op-1", cliente_id: "cli-1", nombre: "Proyecto X", deleted_at: null },
    ] as never);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.oportunidades).toHaveLength(1);
    expect(db.oportunidad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cliente_id: "cli-1", deleted_at: null } }),
    );
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
  });

  // RNF-C02 / opportunity-access-control spec: a COLABORADOR without the
  // commercial flag MUST NOT see opportunities, even when they ARE the
  // client's responsable — commercial read access is role/flag-only, never
  // per-client ownership (deliberate deviation from the client/task read gate).
  it("returns 403 for a COLABORADOR without the flag, even as the client's responsable", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.findMany).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR with the flag to read opportunities, even for a client they are not responsable of", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to read opportunities for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.oportunidad.findMany).mockResolvedValue([]);

    const res = await GET(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities"),
      routeContext,
    );

    expect(res.status).toBe(200);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-1", deleted_at: null } }),
    );
  });
});

describe("POST /api/v1/clients/:id/opportunities", () => {
  it("creates an opportunity defaulting estado to DISENANDO_PROPUESTA (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.oportunidad).toMatchObject({ id: "op-1", nombre: "Proyecto X" });
    expect(db.oportunidad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "DISENANDO_PROPUESTA" }) }),
    );
  });

  it("returns 400 when nombre is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.oportunidad.create).not.toHaveBeenCalled();
  });

  it("returns 400 when nombre exceeds the 300-char limit", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "a".repeat(301) }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for a negative valor_estimado_cop", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Proyecto X", valor_estimado_cop: -1 }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for an invalid estado", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ nombre: "Proyecto X", estado: "NOT_REAL" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.oportunidad.create).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable (even with the flag) — D4", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.create).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR IS the client's responsable but lacks the flag (RNF-C02)", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.create).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable AND has the flag to create an opportunity", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(201);
  });

  it("allows a full-access role to create an opportunity for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(res.status).toBe(201);
  });

  // RF-C03 / fecha_envio_propuesta spec: fixed once, auto-set on the first
  // transition to PRESENTADA. A brand-new opportunity created directly with
  // estado: PRESENTADA IS that first transition (it comes from a null field).
  it("auto-sets fecha_envio_propuesta when created directly with estado PRESENTADA", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    const res = await POST(postRequest({ nombre: "Proyecto X", estado: "PRESENTADA" }), routeContext);

    expect(res.status).toBe(201);
    expect(db.oportunidad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fecha_envio_propuesta: expect.any(Date) }) }),
    );
  });

  it("does not set fecha_envio_propuesta when created with a non-PRESENTADA estado", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    await POST(postRequest({ nombre: "Proyecto X" }), routeContext);

    expect(db.oportunidad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fecha_envio_propuesta: undefined }) }),
    );
  });

  it("an explicit fecha_envio_propuesta in the body always wins over the auto-set", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.create).mockResolvedValue({ id: "op-1", nombre: "Proyecto X" } as never);

    await POST(
      postRequest({ nombre: "Proyecto X", estado: "PRESENTADA", fecha_envio_propuesta: "2026-01-05" }),
      routeContext,
    );

    expect(db.oportunidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fecha_envio_propuesta: new Date("2026-01-05") }),
      }),
    );
  });
});
