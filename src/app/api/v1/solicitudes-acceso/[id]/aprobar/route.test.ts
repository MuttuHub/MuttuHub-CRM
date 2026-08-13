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
    solicitudAcceso: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    usuario: {
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { POST } from "./route";

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

const ctx = { params: Promise.resolve({ id: "sol-1" }) };

type SolicitudRow = {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  origen: string;
  auth_id: string | null;
};

const solicitudForm: SolicitudRow = {
  id: "sol-1",
  nombre: "Ana Solicitante",
  email: "ana@x.com",
  cargo: "Analista",
  origen: "form",
  auth_id: null,
};

const solicitudGoogle: SolicitudRow = {
  id: "sol-1",
  nombre: "Beto Solicitante",
  email: "beto@x.com",
  cargo: null,
  origen: "google",
  auth_id: "google-auth-1",
};

function mockAdmin() {
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

/**
 * First findUnique call = full row (SOLICITUD_SELECT); second = { estado }.
 * Resets first: some tests only trigger the route's first findUnique call
 * (e.g. 404 not-found), which would otherwise leave a stale queued value for
 * the next test to consume.
 */
function mockSolicitud(row: SolicitudRow | null, estado = "PENDIENTE") {
  vi.mocked(db.solicitudAcceso.findUnique)
    .mockReset()
    .mockResolvedValueOnce(row as never)
    .mockResolvedValueOnce(row ? ({ estado } as never) : (null as never));
}

function mockSupabaseAdmin(overrides: {
  inviteUserByEmail?: ReturnType<typeof vi.fn>;
  deleteUser?: ReturnType<typeof vi.fn>;
}) {
  const client = {
    auth: {
      admin: {
        inviteUserByEmail: overrides.inviteUserByEmail ?? vi.fn(),
        deleteUser: overrides.deleteUser ?? vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
  vi.mocked(createSupabaseAdmin).mockReturnValue(client as never);
  return client;
}

function request(body: unknown = { rol: "COLABORADOR" }): Request {
  return new Request("http://localhost/api/v1/solicitudes-acceso/sol-1/aprobar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/solicitudes-acceso/:id/aprobar", () => {
  it("returns 403 for a non-admin role", async () => {
    mockForbidden();

    const res = await POST(request(), ctx);

    expect(res.status).toBe(403);
    expect(db.solicitudAcceso.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing or invalid rol", async () => {
    mockAdmin();

    const res = await POST(request({ rol: "SUPERADMIN" }), ctx);

    expect(res.status).toBe(400);
    expect(db.solicitudAcceso.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the solicitud does not exist", async () => {
    mockAdmin();
    mockSolicitud(null);

    const res = await POST(request(), ctx);

    expect(res.status).toBe(404);
  });

  it("returns 409 when the solicitud was already reviewed", async () => {
    mockAdmin();
    mockSolicitud(solicitudForm, "APROBADA");

    const res = await POST(request(), ctx);

    expect(res.status).toBe(409);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  describe("origen: form", () => {
    it("invites the user by email, creates the Usuario row and marks the solicitud APROBADA", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      const supabaseAdmin = mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-1" } },
          error: null,
        }),
      });
      vi.mocked(db.usuario.create).mockResolvedValue({ id: "auth-1" } as never);
      vi.mocked(db.solicitudAcceso.update).mockResolvedValue({} as never);

      const res = await POST(request(), ctx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        solicitudForm.email,
        expect.objectContaining({ data: { nombre: solicitudForm.nombre, rol: "COLABORADOR" } }),
      );
      expect(db.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            id: "auth-1",
            nombre: solicitudForm.nombre,
            email: solicitudForm.email,
            rol: "COLABORADOR",
          },
        }),
      );
      expect(db.solicitudAcceso.update).toHaveBeenCalledWith({
        where: { id: "sol-1" },
        data: expect.objectContaining({ estado: "APROBADA", revisado_por: "admin-1" }),
      });
      expect(json.solicitud).toMatchObject({ id: "sol-1", estado: "APROBADA" });
    });

    it("returns 409 when the invite email is already registered", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Email already registered" },
        }),
      });

      const res = await POST(request(), ctx);

      expect(res.status).toBe(409);
      expect(db.usuario.create).not.toHaveBeenCalled();
    });

    it("returns 500 when the invite fails for another reason", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Internal error" },
        }),
      });

      const res = await POST(request(), ctx);

      expect(res.status).toBe(500);
    });

    it("rolls back the invited auth user when the Prisma insert fails", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      const supabaseAdmin = mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-1" } },
          error: null,
        }),
      });
      vi.mocked(db.usuario.create).mockRejectedValue(new Error("db down"));

      const res = await POST(request(), ctx);

      expect(res.status).toBe(500);
      expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith("auth-1");
      expect(db.solicitudAcceso.update).not.toHaveBeenCalled();
    });
  });

  describe("origen: google", () => {
    it("creates the Usuario row using the existing auth_id, without inviting", async () => {
      mockAdmin();
      mockSolicitud(solicitudGoogle);
      const supabaseAdmin = mockSupabaseAdmin({});
      vi.mocked(db.usuario.create).mockResolvedValue({ id: "google-auth-1" } as never);
      vi.mocked(db.solicitudAcceso.update).mockResolvedValue({} as never);

      const res = await POST(request(), ctx);

      expect(res.status).toBe(200);
      expect(supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
      expect(db.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            id: "google-auth-1",
            nombre: solicitudGoogle.nombre,
            email: solicitudGoogle.email,
            rol: "COLABORADOR",
          },
        }),
      );
    });

    it("returns 400 when the solicitud has no linked auth_id", async () => {
      mockAdmin();
      mockSolicitud({ ...solicitudGoogle, auth_id: null });

      const res = await POST(request(), ctx);

      expect(res.status).toBe(400);
      expect(db.usuario.create).not.toHaveBeenCalled();
    });

    it("returns 500 without rollback when the Prisma insert fails (no auth user was created here)", async () => {
      mockAdmin();
      mockSolicitud(solicitudGoogle);
      const supabaseAdmin = mockSupabaseAdmin({});
      vi.mocked(db.usuario.create).mockRejectedValue(new Error("db down"));

      const res = await POST(request(), ctx);

      expect(res.status).toBe(500);
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });
  });

  it("returns 500 with a distinct message when marking the solicitud APROBADA fails after creating the user", async () => {
    mockAdmin();
    mockSolicitud(solicitudGoogle);
    mockSupabaseAdmin({});
    vi.mocked(db.usuario.create).mockResolvedValue({ id: "google-auth-1" } as never);
    vi.mocked(db.solicitudAcceso.update).mockRejectedValue(new Error("db down"));

    const res = await POST(request(), ctx);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/Aprobamos el acceso/);
  });
});
