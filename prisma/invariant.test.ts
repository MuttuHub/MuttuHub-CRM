// Database-level invariant tests for oportunidades-comerciales PR 1
// (prisma/migrations/20260915120000_oportunidades_comerciales). These hit the
// real database configured by DATABASE_URL/DIRECT_URL — every fixture is
// created and asserted INSIDE a Prisma interactive transaction that is
// always forced to roll back (via the `Rollback` sentinel below), so nothing
// written by this file is ever persisted, whatever the outcome.
//
// Scope, per tasks.md Phase 1:
//   1.1/1.5 — the `tareas_oportunidad_requiere_cliente` CHECK constraint
//             (D2) rejects oportunidad_id set + cliente_id NULL, closing the
//             MATCH SIMPLE hole the composite FK alone leaves open.
//   1.4/1.5 — the D3 seed UPDATE predicate flags exactly the COLABORADORES
//             responsible for a client with a live (non-deleted) Oportunidad.

// vitest.config.ts does not load .env (unlike prisma.config.ts) — this file
// is the only test in the suite that touches a real database connection, so
// it loads it explicitly rather than changing global test setup for files
// that never need it.
import "dotenv/config";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

const MARKER = "sdd-invariant-oportunidades-pr1";

// This suite runs against a remote pooled Postgres instance (no local DB in
// this environment) — Prisma's 5s default interactive-transaction timeout is
// too tight for that round-trip latency and produced flaky
// "Unable to start a transaction in the given time" failures. Widen both.
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

/** Thrown at the end of every transaction body to force a rollback even when
 * every assertion setup step succeeded — this file must never leave rows
 * behind in a shared database. */
class IntentionalRollback extends Error {}

async function runAndRollback<T>(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  let captured: T | undefined;
  try {
    await db.$transaction(async (tx) => {
      captured = await fn(tx);
      throw new IntentionalRollback();
    }, TX_OPTIONS);
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error;
  }
  return captured as T;
}

// Vitest's default per-test timeout (5000ms) is tighter than the remote-DB
// round trips these tests need, especially under full-suite load — pass it
// explicitly on every test in this file rather than only tuning Prisma's own
// transaction timeout above.
const TEST_TIMEOUT = 20_000;

