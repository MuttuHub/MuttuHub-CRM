import { afterEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    cronLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    usuario: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/alerts", () => ({
  getAlertBuckets: vi.fn(),
  startOfLocalDay: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")),
}));

vi.mock("@/lib/email", () => ({
  sendDailySummary: vi.fn(),
}));

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getAlertBuckets } from "@/lib/alerts";
import { sendDailySummary } from "@/lib/email";
import { POST } from "./route";

function mockHeader(value: string | null) {
  vi.mocked(headers).mockResolvedValue(
    new Headers(value !== null ? { "x-cron-secret": value } : {}) as never,
  );
}

const emptyBuckets = { vencidos: [], hoy: [], proximos3: [] };
const nonEmptyBuckets = {
  vencidos: [{ id: "t1" }],
  hoy: [],
  proximos3: [],
};

function usuario(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: "u1",
    nombre: "Ana",
    email: "ana@muttu.co",
    rol: "COLABORADOR",
    activo: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Usuario;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/cron/daily", () => {
  it("returns 401 when the x-cron-secret header is missing", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    mockHeader(null);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(db.usuario.findMany).not.toHaveBeenCalled();
  });

  it("returns 401 when the x-cron-secret header does not match", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    mockHeader("wrong-secret");

    const res = await POST();

    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is not configured, regardless of the header sent", async () => {
    vi.stubEnv("CRON_SECRET", "");
    mockHeader("anything");

    const res = await POST();

    expect(res.status).toBe(401);
  });

  it("records SKIPPED_NO_CONFIG and returns 200 when RESEND_API_KEY is missing", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "");
    mockHeader("the-secret");

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, processed: 0, sent: 0 });
    expect(db.cronLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "SKIPPED_NO_CONFIG" }) }),
    );
    expect(db.usuario.findMany).not.toHaveBeenCalled();
  });

  it("skips the run when today's job already completed OK (idempotency guard)", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue({ id: "log-1" } as never);

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.already_sent_today).toBe(true);
    expect(db.usuario.findMany).not.toHaveBeenCalled();
    expect(sendDailySummary).not.toHaveBeenCalled();
    expect(db.cronLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "OK" }) }),
    );
  });

  it("sends the summary only to users with non-empty buckets and counts skipped_empty for the rest", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      usuario({ id: "u1", rol: "COLABORADOR" }),
      usuario({ id: "u2", rol: "COORDINADOR" }),
    ] as never);
    vi.mocked(getAlertBuckets)
      .mockResolvedValueOnce(nonEmptyBuckets as never)
      .mockResolvedValueOnce(emptyBuckets as never);
    vi.mocked(sendDailySummary).mockResolvedValue({ ok: true });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, processed: 1, sent: 1, skipped_empty: 1, failed: 0 });
    expect(sendDailySummary).toHaveBeenCalledTimes(1);
    expect(db.cronLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "OK" }) }),
    );
  });

  it("excludes ADMINISTRADOR from the recipient query", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findMany).mockResolvedValue([]);

    await POST();

    expect(db.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ rol: { not: "ADMINISTRADOR" } }) }),
    );
  });

  it("marks the run as failed and increments failed count when sendDailySummary errors", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findMany).mockResolvedValue([usuario({ id: "u1" })] as never);
    vi.mocked(getAlertBuckets).mockResolvedValueOnce(nonEmptyBuckets as never);
    vi.mocked(sendDailySummary).mockResolvedValue({ ok: false, error: "Resend HTTP 500" });

    const res = await POST();
    const json = await res.json();

    expect(json).toMatchObject({ ok: false, processed: 1, sent: 0, failed: 1 });
    expect(db.cronLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "ERROR" }) }),
    );
  });

  it("catches an unhandled failure, records it and responds 200 with ok:false for the retry", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findMany).mockRejectedValue(new Error("db unreachable"));

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(db.cronLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "ERROR", detalle: expect.stringContaining("unhandled") }),
      }),
    );
  });
});
