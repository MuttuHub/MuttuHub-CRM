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
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { PATCH, DELETE } from "./route";

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

const routeContext = { params: Promise.resolve({ id: "cli-1", opportunityId: "op-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/clients/:id/opportunities/:opportunityId", () => {
  it("updates an opportunity (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({ id: "op-1", estado: "GANADA" } as never);

    const res = await PATCH(patchRequest({ estado: "GANADA" }), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.oportunidad).toMatchObject({ estado: "GANADA" });
  });

  it("returns 400 when the body has no fields to update", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid estado", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ estado: "NOT_REAL" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for a negative valor_estimado_cop", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ valor_estimado_cop: -5 }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ estado: "GANADA" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable (even with the flag) — D4", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await PATCH(patchRequest({ estado: "GANADA" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR IS the client's responsable but lacks the flag (RNF-C02)", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);

    const res = await PATCH(patchRequest({ estado: "GANADA" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable AND has the flag to update the opportunity", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({ id: "op-1", estado: "GANADA" } as never);

    const res = await PATCH(patchRequest({ estado: "GANADA" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to update an opportunity for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({ id: "op-1", estado: "GANADA" } as never);

    const res = await PATCH(patchRequest({ estado: "GANADA" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns 404 when the opportunity does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ estado: "GANADA" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  // D7: fase = EJECUCION is terminal — once converted, changing estado 409s.
  it("returns 409 when patching estado on an opportunity already in fase EJECUCION (D7)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      fase: "EJECUCION",
      estado: "GANADA",
    } as never);

    const res = await PATCH(patchRequest({ estado: "PERDIDA" }), routeContext);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CONFLICT" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("allows a non-estado PATCH on an opportunity already in fase EJECUCION", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      fase: "EJECUCION",
      estado: "GANADA",
    } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({ id: "op-1", nombre: "Nuevo nombre" } as never);

    const res = await PATCH(patchRequest({ nombre: "Nuevo nombre" }), routeContext);

    expect(res.status).toBe(200);
  });

  // RF-C03 / fecha_envio_propuesta: fixed on the FIRST transition to
  // PRESENTADA, never rewritten by a later PATCH — independent of
  // fecha_ultima_gestion, which keeps mutating on every PATCH as before.
  it("auto-sets fecha_envio_propuesta on the first transition to PRESENTADA", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      fase: "PROSPECCION",
      estado: "DISENANDO_PROPUESTA",
      fecha_envio_propuesta: null,
    } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({ id: "op-1", estado: "PRESENTADA" } as never);

    await PATCH(patchRequest({ estado: "PRESENTADA" }), routeContext);

    expect(db.oportunidad.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fecha_envio_propuesta: expect.any(Date) }),
      }),
    );
  });

  it("does not overwrite an already-fixed fecha_envio_propuesta on a later PATCH", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      fase: "PROSPECCION",
      estado: "PRESENTADA",
      fecha_envio_propuesta: new Date("2026-01-01"),
    } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({ id: "op-1", estado: "EN_NEGOCIACION" } as never);

    await PATCH(patchRequest({ estado: "EN_NEGOCIACION" }), routeContext);

    expect(db.oportunidad.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fecha_envio_propuesta: undefined }) }),
    );
  });

  it("an explicit fecha_envio_propuesta in the body always wins, even over an already-fixed date", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({
      id: "op-1",
      cliente_id: "cli-1",
      fase: "PROSPECCION",
      estado: "PRESENTADA",
      fecha_envio_propuesta: new Date("2026-01-01"),
    } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({ id: "op-1" } as never);

    await PATCH(patchRequest({ fecha_envio_propuesta: "2026-02-10" }), routeContext);

    expect(db.oportunidad.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fecha_envio_propuesta: new Date("2026-02-10") }),
      }),
    );
  });
});

describe("DELETE /api/v1/clients/:id/opportunities/:opportunityId", () => {
  it("soft-deletes an opportunity (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({} as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1"),
      routeContext,
    );

    expect(res.status).toBe(204);
    expect(db.oportunidad.update).toHaveBeenCalledWith({
      where: { id: "op-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR IS the client's responsable but lacks the flag (RNF-C02)", async () => {
    authAs(colaboradorSinFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1"),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable AND has the flag to delete the opportunity", async () => {
    authAs(colaboradorConFlag);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue({ id: "op-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.oportunidad.update).mockResolvedValue({} as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1"),
      routeContext,
    );

    expect(res.status).toBe(204);
  });

  it("returns 404 when the opportunity does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.oportunidad.findFirst).mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/opportunities/op-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.oportunidad.update).not.toHaveBeenCalled();
  });
});
