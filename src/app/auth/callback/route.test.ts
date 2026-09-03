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
    solicitudAcceso: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { GET } from "./route";

const authUser = {
  id: "auth-1",
  email: "ana@muttu.co",
  user_metadata: { nombre: "Ana" },
};

const usuarioActivo = {
  id: "auth-1",
  activo: true,
} as Usuario;

function callbackRequest(query = "?code=abc123"): Request {
  return new Request(`http://localhost/auth/callback${query}`);
}

function mockSupabaseClient(overrides: {
  getUser?: ReturnType<typeof vi.fn>;
  exchangeCodeForSession?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
}) {
  const client = {
    auth: {
      getUser:
        overrides.getUser ??
        vi.fn().mockResolvedValue({ data: { user: null } }),
      exchangeCodeForSession: overrides.exchangeCodeForSession ?? vi.fn(),
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

describe("GET /auth/callback", () => {
  it("redirects to /login?error=1 when the code param is missing and no session exists", async () => {
    mockSupabaseClient({});

    const res = await GET(callbackRequest(""));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=1");
  });

  it("redirects an active registered user to /", async () => {
    mockSupabaseClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { user: authUser },
        error: null,
      }),
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue(usuarioActivo);
    vi.mocked(db.acceso.create).mockResolvedValue({} as never);

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
    expect(db.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: "auth-1" },
      select: { id: true, activo: true },
    });
  });

  it("signs out and redirects a deactivated user to /login?error=inactive instead of /", async () => {
    const client = mockSupabaseClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { user: authUser },
        error: null,
      }),
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue({
      id: "auth-1",
      activo: false,
    } as Usuario);

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=inactive",
    );
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(db.acceso.create).not.toHaveBeenCalled();
  });

  it("creates a SolicitudAcceso for a new email with no existing Usuario row", async () => {
    const client = mockSupabaseClient({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { user: authUser },
        error: null,
      }),
    });
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    vi.mocked(db.solicitudAcceso.findFirst)
      .mockResolvedValueOnce(null) // no PENDIENTE
      .mockResolvedValueOnce(null); // no anterior
    vi.mocked(db.solicitudAcceso.create).mockResolvedValue({} as never);

    const res = await GET(callbackRequest());

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?solicitud=1",
    );
    expect(db.solicitudAcceso.create).toHaveBeenCalledWith({
      data: {
        nombre: "Ana",
        email: "ana@muttu.co",
        origen: "google",
        auth_id: "auth-1",
      },
    });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