describe("prisma invariant: tareas_oportunidad_requiere_cliente (CHECK, D2)", () => {
  it("rejects a Tarea with oportunidad_id set and cliente_id NULL", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const responsable = await tx.usuario.create({
          data: {
            email: `${MARKER}-check-responsable@example.invalid`,
            nombre: MARKER,
            rol: "COLABORADOR",
          },
        });

        // oportunidad_id does not need to reference a real Oportunidad row:
        // the composite FK is MATCH SIMPLE and is skipped entirely whenever
        // any referencing column is NULL — that is exactly the hole the
        // CHECK exists to close, independent of FK referential integrity.
        await tx.tarea.create({
          data: {
            titulo: `${MARKER}-tarea`,
            responsable_id: responsable.id,
            cliente_id: null,
            oportunidad_id: "00000000-0000-0000-0000-000000000000",
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain("tareas_oportunidad_requiere_cliente");
  }, TEST_TIMEOUT);

  it("accepts a Tarea with oportunidad_id set and a matching cliente_id (control case)", async () => {
    const result = await runAndRollback(async (tx) => {
      const responsable = await tx.usuario.create({
        data: {
          email: `${MARKER}-check-control-responsable@example.invalid`,
          nombre: MARKER,
          rol: "COLABORADOR",
        },
      });
      const cliente = await tx.cliente.create({
        data: { nombre: MARKER, tipo_cliente: "OTRO", responsable_id: responsable.id },
      });
      const oportunidad = await tx.oportunidad.create({
        data: { cliente_id: cliente.id, nombre: MARKER },
      });
      const tarea = await tx.tarea.create({
        data: {
          titulo: `${MARKER}-tarea-valida`,
          responsable_id: responsable.id,
          cliente_id: cliente.id,
          oportunidad_id: oportunidad.id,
        },
      });
      return tarea.oportunidad_id;
    });

    expect(result).not.toBeNull();
  }, TEST_TIMEOUT);
});

describe("prisma migration seed: D3 gestiona_oportunidades predicate", () => {
  it("flags exactly the COLABORADOR responsible for a client with a live Oportunidad, not the one without", async () => {
    const captured = await runAndRollback(async (tx) => {
      const withOppUser = await tx.usuario.create({
        data: { email: `${MARKER}-seed-with-opp@example.invalid`, nombre: MARKER, rol: "COLABORADOR" },
      });
      const withoutOppUser = await tx.usuario.create({
        data: { email: `${MARKER}-seed-without-opp@example.invalid`, nombre: MARKER, rol: "COLABORADOR" },
      });
      const clienteWithOpp = await tx.cliente.create({
        data: { nombre: `${MARKER}-cliente-con-oportunidad`, tipo_cliente: "OTRO", responsable_id: withOppUser.id },
      });
      const clienteWithoutOpp = await tx.cliente.create({
        data: { nombre: `${MARKER}-cliente-sin-oportunidad`, tipo_cliente: "OTRO", responsable_id: withoutOppUser.id },
      });
      await tx.oportunidad.create({ data: { cliente_id: clienteWithOpp.id, nombre: MARKER } });

      // Exact copy of the migration's D3 seed UPDATE (migration.sql), scoped
      // to just these two fixture users via the id filter so it can never
      // touch real data even if the transaction somehow committed.
      await tx.$executeRaw`
        UPDATE usuarios u SET gestiona_oportunidades = true
        WHERE u.rol = 'COLABORADOR'
          AND u.id = ANY(ARRAY[${withOppUser.id}, ${withoutOppUser.id}]::text[])
          AND EXISTS (
            SELECT 1 FROM clientes c
            JOIN oportunidades o ON o.cliente_id = c.id AND o.deleted_at IS NULL
            WHERE c.responsable_id = u.id AND c.deleted_at IS NULL
          )
      `;

      const rows = await tx.usuario.findMany({
        where: { id: { in: [withOppUser.id, withoutOppUser.id] } },
        select: { id: true, gestiona_oportunidades: true },
      });

      return {
        withOpportunity: rows.find((r) => r.id === withOppUser.id)?.gestiona_oportunidades,
        withoutOpportunity: rows.find((r) => r.id === withoutOppUser.id)?.gestiona_oportunidades,
      };
    });

    expect(captured.withOpportunity).toBe(true);
    expect(captured.withoutOpportunity).toBe(false);
  }, TEST_TIMEOUT);

  it("does not flag a COLABORADOR whose client's only Oportunidad is soft-deleted", async () => {
    const captured = await runAndRollback(async (tx) => {
      const user = await tx.usuario.create({
        data: { email: `${MARKER}-seed-deleted-opp@example.invalid`, nombre: MARKER, rol: "COLABORADOR" },
      });
      const cliente = await tx.cliente.create({
        data: { nombre: `${MARKER}-cliente-oportunidad-borrada`, tipo_cliente: "OTRO", responsable_id: user.id },
      });
      await tx.oportunidad.create({
        data: { cliente_id: cliente.id, nombre: MARKER, deleted_at: new Date() },
      });

      await tx.$executeRaw`
        UPDATE usuarios u SET gestiona_oportunidades = true
        WHERE u.rol = 'COLABORADOR'
          AND u.id = ${user.id}
          AND EXISTS (
            SELECT 1 FROM clientes c
            JOIN oportunidades o ON o.cliente_id = c.id AND o.deleted_at IS NULL
            WHERE c.responsable_id = u.id AND c.deleted_at IS NULL
          )
      `;

      const row = await tx.usuario.findUniqueOrThrow({
        where: { id: user.id },
        select: { gestiona_oportunidades: true },
      });
      return row.gestiona_oportunidades;
    });

    expect(captured).toBe(false);
  }, TEST_TIMEOUT);
});
