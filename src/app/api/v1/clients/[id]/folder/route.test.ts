// POST /api/v1/clients/:id/folder — find-or-create the client's folder in the
// Document Repository (S4, assumption A5: one folder per client). The endpoint
// must be idempotent, including under two concurrent first calls: the unique
// index on carpetas.cliente_id makes the loser's insert fail with P2002, and
// the loser re-reads the winner's folder instead of answering 500.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    carpeta: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    cliente: {
      findFirst: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

const colaborador = { id: "colab-1", nombre: "Colab", rol: "COLABORADOR" } as Usuario;

const FOLDER_SELECT = { id: true, nombre: true, parent_id: true, cliente_id: true, created_at: true };

function folderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "f-cli",
    nombre: "Acme S.A.S.",
    parent_id: null,
    cliente_id: "cli-1",
    created_at: new Date("2026-10-29"),
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { modelName: "Carpeta", target: ["cliente_id"] },
  });
}

function call(id = "cli-1") {
  return POST(new Request(`http://localhost/api/v1/clients/${id}/folder`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario: colaborador, supabaseUser: {} as never });
  vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1", nombre: "  Acme S.A.S.  " } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/clients/:id/folder", () => {
  it("answers 401 without a session and touches nothing", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No autenticado.", code: "UNAUTHORIZED" }, { status: 401 }),
    } as never);

    const res = await call();

    expect(res.status).toBe(401);
    expect(db.cliente.findFirst).not.toHaveBeenCalled();
    expect(db.carpeta.create).not.toHaveBeenCalled();
  });

  it("answers 404 in Spanish for a missing or deleted client and creates nothing", async () => {
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await call("ghost");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "El cliente no existe.", code: "NOT_FOUND" });
    expect(vi.mocked(db.cliente.findFirst).mock.calls[0]![0]!.where).toMatchObject({ id: "ghost", deleted_at: null });
    expect(db.carpeta.create).not.toHaveBeenCalled();
  });

  it("returns the existing client folder (200, creada false) without creating another", async () => {
    vi.mocked(db.carpeta.findFirst).mockResolvedValue(folderRow() as never);

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ creada: false, carpeta: { id: "f-cli", cliente_id: "cli-1" } });
    expect(db.carpeta.findFirst).toHaveBeenCalledWith({
      where: { cliente_id: "cli-1", deleted_at: null },
      select: FOLDER_SELECT,
    });
    expect(db.carpeta.create).not.toHaveBeenCalled();
  });

  it("creates the folder at the root, named after the client (201, creada true)", async () => {
    vi.mocked(db.carpeta.findFirst).mockResolvedValue(null);
    vi.mocked(db.carpeta.create).mockResolvedValue(folderRow() as never);

    const res = await call();

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ creada: true, carpeta: { id: "f-cli", cliente_id: "cli-1" } });
    expect(db.carpeta.create).toHaveBeenCalledWith({
      data: { nombre: "Acme S.A.S.", parent_id: null, cliente_id: "cli-1", creado_por_id: "colab-1" },
      select: FOLDER_SELECT,
    });
  });

  it("is idempotent: two calls leave exactly one folder", async () => {
    let stored: ReturnType<typeof folderRow> | null = null;
    vi.mocked(db.carpeta.findFirst).mockImplementation((async () => stored) as never);
    vi.mocked(db.carpeta.create).mockImplementation((async () => {
      stored = folderRow();
      return stored;
    }) as never);

    const first = await call();
    const second = await call();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json()).carpeta.id).toBe("f-cli");
    expect(db.carpeta.create).toHaveBeenCalledTimes(1);
  });

  it("re-reads the winner's folder when a concurrent call wins the unique index (P2002)", async () => {
    vi.mocked(db.carpeta.findFirst)
      .mockResolvedValueOnce(null) // our lookup: none yet
      .mockResolvedValueOnce(folderRow({ id: "f-winner" }) as never); // re-read after the race
    vi.mocked(db.carpeta.create).mockRejectedValue(uniqueViolation());

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ creada: false, carpeta: { id: "f-winner" } });
    expect(db.carpeta.create).toHaveBeenCalledTimes(1);
    expect(db.carpeta.findFirst).toHaveBeenCalledTimes(2);
  });

  it("answers the 500 envelope for any other database failure", async () => {
    vi.mocked(db.carpeta.findFirst).mockResolvedValue(null);
    vi.mocked(db.carpeta.create).mockRejectedValue(new Error("db down"));

    const res = await call();

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
