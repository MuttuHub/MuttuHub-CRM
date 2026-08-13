import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: vi.fn(),
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usuario: {
      findUnique: vi.fn(),
    },
    acceso: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { POST } from "./route";

const usuario = {
  id: "user-1",
  nombre: "Ana Admin",
  email: "ana@muttu.co",
  rol: "ADMINISTRADOR",
  activo: true,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
} as Usuario;

function loginRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSupabaseClient(overrides: {
  signInWithPassword?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
}) {
  const client = {
    auth: {
      signInWithPassword: overrides.signInWithPassword ?? vi.fn(),
      signOut: overrides.signOut ?? vi.fn().mockResolvedValue({ error: null }),
    },
  };
  vi.mocked(createServerSupabase).mockResolvedValue(client as never);
  return client;
}

beforeEach(() => {
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/login", () => {
  it("signs in successfully and writes an access log entry", async () => {
    const client = mockSupabaseClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue(usuario);
    vi.mocked(db.acceso.create).mockResolvedValue({} as never);

    const res = await POST(
      loginRequest({ email: "ana@muttu.co", password: "letmein1" }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.usuario).toEqual({
      id: "user-1",
      nombre: "Ana Admin",
      email: "ana@muttu.co",
      rol: "ADMINISTRADOR",
    });
    expect(json.sessionExpiresAt).toEqual(expect.any(String));
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(db.acceso.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ usuario_id: "user-1" }),
    });
  });

  it("returns 401 for wrong credentials without leaking account existence", async () => {
    mockSupabaseClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid login credentials" },
      }),
    });

    const res = await POST(
      loginRequest({ email: "ana@muttu.co", password: "wrongpass1" }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Correo o contraseña incorrectos.",
      code: "UNAUTHORIZED",
    });
    expect(db.usuario.findUnique).not.toHaveBeenCalled();
  });

  it("forces a sign-out and rejects an inactive account", async () => {
    const client = mockSupabaseClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue({
      ...usuario,
      activo: false,
    });

    const res = await POST(
      loginRequest({ email: "ana@muttu.co", password: "letmein1" }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Tu cuenta está inactiva. Contacta al administrador.",
      code: "INACTIVE",
    });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(db.acceso.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email format without calling Supabase", async () => {
    const res = await POST(
      loginRequest({ email: "not-an-email", password: "letmein1" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Correo y contraseña son obligatorios.",
      code: "VALIDATION_ERROR",
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("signs out and returns 500 when the Usuario lookup fails (DB unreachable)", async () => {
    const client = mockSupabaseClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);

    const res = await POST(
      loginRequest({ email: "ana@muttu.co", password: "letmein1" }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
