import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireApiUser } from "@/lib/supabase/server";
import { POST } from "./route";

const usuario = { id: "user-1", rol: "COLABORADOR" } as Usuario;

function changeRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthed(email = "ana@muttu.co") {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: { id: "user-1", email } as never,
  });
}

function mockSupabaseAdmin(overrides: {
  signInWithPassword?: ReturnType<typeof vi.fn>;
  updateUserById?: ReturnType<typeof vi.fn>;
}) {
  const client = {
    auth: {
      signInWithPassword:
        overrides.signInWithPassword ?? vi.fn().mockResolvedValue({ error: null }),
      admin: {
        updateUserById:
          overrides.updateUserById ?? vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
  vi.mocked(createSupabaseAdmin).mockReturnValue(client as never);
  return client;
}

beforeEach(() => {
  mockAuthed();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/change-password", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "x", code: "UNAUTHORIZED" }), {
        status: 401,
      }),
    });

    const res = await POST(changeRequest({ currentPassword: "old12345", newPassword: "new12345" }));

    expect(res.status).toBe(401);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 when currentPassword is missing", async () => {
    const res = await POST(changeRequest({ newPassword: "new12345" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Ingresa tu contraseña actual.",
      code: "VALIDATION_ERROR",
    });
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 for a newPassword that does not meet the policy", async () => {
    const res = await POST(changeRequest({ currentPassword: "old12345", newPassword: "short" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La contraseña debe tener al menos 8 caracteres, con letras y números.",
      code: "VALIDATION_ERROR",
    });
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 with a hint towards 'forgot password' when the current password is wrong", async () => {
    const client = mockSupabaseAdmin({
      signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "invalid" } }),
    });

    const res = await POST(
      changeRequest({ currentPassword: "wrongpass1", newPassword: "new12345" }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toContain("La contraseña actual no es correcta");
    expect(json.error).toContain("¿Olvidaste tu contraseña?");
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("re-authenticates with the current password (without touching the live session) and updates via the admin API", async () => {
    mockAuthed("ana@muttu.co");
    const client = mockSupabaseAdmin({});

    const res = await POST(
      changeRequest({ currentPassword: "old12345", newPassword: "new12345" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      message: "Contraseña actualizada correctamente.",
    });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@muttu.co",
      password: "old12345",
    });
    expect(client.auth.admin.updateUserById).toHaveBeenCalledWith("user-1", {
      password: "new12345",
    });
  });

  it("returns 500 when updateUserById fails", async () => {
    const client = mockSupabaseAdmin({
      updateUserById: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
    });

    const res = await POST(
      changeRequest({ currentPassword: "old12345", newPassword: "new12345" }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "No pudimos actualizar tu contraseña. Inténtalo de nuevo.",
      code: "INTERNAL_ERROR",
    });
    expect(client.auth.admin.updateUserById).toHaveBeenCalled();
  });
});
