import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: vi.fn(),
  createServerSupabase: vi.fn(),
}));

import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { POST } from "./route";

function confirmRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/reset-password/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSupabaseClient(overrides: {
  exchangeCodeForSession?: ReturnType<typeof vi.fn>;
  setSession?: ReturnType<typeof vi.fn>;
  updateUser?: ReturnType<typeof vi.fn>;
}) {
  const client = {
    auth: {
      exchangeCodeForSession:
        overrides.exchangeCodeForSession ?? vi.fn().mockResolvedValue({ error: null }),
      setSession: overrides.setSession ?? vi.fn().mockResolvedValue({ error: null }),
      updateUser: overrides.updateUser ?? vi.fn().mockResolvedValue({ error: null }),
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

describe("POST /api/v1/auth/reset-password/confirm", () => {
  it("returns 400 for a password that does not meet the policy", async () => {
    const res = await POST(confirmRequest({ newPassword: "short" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "La contraseña debe tener al menos 8 caracteres, con letras y números.",
      code: "VALIDATION_ERROR",
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("exchanges a PKCE code and updates the password (code path)", async () => {
    const client = mockSupabaseClient({});

    const res = await POST(
      confirmRequest({ code: "recovery-code", newPassword: "letmein1" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      message: "Contraseña actualizada. Ya puedes iniciar sesión.",
    });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "letmein1" });
  });

  it("returns 400 when the recovery code is invalid or expired", async () => {
    const client = mockSupabaseClient({
      exchangeCodeForSession: vi
        .fn()
        .mockResolvedValue({ error: { message: "invalid code" } }),
    });

    const res = await POST(
      confirmRequest({ code: "bad-code", newPassword: "letmein1" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "El enlace de recuperación no es válido o ya expiró.",
      code: "VALIDATION_ERROR",
    });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("restores a recovery session from accessToken/refreshToken and updates the password", async () => {
    const client = mockSupabaseClient({});

    const res = await POST(
      confirmRequest({
        accessToken: "at-1",
        refreshToken: "rt-1",
        newPassword: "letmein1",
      }),
    );

    expect(res.status).toBe(200);
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: "at-1",
      refresh_token: "rt-1",
    });
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "letmein1" });
  });

  it("returns 400 when the recovery session tokens are invalid or expired", async () => {
    const client = mockSupabaseClient({
      setSession: vi.fn().mockResolvedValue({ error: { message: "invalid session" } }),
    });

    const res = await POST(
      confirmRequest({
        accessToken: "at-1",
        refreshToken: "rt-1",
        newPassword: "letmein1",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "El enlace de recuperación no es válido o ya expiró.",
      code: "VALIDATION_ERROR",
    });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("returns 500 when updateUser fails", async () => {
    mockSupabaseClient({
      updateUser: vi.fn().mockResolvedValue({ error: { message: "update failed" } }),
    });

    const res = await POST(
      confirmRequest({ code: "recovery-code", newPassword: "letmein1" }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "No pudimos actualizar tu contraseña. Inténtalo de nuevo.",
      code: "INTERNAL_ERROR",
    });
  });
});
