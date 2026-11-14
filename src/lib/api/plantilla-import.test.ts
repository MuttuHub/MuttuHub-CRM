// @vitest-environment node
// Pure/server helpers of the S7 template routes: the zip guard, the plan summary
// and the project -> template input loader (with a fake client).
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { parsePlantilla } from "@/lib/proyectos/plantilla/parse";
import { generarPlantilla } from "@/lib/proyectos/plantilla/generate";
import { construirPlan } from "@/lib/proyectos/plantilla/mapear";
import { F_X1_LINEAS, fixtureContextoFX1, fixtureF_X1 } from "@/lib/proyectos/__fixtures__/plantilla-cedetextil";
import { RespuestaAbortada } from "@/lib/api/presupuesto";
import {
  LINEA_CON_GASTOS_MESSAGE,
  cargarPlantillaInput,
  ZIP_MAX_ENTRADAS,
  ZIP_MAX_DESCOMPRIMIDO,
  inspeccionarZip,
  resumenDePlan,
  importarPlantilla,
} from "@/lib/api/plantilla-import";

async function zipDe(entradas: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [nombre, contenido] of Object.entries(entradas)) zip.file(nombre, contenido);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("inspeccionarZip", () => {
  it("accepts a generated template", async () => {
    const buffer = await generarPlantilla(fixtureF_X1("valido"));
    await expect(inspeccionarZip(buffer)).resolves.toBe(true);
  });

  it("rejects bytes that are not a zip", async () => {
    await expect(inspeccionarZip(Buffer.from("esto no es un zip"))).resolves.toBe(false);
  });

  it("rejects a zip bomb: tiny on disk, far above the uncompressed cap", async () => {
    const bomba = await zipDe({ "xl/sheet.xml": Buffer.alloc(ZIP_MAX_DESCOMPRIMIDO + 1, 0) });
    expect(bomba.length).toBeLessThan(1024 * 1024);
    await expect(inspeccionarZip(bomba)).resolves.toBe(false);
    // Compressing the bomb is CPU-bound and exceeds 5 s under a loaded run with coverage.
  }, 20_000);

  it("rejects a zip with too many entries", async () => {
    const entradas: Record<string, string> = {};
    for (let i = 0; i <= ZIP_MAX_ENTRADAS; i++) entradas[`f${i}.xml`] = "x";
    await expect(inspeccionarZip(await zipDe(entradas))).resolves.toBe(false);
  });
});

type LineaExistente = {
  id: string;
  rubro_id: string;
  actividad_id: string | null;
  monto_proyectado_cop: string;
  actividad: { codigo: string } | null;
};

/**
 * A transaction that records every model call and answers like an empty draft, or like a draft that
 * already has `lineas` (their activities were soft-deleted by the import's step 1) and `gastos`.
 */
function grabadora({ lineas = [] as LineaExistente[], gastos = 0 } = {}) {
  const llamadas: { op: string; args: unknown }[] = [];
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get: (_m, metodo: string) => async (args: unknown) => {
          llamadas.push({ op: `${nombre}.${metodo}`, args });
          if (metodo === "count") return nombre === "gasto" ? gastos : 0;
          if (metodo === "updateMany") return { count: 2 };
          if (metodo === "findUniqueOrThrow") {
            return { fecha_inicio: null, fecha_fin: null, valor_total: null, beneficiarios_meta: null, oportunidad: null, lineas: [], municipios: [] };
          }
          if (metodo === "findMany") {
            const rubros = (args as { where?: { codigo?: { in?: string[] } } }).where?.codigo?.in ?? [];
            if (nombre === "lineaPresupuestal") return lineas;
            return nombre === "rubro" ? rubros.map((codigo) => ({ id: `id-${codigo}`, codigo })) : [];
          }
          if (metodo === "create") return { id: `linea-${llamadas.length}` };
          return { count: 0 };
        },
      },
    );
  const tx = new Proxy({} as Record<string, unknown>, {
    get: (_t, nombre: string) =>
      nombre === "$queryRaw"
        ? async () => {
            llamadas.push({ op: "$queryRaw", args: null });
            return [{ estado: "BORRADOR", valor_total: null }];
          }
        : modelo(nombre),
  });
  return { tx: tx as unknown as Prisma.TransactionClient, llamadas };
}

