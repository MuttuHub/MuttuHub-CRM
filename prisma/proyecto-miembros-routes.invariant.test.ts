// Live-DB coverage for the E-07 membership routes. The three claims that a
// mocked Prisma client cannot make are enforced by the database itself:
//
//   - "already an active member" is answered 409 by the partial unique index
//     `proyecto_miembros_activo_uq`, not by a read-then-write check that could
//     race;
//   - `DELETE` is a soft removal: the row survives with `removed_at` set and the
//     member loses read access immediately (the U1 scope honours `removed_at`);
//   - a previously removed member can be re-added, which inserts a new row.
//
// Every path drives the REAL route handlers against the LOCAL database —
// `@/lib/db` is a Proxy that joins the ambient test transaction (same harness as
// prisma/proyecto-miembros-scope.invariant.test.ts) and only auth is mocked.
//
// `./require-local-db` must stay the FIRST import — it loads `.env.local` and
// refuses any non-loopback target before the Prisma client is built.
import "./require-local-db";

import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient, type Usuario } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ tx: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));

// The routes read/write through `@/lib/db`; the proxy forwards every model
// delegate to the ambient test transaction so the whole path shares one tx and
// rolls back together.
vi.mock("@/lib/db", () => ({
  db: new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => fn(holder.tx);
      }
      const source = holder.tx as Record<string, unknown> | null;
      if (!source) {
        throw new Error(`db.${String(prop)} was used outside the test transaction`);
      }
      const value = source[prop as string];
      return typeof value === "function" ? value.bind(source) : value;
    },
  }),
}));

import { requireApiUser } from "@/lib/supabase/server";
import { AUDIT_ENTIDADES_V2 } from "@/lib/api/audit-cambios";
import { GET as listProjects } from "@/app/api/v1/projects/route";
import { GET as getProject } from "@/app/api/v1/projects/[id]/route";
import { GET as getProjectAudit } from "@/app/api/v1/projects/[id]/audit/route";
import { POST as addMember } from "@/app/api/v1/projects/[id]/members/route";
import { DELETE as removeMember } from "@/app/api/v1/projects/[id]/members/[userId]/route";

const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Tx = Prisma.TransactionClient;

/** Thrown to force a rollback even when the body succeeded. */
class IntentionalRollback extends Error {}

async function runAndRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let captured: T | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      holder.tx = tx;
      captured = await fn(tx);
      throw new IntentionalRollback();
    }, TX_OPTIONS);
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error;
  } finally {
    holder.tx = null;
  }
  return captured as T;
}

const MARKER = "sdd-routes-miembros";

/**
 * A GERENCIA actor, a COORDINADOR target and a project. Every id is a fresh
 * UUID and every code is MARKER-prefixed, so nothing this suite creates can
 * collide with `prisma/seed.ts`.
 */
async function seedFixture(tx: Tx) {
  const suffix = randomUUID();
  const gerencia = await tx.usuario.create({
    data: { email: `${MARKER}-ger-${suffix}@example.test`, nombre: MARKER, rol: "GERENCIA" },
  });
  const coordinador = await tx.usuario.create({
    data: { email: `${MARKER}-coord-${suffix}@example.test`, nombre: MARKER, rol: "COORDINADOR" },
  });
  const inactivo = await tx.usuario.create({
    data: {
      email: `${MARKER}-inactivo-${suffix}@example.test`,
      nombre: MARKER,
      rol: "COORDINADOR",
      activo: false,
    },
  });
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${suffix}`, tipo_cliente: "OTRO", responsable_id: gerencia.id },
  });
  const proyecto = await tx.proyecto.create({
    data: {
      codigo: `PRY-RTM-${suffix}`,
      nombre: `${MARKER}-${suffix}`,
      cliente_id: cliente.id,
    },
  });
  return { suffix, gerencia, coordinador, inactivo, cliente, proyecto };
}

function authAs(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({
    ok: true,
    usuario,
    supabaseUser: {} as never,
  });
}

function listRequest(): Request {
  return new Request("http://localhost/api/v1/projects");
}

function detailRequest(id: string): Request {
  return new Request(`http://localhost/api/v1/projects/${id}`);
}

function auditRequest(id: string): Request {
  return new Request(`http://localhost/api/v1/projects/${id}/audit`);
}

function membersRequest(id: string, body?: unknown): Request {
  return new Request(`http://localhost/api/v1/projects/${id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function memberRequest(id: string, userId: string): Request {
  return new Request(`http://localhost/api/v1/projects/${id}/members/${userId}`, {
    method: "DELETE",
  });
}

function projectContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function memberContext(id: string, userId: string) {
  return { params: Promise.resolve({ id, userId }) };
}

