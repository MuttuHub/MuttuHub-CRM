// Mailpit adapter for the EmailSender port — local development only. The Supabase stack runs
// Mailpit (web UI and API on port 54324); its HTTP API `POST /api/v1/send` takes
// {From:{Email,Name?}, To:[{Email}], Subject, HTML} and answers {ID}. Shape verified against the
// running instance's /api/v1/swagger.json (Mailpit v1.30). Nothing leaves the machine.

import { readErrorDetail } from "./http";
import type { EmailSender } from "./sender";

export const MAILPIT_URL_DEFAULT = "http://127.0.0.1:54324";

/** "Muttu Hub <noreply@muttu.co>" → {Email, Name}; a bare address → {Email}. */
function parseAddress(value: string): { Email: string; Name?: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { Email: value.trim() };
  const name = match[1]!.replace(/^"|"$/g, "");
  return name ? { Email: match[2]!.trim(), Name: name } : { Email: match[2]!.trim() };
}

export function createMailpitSender(options: {
  baseUrl: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailSender {
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/api/v1/send`;
  const from = parseAddress(options.from);
  return {
    async send({ to, subject, html }) {
      const doFetch = options.fetchImpl ?? globalThis.fetch;
      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ From: from, To: [{ Email: to }], Subject: subject, HTML: html }),
        });
      } catch (err) {
        return { ok: false, error: `fetch failed: ${(err as Error).message}` };
      }

      if (!res.ok) return { ok: false, error: await readErrorDetail(res, "Mailpit") };

      try {
        const body = (await res.json()) as { ID?: unknown };
        return typeof body.ID === "string" ? { ok: true, id: body.ID } : { ok: true };
      } catch {
        return { ok: true };
      }
    },
  };
}