describe("importarPlantilla", () => {
  it("keeps its write order and its audit lote (pins the shared structure steps)", async () => {
    const parsed = await parsePlantilla(await generarPlantilla(fixtureF_X1("valido")));
    const plan = construirPlan(parsed, fixtureContextoFX1());
    const { tx, llamadas } = grabadora();

    const resumen = await importarPlantilla(tx, { proyectoId: "p1", usuarioId: "u1", plan, loteId: "lote-1" });

    expect(resumen).toEqual(resumenDePlan(plan));
    const orden = llamadas.map((l) => l.op).filter((op, i, todas) => op !== todas[i - 1]);
    expect(orden).toEqual([
      "$queryRaw",
      "avanceEntregable.count",
      "medicionIndicador.count",
      "registroBeneficiario.count",
      "proyecto.findUniqueOrThrow",
      "entregable.updateMany",
      "actividad.updateMany",
      "indicador.updateMany",
      "objetivo.updateMany",
      "proyecto.update",
      "proyectoLinea.deleteMany",
      "proyectoLinea.createMany",
      "proyectoMunicipio.deleteMany",
      "proyectoMunicipio.createMany",
      "objetivo.createMany",
      "actividad.createMany",
      "entregable.createMany",
      "indicador.createMany",
      "rubro.findMany",
      "lineaPresupuestal.findMany",
      "lineaPresupuestal.create",
      "auditoriaCambio.createMany",
    ]);
    // S4: the template carries no programming, so an import never writes a cell.
    expect(llamadas.some((l) => l.op.startsWith("programacionPeriodo."))).toBe(false);

    const lote = (llamadas.at(-1)?.args as { data: { lote_id: string; accion: string; entidad: string; campo: string | null }[] }).data;
    expect(new Set(lote.map((c) => c.lote_id))).toEqual(new Set(["lote-1"]));
    expect(lote.every((c) => c.accion === "IMPORTAR")).toBe(true);
    const porEntidad = (entidad: string) => lote.filter((c) => c.entidad === entidad).length;
    expect([porEntidad("objetivo"), porEntidad("actividad"), porEntidad("entregable"), porEntidad("indicador")]).toEqual([1, 4, 7, 2]);
    expect(lote.at(-1)).toMatchObject({ entidad: "proyecto", campo: "reemplazo" });
  });
});

/** The data of the first call to `op`. */
function datos<T>(llamadas: { op: string; args: unknown }[], op: string): T {
  return (llamadas.find((l) => l.op === op)?.args as { data: T }).data;
}

describe("importarPlantilla budget lines (T11.3)", () => {
  async function planValido() {
    return construirPlan(await parsePlantilla(await generarPlantilla(fixtureF_X1("valido"))), fixtureContextoFX1());
  }

  it("creates each line on the activity the import just created, and valor_total is the sum (S2, S3)", async () => {
    const plan = await planValido();
    const { tx, llamadas } = grabadora();

    await importarPlantilla(tx, { proyectoId: "p1", usuarioId: "u1", plan, loteId: "lote-1" });

    const actividades = datos<{ id: string; codigo: string }[]>(llamadas, "actividad.createMany");
    const idDe = new Map(actividades.map((a) => [a.codigo, a.id]));
    const creadas = llamadas
      .filter((l) => l.op === "lineaPresupuestal.create")
      .map((l) => (l.args as { data: { proyecto_id: string; actividad_id: string; rubro_id: string; monto_proyectado_cop: { toString(): string } } }).data);
    expect(creadas.map((d) => [d.proyecto_id, d.actividad_id, d.rubro_id, d.monto_proyectado_cop.toString()])).toEqual(
      F_X1_LINEAS.map((l) => ["p1", idDe.get(l.actividadCodigo), `id-${l.rubroCodigo}`, l.valor]),
    );
    const proyecto = datos<{ valor_total: { toString(): string } }>(llamadas, "proyecto.update");
    expect(proyecto.valor_total.toString()).toBe("177360000");
  });

  it("keeps a line the template repeats (same activity code + rubro) and re-points it; deletes the rest with their programming", async () => {
    const plan = await planValido();
    const { tx, llamadas } = grabadora({
      lineas: [
        // Kept: 1.2 + R08 is in the template; its activity is the old (soft-deleted) one.
        { id: "l-keep", rubro_id: "id-R08", actividad_id: "act-vieja", monto_proyectado_cop: "40000000.00", actividad: { codigo: "1.2" } },
        // Removed: a legacy line (no activity) and a combination the template leaves out.
        { id: "l-legacy", rubro_id: "id-R02", actividad_id: null, monto_proyectado_cop: "500.00", actividad: null },
        { id: "l-gone", rubro_id: "id-R02", actividad_id: "act-vieja", monto_proyectado_cop: "700.00", actividad: { codigo: "1.2" } },
      ],
    });

    await importarPlantilla(tx, { proyectoId: "p1", usuarioId: "u1", plan, loteId: "lote-1" });

    const ops = llamadas.map((l) => l.op);
    const quitadas = ["l-legacy", "l-gone"];
    expect(llamadas.find((l) => l.op === "gasto.count")?.args).toEqual({ where: { proyecto_id: "p1", linea_id: { in: quitadas } } });
    // Cells go before their line (ProgramacionPeriodo -> line is NoAction); the kept line's cells are untouched.
    expect(llamadas.find((l) => l.op === "programacionPeriodo.deleteMany")?.args).toEqual({ where: { proyecto_id: "p1", linea_id: { in: quitadas } } });
    expect(llamadas.find((l) => l.op === "lineaPresupuestal.deleteMany")?.args).toEqual({ where: { proyecto_id: "p1", id: { in: quitadas } } });
    expect(ops.indexOf("programacionPeriodo.deleteMany")).toBeLessThan(ops.indexOf("lineaPresupuestal.deleteMany"));
    expect(ops.filter((op) => op.startsWith("programacionPeriodo.")).length).toBe(1);

    const nueva12 = datos<{ id: string; codigo: string }[]>(llamadas, "actividad.createMany").find((a) => a.codigo === "1.2")!.id;
    const update = llamadas.find((l) => l.op === "lineaPresupuestal.update")?.args as {
      where: { id: string };
      data: { actividad_id: string; monto_proyectado_cop: { toString(): string } };
    };
    expect(update.where).toEqual({ id: "l-keep" });
    expect(update.data.actividad_id).toBe(nueva12);
    expect(update.data.monto_proyectado_cop.toString()).toBe("45000000");
    // The kept line is not created again: 7 of the 8 template lines are new.
    expect(ops.filter((op) => op === "lineaPresupuestal.create")).toHaveLength(7);

    const lote = datos<{ accion: string; entidad: string; entidad_id: string; campo: string | null; valor_anterior: unknown; valor_nuevo: unknown }[]>(
      llamadas,
      "auditoriaCambio.createMany",
    );
    const presupuesto = lote.filter((c) => c.entidad === "presupuesto");
    expect(presupuesto.filter((c) => quitadas.includes(c.entidad_id))).toEqual([
      expect.objectContaining({ accion: "IMPORTAR", entidad_id: "l-legacy", campo: "asignado", valor_anterior: "500.00", valor_nuevo: "0.00" }),
      expect.objectContaining({ accion: "IMPORTAR", entidad_id: "l-gone", campo: "asignado", valor_anterior: "700.00", valor_nuevo: "0.00" }),
    ]);
    expect(presupuesto.filter((c) => c.entidad_id === "l-keep")).toEqual([
      expect.objectContaining({ campo: "actividad_id", valor_anterior: "act-vieja", valor_nuevo: nueva12 }),
      expect.objectContaining({ campo: "asignado", valor_anterior: "40000000.00", valor_nuevo: "45000000.00" }),
    ]);
  });

  it("refuses to remove a line that already has expenses, before deleting anything (409)", async () => {
    const plan = await planValido();
    const { tx, llamadas } = grabadora({
      lineas: [{ id: "l-gasto", rubro_id: "id-R02", actividad_id: null, monto_proyectado_cop: "500.00", actividad: null }],
      gastos: 1,
    });

    const error = await importarPlantilla(tx, { proyectoId: "p1", usuarioId: "u1", plan, loteId: "lote-1" }).catch((e) => e);

    expect(error).toBeInstanceOf(RespuestaAbortada);
    const respuesta = (error as RespuestaAbortada).response;
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ error: LINEA_CON_GASTOS_MESSAGE, code: "CONFLICT" });
    expect(llamadas.some((l) => l.op === "programacionPeriodo.deleteMany" || l.op === "lineaPresupuestal.deleteMany")).toBe(false);
    expect(llamadas.some((l) => l.op === "auditoriaCambio.createMany")).toBe(false);
  });
});

