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
    contacto: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { PATCH, DELETE } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "cli-1", contactId: "con-1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/contacts/con-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/clients/:id/contacts/:contactId", () => {
  it("updates a contact (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.findFirst).mockResolvedValue({ id: "con-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.contacto.update).mockResolvedValue({ id: "con-1", nombre: "Juan Renombrado" } as never);

    const res = await PATCH(patchRequest({ nombre: "Juan Renombrado" }), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.contacto).toMatchObject({ nombre: "Juan Renombrado" });
  });

  it("returns 400 when the body has no fields to update", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.contacto.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid correo", async () => {
    authAs(gerencia);

    const res = await PATCH(patchRequest({ correo: "not-an-email" }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.contacto.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await PATCH(patchRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.contacto.update).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable to update the contact", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.findFirst).mockResolvedValue({ id: "con-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.contacto.update).mockResolvedValue({ id: "con-1", nombre: "Juan" } as never);

    const res = await PATCH(patchRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to update a contact for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);
    vi.mocked(db.contacto.findFirst).mockResolvedValue({ id: "con-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.contacto.update).mockResolvedValue({ id: "con-1", nombre: "Juan" } as never);

    const res = await PATCH(patchRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(200);
  });

  it("returns 404 when the contact does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.findFirst).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ nombre: "Juan" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.contacto.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/clients/:id/contacts/:contactId", () => {
  it("soft-deletes a contact (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.findFirst).mockResolvedValue({ id: "con-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.contacto.update).mockResolvedValue({} as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/contacts/con-1"),
      routeContext,
    );

    expect(res.status).toBe(204);
    expect(db.contacto.update).toHaveBeenCalledWith({
      where: { id: "con-1" },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/contacts/con-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.contacto.update).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/contacts/con-1"),
      routeContext,
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.contacto.update).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable to delete the contact", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.findFirst).mockResolvedValue({ id: "con-1", cliente_id: "cli-1" } as never);
    vi.mocked(db.contacto.update).mockResolvedValue({} as never);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/contacts/con-1"),
      routeContext,
    );

    expect(res.status).toBe(204);
  });

  it("returns 404 when the contact does not exist or belongs to another client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.contacto.findFirst).mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/v1/clients/cli-1/contacts/con-1"),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(db.contacto.update).not.toHaveBeenCalled();
  });
});
