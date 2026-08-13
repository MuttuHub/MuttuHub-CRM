import { afterEach, describe, expect, it, vi } from "vitest";
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

const admin = {
  id: "admin-1",
  rol: "ADMINISTRADOR",
} as Usuario;

function mockAuth(usuario: Usuario) {
  vi.mocked(requireApiRole).mockResolvedValue({
    ok: true,
    usuario,
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
  return new Request("http://localhost/api/v1/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/settings", () => {
  it("returns 403 for a non-admin role", async () => {
    mockForbidden();

    const res = await GET();

    expect(res.status).toBe(403);
    expect(db.setting.upsert).not.toHaveBeenCalled();
  });

  it("returns the snapshot for an admin, ensuring defaults first", async () => {
    mockAuth(admin);
    vi.mocked(db.setting.upsert).mockResolvedValue({} as never);
    vi.mocked(db.setting.findUnique).mockResolvedValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(db.setting.upsert).toHaveBeenCalledTimes(2);
    expect(json.task_tags).toEqual(["Comercial", "Administrativo", "Proyecto", "Interno"]);
  });
});

describe("PUT /api/v1/settings", () => {
  it("returns 403 for a non-admin role", async () => {
    mockForbidden();

    const res = await PUT(putRequest({ task_tags: ["A"] }));

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid JSON body", async () => {
    mockAuth(admin);

    const res = await PUT(putRequest("not-json"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 when neither task_tags nor doc_categories is sent", async () => {
    mockAuth(admin);

    const res = await PUT(putRequest({}));

    expect(res.status).toBe(400);
  });

  it("returns 400 when task_tags is not an array of strings", async () => {
    mockAuth(admin);

    const res = await PUT(putRequest({ task_tags: [1, 2] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate task_tags", async () => {
    mockAuth(admin);

    const res = await PUT(putRequest({ task_tags: ["Comercial", "Comercial"] }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "Las etiquetas no pueden repetirse.",
    });
  });

  it("returns 400 for doc_categories with a malformed item", async () => {
    mockAuth(admin);

    const res = await PUT(putRequest({ doc_categories: [{ nombre: "Legal" }] }));

    expect(res.status).toBe(400);
  });

  it("returns 400 for case-insensitive duplicate doc_categories", async () => {
    mockAuth(admin);

    const res = await PUT(
      putRequest({
        doc_categories: [
          { nombre: "Legal", restringida: true },
          { nombre: "legal", restringida: false },
        ],
      }),
    );

    expect(res.status).toBe(400);
  });

  it("updates task_tags only and returns the fresh snapshot", async () => {
    mockAuth(admin);
    vi.mocked(db.setting.upsert).mockResolvedValue({} as never);
    vi.mocked(db.setting.findUnique)
      .mockResolvedValueOnce({ value: ["Nueva"] } as never)
      .mockResolvedValueOnce(null as never);

    const res = await PUT(putRequest({ task_tags: ["Nueva"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.task_tags).toEqual(["Nueva"]);
    expect(db.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "task_tags" },
        update: { value: ["Nueva"], updated_by: "admin-1" },
      }),
    );
  });

  it("updates doc_categories only and returns the fresh snapshot", async () => {
    mockAuth(admin);
    vi.mocked(db.setting.upsert).mockResolvedValue({} as never);
    vi.mocked(db.setting.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ value: [{ nombre: "Nueva", restringida: true }] } as never);

    const res = await PUT(
      putRequest({ doc_categories: [{ nombre: "Nueva", restringida: true }] }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.doc_categories).toEqual([{ nombre: "Nueva", restringida: true }]);
  });
});
