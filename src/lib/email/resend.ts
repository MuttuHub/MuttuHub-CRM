// Resend adapter for the EmailSender port. Same request the daily summary always sent
// (POST https://api.resend.com/emails, Bearer key, JSON {from, to[], subject, html}); the only
// addition is the optional `Idempotency-Key` header, sent only when the caller provides one.
// Resend keeps a key for 24 h and accepts at most 256 characters.
//
// Every request is aborted after `timeoutMs`, so a hung connection cannot hold a whole outbox
// batch. A 429 comes back with `retryAfterMs` (from `Retry-After`) so the caller can back off.

import { readErrorDetail } from "./http";
import type { EmailSender } from "./sender";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;
/** Wait used when a 429 carries no usable `Retry-After`. */
const RATE_LIMIT_DEFAULT_WAIT_MS = 60_000;

export function createResendSender(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): EmailSender {
  const { apiKey, from } = options;
  const timeoutMs = options.timeoutMs ?? RESEND_TIMEOUT_MS;
  return {
    async send({ to, subject, html, idempotencyKey }) {
      const doFetch = options.fetchImpl ?? globalThis.fetch;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

      let res: Response;
      try {
        res = await doFetch(RESEND_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ from, to: [to], subject, html }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if ((err as Error).name === "TimeoutError") {
          return { ok: false, error: `Resend timed out after ${timeoutMs} ms` };
        }
        return { ok: false, error: `fetch failed: ${(err as Error).message}` };
      }

      if (res.status === 429) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"), Date.now());
        return { ok: false, error: await readErrorDetail(res, "Resend"), retryAfterMs };
      }
      if (!res.ok) return { ok: false, error: await readErrorDetail(res, "Resend") };

      try {
        const body = (await res.json()) as { id?: unknown };
        return typeof body.id === "string" ? { ok: true, id: body.id } : { ok: true };
      } catch {
        return { ok: true };
      }
    },
  };
}

/**
 * `Retry-After` is either delay-seconds or an HTTP date (RFC 9110 §10.2.3). Only a value with
 * letters is read as a date: `Date.parse` accepts malformed numbers like "1.5" or "-5" as dates
 * in 2001, which would turn them into an immediate retry.
 */
function parseRetryAfterMs(header: string | null, nowMs: number): number {
  const value = header?.trim() ?? "";
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = /[a-z]/i.test(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isNaN(at)) return Math.max(0, at - nowMs);
  return RATE_LIMIT_DEFAULT_WAIT_MS;
}
