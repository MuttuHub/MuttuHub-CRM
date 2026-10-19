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
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    solicitudAcceso: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { GET, POST } from "./route";

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

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

function mockSupabaseAdmin(overrides: {
  createUser?: ReturnType<typeof vi.fn>;
  inviteUserByEmail?: ReturnType<typeof vi.fn>;
  deleteUser?: ReturnType<typeof vi.fn>;
  listUsers?: ReturnType<typeof vi.fn>;
  generateLink?: ReturnType<typeof vi.fn>;
}) {
  const client = {
    auth: {
      admin: {
        createUser: overrides.createUser ?? vi.fn(),
        inviteUserByEmail: overrides.inviteUserByEmail ?? vi.fn(),
        deleteUser: overrides.deleteUser ?? vi.fn().mockResolvedValue({ error: null }),
        listUsers: overrides.listUsers ?? vi.fn().mockResolvedValue({ data: { users: [] } }),
        generateLink: overrides.generateLink ?? vi.fn(),
      },
    },
  };
  vi.mocked(createSupabaseAdmin).mockReturnValue(client as never);
  return client;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  nombre: "Nuevo Usuario",
  email: "nuevo@muttu.co",
  rol: "COLABORADOR",
  invite: true,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/users", () => {
  it("returns 403 for a non-admin role", async () => {
    mockForbidden();

    const res = await GET();

    expect(res.status).toBe(403);
    expect(db.usuario.findMany).not.toHaveBeenCalled();
  });

  it("returns the full usuarios list for an admin", async () => {
    mockAuth();
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      { id: "u1", nombre: "Ana", email: "ana@muttu.co", rol: "COLABORADOR", activo: true, created_at: new Date() },
    ] as never);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.usuarios).toHaveLength(1);
  });
});

describe("POST /api/v1/users", () => {
  it("returns 403 for a non-admin role", async () => {
    mockForbidden();

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(403);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    mockAuth();

    const res = await POST(postRequest({ nombre: "", email: "", rol: undefined }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 for an invalid email", async () => {
    mockAuth();

    const res = await POST(postRequest({ ...validBody, email: "not-an-email" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid rol", async () => {
    mockAuth();

    const res = await POST(postRequest({ ...validBody, rol: "SUPERADMIN" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for a weak password when not inviting", async () => {
    mockAuth();

    const res = await POST(postRequest({ ...validBody, invite: false, password: "weak" }));

    expect(res.status).toBe(400);
  });

  it("returns 409 when the email is already registered in the app DB", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue({ id: "existing" } as never);

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(409);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("creates the user via inviteUserByEmail in invite mode and persists the Usuario row", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    const supabaseAdmin = mockSupabaseAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: { id: "auth-1" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.create).mockResolvedValue({
      id: "auth-1",
      nombre: validBody.nombre,
      email: validBody.email,
      rol: validBody.rol,
      activo: true,
      created_at: new Date(),
    } as never);

    const res = await POST(postRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      validBody.email,
      expect.objectContaining({ data: { nombre: validBody.nombre, rol: validBody.rol } }),
    );
    expect(db.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { id: "auth-1", nombre: validBody.nombre, email: validBody.email, rol: validBody.rol },
      }),
    );
    expect(json.usuario.id).toBe("auth-1");
  });

  it("creates the user via createUser with a password when invite is false", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    const supabaseAdmin = mockSupabaseAdmin({
      createUser: vi.fn().mockResolvedValue({
        data: { user: { id: "auth-2" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.create).mockResolvedValue({ id: "auth-2" } as never);

    const res = await POST(
      postRequest({ ...validBody, invite: false, password: "letmein1" }),
    );

    expect(res.status).toBe(201);
    expect(supabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith({
      email: validBody.email,
      password: "letmein1",
      email_confirm: true,
    });
  });

  it("returns 409 when Supabase reports the email is already registered and confirmed", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    mockSupabaseAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        // Real Supabase wording — a plain "already registered" substring
        // check does NOT match this and used to fall through to a raw 500
        // in production instead of the intended 409/resend flow.
        error: {
          message: "A user with this email address has already been registered",
        },
      }),
      listUsers: vi.fn().mockResolvedValue({
        data: {
          users: [
            {
              email: validBody.email,
              email_confirmed_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      }),
    });

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(409);
  });

  it("resends the invite via generateLink when the existing auth user has not confirmed yet", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    const supabaseAdmin = mockSupabaseAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Email already registered" },
      }),
      listUsers: vi.fn().mockResolvedValue({
        data: {
          users: [{ email: validBody.email, email_confirmed_at: null }],
        },
      }),
      generateLink: vi.fn().mockResolvedValue({
        data: { properties: { action_link: "https://x.test/invite?token=abc" } },
        error: null,
      }),
    });

    const res = await POST(postRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(supabaseAdmin.auth.admin.generateLink).toHaveBeenCalledWith({
      type: "invite",
      email: validBody.email,
    });
    expect(json).toEqual({
      resent: true,
      inviteUrl: "https://x.test/invite?token=abc",
      message: "Enlace de invitación generado.",
    });
    expect(db.usuario.create).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase user creation fails for another reason", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    mockSupabaseAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: "Internal Supabase error" },
      }),
    });

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(500);
  });

  it("resolves a matching PENDIENTE SolicitudAcceso to APROBADA when the admin creates the user", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    mockSupabaseAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: { id: "auth-4" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.create).mockResolvedValue({
      id: "auth-4",
      nombre: validBody.nombre,
      email: validBody.email,
      rol: validBody.rol,
      activo: true,
      created_at: new Date(),
    } as never);
    vi.mocked(db.solicitudAcceso.findFirst).mockResolvedValue({
      id: "sol-1",
    } as never);
    vi.mocked(db.solicitudAcceso.update).mockResolvedValue({} as never);

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(201);
    expect(db.solicitudAcceso.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: validBody.email, estado: "PENDIENTE" },
      }),
    );
    expect(db.solicitudAcceso.update).toHaveBeenCalledWith({
      where: { id: "sol-1" },
      data: expect.objectContaining({
        estado: "APROBADA",
        revisado_por: "admin-1",
      }),
    });
  });

  it("still returns 201 when the SolicitudAcceso reconciliation fails (best-effort, does not roll back the created user)", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    mockSupabaseAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: { id: "auth-5" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.create).mockResolvedValue({
      id: "auth-5",
      nombre: validBody.nombre,
      email: validBody.email,
      rol: validBody.rol,
      activo: true,
      created_at: new Date(),
    } as never);
    vi.mocked(db.solicitudAcceso.findFirst).mockRejectedValue(
      new Error("db down"),
    );

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(201);
    expect(db.solicitudAcceso.update).not.toHaveBeenCalled();
  });

  it("rolls back the auth user when the Prisma insert fails", async () => {
    mockAuth();
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    const supabaseAdmin = mockSupabaseAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: { id: "auth-3" } },
        error: null,
      }),
    });
    vi.mocked(db.usuario.create).mockRejectedValue(new Error("db down"));

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(500);
    expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith("auth-3");
  });
});
