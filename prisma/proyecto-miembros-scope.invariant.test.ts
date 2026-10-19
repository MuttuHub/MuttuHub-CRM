// Live-DB coverage for the S2.6 membership read scope: who can read what must
// be resolved from `proyecto_miembros` by the server, never from a request
// flag. The claim is exercised through the REAL route handlers against the
// LOCAL database — `@/lib/db` is a Proxy that joins the ambient test
// transaction (the same harness as `prisma/proyecto-create-flow.invariant.test.ts`)
// and only auth is mocked. A mocked Prisma client could not prove who can read
// what.
//
//   - a COORDINADOR sees only projects with an active membership, on both the
//     list and the detail;
//   - removing a membership (`removed_at` set) revokes access immediately while
//     the row stays stored (the soft-removal contract);
//   - ADMINISTRADOR/GERENCIA keep seeing every project (regression guard).
//
// Every path runs inside one forced-rollback transaction.
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

// The routes read through `@/lib/db`; the proxy forwards every model delegate
// to the ambient test transaction so the whole path shares one tx and rolls
// back together. `$transaction(fn)` runs the route's callback against the same
// tx instead of opening a nested one.
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
import { GET as listProjects } from "@/app/api/v1/projects/route";
import { GET as getProject } from "@/app/api/v1/projects/[id]/route";
import { GET as getProjectAudit } from "@/app/api/v1/projects/[id]/audit/route";

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

const MARKER = "sdd-scope-miembros";

/**
 * A COORDINADOR, a GERENCIA and two projects of the same client: the first one
 * carries the coordinator's ACTIVE membership, the second does not. Every id is
 * a fresh UUID and every code is MARKER-prefixed, so nothing this suite creates
 * can collide with `prisma/seed.ts`.
 */
