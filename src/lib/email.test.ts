import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDailyHtml, DAILY_SUBJECT, RESEND_ENDPOINT, sendDailySummary } from "./email";

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
