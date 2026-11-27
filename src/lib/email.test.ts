import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDailyHtml,
  buildRecordatorioEmail,
  buildSinContactoEmail,
  DAILY_SUBJECT,
  RESEND_ENDPOINT,
  sendDailySummary,
} from "./email";

const buckets = { vencidos: [], hoy: [], proximos3: [] };
const usuario = { nombre: "Ana", email: "ana@muttu.co" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendDailySummary (routed through the EmailSender port)", () => {
  it("sends exactly the request the daily summary sent before the port existed", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "");
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("EMAIL_FROM", "Muttu Hub <noreply@muttu.co>");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDailySummary(usuario, buckets);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: "Bearer re_key", "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Muttu Hub <noreply@muttu.co>",
        to: ["ana@muttu.co"],
        subject: DAILY_SUBJECT,
        html: buildDailyHtml("Ana", buckets),
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it("keeps the historical results: missing key, provider error and default sender", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendDailySummary(usuario, buckets)).toEqual({ ok: false, error: "missing RESEND_API_KEY" });

    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("EMAIL_FROM", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response("domain not verified", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendDailySummary(usuario, buckets)).toEqual({
      ok: false,
      error: "Resend HTTP 403 · domain not verified",
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).from).toBe("noreply@muttu.co");
  });

  it("goes to Mailpit when EMAIL_TRANSPORT=mailpit", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "mailpit");
    vi.stubEnv("MAILPIT_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ID: "mp_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendDailySummary(usuario, buckets)).toEqual({ ok: true, id: "mp_1" });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://127.0.0.1:54324/api/v1/send");
  });
});

describe("V8 digest sections and rule e-mails", () => {
  const tarea = {
    id: "t9",
    titulo: "Enviar <propuesta>",
    estado: "EN_CURSO",
    fecha_entrega: new Date(2026, 0, 3, 10),
    origen: "CRM" as const,
    responsable_id: "u1",
    responsable_nombre: "Ana",
    cliente_id: "c1",
    cliente_nombre: "Fundación Uno",
  };
  const cliente = {
    id: "c1",
    nombre: "Fundación & Uno",
    responsable_id: "u1",
    responsable_nombre: "Ana",
    ultimo_contacto: new Date(2025, 10, 20, 10),
    dias_sin_gestion: 42,
  };

  it("renders the pre-V8 digest byte for byte when no rule section is passed", () => {
    expect(buildDailyHtml("Ana", buckets, {})).toBe(buildDailyHtml("Ana", buckets));
    expect(buildDailyHtml("Ana", buckets)).not.toContain("sin contacto");
    expect(buildDailyHtml("Ana", buckets)).not.toContain("Compromisos que vencen en");
  });

  it("adds a reminders section and a clients-without-contact section, escaped", () => {
    const html = buildDailyHtml("Ana", buckets, {
      recordatorios: { dias: 2, items: [tarea] },
      sinContacto: { dias: 30, items: [cliente, { ...cliente, id: "c3", nombre: "Alcaldía", ultimo_contacto: null, dias_sin_gestion: null }] },
    });
    expect(html).toContain("Compromisos que vencen en 2 días");
    expect(html).toContain("Enviar &lt;propuesta&gt;");
    expect(html).toContain("Entrega: 2026-01-03");
    expect(html).toContain("Aliados con 30 días o más sin contacto");
    expect(html).toContain("Fundación &amp; Uno");
    expect(html).toContain("Último contacto: 2025-11-20 (hace 42 días)");
    expect(html).toContain("Sin contacto registrado");
  });

  it("shows an empty-state line for an active rule with nothing to report", () => {
    const html = buildDailyHtml("Ana", buckets, {
      recordatorios: { dias: 1, items: [] },
      sinContacto: { dias: 30, items: [] },
    });
    expect(html).toContain("Compromisos que vencen en 1 día");
    expect(html).toContain("Ningún compromiso para recordar.");
    expect(html).toContain("Todos tus aliados tienen contacto reciente.");
  });

  it("builds the per-event e-mails with a subject naming the event", () => {
    const recordatorio = buildRecordatorioEmail(tarea, 2);
    expect(recordatorio.subject).toBe("Muttu Hub · Compromiso en 2 días: Enviar <propuesta>");
    expect(recordatorio.html).toContain("Este compromiso vence en 2 días");
    expect(recordatorio.html).toContain("Enviar &lt;propuesta&gt;");

    const sinContacto = buildSinContactoEmail(cliente, 30);
    expect(sinContacto.subject).toBe("Muttu Hub · Fundación & Uno lleva 30 días o más sin contacto");
    expect(sinContacto.html).toContain("Último contacto: 2025-11-20 (hace 42 días)");
  });
});

