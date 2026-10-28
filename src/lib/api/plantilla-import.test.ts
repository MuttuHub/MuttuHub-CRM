// @vitest-environment node
// Pure/server helpers of the S7 template routes: the zip guard, the plan summary
// and the project -> template input loader (with a fake client).
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { parsePlantilla } from "@/lib/proyectos/plantilla/parse";
import { generarPlantilla } from "@/lib/proyectos/plantilla/generate";
import { construirPlan } from "@/lib/proyectos/plantilla/mapear";
import { fixtureContextoFX1, fixtureF_X1 } from "@/lib/proyectos/__fixtures__/plantilla-cedetextil";
import {
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

/** A transaction that records every model call and answers like an empty draft. */
function grabadora() {
  const llamadas: { op: string; args: unknown }[] = [];
  const modelo = (nombre: string) =>
    new Proxy(
      {},
      {
        get: (_m, metodo: string) => async (args: unknown) => {
          llamadas.push({ op: `${nombre}.${metodo}`, args });
          if (metodo === "count") return 0;
          if (metodo === "updateMany") return { count: 2 };
          if (metodo === "findUniqueOrThrow") {
            return { fecha_inicio: null, fecha_fin: null, valor_total: null, beneficiarios_meta: null, oportunidad: null, lineas: [], municipios: [] };
          }
          if (metodo === "findMany") {
            const rubros = (args as { where?: { codigo?: { in?: string[] } } }).where?.codigo?.in ?? [];
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
      "programacionPeriodo.findMany",
      "programacionPeriodo.createMany",
      "auditoriaCambio.createMany",
    ]);

    const lote = (llamadas.at(-1)?.args as { data: { lote_id: string; accion: string; entidad: string; campo: string | null }[] }).data;
    expect(new Set(lote.map((c) => c.lote_id))).toEqual(new Set(["lote-1"]));
    expect(lote.every((c) => c.accion === "IMPORTAR")).toBe(true);
    const porEntidad = (entidad: string) => lote.filter((c) => c.entidad === entidad).length;
    expect([porEntidad("objetivo"), porEntidad("actividad"), porEntidad("entregable"), porEntidad("indicador")]).toEqual([1, 4, 7, 2]);
    expect(lote.at(-1)).toMatchObject({ entidad: "proyecto", campo: "reemplazo" });
  });
});

describe("resumenDePlan", () => {
  it("counts the F-X1 plan: 1 objective, 4 activities, 7 deliverables, 2 indicators, 8 funded rubros, 32 cells", async () => {
    const parsed = await parsePlantilla(await generarPlantilla(fixtureF_X1("valido")));
    const plan = construirPlan(parsed, fixtureContextoFX1());
    expect(resumenDePlan(plan)).toEqual({
      objetivos: 1,
      actividades: 4,
      entregables: 7,
      indicadores: 2,
      rubros: 8,
      celdas_programacion: 32,
    });
  });
});
