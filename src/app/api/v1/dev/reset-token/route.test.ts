import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: vi.fn(),
}));

import { isSupabaseConfigured } from "@/lib/supabase/server";
import { GET } from "./route";

function resetTokenRequest(query = "?email=ana@muttu.co"): Request {
  return new Request(`http://localhost/api/v1/dev/reset-token${query}`);
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/v1/dev/reset-token", () => {
  it("returns 404 when ENABLE_DEV_ROUTES is unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "");

    const res = await GET(resetTokenRequest());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No disponible.", code: "NOT_FOUND" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 404 in production even when ENABLE_DEV_ROUTES=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_ROUTES", "true");

    const res = await GET(resetTokenRequest());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No disponible.", code: "NOT_FOUND" });
  });

  it("returns 400 for an invalid email when dev routes are enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "true");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");

    const res = await GET(resetTokenRequest("?email=not-an-email"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Ingresa un correo válido.",
      code: "VALIDATION_ERROR",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mints and redeems a recovery session on the happy path", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "true");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ hashed_token: "hashed-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at-1", refresh_token: "rt-1" }),
      );

    const res = await GET(resetTokenRequest("?email=ana@muttu.co"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      email: "ana@muttu.co",
      accessToken: "at-1",
      refreshToken: "rt-1",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://project.supabase.co/auth/v1/admin/generate_link",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://project.supabase.co/auth/v1/verify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 502 when generate_link fails", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "true");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: "not found" }, false),
    );

    const res = await GET(resetTokenRequest("?email=ana@muttu.co"));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "No pudimos generar el enlace de recuperación.",
      code: "INTERNAL_ERROR",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when verify fails", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "true");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ hashed_token: "hashed-1" }))
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, false));

    const res = await GET(resetTokenRequest("?email=ana@muttu.co"));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "No pudimos canjear el enlace de recuperación.",
      code: "INTERNAL_ERROR",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns 500 when the service role key is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_ROUTES", "true");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const res = await GET(resetTokenRequest("?email=ana@muttu.co"));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Falta la service key en el entorno de desarrollo.",
      code: "INTERNAL_ERROR",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
