// Resend adapter for the EmailSender port. Same request the daily summary always sent
// (POST https://api.resend.com/emails, Bearer key, JSON {from, to[], subject, html}); the only
// addition is the optional `Idempotency-Key` header, sent only when the caller provides one.
// Resend keeps a key for 24 h and accepts at most 256 characters.

import { readErrorDetail } from "./http";
import type { EmailSender } from "./sender";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function createResendSender(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailSender {
  const { apiKey, from } = options;
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
        });
      } catch (err) {
        return { ok: false, error: `fetch failed: ${(err as Error).message}` };
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
