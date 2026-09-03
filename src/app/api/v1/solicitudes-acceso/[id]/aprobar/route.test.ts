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
    // Array-form $transaction: the individual mocked calls (usuario.create,
    // solicitudAcceso.update) are already invoked by the time this runs —
    // Promise.all mirrors Prisma's all-or-nothing semantics closely enough
    // for these unit tests (one rejection fails the whole transaction).
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
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
  estado: string;
};

const solicitudForm: SolicitudRow = {
  id: "sol-1",
  nombre: "Ana Solicitante",
  email: "ana@x.com",
  cargo: "Analista",
  origen: "form",
  auth_id: null,
  estado: "PENDIENTE",
};

const solicitudGoogle: SolicitudRow = {
  id: "sol-1",
  nombre: "Beto Solicitante",
  email: "beto@x.com",
  cargo: null,
  origen: "google",
  auth_id: "google-auth-1",
  estado: "PENDIENTE",
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

// Single findUnique call now (estado is part of SOLICITUD_SELECT).
function mockSolicitud(row: SolicitudRow | null) {
  vi.mocked(db.solicitudAcceso.findUnique)
    .mockReset()
    .mockResolvedValueOnce(row as never);
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
    mockSolicitud({ ...solicitudForm, estado: "APROBADA" });

    const res = await POST(request(), ctx);

    expect(res.status).toBe(409);
    expect(createSupabaseAdmin).not.toHaveBeenCalled();
  });

  describe("origen: form", () => {
    it("invites the user, checkpoints auth_id, creates the Usuario row and marks the solicitud APROBADA", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      const supabaseAdmin = mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-1" } },
          error: null,
        }),
      });
      vi.mocked(db.solicitudAcceso.update).mockResolvedValue({} as never);
      vi.mocked(db.usuario.create).mockResolvedValue({ id: "auth-1" } as never);

      const res = await POST(request(), ctx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        solicitudForm.email,
        expect.objectContaining({ data: { nombre: solicitudForm.nombre, rol: "COLABORADOR" } }),
      );
      // First write after a successful invite is the checkpoint — before
      // anything else touches Usuario or estado.
      expect(db.solicitudAcceso.update).toHaveBeenNthCalledWith(1, {
        where: { id: "sol-1" },
        data: { auth_id: "auth-1" },
      });
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
      expect(db.solicitudAcceso.update).toHaveBeenNthCalledWith(2, {
        where: { id: "sol-1" },
        data: expect.objectContaining({ estado: "APROBADA", revisado_por: "admin-1" }),
      });
      expect(json.solicitud).toMatchObject({ id: "sol-1", estado: "APROBADA" });
    });

    it("reuses a previously checkpointed auth_id instead of inviting again", async () => {
      mockAdmin();
      mockSolicitud({ ...solicitudForm, auth_id: "auth-1" });
      const supabaseAdmin = mockSupabaseAdmin({});
      vi.mocked(db.solicitudAcceso.update).mockResolvedValue({} as never);
      vi.mocked(db.usuario.create).mockResolvedValue({ id: "auth-1" } as never);

      const res = await POST(request(), ctx);

      expect(res.status).toBe(200);
      expect(supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
      expect(db.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id: "auth-1" }) }),
      );
      // Only the final estado update — no checkpoint write, nothing to redo.
      expect(db.solicitudAcceso.update).toHaveBeenCalledTimes(1);
    });

    it("uses the rol from the retry request, not the one sent on the original (already-invited) attempt", async () => {
      mockAdmin();
      // auth_id already checkpointed from a prior attempt with a different
      // rol — the email's user_metadata still carries that original rol,
      // but nothing in the app reads it for authorization (only
      // Usuario.rol does, via requireApiRole/getSessionUser). The retry's
      // rol is what actually lands in Usuario.
      mockSolicitud({ ...solicitudForm, auth_id: "auth-1" });
      const supabaseAdmin = mockSupabaseAdmin({});
      vi.mocked(db.solicitudAcceso.update).mockResolvedValue({} as never);
      vi.mocked(db.usuario.create).mockResolvedValue({ id: "auth-1" } as never);

      const res = await POST(request({ rol: "GERENCIA" }), ctx);

      expect(res.status).toBe(200);
      expect(supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
      expect(db.usuario.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rol: "GERENCIA" }) }),
      );
    });

    it("returns 409 when the invite email is already registered", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: null },
          // Real Supabase wording (not the simplified "Email already
          // registered" used elsewhere) — a plain "already registered"
          // substring check does NOT match this and used to fall through
          // to a raw 500 in production.
          error: {
            message: "A user with this email address has already been registered",
          },
        }),
      });

      const res = await POST(request(), ctx);

      expect(res.status).toBe(409);
      expect(db.usuario.create).not.toHaveBeenCalled();
    });

    it("returns 409 when Supabase reports email_exists via error code alone", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Unexpected failure", code: "email_exists" },
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

    it("returns a JSON 500 envelope (not a crash) when inviteUserByEmail THROWS (e.g. bad service-role key / SDK error)", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockRejectedValue(new Error("Invalid API key")),
      });

      const res = await POST(request(), ctx);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBeTruthy();
      expect(json.code).toBe("INTERNAL_ERROR");
      // No orphan: nothing was created on Supabase, nothing to roll back.
      expect(db.solicitudAcceso.update).not.toHaveBeenCalled();
      expect(db.usuario.create).not.toHaveBeenCalled();
    });

    it("rolls back the invited auth user when the auth_id checkpoint write fails", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      const supabaseAdmin = mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-1" } },
          error: null,
        }),
      });
      vi.mocked(db.solicitudAcceso.update).mockRejectedValueOnce(new Error("db down"));

      const res = await POST(request(), ctx);

      expect(res.status).toBe(500);
      // Nothing was checkpointed yet — safe to undo the invite.
      expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith("auth-1");
      expect(db.usuario.create).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("does NOT roll back the auth user when the final transaction fails — auth_id is already checkpointed", async () => {
      mockAdmin();
      mockSolicitud(solicitudForm);
      const supabaseAdmin = mockSupabaseAdmin({
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-1" } },
          error: null,
        }),
      });
      // 1st update = checkpoint (succeeds), 2nd = final estado update (fails).
      vi.mocked(db.solicitudAcceso.update)
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new Error("db down"));
      vi.mocked(db.usuario.create).mockResolvedValue({ id: "auth-1" } as never);

      const res = await POST(request(), ctx);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toMatch(/Aprobamos el acceso/);
      expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
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
      // No checkpoint write for google — auth_id already came from the callback.
      expect(db.solicitudAcceso.update).toHaveBeenCalledTimes(1);
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
});