async function seedFixture(tx: Tx) {
  const suffix = randomUUID();
  const coordinador = await tx.usuario.create({
    data: {
      email: `${MARKER}-coord-${suffix}@example.test`,
      nombre: MARKER,
      rol: "COORDINADOR",
    },
  });
  const gerencia = await tx.usuario.create({
    data: {
      email: `${MARKER}-ger-${suffix}@example.test`,
      nombre: MARKER,
      rol: "GERENCIA",
    },
  });
  const cliente = await tx.cliente.create({
    data: {
      nombre: `${MARKER}-cliente-${suffix}`,
      tipo_cliente: "OTRO",
      responsable_id: gerencia.id,
    },
  });
  const miembro = await tx.proyecto.create({
    data: {
      codigo: `PRY-SDD-S-${suffix}-A`,
      nombre: `${MARKER}-miembro-${suffix}`,
      cliente_id: cliente.id,
    },
  });
  const ajeno = await tx.proyecto.create({
    data: {
      codigo: `PRY-SDD-S-${suffix}-B`,
      nombre: `${MARKER}-ajeno-${suffix}`,
      cliente_id: cliente.id,
    },
  });
  const membresia = await tx.proyectoMiembro.create({
    data: {
      proyecto_id: miembro.id,
      usuario_id: coordinador.id,
      agregado_por_id: gerencia.id,
    },
  });
  return { suffix, coordinador, gerencia, cliente, miembro, ajeno, membresia };
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

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Ids of the projects the list route answered with. */
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

describe("project membership read scope (live DB, forced rollback)", () => {
  it("a COORDINADOR sees only projects with an active membership", async () => {
    const result = await runAndRollback(async (tx) => {
      const { coordinador, miembro, ajeno } = await seedFixture(tx);
      authAs(coordinador);

      const listRes = await listProjects(listRequest());
      expect(listRes.status).toBe(200);
      const { proyectos } = await listRes.json();

      const detailRes = await getProject(detailRequest(miembro.id), routeContext(miembro.id));
      expect(detailRes.status).toBe(200);

      // The ficha and its Historial must agree on the same resolved membership.
      const auditRes = await getProjectAudit(auditRequest(miembro.id), routeContext(miembro.id));
      expect(auditRes.status).toBe(200);

      return { ids: projectIds(proyectos), miembroId: miembro.id, ajenoId: ajeno.id };
    });

    expect(result.ids).toContain(result.miembroId);
    expect(result.ids).not.toContain(result.ajenoId);
  });

  it("removing a member revokes access immediately and keeps the row with removed_at", async () => {
    await runAndRollback(async (tx) => {
      const { coordinador, miembro, ajeno, membresia } = await seedFixture(tx);
      authAs(coordinador);

      // Before the removal the membership is the only reason the COORDINADOR
      // can read the project, so this asserts the access that is about to be
      // revoked instead of assuming it.
      const beforeDetail = await getProject(detailRequest(miembro.id), routeContext(miembro.id));
      expect(beforeDetail.status).toBe(200);

      const beforeAudit = await getProjectAudit(auditRequest(miembro.id), routeContext(miembro.id));
      expect(beforeAudit.status).toBe(200);

      await tx.proyectoMiembro.update({
        where: { id: membresia.id },
        data: { removed_at: new Date(), removido_por_id: coordinador.id },
      });

      const listRes = await listProjects(listRequest());
      expect(listRes.status).toBe(200);
      const { proyectos } = await listRes.json();
      expect(projectIds(proyectos)).not.toContain(miembro.id);
      expect(projectIds(proyectos)).not.toContain(ajeno.id);

      const detailRes = await getProject(detailRequest(miembro.id), routeContext(miembro.id));
      expect(detailRes.status).toBe(403);

      // The revocation flips the Historial to 403 in the same breath as the
      // ficha: no path keeps a stale membership.
      const auditRes = await getProjectAudit(auditRequest(miembro.id), routeContext(miembro.id));
      expect(auditRes.status).toBe(403);

      // Soft removal: the row survives with `removed_at` set.
      const stored = await tx.proyectoMiembro.findUnique({ where: { id: membresia.id } });
      expect(stored).not.toBeNull();
      expect(stored?.removed_at).not.toBeNull();
    });
  });

  it("a manager still sees every project, member or not (regression guard)", async () => {
    const result = await runAndRollback(async (tx) => {
      const { gerencia, miembro, ajeno } = await seedFixture(tx);
      authAs(gerencia);

      const listRes = await listProjects(listRequest());
      expect(listRes.status).toBe(200);
      const { proyectos } = await listRes.json();

      const detailRes = await getProject(detailRequest(ajeno.id), routeContext(ajeno.id));
      expect(detailRes.status).toBe(200);

      return { ids: projectIds(proyectos), miembroId: miembro.id, ajenoId: ajeno.id };
    });

    expect(result.ids).toContain(result.miembroId);
    expect(result.ids).toContain(result.ajenoId);
  });

  it("a COLABORADOR with a stray membership row still sees nothing (membership grants COORDINADOR only)", async () => {
    const result = await runAndRollback(async (tx) => {
      const { miembro, ajeno, gerencia } = await seedFixture(tx);
      const colaborador = await tx.usuario.create({
        data: {
          email: `${MARKER}-colab-${randomUUID()}@example.test`,
          nombre: MARKER,
          rol: "COLABORADOR",
        },
      });
      await tx.proyectoMiembro.create({
        data: {
          proyecto_id: miembro.id,
          usuario_id: colaborador.id,
          agregado_por_id: gerencia.id,
        },
      });
      authAs(colaborador);

      const listRes = await listProjects(listRequest());
      expect(listRes.status).toBe(200);
      const { proyectos } = await listRes.json();

      const detailRes = await getProject(detailRequest(miembro.id), routeContext(miembro.id));

      return {
        ids: projectIds(proyectos),
        miembroId: miembro.id,
        ajenoId: ajeno.id,
        detailStatus: detailRes.status,
      };
    });

    expect(result.ids).not.toContain(result.miembroId);
    expect(result.ids).not.toContain(result.ajenoId);
    expect(result.detailStatus).toBe(403);
  });
});