describe("cargarPlantillaInput budget lines (export, S3)", () => {
  it("lists one line per activity + rubro, by activity code as numbers, legacy lines last without activity", async () => {
    const linea = (actividad: string | null, codigo: string, orden: number, monto: string) => ({
      monto_proyectado_cop: { toString: () => monto },
      actividad: actividad === null ? null : { codigo: actividad },
      rubro: { codigo, orden },
    });
    const cliente = new Proxy({} as Record<string, unknown>, {
      get: (_c, nombre: string) => ({
        findFirst: async () => ({
          codigo: "PRY-1",
          fecha_inicio: new Date("2026-10-05T00:00:00.000Z"),
          fecha_fin: new Date("2027-01-29T00:00:00.000Z"),
          valor_total: null,
          beneficiarios_meta: null,
          cliente: { nombre: "Cliente" },
          lineas: [],
          municipios: [],
        }),
        findMany: async () =>
          nombre === "lineaPresupuestal"
            ? [
                linea("1.10", "R01", 1, "10"),
                linea(null, "R04", 4, "20"),
                linea("1.2", "R12", 12, "30"),
                linea("1.2", "R08", 8, "40"),
              ]
            : [],
      }),
    });

    const input = await cargarPlantillaInput(cliente as never, "p1");

    expect(input.presupuesto).toEqual([
      { actividadCodigo: "1.2", rubroCodigo: "R08", valor: "40" },
      { actividadCodigo: "1.2", rubroCodigo: "R12", valor: "30" },
      { actividadCodigo: "1.10", rubroCodigo: "R01", valor: "10" },
      { actividadCodigo: null, rubroCodigo: "R04", valor: "20" },
    ]);
    expect(input).not.toHaveProperty("programacion");
  });
});

describe("resumenDePlan", () => {
  it("counts the F-X1 plan: 1 objective, 4 activities, 7 deliverables, 2 indicators, 8 funded lines, no cells", async () => {
    const parsed = await parsePlantilla(await generarPlantilla(fixtureF_X1("valido")));
    const plan = construirPlan(parsed, fixtureContextoFX1());
    expect(resumenDePlan(plan)).toEqual({
      objetivos: 1,
      actividades: 4,
      entregables: 7,
      indicadores: 2,
      rubros: 8,
      celdas_programacion: 0,
    });
  });
});
