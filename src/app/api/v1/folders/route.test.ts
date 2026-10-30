import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    carpeta: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    documento: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    cliente: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/documents", () => ({
  loadDocCategories: vi.fn().mockResolvedValue({ categorias: [], restringidas: ["Legal", "Administrativo-financiero"] }),
}));

import { db } from "@/lib/db";
import { requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const admin = { id: "admin-1", nombre: "Admin", rol: "ADMINISTRADOR" } as Usuario;
const colaborador = { id: "colab-1", nombre: "Colab", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/folders", () => {
  beforeEach(() => {
    authAs(admin);
  });

  it("builds the tree in memory and attaches direct document counts", async () => {
    vi.mocked(db.carpeta.findMany).mockResolvedValue([
      { id: "root", nombre: "Raíz", parent_id: null, created_at: new Date("2026-01-01") },
      { id: "child", nombre: "Hija", parent_id: "root", created_at: new Date("2026-01-02") },
    ] as never);
    vi.mocked(db.documento.groupBy).mockResolvedValue([
      { carpeta_id: "child", _count: { _all: 3 } },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.carpetas).toHaveLength(1);
    expect(body.carpetas[0]).toMatchObject({ id: "root", documentos_count: 0 });
    expect(body.carpetas[0].hijos[0]).toMatchObject({ id: "child", documentos_count: 3 });
  });

  it("exposes cliente_id on each node so the UI can tell client folders apart", async () => {
    vi.mocked(db.carpeta.findMany).mockResolvedValue([
      { id: "plain", nombre: "Legal", parent_id: null, cliente_id: null, created_at: new Date("2026-01-01") },
      { id: "f-cli", nombre: "Acme", parent_id: null, cliente_id: "cli-1", created_at: new Date("2026-01-02") },
    ] as never);
    vi.mocked(db.documento.groupBy).mockResolvedValue([] as never);

    const res = await GET();
    const body = await res.json();

    expect(vi.mocked(db.carpeta.findMany).mock.calls[0]![0]!.select).toMatchObject({ cliente_id: true });
    expect(body.carpetas).toEqual([
      expect.objectContaining({ id: "plain", cliente_id: null }),
      expect.objectContaining({ id: "f-cli", cliente_id: "cli-1" }),
    ]);
  });

  it("excludes restricted categories from counts for a COLABORADOR", async () => {
    authAs(colaborador);
    vi.mocked(db.carpeta.findMany).mockResolvedValue([
      { id: "root", nombre: "Raíz", parent_id: null, created_at: new Date("2026-01-01") },
    ] as never);
    vi.mocked(db.documento.groupBy).mockResolvedValueOnce([
      { carpeta_id: "root", _count: { _all: 5 } },
    ] as never);
    // segunda llamada: solo no-restringidos
    vi.mocked(db.documento.groupBy).mockResolvedValueOnce([
      { carpeta_id: "root", _count: { _all: 2 } },
    ] as never);

    const res = await GET();
    const body = await res.json();
    expect(body.carpetas[0].documentos_count).toBe(2);
    const restrictedWhere = vi.mocked(db.documento.groupBy).mock.calls[1]![0]!.where as {
      categoria?: { notIn?: string[] };
    };
    expect(restrictedWhere.categoria?.notIn).toEqual(["Legal", "Administrativo-financiero"]);
  });
});

describe("POST /api/v1/folders", () => {
  beforeEach(() => {
    authAs(admin);
  });

  it("creates a root folder (201)", async () => {
    vi.mocked(db.carpeta.create).mockResolvedValue({
      id: "f-1",
      nombre: "Legal",
      parent_id: null,
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(
      new Request("http://localhost/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Legal" }),
      }),
    );

    expect(res.status).toBe(201);
    // Previous behavior without cliente_id: the row carries no client link
    // (the select now also echoes cliente_id, null for a plain folder).
    expect(db.carpeta.create).toHaveBeenCalledWith({
      data: { nombre: "Legal", parent_id: null, creado_por_id: "admin-1" },
      select: { id: true, nombre: true, parent_id: true, cliente_id: true, created_at: true },
    });
    expect(db.cliente.findFirst).not.toHaveBeenCalled();
  });

  it("creates a client folder when cliente_id is sent (201)", async () => {
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.carpeta.create).mockResolvedValue({
      id: "f-cli",
      nombre: "Acme",
      parent_id: null,
      cliente_id: "cli-1",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(
      new Request("http://localhost/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Acme", cliente_id: "cli-1" }),
      }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).carpeta).toMatchObject({ id: "f-cli", cliente_id: "cli-1" });
    expect(db.carpeta.create).toHaveBeenCalledWith({
      data: { nombre: "Acme", parent_id: null, creado_por_id: "admin-1", cliente_id: "cli-1" },
      select: { id: true, nombre: true, parent_id: true, cliente_id: true, created_at: true },
    });
  });

  it("answers 409 in Spanish when the client already has a folder (unique index, never a 500)", async () => {
    vi.mocked(db.cliente.findFirst).mockResolvedValue({ id: "cli-1" } as never);
    vi.mocked(db.carpeta.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { modelName: "Carpeta", target: ["cliente_id"] },
      }),
    );

    const res = await POST(
      new Request("http://localhost/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Acme 2", cliente_id: "cli-1" }),
      }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Este cliente ya tiene una carpeta. Usa la carpeta existente.",
      code: "CONFLICT",
    });
  });

  it("answers 404 for a missing or deleted client and creates nothing", async () => {
    vi.mocked(db.cliente.findFirst).mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Acme", cliente_id: "ghost" }),
      }),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "El cliente no existe.", code: "NOT_FOUND" });
    expect(db.carpeta.create).not.toHaveBeenCalled();
  });

  it("rejects a non-string cliente_id (400)", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Acme", cliente_id: 42 }),
      }),
    );

    expect(res.status).toBe(400);
    expect(db.carpeta.create).not.toHaveBeenCalled();
  });

  it("rejects a folder whose parent does not exist (404)", async () => {
    vi.mocked(db.carpeta.findFirst).mockResolvedValue(null as never);

    const res = await POST(
      new Request("http://localhost/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Legal", parent_id: "ghost" }),
      }),
    );

    expect(res.status).toBe(404);
    expect(db.carpeta.create).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    const res = await POST(
      new Request("http://localhost/api/v1/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "   " }),
      }),
    );

    expect(res.status).toBe(400);
    expect(db.carpeta.create).not.toHaveBeenCalled();
  });
});