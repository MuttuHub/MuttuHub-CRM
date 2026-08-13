import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: vi.fn(),
  createServerSupabase: vi.fn(),
}));

import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/logout", () => {
  it("signs out and returns 204 when configured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    const signOut = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerSupabase).mockResolvedValue({
      auth: { signOut },
    } as never);

    const res = await POST();

    expect(res.status).toBe(204);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: returns 204 even when Supabase is unconfigured", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);

    const res = await POST();

    expect(res.status).toBe(204);
    expect(createServerSupabase).not.toHaveBeenCalled();
  });
});
