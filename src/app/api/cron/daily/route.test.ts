import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "@prisma/client";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const db = {
    cronLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    usuario: {
      findMany: vi.fn(),
    },
    // V8 automation rules.
    tarea: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
    bitacoraEntrada: { groupBy: vi.fn() },
    emailOutbox: { createMany: vi.fn() },
    notificacion: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return { db };
});

vi.mock("@/lib/alerts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/alerts")>();
  return {
    ...actual,
    getAlertBuckets: vi.fn(),
    startOfLocalDay: vi.fn(() => new Date("2026-01-01T00:00:00.000Z")),
  };
});

vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendDailySummary: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getAutomatizaciones: vi.fn(),
}));

vi.mock("@/lib/email/outbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/outbox")>()),
  processOutbox: vi.fn(),
}));

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getAlertBuckets } from "@/lib/alerts";
import { sendDailySummary } from "@/lib/email";
import { getAutomatizaciones } from "@/lib/settings";
import { processOutbox } from "@/lib/email/outbox";
import { OUTBOX_JOB_NAME, POST } from "./route";

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

/** Pre-V8 baseline: the digest on, both V8 rules off. */
const automatizacionesEnabled = {
  resumen_diario: true,
  dias_por_vencer: 3,
  categorias: { vencidos: true, hoy: true, proximos: true },
  recordar_compromisos: { activo: false, dias: 2 },
  alertar_sin_contacto: { activo: false, dias: 30 },
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

const emptyOutboxRun = { claimed: 0, sent: 0, retried: 0, failed: 0 };

beforeEach(() => {
  vi.mocked(getAutomatizaciones).mockResolvedValue(automatizacionesEnabled);
  vi.mocked(processOutbox).mockResolvedValue(emptyOutboxRun);
  vi.mocked(db.tarea.findMany).mockResolvedValue([]);
  vi.mocked(db.cliente.findMany).mockResolvedValue([]);
  vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([] as never);
  vi.mocked(db.emailOutbox.createMany).mockResolvedValue({ count: 1 });
  vi.mocked(db.notificacion.findMany).mockResolvedValue([]);
  vi.mocked(db.notificacion.create).mockResolvedValue({ id: "n-1" } as never);
  vi.mocked(db.notificacion.upsert).mockResolvedValue({ id: "n-2" } as never);
});

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

  it("skips the send and records SKIPPED_DISABLED when resumen_diario is off", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(getAutomatizaciones).mockResolvedValue({
      ...automatizacionesEnabled,
      resumen_diario: false,
    });

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, processed: 0, sent: 0, failed: 0 });
    expect(db.usuario.findMany).not.toHaveBeenCalled();
    expect(sendDailySummary).not.toHaveBeenCalled();
    expect(db.cronLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "SKIPPED_DISABLED" }),
      }),
    );
  });

  it("threads dias_por_vencer into the alert buckets window", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      usuario({ id: "u1", rol: "COORDINADOR" }),
    ] as never);
    vi.mocked(getAutomatizaciones).mockResolvedValue({
      ...automatizacionesEnabled,
      dias_por_vencer: 7,
    });
    vi.mocked(getAlertBuckets).mockResolvedValueOnce(emptyBuckets as never);

    await POST();

    expect(getAlertBuckets).toHaveBeenCalledWith(
      "all",
      expect.objectContaining({ id: "u1" }),
      7,
    );
  });

  it("omits the categories the setting disables before sending", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findMany).mockResolvedValue([
      usuario({ id: "u1", rol: "COORDINADOR" }),
    ] as never);
    vi.mocked(getAutomatizaciones).mockResolvedValue({
      ...automatizacionesEnabled,
      categorias: { vencidos: false, hoy: true, proximos: false },
    });
    vi.mocked(getAlertBuckets).mockResolvedValueOnce({
      vencidos: [{ id: "v" }],
      hoy: [{ id: "h" }],
      proximos3: [{ id: "p" }],
    } as never);
    vi.mocked(sendDailySummary).mockResolvedValue({ ok: true });

    const json = await (await POST()).json();

    expect(json).toMatchObject({ processed: 1, sent: 1, skipped_empty: 0 });
    expect(sendDailySummary).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), {
      vencidos: [],
      hoy: [{ id: "h" }],
      proximos3: [],
    });
  });

  it("counts a user as skipped_empty when their only alerts fall in disabled categories", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    mockHeader("the-secret");
    vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.usuario.findMany).mockResolvedValue([usuario({ id: "u1" })] as never);
    vi.mocked(getAutomatizaciones).mockResolvedValue({
      ...automatizacionesEnabled,
      categorias: { vencidos: false, hoy: false, proximos: false },
    });
    vi.mocked(getAlertBuckets).mockResolvedValueOnce(nonEmptyBuckets as never);

    const json = await (await POST()).json();

    expect(json).toMatchObject({ processed: 0, sent: 0, skipped_empty: 1 });
    expect(sendDailySummary).not.toHaveBeenCalled();
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

  describe("email outbox drain (PR-M1)", () => {
    it("drains the outbox with the configured sender even when the daily summary is off", async () => {
      vi.stubEnv("CRON_SECRET", "the-secret");
      vi.stubEnv("RESEND_API_KEY", "re_test_key");
      mockHeader("the-secret");
      vi.mocked(getAutomatizaciones).mockResolvedValue({ ...automatizacionesEnabled, resumen_diario: false });
      vi.mocked(processOutbox).mockResolvedValue({ claimed: 3, sent: 2, retried: 1, failed: 0 });

      const res = await POST();
      const json = await res.json();

      expect(processOutbox).toHaveBeenCalledTimes(1);
      const [sender, now, limit] = vi.mocked(processOutbox).mock.calls[0]!;
      expect(typeof sender.send).toBe("function");
      expect(now).toBeInstanceOf(Date);
      expect(limit).toBeGreaterThan(0);
      expect(db.cronLog.create).toHaveBeenCalledWith({
        data: { job_name: OUTBOX_JOB_NAME, estado: "OK", detalle: "claimed=3 sent=2 retried=1 failed=0" },
      });
      // The summary's own response is untouched by the drain.
      expect(json).toMatchObject({ ok: true, processed: 0, sent: 0, failed: 0 });
      expect(json.note).toContain("SKIPPED_DISABLED");
    });

    it("does not drain the outbox when no email transport is configured, so no attempt is burnt", async () => {
      vi.stubEnv("CRON_SECRET", "the-secret");
      vi.stubEnv("RESEND_API_KEY", "");
      mockHeader("the-secret");

      await POST();

      expect(processOutbox).not.toHaveBeenCalled();
    });

    it("keeps the summary result when the drain throws", async () => {
      vi.stubEnv("CRON_SECRET", "the-secret");
      vi.stubEnv("RESEND_API_KEY", "re_test_key");
      mockHeader("the-secret");
      vi.mocked(processOutbox).mockRejectedValue(new Error("outbox table missing"));
      vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
      vi.mocked(db.usuario.findMany).mockResolvedValue([usuario({ id: "u1" })] as never);
      vi.mocked(getAlertBuckets).mockResolvedValue(nonEmptyBuckets as never);
      vi.mocked(sendDailySummary).mockResolvedValue({ ok: true });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST();
      const json = await res.json();

      expect(json).toEqual({
        ok: true,
        processed: 1,
        sent: 1,
        failed: 0,
        skipped_empty: 0,
        already_sent_today: false,
      });
      expect(db.cronLog.create).toHaveBeenCalledWith({
        data: { job_name: OUTBOX_JOB_NAME, estado: "ERROR", detalle: "outbox table missing" },
      });
      errorSpy.mockRestore();
    });

    it("writes no outbox log line when there was nothing to send", async () => {
      vi.stubEnv("CRON_SECRET", "the-secret");
      vi.stubEnv("RESEND_API_KEY", "re_test_key");
      mockHeader("the-secret");
      vi.mocked(getAutomatizaciones).mockResolvedValue({ ...automatizacionesEnabled, resumen_diario: false });

      await POST();

      expect(processOutbox).toHaveBeenCalledTimes(1);
      expect(db.cronLog.create).toHaveBeenCalledTimes(1);
      expect(db.cronLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ job_name: "daily-notifications" }) }),
      );
    });
  });

  describe("V8 automation rules", () => {
    const DAY_MS = 86_400_000;
    const bogotaDate = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);

    const reglas = (
      recordar: { activo: boolean; dias: number },
      sinContacto: { activo: boolean; dias: number },
      extra: Partial<typeof automatizacionesEnabled> = {},
    ) => ({
      ...automatizacionesEnabled,
      recordar_compromisos: recordar,
      alertar_sin_contacto: sinContacto,
      ...extra,
    });

    const responsableAna = { nombre: "Ana", email: "ana@muttu.co", activo: true, rol: "COLABORADOR" };
    const responsableBeto = { nombre: "Beto", email: "beto@muttu.co", activo: true, rol: "COLABORADOR" };

    const tareaRow = {
      id: "t9",
      titulo: "Enviar propuesta",
      estado: "EN_CURSO",
      fecha_entrega: new Date("2026-01-03T15:00:00.000Z"),
      origen: "CRM",
      responsable_id: "u1",
      responsable: responsableAna,
      cliente_id: "c1",
      cliente: { nombre: "Fundación Uno" },
    };

    function arrangeRun(users: Usuario[]) {
      vi.stubEnv("CRON_SECRET", "the-secret");
      vi.stubEnv("RESEND_API_KEY", "re_test_key");
      mockHeader("the-secret");
      vi.mocked(db.cronLog.findFirst).mockResolvedValue(null);
      vi.mocked(db.usuario.findMany).mockResolvedValue(users as never);
      vi.mocked(getAlertBuckets).mockResolvedValue(emptyBuckets as never);
      vi.mocked(sendDailySummary).mockResolvedValue({ ok: true });
    }

    type ClienteRow = {
      id: string;
      nombre: string;
      estado: string;
      created_at: Date;
      responsable_id: string;
      responsable: typeof responsableAna;
    };

    /** cliente.findMany honouring the rule's `estado: { notIn }` filter, like the database would. */
    function mockClientes(rows: ClienteRow[]) {
      vi.mocked(db.cliente.findMany).mockImplementation(((args: { where?: { estado?: { notIn?: string[] } } }) =>
        Promise.resolve(rows.filter((r) => !args?.where?.estado?.notIn?.includes(r.estado)))) as never);
    }

    function arrangeClients() {
      const hace40 = new Date(Date.now() - 40 * DAY_MS);
      const hace5 = new Date(Date.now() - 5 * DAY_MS);
      const creadoHace60 = new Date(Date.now() - 60 * DAY_MS);
      const creadoHace400 = new Date(Date.now() - 400 * DAY_MS);
      mockClientes([
        { id: "c1", nombre: "Fundación Uno", estado: "CLIENTE_ACTIVO", created_at: creadoHace400, responsable_id: "u1", responsable: responsableAna },
        { id: "c2", nombre: "Colegio Dos", estado: "PROSPECTO", created_at: creadoHace400, responsable_id: "u1", responsable: responsableAna },
        { id: "c3", nombre: "Alcaldía Tres", estado: "EN_ACERCAMIENTO", created_at: creadoHace60, responsable_id: "u2", responsable: responsableBeto },
      ]);
      vi.mocked(db.bitacoraEntrada.groupBy).mockResolvedValue([
        { cliente_id: "c1", _max: { created_at: hace40 } },
        { cliente_id: "c2", _max: { created_at: hace5 } },
      ] as never);
      return { hace40, hace5, creadoHace60 };
    }

    const queuedKeys = () =>
      vi.mocked(db.emailOutbox.createMany).mock.calls.map(
        ([args]) => (args as { data: { clave_idempotencia: string }[] }).data[0].clave_idempotencia,
      );

    it("rule 1 reminds an open task due exactly N days ahead in the digest, by e-mail and in-app", async () => {
      arrangeRun([usuario({ id: "u1", rol: "COLABORADOR" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: true, dias: 2 }, { activo: false, dias: 30 }),
      );
      vi.mocked(db.tarea.findMany).mockResolvedValue([tareaRow] as never);

      const json = await (await POST()).json();

      // Window: [today + 2, today + 3) on the engine's local day (startOfLocalDay is 2026-01-01).
      expect(db.tarea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deleted_at: null,
            estado: { notIn: ["COMPLETADA", "CANCELADA"] },
            fecha_entrega: {
              gte: new Date("2026-01-03T00:00:00.000Z"),
              lt: new Date("2026-01-04T00:00:00.000Z"),
            },
          }),
        }),
      );
      // (b) its own e-mail, keyed per task and due date.
      expect(db.emailOutbox.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            usuario_id: "u1",
            destinatario_email: "ana@muttu.co",
            asunto: "Muttu Hub · Compromiso en 2 días: Enviar propuesta",
            tipo: "RECORDATORIO_COMPROMISO",
            clave_idempotencia: "recordatorio/t9/2026-01-03",
            html: expect.stringContaining("Enviar propuesta"),
          }),
        ],
        skipDuplicates: true,
      });
      // (c) the in-app POR_VENCER row for the task's owner.
      expect(db.notificacion.create).toHaveBeenCalledWith({
        data: { usuario_id: "u1", tarea_id: "t9", tipo: "POR_VENCER" },
        select: { id: true },
      });
      // (a) the digest section; it is sent even though the buckets are empty.
      expect(json).toMatchObject({ processed: 1, sent: 1, skipped_empty: 0 });
      expect(sendDailySummary).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), emptyBuckets, {
        recordatorios: { dias: 2, items: [expect.objectContaining({ id: "t9", titulo: "Enviar propuesta" })] },
      });
    });

    it("rule 1 follows the threshold and stays silent when switched off", async () => {
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: true, dias: 5 }, { activo: false, dias: 30 }),
      );
      await POST();
      expect(db.tarea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fecha_entrega: {
              gte: new Date("2026-01-06T00:00:00.000Z"),
              lt: new Date("2026-01-07T00:00:00.000Z"),
            },
          }),
        }),
      );

      vi.clearAllMocks();
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: false, dias: 2 }, { activo: true, dias: 30 }),
      );
      vi.mocked(db.tarea.findMany).mockResolvedValue([tareaRow] as never);
      await POST();
      expect(db.tarea.findMany).not.toHaveBeenCalled();
      expect(queuedKeys().some((key) => key.startsWith("recordatorio/"))).toBe(false);
      expect(db.notificacion.create).not.toHaveBeenCalled();
      expect(vi.mocked(sendDailySummary).mock.calls.every(([, , extra]) => !extra?.recordatorios)).toBe(true);
    });

    it("rule 2 alerts each client's responsable after N or more days without contact, through all three channels", async () => {
      arrangeRun([usuario({ id: "u1", rol: "COORDINADOR" }), usuario({ id: "u2", nombre: "Beto", email: "beto@muttu.co" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: false, dias: 2 }, { activo: true, dias: 30 }),
      );
      const { hace40, creadoHace60 } = arrangeClients();

      await POST();

      // c1 (40 days) and c3 (no entry, created 60 days ago) cross 30 days; c2 (5 days) does not.
      expect(queuedKeys()).toEqual([
        `sin-contacto/c1/${bogotaDate(hace40)}`,
        `sin-contacto/c3/${bogotaDate(creadoHace60)}`,
      ]);
      expect(db.emailOutbox.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            usuario_id: "u1",
            destinatario_email: "ana@muttu.co",
            asunto: "Muttu Hub · Fundación Uno lleva 30 días o más sin contacto",
            tipo: "SIN_CONTACTO",
          }),
        ],
        skipDuplicates: true,
      });
      expect(db.notificacion.upsert).toHaveBeenCalledTimes(2);
      expect(db.notificacion.upsert).toHaveBeenCalledWith({
        where: { usuario_id_tipo_cliente_id: { usuario_id: "u2", tipo: "SIN_CONTACTO", cliente_id: "c3" } },
        create: { usuario_id: "u2", tipo: "SIN_CONTACTO", cliente_id: "c3" },
        update: { leida: false, created_at: expect.any(Date) },
      });
      // Digest: each responsable sees only their own clients.
      expect(sendDailySummary).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), emptyBuckets, {
        sinContacto: { dias: 30, items: [expect.objectContaining({ id: "c1", dias_sin_gestion: 40 })] },
      });
      expect(sendDailySummary).toHaveBeenCalledWith(expect.objectContaining({ id: "u2" }), emptyBuckets, {
        sinContacto: {
          dias: 30,
          items: [expect.objectContaining({ id: "c3", ultimo_contacto: null, dias_sin_gestion: 60 })],
        },
      });
    });

    it("rule 2 follows the threshold and stays silent when switched off", async () => {
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: false, dias: 2 }, { activo: true, dias: 3 }),
      );
      const { hace40, hace5, creadoHace60 } = arrangeClients();
      await POST();
      expect(queuedKeys()).toEqual([
        `sin-contacto/c1/${bogotaDate(hace40)}`,
        `sin-contacto/c2/${bogotaDate(hace5)}`,
        `sin-contacto/c3/${bogotaDate(creadoHace60)}`,
      ]);

      vi.clearAllMocks();
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: true, dias: 2 }, { activo: false, dias: 3 }),
      );
      arrangeClients();
      await POST();
      expect(db.cliente.findMany).not.toHaveBeenCalled();
      expect(queuedKeys().some((key) => key.startsWith("sin-contacto/"))).toBe(false);
      expect(db.notificacion.upsert).not.toHaveBeenCalled();
    });

    it("rule 2 skips INACTIVO and CERRADO clients («Solo activos»)", async () => {
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: false, dias: 2 }, { activo: true, dias: 30 }),
      );
      const creado = new Date(Date.now() - 400 * DAY_MS);
      mockClientes([
        { id: "c4", nombre: "Inactivo", estado: "INACTIVO", created_at: creado, responsable_id: "u1", responsable: responsableAna },
        { id: "c5", nombre: "Cerrado", estado: "CERRADO", created_at: creado, responsable_id: "u1", responsable: responsableAna },
        { id: "c6", nombre: "En pausa", estado: "EN_PAUSA", created_at: creado, responsable_id: "u1", responsable: responsableAna },
      ]);

      await POST();

      expect(db.cliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deleted_at: null, estado: { notIn: ["INACTIVO", "CERRADO"] } }),
        }),
      );
      expect(queuedKeys()).toEqual([`sin-contacto/c6/${bogotaDate(creado)}`]);
      expect(db.notificacion.upsert).toHaveBeenCalledTimes(1);
    });

    it("rule 2 counts a client without entries from its creation: N-1 days is silent, N days alerts", async () => {
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: false, dias: 2 }, { activo: true, dias: 30 }),
      );
      const hace29 = new Date(Date.now() - 29 * DAY_MS);
      mockClientes([
        { id: "c7", nombre: "Nuevo", estado: "PROSPECTO", created_at: hace29, responsable_id: "u1", responsable: responsableAna },
      ]);
      await POST();
      expect(db.emailOutbox.createMany).not.toHaveBeenCalled();
      expect(db.notificacion.upsert).not.toHaveBeenCalled();

      vi.clearAllMocks();
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: false, dias: 2 }, { activo: true, dias: 30 }),
      );
      const hace30 = new Date(Date.now() - 30 * DAY_MS);
      mockClientes([
        { id: "c7", nombre: "Nuevo", estado: "PROSPECTO", created_at: hace30, responsable_id: "u1", responsable: responsableAna },
      ]);
      await POST();
      expect(queuedKeys()).toEqual([`sin-contacto/c7/${bogotaDate(hace30)}`]);
      expect(db.notificacion.upsert).toHaveBeenCalledTimes(1);
      expect(sendDailySummary).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" }), emptyBuckets, {
        sinContacto: { dias: 30, items: [expect.objectContaining({ id: "c7", ultimo_contacto: null, dias_sin_gestion: 30 })] },
      });
    });

    it("does not queue or notify twice when the cron reruns the same day", async () => {
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: true, dias: 2 }, { activo: true, dias: 30 }),
      );
      vi.mocked(db.tarea.findMany).mockResolvedValue([tareaRow] as never);
      const creado = new Date(Date.now() - 60 * DAY_MS);
      mockClientes([
        { id: "c3", nombre: "Alcaldía Tres", estado: "PROSPECTO", created_at: creado, responsable_id: "u1", responsable: responsableAna },
      ]);
      // The outbox's unique key turns the second insert of each e-mail into a no-op.
      vi.mocked(db.emailOutbox.createMany)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValue({ count: 0 });
      // The rerun finds the POR_VENCER row the first run created.
      vi.mocked(db.notificacion.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ id: "n-1", tarea_id: "t9", tipo: "POR_VENCER", leida: false }] as never);

      await POST();
      await POST();

      expect(queuedKeys()).toEqual([
        "recordatorio/t9/2026-01-03",
        `sin-contacto/c3/${bogotaDate(creado)}`,
        "recordatorio/t9/2026-01-03",
        `sin-contacto/c3/${bogotaDate(creado)}`,
      ]);
      expect(db.notificacion.create).toHaveBeenCalledTimes(1);
      expect(db.notificacion.upsert).toHaveBeenCalledTimes(1);
    });

    it("still queues and notifies when the daily digest is off", async () => {
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAutomatizaciones).mockResolvedValue(
        reglas({ activo: true, dias: 2 }, { activo: false, dias: 30 }, { resumen_diario: false }),
      );
      vi.mocked(db.tarea.findMany).mockResolvedValue([tareaRow] as never);

      const json = await (await POST()).json();

      expect(json).toMatchObject({ processed: 0, sent: 0 });
      expect(sendDailySummary).not.toHaveBeenCalled();
      expect(queuedKeys()).toEqual(["recordatorio/t9/2026-01-03"]);
      expect(db.notificacion.create).toHaveBeenCalledTimes(1);
    });

    it("keeps the pre-V8 digest when both rules are off", async () => {
      arrangeRun([usuario({ id: "u1" })]);
      vi.mocked(getAlertBuckets).mockResolvedValue(nonEmptyBuckets as never);

      const json = await (await POST()).json();

      expect(json).toEqual({ ok: true, processed: 1, sent: 1, failed: 0, skipped_empty: 0, already_sent_today: false });
      expect(vi.mocked(sendDailySummary).mock.calls).toEqual([[expect.objectContaining({ id: "u1" }), nonEmptyBuckets]]);
      expect(db.tarea.findMany).not.toHaveBeenCalled();
      expect(db.cliente.findMany).not.toHaveBeenCalled();
      expect(db.emailOutbox.createMany).not.toHaveBeenCalled();
      expect(db.notificacion.create).not.toHaveBeenCalled();
      expect(db.notificacion.upsert).not.toHaveBeenCalled();
      expect(db.cronLog.create).toHaveBeenCalledTimes(1);
    });
  });
});
