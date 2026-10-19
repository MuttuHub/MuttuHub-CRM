// @vitest-environment node
// Live-DB coverage for the S7 template import (E-24 and the atomic writer).
// What a mocked client cannot prove, the local Postgres does:
//
//   - the valid F-X1 workbook replaces the draft with the exact counts, weights,
//     budget, programming and ONE audit lote;
//   - a V-12 failure writes nothing (counts before == after);
//   - the PRODUCTION path is atomic: a late failure injected at the last audit
//     insert while the route wraps the writer in its own `db.$transaction`
//     leaves zero new rows, zero audit rows and the previous draft intact;
//   - the writer's own writes are undoable: a failure after the objectives and
//     activities were inserted can be rolled back with a savepoint (this proves
//     undoability, NOT that the route wraps the writer — see the test below);
//   - a re-import soft-deletes the old rows and the same codes stay insertable;
//   - a pre-existing gasto and its soporte survive an import (budget lines are
//     updated to $0, never deleted);
//   - a non-BORRADOR project, or one that already has progress history (an
//     avance OR a medición), is 409.
//
// The REAL route handler and writer run against the LOCAL database; only auth is
// mocked. `auditoria_cambios` is append-only (its triggers reject DELETE), so a
// test that really committed could never clean up. The whole test therefore runs
// inside ONE ambient transaction that is always rolled back, and the route's own
// `db.$transaction` is emulated with a SAVEPOINT: `ROLLBACK TO SAVEPOINT` is the
// same Postgres rollback semantics a real transaction gives, with zero residue.
//
// `./require-local-db` must stay the FIRST import.
import "./require-local-db";

import { randomUUID } from "node:crypto";

import { Prisma, PrismaClient, type Usuario } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ tx: null as unknown, transacciones: 0 }));

vi.mock("@/lib/supabase/server", () => ({ requireApiUser: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      const source = holder.tx as Prisma.TransactionClient | null;
      if (!source) throw new Error(`db.${String(prop)} was used outside the test transaction`);
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => Promise<unknown>) => {
          holder.transacciones += 1;
          await source.$executeRawUnsafe("SAVEPOINT plantilla_sp");
          try {
            const result = await fn(source);
            await source.$executeRawUnsafe("RELEASE SAVEPOINT plantilla_sp");
            return result;
          } catch (error) {
            await source.$executeRawUnsafe("ROLLBACK TO SAVEPOINT plantilla_sp");
            throw error;
          }
        };
      }
      const value = (source as unknown as Record<string, unknown>)[prop as string];
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(source) : value;
    },
  }),
}));

import { requireApiUser } from "@/lib/supabase/server";
import { RUBROS_V2 } from "@/lib/catalogs";
import { RespuestaAbortada } from "@/lib/api/presupuesto";
import { importarPlantilla } from "@/lib/api/plantilla-import";
import { POST } from "@/app/api/v1/projects/[id]/import/route";
import { generarPlantilla, type PlantillaInput } from "@/lib/proyectos/plantilla/generate";
import { parsePlantilla } from "@/lib/proyectos/plantilla/parse";
import { construirPlan } from "@/lib/proyectos/plantilla/mapear";
import { cargarContexto } from "@/lib/api/plantilla-import";
import { F_X1_PRESUPUESTO, fixtureF_X1 } from "@/lib/proyectos/__fixtures__/plantilla-cedetextil";

const TX_OPTIONS = { timeout: 120_000, maxWait: 20_000 };
const MARKER = "sdd-invariant-plantilla";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Tx = Prisma.TransactionClient;

class IntentionalRollback extends Error {}

async function runAndRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let captured: T | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      holder.tx = tx;
      holder.transacciones = 0;
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

afterAll(async () => {
  await prisma.$disconnect();
});

type Contexto = {
  tx: Tx;
  gerente: Usuario;
  proyecto: { id: string; codigo: string };
  input: (variante: "valido" | "v12") => PlantillaInput;
  antiguo: { objetivoId: string };
};

