import { describe, expect, it, vi } from "vitest";

import {
  enqueueEmail,
  nextAttemptDelayMs,
  OUTBOX_MAX_ATTEMPTS,
  processOutbox,
  type ClaimedEmail,
  type OutboxStore,
} from "./outbox";
import type { EmailMessage, EmailSender, SendResult } from "./sender";

type Estado = "PENDIENTE" | "ENVIANDO" | "ENVIADO" | "FALLIDO";

type FakeRow = ClaimedEmail & {
  estado: Estado;
  proximo_intento_at: Date;
  bloqueado_hasta: Date | null;
  ultimo_error: string | null;
  enviado_at: Date | null;
  proveedor_id: string | null;
};

/**
 * In-memory OutboxStore with the same contract as the Postgres one: `claimDue` selects and
 * flips the rows in one synchronous step (no await in between), which is what the real
 * `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` guarantees across connections.
 */
function createFakeStore(rows: FakeRow[]): OutboxStore & { rows: FakeRow[] } {
  return {
    rows,
    async claimDue({ now, limit, leaseMs, maxAttempts }) {
      for (const row of rows) {
        if (row.estado === "ENVIANDO" && row.bloqueado_hasta! < now && row.intentos >= maxAttempts) {
          row.estado = "FALLIDO";
          row.ultimo_error = "lease expired after the last attempt";
        }
      }
      const due = rows
        .filter(
          (row) =>
            row.intentos < maxAttempts &&
            ((row.estado === "PENDIENTE" && row.proximo_intento_at <= now) ||
              (row.estado === "ENVIANDO" && row.bloqueado_hasta! < now)),
        )
        .sort((a, b) => a.proximo_intento_at.getTime() - b.proximo_intento_at.getTime())
        .slice(0, limit);
      for (const row of due) {
        row.estado = "ENVIANDO";
        row.intentos += 1;
        row.bloqueado_hasta = new Date(now.getTime() + leaseMs);
      }
      return due.map(({ id, destinatario_email, asunto, html, intentos, clave_idempotencia }) => ({
        id,
        destinatario_email,
        asunto,
        html,
        intentos,
        clave_idempotencia,
      }));
    },
    async markSent(id, { now, providerId }) {
      const row = rows.find((r) => r.id === id)!;
      if (row.estado !== "ENVIANDO") return;
      Object.assign(row, { estado: "ENVIADO", enviado_at: now, proveedor_id: providerId ?? null, bloqueado_hasta: null });
    },
    async markRetry(id, { nextAttemptAt, error }) {
      const row = rows.find((r) => r.id === id)!;
      if (row.estado !== "ENVIANDO") return;
      Object.assign(row, { estado: "PENDIENTE", proximo_intento_at: nextAttemptAt, ultimo_error: error, bloqueado_hasta: null });
    },
    async markFailed(id, { error }) {
      const row = rows.find((r) => r.id === id)!;
      if (row.estado !== "ENVIANDO") return;
      Object.assign(row, { estado: "FALLIDO", ultimo_error: error, bloqueado_hasta: null });
    },
  };
}

const NOW = new Date("2026-11-04T13:00:00.000Z");

function row(id: string, overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id,
    destinatario_email: `${id}@muttu.co`,
    asunto: `Asunto ${id}`,
    html: `<p>${id}</p>`,
    intentos: 0,
    clave_idempotencia: `prueba/${id}`,
    estado: "PENDIENTE",
    proximo_intento_at: new Date(NOW.getTime() - 60_000),
    bloqueado_hasta: null,
    ultimo_error: null,
    enviado_at: null,
    proveedor_id: null,
    ...overrides,
  };
}

function recordingSender(results: (msg: EmailMessage) => SendResult | Promise<SendResult>) {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    async send(msg) {
      sent.push(msg);
      return results(msg);
    },
  };
  return { sender, sent };
}