function projectIds(proyectos: { id: string }[]): string[] {
  return proyectos.map((proyecto) => proyecto.id);
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("project membership routes (live DB, forced rollback)", () => {
  it("adding an existing active member returns 409 from the partial index, not a read-then-write check", async () => {
    const result = await runAndRollback(async (tx) => {
      const { gerencia, coordinador, proyecto } = await seedFixture(tx);
      authAs(gerencia);

      const first = await addMember(
        membersRequest(proyecto.id, { usuario_id: coordinador.id }),
        projectContext(proyecto.id),
      );
      const activos = await tx.proyectoMiembro.count({
        where: { proyecto_id: proyecto.id, usuario_id: coordinador.id, removed_at: null },
      });

      // The second INSERT violates `proyecto_miembros_activo_uq` and aborts the
      // ambient transaction, so nothing may be queried after it.
      const duplicate = await addMember(
        membersRequest(proyecto.id, { usuario_id: coordinador.id }),
        projectContext(proyecto.id),
      );

      return { first: first.status, activos, duplicate: duplicate.status };
    });

    expect(result.first).toBe(201);
    expect(result.activos).toBe(1);
    expect(result.duplicate).toBe(409);
  });

  it("rejects an inactive COORDINADOR target with 400 and writes no row", async () => {
    const result = await runAndRollback(async (tx) => {
      const { gerencia, inactivo, proyecto } = await seedFixture(tx);
      authAs(gerencia);

      const res = await addMember(
        membersRequest(proyecto.id, { usuario_id: inactivo.id }),
        projectContext(proyecto.id),
      );
      const json = await res.json();
      const rows = await tx.proyectoMiembro.count({
        where: { proyecto_id: proyecto.id, usuario_id: inactivo.id },
      });

      return { status: res.status, code: json.code, error: json.error, rows };
    });

    expect(result.status).toBe(400);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.error).toBe("El usuario no existe o está inactivo.");
    expect(result.rows).toBe(0);
  });

  it("removing a member revokes read access immediately and keeps the row with removed_at", async () => {
    const result = await runAndRollback(async (tx) => {
      const { gerencia, coordinador, proyecto } = await seedFixture(tx);
      const membresia = await tx.proyectoMiembro.create({
        data: { proyecto_id: proyecto.id, usuario_id: coordinador.id, agregado_por_id: gerencia.id },
      });

      // Before the removal the membership is the only reason the COORDINADOR
      // can read the project, so this asserts the access that is about to be
      // revoked instead of assuming it.
      authAs(coordinador);
      const beforeDetail = await getProject(detailRequest(proyecto.id), projectContext(proyecto.id));
      const beforeList = await listProjects(listRequest());
      const beforeIds = projectIds((await beforeList.json()).proyectos);

      authAs(gerencia);
      const removed = await removeMember(
        memberRequest(proyecto.id, coordinador.id),
        memberContext(proyecto.id, coordinador.id),
      );

      // The removal must be visible in the real Historial reader with the same
      // vocabulary the route writes and the allow-list declares.
      const auditRes = await getProjectAudit(
        auditRequest(proyecto.id),
        projectContext(proyecto.id),
      );
      const historial = (await auditRes.json()).historial as {
        accion: string;
        entidad: string;
        campo: string | null;
      }[];

      authAs(coordinador);
      const afterDetail = await getProject(detailRequest(proyecto.id), projectContext(proyecto.id));
      const afterList = await listProjects(listRequest());
      const afterIds = projectIds((await afterList.json()).proyectos);

      const stored = await tx.proyectoMiembro.findUnique({ where: { id: membresia.id } });
      const audit = await tx.auditoriaCambio.findMany({
        where: { proyecto_id: proyecto.id, entidad: "proyecto_miembro" },
      });

      return {
        beforeDetail: beforeDetail.status,
        beforeIds,
        removed: removed.status,
        auditRes: auditRes.status,
        historial,
        afterDetail: afterDetail.status,
        afterIds,
        stored,
        audit,
        proyectoId: proyecto.id,
        gerenciaId: gerencia.id,
      };
    });

    expect(result.beforeDetail).toBe(200);
    expect(result.beforeIds).toContain(result.proyectoId);
    expect(result.removed).toBe(200);
    expect(result.afterDetail).toBe(403);
    expect(result.afterIds).not.toContain(result.proyectoId);

    // Soft removal: the row survives with `removed_at` and the acting user.
    expect(result.stored).not.toBeNull();
    expect(result.stored?.removed_at).not.toBeNull();
    expect(result.stored?.removido_por_id).toBe(result.gerenciaId);

    // The removal is audited as `EDITAR proyecto_miembro`.
    expect(result.audit.length).toBeGreaterThan(0);
    expect(result.audit.every((row) => row.accion === "EDITAR")).toBe(true);
    expect(result.audit.map((row) => row.campo)).toEqual(
      expect.arrayContaining(["removed_at", "removido_por_id"]),
    );

    // One vocabulary end to end: the route writes `proyecto_miembro`, the
    // reader returns it and the allow-list declares it — no dead `equipo`.
    expect(result.auditRes).toBe(200);
    expect(result.historial.map((entry) => entry.entidad)).toContain("proyecto_miembro");
    expect(AUDIT_ENTIDADES_V2).toContain("proyecto_miembro");
    expect(AUDIT_ENTIDADES_V2).not.toContain("equipo");
  });

  it("re-adding a previously removed member succeeds and leaves one active and one removed row", async () => {
    const result = await runAndRollback(async (tx) => {
      const { gerencia, coordinador, proyecto } = await seedFixture(tx);
      const original = await tx.proyectoMiembro.create({
        data: { proyecto_id: proyecto.id, usuario_id: coordinador.id, agregado_por_id: gerencia.id },
      });

      authAs(gerencia);
      const removed = await removeMember(
        memberRequest(proyecto.id, coordinador.id),
        memberContext(proyecto.id, coordinador.id),
      );
      const readded = await addMember(
        membersRequest(proyecto.id, { usuario_id: coordinador.id }),
        projectContext(proyecto.id),
      );

      const rows = await tx.proyectoMiembro.findMany({
        where: { proyecto_id: proyecto.id, usuario_id: coordinador.id },
      });

      return {
        removed: removed.status,
        readded: readded.status,
        total: rows.length,
        activos: rows.filter((row) => row.removed_at === null).length,
        activeId: rows.find((row) => row.removed_at === null)?.id,
        originalId: original.id,
        ids: new Set(rows.map((row) => row.id)).size,
      };
    });

    expect(result.removed).toBe(200);
    expect(result.readded).toBe(201);
    expect(result.total).toBe(2);
    expect(result.ids).toBe(2);
    expect(result.activos).toBe(1);
    expect(result.activeId).not.toBe(result.originalId);
  });
});
