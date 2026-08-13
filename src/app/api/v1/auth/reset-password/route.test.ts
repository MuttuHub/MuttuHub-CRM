import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: vi.fn(),
  createServerSupabase: vi.fn(),
}));

import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { POST } from "./route";

function resetRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSupabaseClient(resetPasswordForEmail: ReturnType<typeof vi.fn>) {
  vi.mocked(createServerSupabase).mockResolvedValue({
    auth: { resetPasswordForEmail },
  } as never);
}

beforeEach(() => {
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/reset-password", () => {
  it("accepts a valid, registered-looking email and returns the generic message", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    mockSupabaseClient(resetPasswordForEmail);

    const res = await POST(resetRequest({ email: "ana@muttu.co" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      message:
        "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "ana@muttu.co",
      expect.objectContaining({ redirectTo: expect.any(String) }),
    );
  });

  it("returns the exact same message for a well-formed but unregistered email (no enumeration)", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    mockSupabaseClient(resetPasswordForEmail);

    const res = await POST(resetRequest({ email: "nadie@muttu.co" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      message:
        "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
    });
  });

  it("returns 400 for an invalid email without calling Supabase", async () => {
    const res = await POST(resetRequest({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Ingresa un correo válido.",
      code: "VALIDATION_ERROR",
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("returns 500 when the email provider fails", async () => {
    const resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ error: { message: "provider down" } });
    mockSupabaseClient(resetPasswordForEmail);

    const res = await POST(resetRequest({ email: "ana@muttu.co" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "No pudimos enviar el correo. Inténtalo de nuevo.",
      code: "INTERNAL_ERROR",
    });
  });
});
