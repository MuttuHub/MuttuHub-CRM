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

// ─────────────────────────────────────────────────────────────────────────
// tablero-seguimiento-social PR 1 (prisma/migrations/*_tablero_seguimiento_
// social). Same shared-database + always-rollback discipline as above.
//
// Scope, per tasks.md Phase 1:
//   1.1 — Actividad↔Meta composite FK rejects cross-proyecto meta_id (D2);
//         Proyecto.oportunidad_id @unique rejects a second link; Proyecto↔
//         Oportunidad composite FK rejects a mismatched cliente_id (T1);
//         Gasto↔LineaPresupuestal composite FK rejects cross-proyecto
//         linea_id; SoporteProyecto's XOR CHECK rejects both/neither of
//         storage_path/url_externa (D8); the https-only CHECK rejects a
//         plain http:// url_externa.
// ─────────────────────────────────────────────────────────────────────────
const MARKER2 = "sdd-invariant-tablero-social";

describe("prisma invariant: actividades meta<->proyecto composite FK (D2)", () => {
  it("rejects an Actividad whose meta_id belongs to a different proyecto", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const responsable = await tx.usuario.create({
          data: { email: `${MARKER2}-act-fk-responsable@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
        });
        const cliente = await tx.cliente.create({
          data: { nombre: MARKER2, tipo_cliente: "OTRO", responsable_id: responsable.id },
        });
        const proyectoP = await tx.proyecto.create({
          data: {
            codigo: `${MARKER2}-act-fk-P`,
            nombre: MARKER2,
            cliente_id: cliente.id,
            territorio: MARKER2,
            linea_estrategica: "SOCIAL",
            fecha_inicio: new Date("2026-01-01"),
            fecha_fin: new Date("2026-12-31"),
            responsable_id: responsable.id,
          },
        });
        const proyectoQ = await tx.proyecto.create({
          data: {
            codigo: `${MARKER2}-act-fk-Q`,
            nombre: MARKER2,
            cliente_id: cliente.id,
            territorio: MARKER2,
            linea_estrategica: "SOCIAL",
            fecha_inicio: new Date("2026-01-01"),
            fecha_fin: new Date("2026-12-31"),
            responsable_id: responsable.id,
          },
        });
        const metaDeP = await tx.meta.create({
          data: { proyecto_id: proyectoP.id, nombre: MARKER2 },
        });

        // meta_id references a Meta that really exists, but its real
        // proyecto_id is P, not Q — the composite FK (meta_id, proyecto_id)
        // -> Meta(id, proyecto_id) must reject this tuple.
        await tx.actividad.create({
          data: {
            proyecto_id: proyectoQ.id,
            meta_id: metaDeP.id,
            nombre: MARKER2,
            fecha_planificada: new Date("2026-06-01"),
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain("actividades_meta_id_proyecto_id_fkey");
  }, TEST_TIMEOUT);

  it("accepts an Actividad whose meta_id and proyecto_id belong to the same proyecto (control)", async () => {
    const result = await runAndRollback(async (tx) => {
      const responsable = await tx.usuario.create({
        data: { email: `${MARKER2}-act-fk-control@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
      });
      const cliente = await tx.cliente.create({
        data: { nombre: MARKER2, tipo_cliente: "OTRO", responsable_id: responsable.id },
      });
      const proyecto = await tx.proyecto.create({
        data: {
          codigo: `${MARKER2}-act-fk-control`,
          nombre: MARKER2,
          cliente_id: cliente.id,
          territorio: MARKER2,
          linea_estrategica: "SOCIAL",
          fecha_inicio: new Date("2026-01-01"),
          fecha_fin: new Date("2026-12-31"),
          responsable_id: responsable.id,
        },
      });
      const meta = await tx.meta.create({ data: { proyecto_id: proyecto.id, nombre: MARKER2 } });
      const actividad = await tx.actividad.create({
        data: {
          proyecto_id: proyecto.id,
          meta_id: meta.id,
          nombre: MARKER2,
          fecha_planificada: new Date("2026-06-01"),
        },
      });
      return actividad.id;
    });

    expect(result).not.toBeNull();
  }, TEST_TIMEOUT);
});

