// GET/POST /api/v1/rubros — D5 catalog CRUD. Read is any authenticated user
// (needed to populate the budget UI's rubro dropdown); write is
// requireApiRole(["ADMINISTRADOR"]) per design.md "Catálogo y parámetros
// maestros". GET filters out `activo=false` rubros by default so they never
// appear as "new-line options" (spec.md's catalog scenario) — a caller that
// explicitly asks for the historic catalog (`incluir_inactivos=true`) still
// gets them, so an already-linked, now-inactive rubro is never hidden from
// admin management.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    rubro: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole, requireApiUser } from "@/lib/supabase/server";
import { GET, POST } from "./route";

const admin = { id: "admin-1", rol: "ADMINISTRADOR" } as Usuario;
const colaborador = { id: "colab-1", rol: "COLABORADOR" } as Usuario;

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function roleAs(usuario: Usuario) {
  vi.mocked(requireApiRole).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

function roleForbidden() {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), { status: 403 }),
  });
}

function rubroRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "rubro-1",
    nombre: overrides.nombre ?? "Personal",
    activo: overrides.activo ?? true,
    orden: overrides.orden ?? 1,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
  };
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/rubros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/rubros", () => {
  it("returns only active rubros by default (excluded from new-line options)", async () => {
    authAs(colaborador);
    vi.mocked(db.rubro.findMany).mockResolvedValue([rubroRow()] as never);

    const res = await GET(new Request("http://localhost/api/v1/rubros"));

    expect(res.status).toBe(200);
    expect(db.rubro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, activo: true } }),
    );
    const json = await res.json();
    expect(json.rubros).toHaveLength(1);
  });

  it("returns inactive rubros too when incluir_inactivos=true (historic intact)", async () => {
    authAs(colaborador);
    vi.mocked(db.rubro.findMany).mockResolvedValue([
      rubroRow({ id: "rubro-1", activo: true }),
      rubroRow({ id: "rubro-2", activo: false }),
    ] as never);

    const res = await GET(
      new Request("http://localhost/api/v1/rubros?incluir_inactivos=true"),
    );

    expect(res.status).toBe(200);
    expect(db.rubro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null } }),
    );
    const json = await res.json();
    expect(json.rubros).toHaveLength(2);
  });
});

describe("POST /api/v1/rubros", () => {
  it("returns 403 for a non-admin role", async () => {
    roleForbidden();

    const res = await POST(postRequest({ nombre: "Nuevo rubro" }));

    expect(res.status).toBe(403);
    expect(db.rubro.create).not.toHaveBeenCalled();
  });

  it("returns 400 when nombre is missing", async () => {
    roleAs(admin);

    const res = await POST(postRequest({}));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("creates the rubro for an admin", async () => {
    roleAs(admin);
    vi.mocked(db.rubro.create).mockResolvedValue(rubroRow({ id: "rubro-new" }) as never);

    const res = await POST(postRequest({ nombre: "Nuevo rubro", orden: 5 }));

    expect(res.status).toBe(201);
    expect(db.rubro.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nombre: "Nuevo rubro", orden: 5 }) }),
    );
    const json = await res.json();
    expect(json.rubro).toMatchObject({ id: "rubro-new" });
  });
});
