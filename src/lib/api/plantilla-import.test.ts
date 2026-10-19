// @vitest-environment node
// Pure/server helpers of the S7 template routes: the zip guard, the plan summary
// and the project -> template input loader (with a fake client).
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parsePlantilla } from "@/lib/proyectos/plantilla/parse";
import { generarPlantilla } from "@/lib/proyectos/plantilla/generate";
import { construirPlan } from "@/lib/proyectos/plantilla/mapear";
import { fixtureContextoFX1, fixtureF_X1 } from "@/lib/proyectos/__fixtures__/plantilla-cedetextil";
import {
  ZIP_MAX_ENTRADAS,
  ZIP_MAX_DESCOMPRIMIDO,
  inspeccionarZip,
  resumenDePlan,
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
  });

  it("rejects a zip with too many entries", async () => {
    const entradas: Record<string, string> = {};
    for (let i = 0; i <= ZIP_MAX_ENTRADAS; i++) entradas[`f${i}.xml`] = "x";
    await expect(inspeccionarZip(await zipDe(entradas))).resolves.toBe(false);
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
