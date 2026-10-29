import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    usuario: {
      findUnique: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { POST } from "./route";

const admin = { id: "admin-1", rol: "ADMINISTRADOR" } as Usuario;
const target = { id: "user-1", email: "pat@muttu.co" } as Usuario;

function mockAuth() {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario: admin,
    supabaseUser: {} as never,
  });
}

function mockForbidden() {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: "x", code: "FORBIDDEN" }), { status: 403 }),
  });
}

function mockGenerateLink(generateLink: ReturnType<typeof vi.fn>) {
  vi.mocked(createSupabaseAdmin).mockReturnValue({
    auth: { admin: { generateLink } },
  } as never);
}

function post(id = "user-1") {
  return POST(new Request(`http://localhost/api/v1/users/${id}/reset-password`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/users/:id/reset-password", () => {
  it("returns 403 for a non-admin role", async () => {
    mockForbidden();

    const res = await post();

    expect(res.status).toBe(403);
    expect(db.usuario.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the user does not exist", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);

    const res = await post();

    expect(res.status).toBe(404);
  });

  it("generates a recovery link for the user's email", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(target);
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { action_link: "https://x/auth/reset-password/confirm?token=abc" } },
      error: null,
    });
    mockGenerateLink(generateLink);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ resetUrl: "https://x/auth/reset-password/confirm?token=abc" });
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "pat@muttu.co" });
  });

  it("returns 500 when generateLink fails", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(target);
    mockGenerateLink(vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }));

    const res = await post();

    expect(res.status).toBe(500);
  });
});
