// EmailSender port (PR-M1, Frente M). Everything that sends mail — the daily summary and the
// outbox worker — goes through this interface, so changing provider touches one adapter.
//
// Adapters use `fetch` only (no SDK, no SMTP dependency):
//   * resend  — production (`RESEND_API_KEY`, `EMAIL_FROM`). The default.
//   * mailpit — local only: the Mailpit that ships with the Supabase stack (`MAILPIT_URL`,
//               default http://127.0.0.1:54324). Refused on a non-loopback URL so a deployed
//               environment can never silently swallow real mail.
// `EMAIL_TRANSPORT` picks one; unset means resend.

import { isLocalTarget } from "../../../prisma/local-env";
import { createMailpitSender, MAILPIT_URL_DEFAULT } from "./mailpit";
import { createResendSender } from "./resend";

const EMAIL_FROM_DEFAULT = "noreply@muttu.co";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Forwarded to the provider when it supports deduplication (Resend: `Idempotency-Key`). */
  idempotencyKey?: string;
};

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export interface EmailSender {
  /** Never throws: transport and provider failures come back as `{ ok: false }`. */
  send(message: EmailMessage): Promise<SendResult>;
}

type EmailTransportName = "resend" | "mailpit";

export type EmailTransport =
  | { ok: true; name: EmailTransportName; sender: EmailSender }
  | { ok: false; name: string; reason: string };

/** Reads EMAIL_TRANSPORT, RESEND_API_KEY, EMAIL_FROM and MAILPIT_URL. */
type EmailEnv = Readonly<Record<string, string | undefined>>;

/** Picks the configured adapter, or explains why mail cannot be sent. Never throws. */
export function resolveEmailTransport(env: EmailEnv = process.env): EmailTransport {
  const name = (env.EMAIL_TRANSPORT ?? "").trim().toLowerCase() || "resend";
  const from = env.EMAIL_FROM || EMAIL_FROM_DEFAULT;

  if (name === "resend") {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) return { ok: false, name, reason: "missing RESEND_API_KEY" };
    return { ok: true, name, sender: createResendSender({ apiKey, from }) };
  }

  if (name === "mailpit") {
    const baseUrl = env.MAILPIT_URL || MAILPIT_URL_DEFAULT;
    if (!isLocalTarget(baseUrl)) {
      let host = baseUrl;
      try {
        host = new URL(baseUrl).hostname;
      } catch {
        // unparseable: report it as given
      }
      return { ok: false, name, reason: `MAILPIT_URL must point at loopback (got ${host})` };
    }
    return { ok: true, name, sender: createMailpitSender({ baseUrl, from }) };
  }

  return { ok: false, name, reason: `unknown EMAIL_TRANSPORT=${name} (expected resend or mailpit)` };
}