/** A BORRADOR project with dates, an old draft structure, one budget line and two marker municipios. */
async function fixture(tx: Tx, estado: "BORRADOR" | "EN_EJECUCION" = "BORRADOR"): Promise<Contexto> {
  const sufijo = randomUUID();
  const gerente = await tx.usuario.create({
    data: { email: `${MARKER}-ger-${sufijo}@example.test`, nombre: MARKER, rol: "GERENCIA" },
  });
  const ana = await tx.usuario.create({
    data: { email: `${MARKER}-ana-${sufijo}@example.test`, nombre: `${MARKER}-ana` },
  });
  const cliente = await tx.cliente.create({
    data: { nombre: `${MARKER}-cliente-${sufijo}`, tipo_cliente: "OTRO", responsable_id: gerente.id },
  });
  const codigo = `PRY-SDD-X-${sufijo}`;
  const proyecto = await tx.proyecto.create({
    data: {
      codigo,
      nombre: `${MARKER}-${sufijo}`,
      cliente_id: cliente.id,
      estado,
      fecha_inicio: new Date("2026-09-01T00:00:00Z"),
      fecha_fin: new Date("2026-12-31T00:00:00Z"),
      valor_total: new Prisma.Decimal("1000.00"),
    },
  });
  const municipios = [
    { nombre: `${MARKER}-mun-a-${sufijo}`, departamento: `${MARKER}-dep` },
    { nombre: `${MARKER}-mun-b-${sufijo}`, departamento: `${MARKER}-dep` },
  ];
  for (const municipio of municipios) {
    await tx.municipio.create({ data: { ...municipio, activo: true } });
  }

  // The previous draft the import must replace (or, on failure, leave intact).
  const objetivo = await tx.objetivo.create({
    data: { proyecto_id: proyecto.id, codigo: "OLD1", descripcion: "Objetivo anterior" },
  });
  const actividad = await tx.actividad.create({
    data: {
      proyecto_id: proyecto.id,
      objetivo_id: objetivo.id,
      codigo: "OLD-A1",
      nombre: "Actividad anterior",
      semana_inicio: 1,
      semana_fin: 2,
      peso: new Prisma.Decimal("2"),
    },
  });
  await tx.entregable.create({
    data: {
      proyecto_id: proyecto.id,
      actividad_id: actividad.id,
      codigo: "OLD-E1",
      descripcion: "Entregable anterior",
      cantidad_meta: new Prisma.Decimal("1"),
      unidad: "Informe",
      tipo_medio_exigido: "PDF",
    },
  });
  // A CI database only ran the migrations: the R01–R15 catalog comes from the seed, not from a
  // migration, so the fixture creates any missing rubro (idempotent: the whole test rolls back).
  await tx.rubro.createMany({
    data: RUBROS_V2.map((rubro) => ({
      codigo: rubro.codigo,
      nombre: rubro.nombre,
      orden: rubro.orden,
      activo: true,
    })),
    skipDuplicates: true,
  });
  const rubro = await tx.rubro.findFirst({ where: { codigo: "R02", activo: true } });
  if (!rubro) throw new Error("The fixture could not ensure an active rubro R02.");
  await tx.lineaPresupuestal.create({
    data: { proyecto_id: proyecto.id, rubro_id: rubro.id, monto_proyectado_cop: new Prisma.Decimal("5.00") },
  });

  const input = (variante: "valido" | "v12"): PlantillaInput => {
    const base = fixtureF_X1(variante);
    return {
      ...base,
      proyecto: {
        ...base.proyecto,
        codigo,
        municipios,
      },
      catalogo: { ...base.catalogo, municipios: municipios.map((m) => ({ ...m, codigoDane: null })) },
      estructura: {
        ...base.estructura,
        actividades: base.estructura.actividades.map((a) => ({ ...a, responsable: ana.email })),
      },
    };
  };

  return { tx, gerente, proyecto: { id: proyecto.id, codigo }, input, antiguo: { objetivoId: objetivo.id } };
}

async function snapshot(tx: Tx, proyectoId: string, loteId?: string) {
  const [objetivos, actividades, entregables, indicadores, lineas, celdas, auditoria, project, lineasCat, munis] =
    await Promise.all([
      tx.objetivo.findMany({ where: { proyecto_id: proyectoId }, orderBy: { id: "asc" } }),
      tx.actividad.findMany({ where: { proyecto_id: proyectoId }, orderBy: { id: "asc" } }),
      tx.entregable.findMany({ where: { proyecto_id: proyectoId }, orderBy: { id: "asc" } }),
      tx.indicador.findMany({ where: { proyecto_id: proyectoId }, orderBy: { id: "asc" } }),
      tx.lineaPresupuestal.findMany({ where: { proyecto_id: proyectoId }, orderBy: { id: "asc" } }),
      tx.programacionPeriodo.findMany({ where: { proyecto_id: proyectoId }, orderBy: { id: "asc" } }),
      tx.auditoriaCambio.count({ where: loteId ? { lote_id: loteId } : { proyecto_id: proyectoId } }),
      tx.proyecto.findUniqueOrThrow({ where: { id: proyectoId } }),
      tx.proyectoLinea.findMany({ where: { proyecto_id: proyectoId }, orderBy: { linea_id: "asc" } }),
      tx.proyectoMunicipio.findMany({ where: { proyecto_id: proyectoId }, orderBy: { municipio_id: "asc" } }),
    ]);
  return { objetivos, actividades, entregables, indicadores, lineas, celdas, auditoria, project, lineasCat, munis };
}

