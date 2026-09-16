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
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditoria: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

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

function authAs(usuario: Usuario | null) {
  if (usuario === null) {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    } as never);
    return;
  }
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "cli-1", opportunityId: "op-1" }) };

function convertRequest(): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1/convert", {
    method: "POST",
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/clients/:id/opportunities/:opportunityId/convert", () => {
  it("returns 401 when unauthenticated", async () => {
    authAs(null);

    const res = await POST(convertRequest(), routeContext);

    expect(res.status).toBe(401);
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the user lacks canManageOpportunity", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);

    const res = await POST(convertRequest(), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the opportunity does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(null);

    const res = await POST(convertRequest(), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the opportunity is not GANADA", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      estado: "EN_NEGOCIACION",
      fase: "PROSPECCION",
    } as never);

    const res = await POST(convertRequest(), routeContext);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 409 on a repeat conversion (fase already EJECUCION)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      estado: "GANADA",
      fase: "EJECUCION",
    } as never);

    const res = await POST(convertRequest(), routeContext);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("converts a GANADA opportunity: sets fase=EJECUCION, fecha_adjudicacion, and audits — tareas untouched", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      estado: "GANADA",
      fase: "PROSPECCION",
    } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({
      id: "op-1",
      estado: "GANADA",
      fase: "EJECUCION",
      fecha_adjudicacion: new Date("2026-09-16T00:00:00.000Z"),
    } as never);

    const res = await POST(convertRequest(), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.oportunidad).toMatchObject({ fase: "EJECUCION" });
    expect(db.oportunidad.update).toHaveBeenCalledWith({
      where: { id: "op-1" },
      data: { fase: "EJECUCION", fecha_adjudicacion: expect.any(Date) },
    });
    // D6: zero writes to `tareas` — the route never touches db.tarea at all.
    expect(db.auditoria.create).toHaveBeenCalledTimes(1);
    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entidad: "oportunidad",
        entidad_id: "op-1",
        accion: "convertir",
        usuario_id: "gerencia-1",
      }),
    });
  });

  it("allows a COLABORADOR who is the responsable AND has the flag to convert", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      estado: "GANADA",
      fase: "PROSPECCION",
    } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({
      id: "op-1",
      fase: "EJECUCION",
    } as never);

    const res = await POST(convertRequest(), routeContext);

    expect(res.status).toBe(200);
  });
});