describe("processOutbox", () => {
  it("claims the due pending rows, sends each with its idempotency key and marks it sent", async () => {
    const store = createFakeStore([
      row("a"),
      row("b"),
      row("later", { proximo_intento_at: new Date(NOW.getTime() + 60_000) }),
    ]);
    const { sender, sent } = recordingSender(() => ({ ok: true, id: "prov-1" }));

    const summary = await processOutbox(sender, NOW, 10, { store });

    expect(summary).toEqual({ claimed: 2, sent: 2, retried: 0, failed: 0 });
    expect(sent).toEqual([
      { to: "a@muttu.co", subject: "Asunto a", html: "<p>a</p>", idempotencyKey: "prueba/a" },
      { to: "b@muttu.co", subject: "Asunto b", html: "<p>b</p>", idempotencyKey: "prueba/b" },
    ]);
    expect(store.rows.map((r) => [r.id, r.estado, r.intentos])).toEqual([
      ["a", "ENVIADO", 1],
      ["b", "ENVIADO", 1],
      ["later", "PENDIENTE", 0],
    ]);
    expect(store.rows[0]).toMatchObject({ enviado_at: NOW, proveedor_id: "prov-1" });
  });

  it("honours the batch limit", async () => {
    const store = createFakeStore([row("a"), row("b"), row("c")]);
    const { sender, sent } = recordingSender(() => ({ ok: true }));

    const summary = await processOutbox(sender, NOW, 2, { store });

    expect(summary.claimed).toBe(2);
    expect(sent).toHaveLength(2);
    expect(store.rows[2]!.estado).toBe("PENDIENTE");
  });

  it("puts a provider failure back to pending with a backoff, then delivers it exactly once on the retry", async () => {
    const store = createFakeStore([row("a")]);
    let fail = true;
    const { sender, sent } = recordingSender(() =>
      fail ? { ok: false, error: "Resend HTTP 503" } : { ok: true, id: "prov-2" },
    );

    const first = await processOutbox(sender, NOW, 10, { store });
    expect(first).toEqual({ claimed: 1, sent: 0, retried: 1, failed: 0 });
    expect(store.rows[0]).toMatchObject({
      estado: "PENDIENTE",
      intentos: 1,
      ultimo_error: "Resend HTTP 503",
      proximo_intento_at: new Date(NOW.getTime() + nextAttemptDelayMs(1)),
    });

    // Before the backoff elapses nothing is claimed.
    const early = await processOutbox(sender, new Date(NOW.getTime() + 1_000), 10, { store });
    expect(early.claimed).toBe(0);

    fail = false;
    const later = new Date(NOW.getTime() + nextAttemptDelayMs(1));
    const second = await processOutbox(sender, later, 10, { store });
    expect(second).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0 });

    // A further run never resends a sent row.
    const third = await processOutbox(sender, new Date(later.getTime() + 86_400_000), 10, { store });
    expect(third.claimed).toBe(0);
    expect(sent).toHaveLength(2);
    expect(sent.every((m) => m.idempotencyKey === "prueba/a")).toBe(true);
    expect(store.rows[0]).toMatchObject({ estado: "ENVIADO", intentos: 2 });
  });

  it("treats a sender that throws like a provider failure", async () => {
    const store = createFakeStore([row("a")]);
    const sender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const summary = await processOutbox(sender, NOW, 10, { store });

    expect(summary.retried).toBe(1);
    expect(store.rows[0]).toMatchObject({ estado: "PENDIENTE", ultimo_error: "boom" });
  });

  it("marks the row failed once it reaches the maximum attempts", async () => {
    const store = createFakeStore([row("a", { intentos: OUTBOX_MAX_ATTEMPTS - 1 })]);
    const { sender } = recordingSender(() => ({ ok: false, error: "Resend HTTP 422" }));

    const summary = await processOutbox(sender, NOW, 10, { store });

    expect(summary).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 1 });
    expect(store.rows[0]).toMatchObject({
      estado: "FALLIDO",
      intentos: OUTBOX_MAX_ATTEMPTS,
      ultimo_error: "Resend HTTP 422",
    });

    const again = await processOutbox(sender, new Date(NOW.getTime() + 86_400_000), 10, { store });
    expect(again.claimed).toBe(0);
  });

  it("backs off exponentially from five minutes, capped at six hours", () => {
    expect([1, 2, 3, 4].map(nextAttemptDelayMs)).toEqual([5, 10, 20, 40].map((m) => m * 60_000));
    expect(nextAttemptDelayMs(20)).toBe(6 * 60 * 60_000);
  });

  it("never sends the same row twice when two runs overlap", async () => {
    const store = createFakeStore(["a", "b", "c", "d", "e"].map((id) => row(id)));
    const { sender, sent } = recordingSender(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true };
    });

    const [one, two] = await Promise.all([
      processOutbox(sender, NOW, 3, { store }),
      processOutbox(sender, NOW, 3, { store }),
    ]);

    expect(one.sent + two.sent).toBe(5);
    expect(sent.map((m) => m.to).sort()).toEqual(["a", "b", "c", "d", "e"].map((id) => `${id}@muttu.co`));
    expect(store.rows.every((r) => r.estado === "ENVIADO" && r.intentos === 1)).toBe(true);
  });

  it("reclaims a row whose worker died mid-send only after its lease expires", async () => {
    const store = createFakeStore([
      row("a", { estado: "ENVIANDO", intentos: 1, bloqueado_hasta: new Date(NOW.getTime() + 60_000) }),
    ]);
    const { sender, sent } = recordingSender(() => ({ ok: true }));

    expect((await processOutbox(sender, NOW, 10, { store })).claimed).toBe(0);
    const after = await processOutbox(sender, new Date(NOW.getTime() + 120_000), 10, { store });

    expect(after).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ estado: "ENVIADO", intentos: 2 });
  });
});

describe("enqueueEmail", () => {
  it("inserts inside the caller's transaction and skips a duplicate idempotency key", async () => {
    const createMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const tx = { emailOutbox: { createMany } };
    const input = {
      to: "ana@muttu.co",
      subject: "Tienes una tarea nueva",
      html: "<p>Hola</p>",
      tipo: "TAREA_ASIGNADA",
      idempotencyKey: "tarea-asignada/t1/u1",
      usuarioId: "u1",
    };

    expect(await enqueueEmail(tx, input)).toEqual({ enqueued: true });
    expect(await enqueueEmail(tx, input)).toEqual({ enqueued: false });
    expect(createMany).toHaveBeenNthCalledWith(1, {
      data: [
        {
          usuario_id: "u1",
          destinatario_email: "ana@muttu.co",
          asunto: "Tienes una tarea nueva",
          html: "<p>Hola</p>",
          tipo: "TAREA_ASIGNADA",
          clave_idempotencia: "tarea-asignada/t1/u1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("rejects an idempotency key Resend would refuse (empty or over 256 characters)", async () => {
    const tx = { emailOutbox: { createMany: vi.fn() } };
    const base = { to: "a@muttu.co", subject: "s", html: "h", tipo: "PRUEBA" };

    await expect(enqueueEmail(tx, { ...base, idempotencyKey: "" })).rejects.toThrow(/idempotency key/);
    await expect(enqueueEmail(tx, { ...base, idempotencyKey: "x".repeat(257) })).rejects.toThrow(/idempotency key/);
    expect(tx.emailOutbox.createMany).not.toHaveBeenCalled();
  });
});
