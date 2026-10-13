import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("@/lib/supabase/server", () => ({
  requireApiRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { requireApiRole } from "@/lib/supabase/server";
import { GET, PUT } from "./route";

const admin = { id: "admin-1", rol: "ADMINISTRADOR" } as Usuario;

const DEFAULTS = {
  resumen_diario: true,
  dias_por_vencer: 3,
  categorias: { vencidos: true, hoy: true, proximos: true },
};

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

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/settings/automatizaciones", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(db.setting.findUnique).mockResolvedValue(null);
  vi.mocked(db.setting.upsert).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/settings/automatizaciones", () => {
  it("is 403 for a non-admin", async () => {
    mockForbidden();

    const res = await GET();

    expect(res.status).toBe(403);
    expect(requireApiRole).toHaveBeenCalledWith(["ADMINISTRADOR"]);
  });

  it("returns the defaults for an admin when nothing is stored", async () => {
    mockAuth();

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ automatizaciones: DEFAULTS });
  });

  it("falls back to the defaults on malformed stored data", async () => {
    mockAuth();
    vi.mocked(db.setting.findUnique).mockResolvedValue({ value: "garbage" } as never);

    const json = await (await GET()).json();

    expect(json).toEqual({ automatizaciones: DEFAULTS });
  });
});

describe("PUT /api/v1/settings/automatizaciones", () => {
  it("is 403 for a non-admin and writes nothing", async () => {
    mockForbidden();

    const res = await PUT(putRequest({ dias_por_vencer: 5 }));

    expect(res.status).toBe(403);
    expect(db.setting.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    mockAuth();

    const res = await PUT(putRequest("not-json"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when no field is sent", async () => {
    mockAuth();

    const res = await PUT(putRequest({}));

    expect(res.status).toBe(400);
  });

  it.each([
    ["resumen_diario not boolean", { resumen_diario: "si" }],
    ["dias_por_vencer out of range", { dias_por_vencer: 0 }],
    ["dias_por_vencer too large", { dias_por_vencer: 31 }],
    ["dias_por_vencer non-integer", { dias_por_vencer: 2.5 }],
    ["an unknown field", { inventado: true }],
    ["an empty categorias object", { categorias: {} }],
    ["a malformed categorias flag", { categorias: { hoy: "no" } }],
  ])("rejects %s with 400", async (_name, body) => {
    mockAuth();

    const res = await PUT(putRequest(body));

    expect(res.status).toBe(400);
    expect(db.setting.upsert).not.toHaveBeenCalled();
  });

  it("merges a partial update onto the current value and audits the editor", async () => {
    mockAuth();
    vi.mocked(db.setting.findUnique).mockResolvedValue({
      value: { ...DEFAULTS, dias_por_vencer: 5 },
    } as never);

    const res = await PUT(putRequest({ resumen_diario: false }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      automatizaciones: { ...DEFAULTS, resumen_diario: false, dias_por_vencer: 5 },
    });
    expect(db.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "automatizaciones" },
        update: {
          value: { ...DEFAULTS, resumen_diario: false, dias_por_vencer: 5 },
          updated_by: "admin-1",
        },
      }),
    );
  });

  it("merges a partial categorias object flag by flag", async () => {
    mockAuth();

    const json = await (await PUT(putRequest({ categorias: { hoy: false } }))).json();

    expect(json).toEqual({
      automatizaciones: {
        resumen_diario: true,
        dias_por_vencer: 3,
        categorias: { vencidos: true, hoy: false, proximos: true },
      },
    });
  });
});
