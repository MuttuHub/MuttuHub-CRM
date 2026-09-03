import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  db: {
    solicitudAcceso: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { POST } from "./route";

function solicitudRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/auth/solicitud-acceso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/solicitud-acceso", () => {
  it("creates a request on the happy path", async () => {
    vi.mocked(db.solicitudAcceso.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    vi.mocked(db.solicitudAcceso.create).mockResolvedValue({
      id: "sol-1",
      estado: "PENDIENTE",
      created_at: new Date("2026-01-01"),
    } as never);

    const res = await POST(
      solicitudRequest({
        nombre: "Nuevo Colaborador",
        email: "nuevo@muttu.co",
        cargo: "Analista",
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.solicitud).toEqual({
      id: "sol-1",
      estado: "PENDIENTE",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(db.solicitudAcceso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          nombre: "Nuevo Colaborador",
          email: "nuevo@muttu.co",
          cargo: "Analista",
          origen: "form",
        },
      }),
    );
  });

  it("returns 400 when nombre or email are missing", async () => {
    const res = await POST(solicitudRequest({ email: "nuevo2@muttu.co" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Nombre y correo son obligatorios.",
      code: "VALIDATION_ERROR",
    });
    expect(db.solicitudAcceso.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email", async () => {
    const res = await POST(
      solicitudRequest({ nombre: "Alguien", email: "not-an-email" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Ingresa un correo válido.",
      code: "VALIDATION_ERROR",
    });
  });

  it("returns 400 when cargo exceeds 120 characters", async () => {
    const res = await POST(
      solicitudRequest({
        nombre: "Alguien",
        email: "cargo-largo@muttu.co",
        cargo: "x".repeat(121),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "El cargo no puede superar los 120 caracteres.",
      code: "VALIDATION_ERROR",
    });
  });

  it("returns 409 when a PENDIENTE request already exists for the email", async () => {
    vi.mocked(db.solicitudAcceso.findFirst).mockResolvedValue({ id: "sol-existing" } as never);

    const res = await POST(
      solicitudRequest({ nombre: "Alguien", email: "duplicado@muttu.co" }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ya tienes una solicitud en revisión. Pronto tendrás respuesta.",
      code: "CONFLICT",
    });
    expect(db.solicitudAcceso.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the email already has an app account", async () => {
    vi.mocked(db.solicitudAcceso.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findUnique).mockResolvedValue({ id: "user-existing" } as never);

    const res = await POST(
      solicitudRequest({ nombre: "Alguien", email: "yaexiste@muttu.co" }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Este correo ya tiene acceso al Hub. Inicia sesión.",
      code: "CONFLICT",
    });
    expect(db.solicitudAcceso.create).not.toHaveBeenCalled();
  });

  it("returns the same 409 CONFLICT when the create hits the DB-level unique index (race condition)", async () => {
    vi.mocked(db.solicitudAcceso.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    vi.mocked(db.solicitudAcceso.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await POST(
      solicitudRequest({ nombre: "Alguien", email: "concurrente@muttu.co" }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Ya tienes una solicitud en revisión. Pronto tendrás respuesta.",
      code: "CONFLICT",
    });
  });

  it("returns 429 after exceeding the per-email rate limit (3/hour)", async () => {
    vi.mocked(db.solicitudAcceso.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findUnique).mockResolvedValue(null);
    vi.mocked(db.solicitudAcceso.create).mockResolvedValue({
      id: "sol-rl",
      estado: "PENDIENTE",
      created_at: new Date("2026-01-01"),
    } as never);

    const email = "rate-limited@muttu.co";
    for (let i = 0; i < 3; i += 1) {
      const ok = await POST(solicitudRequest({ nombre: "Alguien", email }));
      expect(ok.status).toBe(201);
    }

    const res = await POST(solicitudRequest({ nombre: "Alguien", email }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error:
        "Ya enviaste varias solicitudes con este correo. Espera un poco e inténtalo de nuevo.",
      code: "CONFLICT",
    });
  });
});
