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
    bitacoraEntrada: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const gerencia = { id: "gerencia-1", rol: "GERENCIA" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

const routeContext = { params: Promise.resolve({ id: "cli-1" }) };

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/clients/cli-1/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/clients/:id/log", () => {
  it("returns the bitácora entries (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([
      {
        id: "bit-1",
        autor_id: "gerencia-1",
        autor: { nombre: "Gerencia Uno" },
        texto: "Nota inicial",
        created_at: new Date("2026-01-01"),
      },
    ] as never);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/log"), routeContext);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entradas).toEqual([
      {
        id: "bit-1",
        autor_id: "gerencia-1",
        autor_nombre: "Gerencia Uno",
        texto: "Nota inicial",
        created_at: new Date("2026-01-01").toISOString(),
      },
    ]);
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/log"), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.bitacoraEntrada.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a COLABORADOR who is NOT the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/log"), routeContext);

    expect(res.status).toBe(404);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cli-1", responsable_id: "colab-1" }),
      }),
    );
  });

  it("allows a COLABORADOR who IS the client's responsable to read the bitácora", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/log"), routeContext);

    expect(res.status).toBe(200);
  });

  it("allows a full-access role to read the bitácora for any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.bitacoraEntrada.findMany).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/v1/clients/cli-1/log"), routeContext);

    expect(res.status).toBe(200);
    expect(db.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-1", deleted_at: null } }),
    );
  });
});

describe("POST /api/v1/clients/:id/log", () => {
  it("creates a bitácora entry authored by the session user (happy path)", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.bitacoraEntrada.create).mockResolvedValue({
      id: "bit-1",
      autor_id: "gerencia-1",
      autor: { nombre: "Gerencia Uno" },
      texto: "Nota nueva",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(postRequest({ texto: "Nota nueva" }), routeContext);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.entrada).toMatchObject({ autor_id: "gerencia-1", autor_nombre: "Gerencia Uno" });
    expect(db.bitacoraEntrada.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ autor_id: "gerencia-1" }) }),
    );
  });

  it("returns 400 when texto is missing", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({}), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.bitacoraEntrada.create).not.toHaveBeenCalled();
  });

  it("returns 400 when texto exceeds the 4000-char limit", async () => {
    authAs(gerencia);

    const res = await POST(postRequest({ texto: "a".repeat(4001) }), routeContext);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 when the client does not exist", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(postRequest({ texto: "Nota" }), routeContext);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(db.bitacoraEntrada.create).not.toHaveBeenCalled();
  });

  it("returns 403 when a COLABORADOR is not the client's responsable", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);

    const res = await POST(postRequest({ texto: "Nota" }), routeContext);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(db.bitacoraEntrada.create).not.toHaveBeenCalled();
  });

  it("allows a COLABORADOR who IS the client's responsable to append a note", async () => {
    authAs(colaborador);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "colab-1" } as never);
    vi.mocked(db.bitacoraEntrada.create).mockResolvedValue({
      id: "bit-1",
      autor_id: "colab-1",
      autor: { nombre: "Colab Uno" },
      texto: "Nota",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(postRequest({ texto: "Nota" }), routeContext);

    expect(res.status).toBe(201);
  });

  it("allows a full-access role to append a note to any client", async () => {
    authAs(gerencia);
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", responsable_id: "someone-else" } as never);
    vi.mocked(db.bitacoraEntrada.create).mockResolvedValue({
      id: "bit-1",
      autor_id: "gerencia-1",
      autor: { nombre: "Gerencia Uno" },
      texto: "Nota",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(postRequest({ texto: "Nota" }), routeContext);

    expect(res.status).toBe(201);
  });
});