describe("prisma invariant: proyectos.oportunidad_id @unique (D1)", () => {
  it("rejects a second Proyecto linked to an already-linked oportunidad_id", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const responsable = await tx.usuario.create({
          data: { email: `${MARKER2}-proy-unique-responsable@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
        });
        const cliente = await tx.cliente.create({
          data: { nombre: MARKER2, tipo_cliente: "OTRO", responsable_id: responsable.id },
        });
        const oportunidad = await tx.oportunidad.create({
          data: { cliente_id: cliente.id, nombre: MARKER2, fase: "EJECUCION" },
        });
        await tx.proyecto.create({
          data: {
            codigo: `${MARKER2}-proy-unique-1`,
            nombre: MARKER2,
            cliente_id: cliente.id,
            oportunidad_id: oportunidad.id,
            territorio: MARKER2,
            linea_estrategica: "SOCIAL",
            fecha_inicio: new Date("2026-01-01"),
            fecha_fin: new Date("2026-12-31"),
            responsable_id: responsable.id,
          },
        });
        // Second Proyecto on the SAME oportunidad_id — must fail P2002.
        await tx.proyecto.create({
          data: {
            codigo: `${MARKER2}-proy-unique-2`,
            nombre: MARKER2,
            cliente_id: cliente.id,
            oportunidad_id: oportunidad.id,
            territorio: MARKER2,
            linea_estrategica: "SOCIAL",
            fecha_inicio: new Date("2026-01-01"),
            fecha_fin: new Date("2026-12-31"),
            responsable_id: responsable.id,
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    // Unique-constraint violations surface through Prisma's own P2002
    // translation (field name), not the raw Postgres constraint name — the
    // other rejection tests in this file hit the constraint directly via
    // $executeRaw or a bare FK violation, which is why they assert the SQL
    // constraint name instead.
    expect(String((caught as Error).message)).toContain("oportunidad_id");
  }, TEST_TIMEOUT);
});

describe("prisma invariant: proyectos oportunidad<->cliente composite FK (T1)", () => {
  it("rejects a Proyecto linking an oportunidad_id whose oportunidad belongs to a different cliente", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const responsable = await tx.usuario.create({
          data: { email: `${MARKER2}-proy-cliente-fk-responsable@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
        });
        const clienteA = await tx.cliente.create({
          data: { nombre: `${MARKER2}-cliente-A`, tipo_cliente: "OTRO", responsable_id: responsable.id },
        });
        const clienteB = await tx.cliente.create({
          data: { nombre: `${MARKER2}-cliente-B`, tipo_cliente: "OTRO", responsable_id: responsable.id },
        });
        const oportunidadDeA = await tx.oportunidad.create({
          data: { cliente_id: clienteA.id, nombre: MARKER2, fase: "EJECUCION" },
        });

        // oportunidad_id references a real Oportunidad, but it belongs to
        // clienteA — the composite FK (oportunidad_id, cliente_id) ->
        // Oportunidad(id, cliente_id) must reject cliente_id = clienteB.
        await tx.proyecto.create({
          data: {
            codigo: `${MARKER2}-proy-cliente-fk`,
            nombre: MARKER2,
            cliente_id: clienteB.id,
            oportunidad_id: oportunidadDeA.id,
            territorio: MARKER2,
            linea_estrategica: "SOCIAL",
            fecha_inicio: new Date("2026-01-01"),
            fecha_fin: new Date("2026-12-31"),
            responsable_id: responsable.id,
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain("proyectos_oportunidad_id_cliente_id_fkey");
  }, TEST_TIMEOUT);

  it("accepts a Proyecto whose oportunidad_id and cliente_id agree with the oportunidad's own cliente (control)", async () => {
    const result = await runAndRollback(async (tx) => {
      const responsable = await tx.usuario.create({
        data: { email: `${MARKER2}-proy-cliente-fk-control@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
      });
      const cliente = await tx.cliente.create({
        data: { nombre: MARKER2, tipo_cliente: "OTRO", responsable_id: responsable.id },
      });
      const oportunidad = await tx.oportunidad.create({
        data: { cliente_id: cliente.id, nombre: MARKER2, fase: "EJECUCION" },
      });
      const proyecto = await tx.proyecto.create({
        data: {
          codigo: `${MARKER2}-proy-cliente-fk-control`,
          nombre: MARKER2,
          cliente_id: cliente.id,
          oportunidad_id: oportunidad.id,
          territorio: MARKER2,
          linea_estrategica: "SOCIAL",
          fecha_inicio: new Date("2026-01-01"),
          fecha_fin: new Date("2026-12-31"),
          responsable_id: responsable.id,
        },
      });
      return proyecto.id;
    });

    expect(result).not.toBeNull();
  }, TEST_TIMEOUT);
});

describe("prisma invariant: gastos linea<->proyecto composite FK", () => {
  it("rejects a Gasto whose linea_id belongs to a different proyecto", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const responsable = await tx.usuario.create({
          data: { email: `${MARKER2}-gasto-fk-responsable@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
        });
        const cliente = await tx.cliente.create({
          data: { nombre: MARKER2, tipo_cliente: "OTRO", responsable_id: responsable.id },
        });
        const proyectoP = await tx.proyecto.create({
          data: {
            codigo: `${MARKER2}-gasto-fk-P`,
            nombre: MARKER2,
            cliente_id: cliente.id,
            territorio: MARKER2,
            linea_estrategica: "SOCIAL",
            fecha_inicio: new Date("2026-01-01"),
            fecha_fin: new Date("2026-12-31"),
            responsable_id: responsable.id,
          },
        });
        const proyectoQ = await tx.proyecto.create({
          data: {
            codigo: `${MARKER2}-gasto-fk-Q`,
            nombre: MARKER2,
            cliente_id: cliente.id,
            territorio: MARKER2,
            linea_estrategica: "SOCIAL",
            fecha_inicio: new Date("2026-01-01"),
            fecha_fin: new Date("2026-12-31"),
            responsable_id: responsable.id,
          },
        });
        const rubro = await tx.rubro.create({ data: { nombre: `${MARKER2}-rubro` } });
        const lineaDeP = await tx.lineaPresupuestal.create({
          data: { proyecto_id: proyectoP.id, rubro_id: rubro.id, monto_proyectado_cop: 1000000 },
        });

        // linea_id references a real LineaPresupuestal, but it really
        // belongs to proyectoP, not proyectoQ — the composite FK
        // (linea_id, proyecto_id) -> LineaPresupuestal(id, proyecto_id)
        // must reject this tuple.
        await tx.gasto.create({
          data: {
            proyecto_id: proyectoQ.id,
            linea_id: lineaDeP.id,
            concepto: MARKER2,
            monto_cop: 50000,
            fecha_gasto: new Date("2026-03-01"),
            registrado_por_id: responsable.id,
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain("gastos_linea_id_proyecto_id_fkey");
  }, TEST_TIMEOUT);

  it("accepts a Gasto whose linea_id and proyecto_id belong to the same proyecto (control)", async () => {
    const result = await runAndRollback(async (tx) => {
      const responsable = await tx.usuario.create({
        data: { email: `${MARKER2}-gasto-fk-control@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
      });
      const cliente = await tx.cliente.create({
        data: { nombre: MARKER2, tipo_cliente: "OTRO", responsable_id: responsable.id },
      });
      const proyecto = await tx.proyecto.create({
        data: {
          codigo: `${MARKER2}-gasto-fk-control`,
          nombre: MARKER2,
          cliente_id: cliente.id,
          territorio: MARKER2,
          linea_estrategica: "SOCIAL",
          fecha_inicio: new Date("2026-01-01"),
          fecha_fin: new Date("2026-12-31"),
          responsable_id: responsable.id,
        },
      });
      const rubro = await tx.rubro.create({ data: { nombre: `${MARKER2}-rubro-control` } });
      const linea = await tx.lineaPresupuestal.create({
        data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: 1000000 },
      });
      const gasto = await tx.gasto.create({
        data: {
          proyecto_id: proyecto.id,
          linea_id: linea.id,
          concepto: MARKER2,
          monto_cop: 50000,
          fecha_gasto: new Date("2026-03-01"),
          registrado_por_id: responsable.id,
        },
      });
      return gasto.id;
    });

    expect(result).not.toBeNull();
  }, TEST_TIMEOUT);
});

describe("prisma invariant: soportes_archivo_xor_url CHECK (D8)", () => {
  async function createProyectoFixture(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], suffix: string) {
    const responsable = await tx.usuario.create({
      data: { email: `${MARKER2}-soporte-${suffix}@example.invalid`, nombre: MARKER2, rol: "COLABORADOR" },
    });
    const cliente = await tx.cliente.create({
      data: { nombre: MARKER2, tipo_cliente: "OTRO", responsable_id: responsable.id },
    });
    const proyecto = await tx.proyecto.create({
      data: {
        codigo: `${MARKER2}-soporte-${suffix}`,
        nombre: MARKER2,
        cliente_id: cliente.id,
        territorio: MARKER2,
        linea_estrategica: "SOCIAL",
        fecha_inicio: new Date("2026-01-01"),
        fecha_fin: new Date("2026-12-31"),
        responsable_id: responsable.id,
      },
    });
    return { responsable, proyecto };
  }

  it("rejects a SoporteProyecto with both storage_path and url_externa set", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const { responsable, proyecto } = await createProyectoFixture(tx, "both");
        await tx.soporteProyecto.create({
          data: {
            proyecto_id: proyecto.id,
            tipo: "VERIFICACION",
            nombre: MARKER2,
            storage_path: "proyectos/x/soporte.pdf",
            url_externa: "https://drive.example.invalid/x",
            subido_por_id: responsable.id,
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain("soportes_archivo_xor_url");
  }, TEST_TIMEOUT);

  it("rejects a SoporteProyecto with neither storage_path nor url_externa set", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const { responsable, proyecto } = await createProyectoFixture(tx, "neither");
        await tx.soporteProyecto.create({
          data: {
            proyecto_id: proyecto.id,
            tipo: "VERIFICACION",
            nombre: MARKER2,
            subido_por_id: responsable.id,
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain("soportes_archivo_xor_url");
  }, TEST_TIMEOUT);

  it("accepts a SoporteProyecto with only storage_path set (control)", async () => {
    const result = await runAndRollback(async (tx) => {
      const { responsable, proyecto } = await createProyectoFixture(tx, "solo-archivo");
      const soporte = await tx.soporteProyecto.create({
        data: {
          proyecto_id: proyecto.id,
          tipo: "VERIFICACION",
          nombre: MARKER2,
          storage_path: "proyectos/x/solo-archivo.pdf",
          subido_por_id: responsable.id,
        },
      });
      return soporte.id;
    });

    expect(result).not.toBeNull();
  }, TEST_TIMEOUT);

  it("accepts a SoporteProyecto with only a https url_externa set (control)", async () => {
    const result = await runAndRollback(async (tx) => {
      const { responsable, proyecto } = await createProyectoFixture(tx, "solo-enlace");
      const soporte = await tx.soporteProyecto.create({
        data: {
          proyecto_id: proyecto.id,
          tipo: "VERIFICACION",
          nombre: MARKER2,
          url_externa: "https://drive.example.invalid/solo-enlace",
          subido_por_id: responsable.id,
        },
      });
      return soporte.id;
    });

    expect(result).not.toBeNull();
  }, TEST_TIMEOUT);

  it("rejects a SoporteProyecto whose url_externa uses a plain http:// scheme", async () => {
    let caught: unknown = null;

    try {
      await db.$transaction(async (tx) => {
        const { responsable, proyecto } = await createProyectoFixture(tx, "http-scheme");
        await tx.soporteProyecto.create({
          data: {
            proyecto_id: proyecto.id,
            tipo: "VERIFICACION",
            nombre: MARKER2,
            url_externa: "http://drive.example.invalid/inseguro",
            subido_por_id: responsable.id,
          },
        });
      }, TX_OPTIONS);
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(String((caught as Error).message)).toContain("soportes_url_https");
  }, TEST_TIMEOUT);
});
