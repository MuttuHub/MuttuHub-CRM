// Transactional email outbox (PR-M1, Frente M).
//
// Write side — `enqueueEmail(tx, …)`: a business event inserts its email in the SAME Prisma
// transaction as the event, so the email exists iff the event committed. The insert is
// `ON CONFLICT (clave_idempotencia) DO NOTHING` (createMany + skipDuplicates): enqueuing the same
// event twice is a no-op and never aborts the caller's transaction.
//
// Read side — `processOutbox(sender, now, limit)`: run by the daily cron.
//   1. Claim: one statement flips due rows to ENVIANDO, bumps `intentos` and sets a lease
//      (`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING …`). Two overlapping
//      runs therefore get disjoint rows: the second run skips rows the first has locked, and a
//      row the first already committed no longer matches `estado = 'PENDIENTE'`. Counting the
//      attempt at claim time means a worker that crashes mid-send still uses up an attempt.
//   2. Send each claimed row through the EmailSender port with its idempotency key (Resend
//      deduplicates on it for 24 h, so a retry after a lost response does not deliver twice).
//   3. ok → ENVIADO (terminal: never claimed again). Failure → back to PENDIENTE with an
//      exponential backoff, or FALLIDO once `intentos` reaches OUTBOX_MAX_ATTEMPTS.
//   A row whose worker died keeps ENVIANDO until its lease expires, then it is claimable again
//   (or FALLIDO if it had no attempts left). Every state change after the claim is guarded by
//   `estado = 'ENVIANDO'`, so a late writer cannot resurrect or overwrite a settled row.

import { Prisma, type PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import type { EmailSender } from "./sender";

export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_MS = 10 * 60_000;
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_CAP_MS = 6 * 60 * 60_000;
/** Resend's limit for `Idempotency-Key`. */
const IDEMPOTENCY_KEY_MAX = 256;

/** Delay before the next attempt after `attempt` failed ones: 5, 10, 20, 40 min … capped at 6 h. */
export function nextAttemptDelayMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_CAP_MS);
}

export type EnqueueEmailInput = {
  to: string;
  subject: string;
  html: string;
  /** Free-form kind, e.g. "TAREA_ASIGNADA" — for reporting and future preferences. */
  tipo: string;
  /** Unique per event, e.g. `tarea-asignada/<tareaId>/<usuarioId>`. */
  idempotencyKey: string;
  usuarioId?: string | null;
  /** Earliest send time; defaults to now. */
  notBefore?: Date;
};

type OutboxWriter = { emailOutbox: Pick<Prisma.TransactionClient["emailOutbox"], "createMany"> };

/** Inserts the email inside the caller's transaction. `enqueued: false` means the key already existed. */
export async function enqueueEmail(
  tx: OutboxWriter,
  input: EnqueueEmailInput,
): Promise<{ enqueued: boolean }> {
  const key = input.idempotencyKey;
  if (!key || key.length > IDEMPOTENCY_KEY_MAX) {
    throw new Error(`email outbox: idempotency key must be 1-${IDEMPOTENCY_KEY_MAX} characters`);
  }
  const { count } = await tx.emailOutbox.createMany({
    data: [
      {
        usuario_id: input.usuarioId ?? null,
        destinatario_email: input.to,
        asunto: input.subject,
        html: input.html,
        tipo: input.tipo,
        clave_idempotencia: key,
        ...(input.notBefore ? { proximo_intento_at: input.notBefore } : {}),
      },
    ],
    skipDuplicates: true,
  });
  return { enqueued: count === 1 };
}

export type ClaimedEmail = {
  id: string;
  destinatario_email: string;
  asunto: string;
  html: string;
  /** Attempts INCLUDING the one just claimed. */
  intentos: number;
  clave_idempotencia: string;
};

export interface OutboxStore {
  claimDue(args: { now: Date; limit: number; leaseMs: number; maxAttempts: number }): Promise<ClaimedEmail[]>;
  markSent(id: string, args: { now: Date; providerId?: string }): Promise<void>;
  markRetry(id: string, args: { nextAttemptAt: Date; error: string }): Promise<void>;
  markFailed(id: string, args: { error: string }): Promise<void>;
}