function peticion(proyectoId: string, contenido: Buffer, modo?: string): [Request, { params: Promise<{ id: string }> }] {
  const form = new FormData();
  form.set("archivo", new File([new Uint8Array(contenido)], "plantilla.xlsx", { type: XLSX_MIME }));
  if (modo) form.set("modo", modo);
  return [
    new Request(`http://localhost/api/v1/projects/${proyectoId}/import`, { method: "POST", body: form }),
    { params: Promise.resolve({ id: proyectoId }) },
  ];
}

function autenticar(usuario: Usuario) {
  vi.mocked(requireApiUser).mockResolvedValue({ ok: true, usuario, supabaseUser: {} as never });
}

/**
 * Wraps the ambient client so the writer's single audit insert (its LAST write)
 * throws, leaving every other operation untouched. Used to drive a late failure
 * through the route's own `db.$transaction` with no test-side savepoint.
 */
function fallandoEnAuditoria(tx: Tx, mensaje: string): Tx {
  return new Proxy(tx, {
    get(objetivo, prop) {
      const valor = Reflect.get(objetivo, prop) as unknown;
      if (prop === "auditoriaCambio") {
        return new Proxy(valor as object, {
          get(delegado, metodo) {
            if (metodo === "createMany") {
              return async () => {
                throw new Error(mensaje);
              };
            }
            const fn = Reflect.get(delegado, metodo) as unknown;
            return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown).bind(delegado) : fn;
          },
        });
      }
      return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
    },
  }) as Tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function plantillas(ctx: Contexto) {
  return {
    valido: await generarPlantilla(ctx.input("valido")),
    v12: await generarPlantilla(ctx.input("v12")),
  };
}

