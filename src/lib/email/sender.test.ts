import { describe, expect, it, vi } from "vitest";

import { createMailpitSender, MAILPIT_URL_DEFAULT } from "./mailpit";
import { createResendSender } from "./resend";
import { resolveEmailTransport } from "./sender";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const message = { to: "ana@muttu.co", subject: "Asunto", html: "<p>Hola</p>" };

describe("createResendSender", () => {
  it("posts the same request shape the daily summary always used, without an idempotency header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "re_1" }));
    const sender = createResendSender({ apiKey: "re_key", from: "noreply@muttu.co", fetchImpl });

    const result = await sender.send(message);

    expect(result).toEqual({ ok: true, id: "re_1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer re_key",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe(
      JSON.stringify({ from: "noreply@muttu.co", to: ["ana@muttu.co"], subject: "Asunto", html: "<p>Hola</p>" }),
    );
  });

  it("forwards the outbox idempotency key as Resend's Idempotency-Key header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: "re_2" }));
    const sender = createResendSender({ apiKey: "re_key", from: "noreply@muttu.co", fetchImpl });

    await sender.send({ ...message, idempotencyKey: "tarea-asignada/t1/u1" });

    expect(fetchImpl.mock.calls[0]![1].headers).toEqual({
      Authorization: "Bearer re_key",
      "Content-Type": "application/json",
      "Idempotency-Key": "tarea-asignada/t1/u1",
    });
  });

  it("returns the HTTP status and a truncated body on a provider error, and never throws", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("domain not verified", { status: 403 }));
    const sender = createResendSender({ apiKey: "re_key", from: "noreply@muttu.co", fetchImpl });

    expect(await sender.send(message)).toEqual({ ok: false, error: "Resend HTTP 403 · domain not verified" });
  });

  it("returns a fetch failure as an error result", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const sender = createResendSender({ apiKey: "re_key", from: "noreply@muttu.co", fetchImpl });

    expect(await sender.send(message)).toEqual({ ok: false, error: "fetch failed: ECONNRESET" });
  });
});

describe("createMailpitSender", () => {
  it("posts Mailpit's /api/v1/send shape and returns its message ID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ID: "mp_1" }));
    const sender = createMailpitSender({
      baseUrl: "http://127.0.0.1:54324",
      from: "Muttu Hub <noreply@muttu.co>",
      fetchImpl,
    });

    const result = await sender.send(message);

    expect(result).toEqual({ ok: true, id: "mp_1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:54324/api/v1/send");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      From: { Email: "noreply@muttu.co", Name: "Muttu Hub" },
      To: [{ Email: "ana@muttu.co" }],
      Subject: "Asunto",
      HTML: "<p>Hola</p>",
    });
  });

  it("returns the HTTP status on a Mailpit error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    const sender = createMailpitSender({ baseUrl: MAILPIT_URL_DEFAULT, from: "noreply@muttu.co", fetchImpl });

    expect(await sender.send(message)).toEqual({ ok: false, error: "Mailpit HTTP 400 · bad request" });
  });
});

describe("resolveEmailTransport", () => {
  it("defaults to Resend when EMAIL_TRANSPORT is unset and the API key exists", () => {
    const transport = resolveEmailTransport({ RESEND_API_KEY: "re_key" });
    expect(transport).toMatchObject({ ok: true, name: "resend" });
  });

  it("reports Resend as not configured without RESEND_API_KEY, with the historical error text", () => {
    expect(resolveEmailTransport({ RESEND_API_KEY: "", EMAIL_TRANSPORT: " Resend " })).toEqual({
      ok: false,
      name: "resend",
      reason: "missing RESEND_API_KEY",
    });
  });

  it("selects Mailpit with EMAIL_TRANSPORT=mailpit and needs no API key", () => {
    const transport = resolveEmailTransport({ EMAIL_TRANSPORT: "mailpit" });
    expect(transport).toMatchObject({ ok: true, name: "mailpit" });
  });

  it("refuses Mailpit on a non-loopback MAILPIT_URL so it can never swallow real mail", () => {
    expect(resolveEmailTransport({ EMAIL_TRANSPORT: "mailpit", MAILPIT_URL: "https://mail.example.com" })).toEqual({
      ok: false,
      name: "mailpit",
      reason: "MAILPIT_URL must point at loopback (got mail.example.com)",
    });
  });

  it("rejects an unknown EMAIL_TRANSPORT instead of guessing", () => {
    expect(resolveEmailTransport({ EMAIL_TRANSPORT: "smtp", RESEND_API_KEY: "re_key" })).toEqual({
      ok: false,
      name: "smtp",
      reason: "unknown EMAIL_TRANSPORT=smtp (expected resend or mailpit)",
    });
  });
});