/** `timestamp(3)` columns hold UTC wall time (Prisma's convention); bind dates the same way. */
function utc(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

export function createPrismaOutboxStore(client: PrismaClient = db): OutboxStore {
  return {
    async claimDue({ now, limit, leaseMs, maxAttempts }) {
      const leaseUntil = new Date(now.getTime() + leaseMs);

      // A crashed worker's row with no attempts left cannot be retried: settle it.
      await client.emailOutbox.updateMany({
        where: { estado: "ENVIANDO", bloqueado_hasta: { lt: now }, intentos: { gte: maxAttempts } },
        data: { estado: "FALLIDO", ultimo_error: "lease expired after the last attempt", bloqueado_hasta: null },
      });

      return client.$queryRaw<ClaimedEmail[]>(Prisma.sql`
        UPDATE "email_outbox"
           SET "estado" = 'ENVIANDO',
               "intentos" = "intentos" + 1,
               "bloqueado_hasta" = ${utc(leaseUntil)},
               "updated_at" = ${utc(now)}
         WHERE "id" IN (
           SELECT "id" FROM "email_outbox"
            WHERE "intentos" < ${maxAttempts}
              AND (("estado" = 'PENDIENTE' AND "proximo_intento_at" <= ${utc(now)})
                OR ("estado" = 'ENVIANDO' AND "bloqueado_hasta" < ${utc(now)}))
            ORDER BY "proximo_intento_at" ASC, "created_at" ASC
            LIMIT ${limit}
              FOR UPDATE SKIP LOCKED
         )
        RETURNING "id", "destinatario_email", "asunto", "html", "intentos", "clave_idempotencia"`);
    },
    async markSent(id, { now, providerId }) {
      await client.emailOutbox.updateMany({
        where: { id, estado: "ENVIANDO" },
        data: {
          estado: "ENVIADO",
          enviado_at: now,
          proveedor_id: providerId ?? null,
          ultimo_error: null,
          bloqueado_hasta: null,
        },
      });
    },
    async markRetry(id, { nextAttemptAt, error }) {
      await client.emailOutbox.updateMany({
        where: { id, estado: "ENVIANDO" },
        data: { estado: "PENDIENTE", proximo_intento_at: nextAttemptAt, ultimo_error: error, bloqueado_hasta: null },
      });
    },
    async markFailed(id, { error }) {
      await client.emailOutbox.updateMany({
        where: { id, estado: "ENVIANDO" },
        data: { estado: "FALLIDO", ultimo_error: error, bloqueado_hasta: null },
      });
    },
  };
}

export type OutboxRunSummary = { claimed: number; sent: number; retried: number; failed: number };

export async function processOutbox(
  sender: EmailSender,
  now: Date,
  limit: number,
  options: { store?: OutboxStore; maxAttempts?: number; leaseMs?: number } = {},
): Promise<OutboxRunSummary> {
  const store = options.store ?? createPrismaOutboxStore();
  const maxAttempts = options.maxAttempts ?? OUTBOX_MAX_ATTEMPTS;
  const leaseMs = options.leaseMs ?? OUTBOX_LEASE_MS;

  const claimed = await store.claimDue({ now, limit, leaseMs, maxAttempts });
  const summary: OutboxRunSummary = { claimed: claimed.length, sent: 0, retried: 0, failed: 0 };

  for (const email of claimed) {
    let result;
    try {
      result = await sender.send({
        to: email.destinatario_email,
        subject: email.asunto,
        html: email.html,
        idempotencyKey: email.clave_idempotencia,
      });
    } catch (err) {
      result = { ok: false as const, error: (err as Error).message || String(err) };
    }

    if (result.ok) {
      await store.markSent(email.id, { now, providerId: result.id });
      summary.sent += 1;
    } else if (email.intentos >= maxAttempts) {
      await store.markFailed(email.id, { error: result.error.slice(0, 500) });
      summary.failed += 1;
    } else {
      await store.markRetry(email.id, {
        nextAttemptAt: new Date(now.getTime() + nextAttemptDelayMs(email.intentos)),
        error: result.error.slice(0, 500),
      });
      summary.retried += 1;
    }
  }

  return summary;
}