describe("template import (live DB)", () => {
  it("imports the valid F-X1 workbook: counts, weights, budget, programming, project fields and one audit lote", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);

      const respuesta = await POST(...peticion(ctx.proyecto.id, valido));
      expect(respuesta.status).toBe(200);
      const cuerpo = await respuesta.json();
      expect(cuerpo.importado).toBe(true);
      expect(cuerpo.resumen).toEqual({
        objetivos: 1,
        actividades: 4,
        entregables: 7,
        indicadores: 2,
        rubros: 8,
        celdas_programacion: 32,
      });
      expect(holder.transacciones).toBe(1);

      const despues = await snapshot(tx, ctx.proyecto.id, cuerpo.lote_id);
      const vivos = <T extends { deleted_at: Date | null }>(filas: T[]) => filas.filter((f) => f.deleted_at === null);

      expect(vivos(despues.objetivos).map((o) => o.codigo)).toEqual(["OE1"]);
      expect(vivos(despues.actividades)).toHaveLength(4);
      expect(vivos(despues.entregables)).toHaveLength(7);
      expect(vivos(despues.indicadores)).toHaveLength(2);

      // The previous draft is soft-deleted, never hard-deleted.
      const antiguo = despues.objetivos.find((o) => o.codigo === "OLD1");
      expect(antiguo?.deleted_at).not.toBeNull();
      expect(despues.actividades.find((a) => a.codigo === "OLD-A1")?.deleted_at).not.toBeNull();
      expect(despues.entregables.find((e) => e.codigo === "OLD-E1")?.deleted_at).not.toBeNull();

      // Weights 1/1/1/4: empty `Peso` means the default duration, not manual.
      const pesos = vivos(despues.actividades)
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .map((a) => [a.codigo, a.peso.toString(), a.peso_manual]);
      expect(pesos).toEqual([
        ["1.1", "1", false],
        ["1.2", "1", false],
        ["1.3", "1", false],
        ["1.4", "4", false],
      ]);
      expect(vivos(despues.actividades).every((a) => a.responsable_id !== null)).toBe(true);

      // Project fields, lines (first = principal) and municipios.
      expect(despues.project.valor_total?.toString()).toBe("177360000");
      expect(despues.project.fecha_inicio?.toISOString().slice(0, 10)).toBe("2026-10-05");
      expect(despues.project.fecha_fin?.toISOString().slice(0, 10)).toBe("2027-01-29");
      expect(despues.project.beneficiarios_meta).toBe(500);
      expect(despues.lineasCat).toHaveLength(2);
      expect(despues.lineasCat.filter((l) => l.principal)).toHaveLength(1);
      expect(despues.munis).toHaveLength(2);

      // Budget: eight funded lines, plus the old R02 line (kept, now $0: lines are never deleted).
      const rubros = await tx.rubro.findMany({ where: { id: { in: despues.lineas.map((l) => l.rubro_id) } } });
      const porCodigo = new Map(
        despues.lineas.map((l) => [rubros.find((r) => r.id === l.rubro_id)?.codigo, l.monto_proyectado_cop.toString()]),
      );
      for (const [codigo, monto] of Object.entries(F_X1_PRESUPUESTO)) expect(porCodigo.get(codigo)).toBe(monto);
      expect(porCodigo.get("R02")).toBe("0");
      expect(despues.lineas).toHaveLength(9);
      expect(despues.celdas).toHaveLength(32);

      // One lote, only IMPORTAR rows, including the `reemplazo` summary row.
      const filas = await tx.auditoriaCambio.findMany({ where: { lote_id: cuerpo.lote_id } });
      expect(filas.length).toBeGreaterThan(40);
      expect(new Set(filas.map((f) => f.lote_id))).toEqual(new Set([cuerpo.lote_id]));
      expect(new Set(filas.map((f) => f.accion))).toEqual(new Set(["IMPORTAR"]));
      const reemplazo = filas.find((f) => f.entidad === "proyecto" && f.campo === "reemplazo");
      expect(reemplazo?.valor_anterior).toEqual({ objetivos: 1, actividades: 1, entregables: 1, indicadores: 0 });
      expect(reemplazo?.valor_nuevo).toEqual({ objetivos: 1, actividades: 4, entregables: 7, indicadores: 2 });
      expect(filas.filter((f) => f.entidad === "actividad")).toHaveLength(4);
      expect(await tx.auditoriaCambio.count({ where: { proyecto_id: ctx.proyecto.id, lote_id: { not: cuerpo.lote_id } } })).toBe(0);
    });
  });

  it("a V-12 failure answers 400 and writes nothing", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { v12 } = await plantillas(ctx);
      const antes = await snapshot(tx, ctx.proyecto.id);

      const respuesta = await POST(...peticion(ctx.proyecto.id, v12));
      expect(respuesta.status).toBe(400);
      const cuerpo = await respuesta.json();
      expect(cuerpo.reporte.errores.map((e: { regla: string }) => e.regla)).toContain("V-12");

      expect(holder.transacciones).toBe(0);
      expect(await snapshot(tx, ctx.proyecto.id)).toEqual(antes);
    });
  });

  it("a dry run validates and writes nothing", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);
      const antes = await snapshot(tx, ctx.proyecto.id);

      const respuesta = await POST(...peticion(ctx.proyecto.id, valido, "validar"));
      expect(respuesta.status).toBe(200);
      const cuerpo = await respuesta.json();
      expect(cuerpo.importado).toBe(false);
      expect(cuerpo.reemplaza).toEqual({ objetivos: 1, actividades: 1, entregables: 1, indicadores: 0 });

      expect(holder.transacciones).toBe(0);
      expect(await snapshot(tx, ctx.proyecto.id)).toEqual(antes);
    });
  });

  // Proves the writer's writes are UNDOABLE, not that the route wraps them: it
  // calls `importarPlantilla` directly and owns the SAVEPOINT. The atomicity of
  // the production path is proven by the route test right below.
  it("the writer's own writes are undoable: a savepoint rolls back an error injected after the first inserts", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      const { valido } = await plantillas(ctx);
      const parsed = await parsePlantilla(valido);
      const plan = construirPlan(parsed, await cargarContexto(tx, ctx.proyecto.id));
      const antes = await snapshot(tx, ctx.proyecto.id);

      const pasos: string[] = [];
      const fallando = (cliente: Tx): Tx =>
        new Proxy(cliente, {
          get(objetivo, prop) {
            const valor = Reflect.get(objetivo, prop) as unknown;
            if (prop === "objetivo" || prop === "actividad" || prop === "entregable") {
              return new Proxy(valor as object, {
                get(delegado, metodo) {
                  const fn = Reflect.get(delegado, metodo) as unknown;
                  if (metodo === "createMany") {
                    return async (...args: unknown[]) => {
                      pasos.push(`${String(prop)}.createMany`);
                      if (prop === "entregable") throw new Error("fallo inyectado");
                      return (fn as (...a: unknown[]) => unknown).apply(delegado, args);
                    };
                  }
                  return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown).bind(delegado) : fn;
                },
              });
            }
            return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(objetivo) : valor;
          },
        });

      const loteId = randomUUID();
      await expect(
        (async () => {
          await tx.$executeRawUnsafe("SAVEPOINT inyectado");
          try {
            await importarPlantilla(fallando(tx), { proyectoId: ctx.proyecto.id, usuarioId: ctx.gerente.id, plan, loteId });
          } catch (error) {
            await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT inyectado");
            throw error;
          }
        })(),
      ).rejects.toThrow("fallo inyectado");

      // The failure came AFTER earlier inserts, so the rollback is a real one.
      expect(pasos).toEqual(["objetivo.createMany", "actividad.createMany", "entregable.createMany"]);

      const despues = await snapshot(tx, ctx.proyecto.id, loteId);
      expect(despues.auditoria).toBe(0);
      expect(await snapshot(tx, ctx.proyecto.id)).toEqual(antes);
      const antiguo = await tx.objetivo.findUniqueOrThrow({ where: { id: ctx.antiguo.objetivoId } });
      expect(antiguo.deleted_at).toBeNull();
      expect(
        await tx.objetivo.count({ where: { proyecto_id: ctx.proyecto.id, deleted_at: null, codigo: "OE1" } }),
      ).toBe(0);
    });
  });

  it("is atomic through the route's own db.$transaction: a late writer failure rolls everything back", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);
      const antes = await snapshot(tx, ctx.proyecto.id);

      // Fail at the writer's LAST write (the audit lote) through the real route.
      holder.tx = fallandoEnAuditoria(tx, "late-fail-through-real-tx");
      const respuesta = await POST(...peticion(ctx.proyecto.id, valido)).finally(() => {
        holder.tx = tx;
      });

      expect(respuesta.status).toBe(500);

      // Zero new rows, zero audit rows for the project, the previous draft live.
      const despues = await snapshot(tx, ctx.proyecto.id);
      expect(despues.auditoria).toBe(0);
      expect(despues).toEqual(antes);
      const antiguo = await tx.objetivo.findUniqueOrThrow({ where: { id: ctx.antiguo.objetivoId } });
      expect(antiguo.deleted_at).toBeNull();
      expect(
        await tx.objetivo.count({ where: { proyecto_id: ctx.proyecto.id, deleted_at: null, codigo: "OE1" } }),
      ).toBe(0);
      // The route wrapped the writer exactly once in `db.$transaction`.
      expect(holder.transacciones).toBe(1);
    });
  });

  it("a re-import soft-deletes the previous import and the same codes stay insertable", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);

      expect((await POST(...peticion(ctx.proyecto.id, valido))).status).toBe(200);
      const segundo = await POST(...peticion(ctx.proyecto.id, valido));
      expect(segundo.status).toBe(200);

      const filas = await snapshot(tx, ctx.proyecto.id);
      const vivos = <T extends { deleted_at: Date | null }>(f: T[]) => f.filter((x) => x.deleted_at === null).length;
      expect([vivos(filas.objetivos), vivos(filas.actividades), vivos(filas.entregables), vivos(filas.indicadores)]).toEqual([
        1, 4, 7, 2,
      ]);
      // OLD1 + OE1 (first import) + OE1 (second import).
      expect(filas.objetivos).toHaveLength(3);
      expect(filas.actividades).toHaveLength(9);
      expect(filas.entregables).toHaveLength(15);
      expect(filas.indicadores).toHaveLength(4);
      expect(filas.celdas).toHaveLength(32);
      expect(filas.lineas).toHaveLength(9);
      expect(filas.lineasCat).toHaveLength(2);
      expect(filas.munis).toHaveLength(2);
    });
  });

  it("answers 409 outside BORRADOR and writes nothing", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx, "EN_EJECUCION");
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);
      const antes = await snapshot(tx, ctx.proyecto.id);

      const respuesta = await POST(...peticion(ctx.proyecto.id, valido));
      expect(respuesta.status).toBe(409);
      expect(await snapshot(tx, ctx.proyecto.id)).toEqual(antes);
    });
  });

  it("refuses to orphan progress history: a project with an avance answers 409 and keeps its draft", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);
      const entregable = await tx.entregable.findFirstOrThrow({ where: { proyecto_id: ctx.proyecto.id } });
      await tx.avanceEntregable.create({
        data: {
          proyecto_id: ctx.proyecto.id,
          entregable_id: entregable.id,
          fecha: new Date("2026-09-15T00:00:00Z"),
          cantidad: new Prisma.Decimal("1"),
          registrado_por_id: ctx.gerente.id,
        },
      });
      const antes = await snapshot(tx, ctx.proyecto.id);

      const respuesta = await POST(...peticion(ctx.proyecto.id, valido));
      expect(respuesta.status).toBe(409);
      expect(await snapshot(tx, ctx.proyecto.id)).toEqual(antes);
    });
  });

  it("refuses to orphan progress history: a project with a medición answers 409 and keeps its draft", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);
      const indicador = await tx.indicador.create({
        data: {
          proyecto_id: ctx.proyecto.id,
          objetivo_id: ctx.antiguo.objetivoId,
          codigo: "IND-OLD",
          nombre: "Indicador anterior",
          meta: new Prisma.Decimal("10"),
          unidad: "Unidades",
        },
      });
      await tx.medicionIndicador.create({
        data: {
          proyecto_id: ctx.proyecto.id,
          indicador_id: indicador.id,
          fecha: new Date("2026-09-15T00:00:00Z"),
          valor: new Prisma.Decimal("1"),
          registrado_por_id: ctx.gerente.id,
        },
      });
      const antes = await snapshot(tx, ctx.proyecto.id);

      const respuesta = await POST(...peticion(ctx.proyecto.id, valido));
      expect(respuesta.status).toBe(409);
      expect(await snapshot(tx, ctx.proyecto.id)).toEqual(antes);
    });
  });

  it("a pre-existing gasto and its soporte survive an import (the budget line is zeroed, never deleted)", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx);
      autenticar(ctx.gerente);
      const { valido } = await plantillas(ctx);
      const linea = await tx.lineaPresupuestal.findFirstOrThrow({ where: { proyecto_id: ctx.proyecto.id } });
      const gasto = await tx.gasto.create({
        data: {
          proyecto_id: ctx.proyecto.id,
          linea_id: linea.id,
          fecha_documento: new Date("2026-10-15T00:00:00Z"),
          periodo: "2026-10",
          tipo_soporte: "FACTURA_PROVEEDOR" as const,
          tercero_nombre: "Proveedor SAS",
          numero_documento: "FE-0123",
          numero_documento_norm: "FE0123",
          descripcion: "Tiquetes",
          monto_cop: new Prisma.Decimal("100"),
          registrado_por_id: ctx.gerente.id,
        },
      });
      const soporte = await tx.soporteProyecto.create({
        data: {
          proyecto_id: ctx.proyecto.id,
          gasto_id: gasto.id,
          nombre: "soporte.pdf",
          url_externa: "https://example.test/soporte.pdf",
          subido_por_id: ctx.gerente.id,
        },
      });

      expect((await POST(...peticion(ctx.proyecto.id, valido))).status).toBe(200);

      const gastoDespues = await tx.gasto.findUniqueOrThrow({ where: { id: gasto.id } });
      expect(gastoDespues.linea_id).toBe(linea.id);
      const soporteDespues = await tx.soporteProyecto.findUniqueOrThrow({ where: { id: soporte.id } });
      expect(soporteDespues.gasto_id).toBe(gasto.id);
      expect(soporteDespues.deleted_at).toBeNull();
      const lineaDespues = await tx.lineaPresupuestal.findUniqueOrThrow({ where: { id: linea.id } });
      expect(lineaDespues.monto_proyectado_cop.toString()).toBe("0");
    });
  });

  it("the writer aborts with RespuestaAbortada when the project left BORRADOR under the lock", async () => {
    await runAndRollback(async (tx) => {
      const ctx = await fixture(tx, "EN_EJECUCION");
      const { valido } = await plantillas(ctx);
      const plan = construirPlan(await parsePlantilla(valido), await cargarContexto(tx, ctx.proyecto.id));
      await expect(
        importarPlantilla(tx, { proyectoId: ctx.proyecto.id, usuarioId: ctx.gerente.id, plan, loteId: randomUUID() }),
      ).rejects.toBeInstanceOf(RespuestaAbortada);
    });
  });
});
