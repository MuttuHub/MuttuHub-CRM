// Loader of the technical semáforo (S14 P6). T12 (S6): `tipo` is part of the read, a Transversal is
// grouped under «Gestión del proyecto» and it never moves the technical numbers. `tipo` is optional in
// the input types, so `tsc` cannot see a select that forgets it: the fake `db` below projects it the
// way Prisma does, and that is what makes the leak observable.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({ actividades: [] as Row[], avances: [] as Row[] }));

vi.mock("@/lib/db", () => ({
  db: {
    // A column the select does not ask for never reaches the loader: the row comes back without `tipo`.
    actividad: {
      findMany: vi.fn(async (args: { select?: Row }) =>
        store.actividades.map((row) =>
          args.select?.tipo === true ? row : Object.fromEntries(Object.entries(row).filter(([key]) => key !== "tipo")),
        ),
      ),
    },
    avanceEntregable: { findMany: vi.fn(async () => store.avances) },
    reporteActividad: { findMany: vi.fn(async () => []) },
    soporteProyecto: {
      groupBy: vi.fn(async () => store.avances.map((avance) => ({ avance_id: avance.id, _count: { _all: 1 } }))),
    },
  },
}));

import { db } from "@/lib/db";
import { GRUPO_GESTION } from "@/lib/proyectos/actividad";
import { PARAMETROS_V2_DEFAULT } from "@/lib/proyectos/semaforo-v2";
import { loadTecnicoStatus } from "./tecnico";

const INICIO = new Date("2026-01-05T00:00:00.000Z");
const CORTE = "2026-03-15";
const dec = (value: string) => new Prisma.Decimal(value);
const ent = (id: string) => ({ id, codigo: id, cantidad_meta: dec("10") });
const av = (id: string, entregable_id: string, fecha: string, cantidad: string) => ({
  id,
  entregable_id,
  fecha: new Date(`${fecha}T00:00:00.000Z`),
  cantidad: dec(cantidad),
  created_at: new Date(`${fecha}T12:00:00.000Z`),
});

// Weeks 1-4 (ended 2026-02-01) fully delivered; the Transversal runs 17 weeks with half of its goal.
const normal = {
  id: "a1",
  codigo: "A-01",
  nombre: "Actividad normal",
  semana_inicio: 1,
  semana_fin: 4,
  tipo: "NORMAL",
  objetivo: { codigo: "OE1" },
  entregables: [ent("a1-e1")],
};
const transversal = {
  id: "t1",
  codigo: "T-01",
  nombre: "Coordinación del proyecto",
  semana_inicio: 1,
  semana_fin: 17,
  tipo: "TRANSVERSAL",
  objetivo: null,
  entregables: [ent("t1-e1")],
};
const avances = [av("v1", "a1-e1", "2026-02-01", "10"), av("v2", "t1-e1", "2026-03-01", "5")];

const cargar = () =>
  loadTecnicoStatus({ proyectoId: "pry-1", fechaInicio: INICIO, corte: CORTE, parametros: PARAMETROS_V2_DEFAULT });

beforeEach(() => {
  store.actividades = [normal, transversal];
  store.avances = avances;
  vi.clearAllMocks();
});

describe("loadTecnicoStatus: T12 (S6) actividad transversal", () => {
  it("reads the activity type from the model", async () => {
    await cargar();
    expect(db.actividad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ tipo: true }) }),
    );
  });

  it("keeps the technical progress of a project with a 17-week transversal equal to the same project without it", async () => {
    const con = await cargar();
    store.actividades = [normal];
    const sin = await cargar();

    expect(con.tecnico.avance_real).toBe(1);
    expect(con.tecnico.avance_real).toBe(sin.tecnico.avance_real);
    expect(con.tecnico.desviacion_pp).toBe(sin.tecnico.desviacion_pp);
    expect(con.umbrales).toEqual(sin.umbrales);
    expect(con.color).toBe(sin.color);
  });

  it("groups the transversal under «Gestión del proyecto», apart from the objectives", async () => {
    const { objetivos, actividades } = await cargar();
    expect(objetivos.map((objetivo) => objetivo.codigo)).toEqual(["OE1", GRUPO_GESTION]);
    // The row keeps its type so a view can list it under that group without re-reading it.
    expect(actividades.find((actividad) => actividad.id === "t1")?.tipo).toBe("TRANSVERSAL");
  });
});
