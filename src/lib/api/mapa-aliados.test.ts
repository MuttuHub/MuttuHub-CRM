// V5 (S3, decision L8): the pure half of the departamento map. The catalogue of official
// departamentos comes from the municipios rows, and the aggregation counts only clients that carry a
// departamento; the rest go to «sin departamento», never guessed from `ubicacion`.

import { describe, expect, it } from "vitest";
import { agregarPorDepartamento, catalogoDepartamentos, type MapaClienteFila } from "./mapa-aliados";

function fila(overrides: Partial<MapaClienteFila> = {}): MapaClienteFila {
  return {
    id: "c1",
    nombre: "Aliado",
    estado: "CLIENTE_ACTIVO",
    departamento: null,
    ubicacion: null,
    responsable_nombre: "Ana",
    proyectos: 0,
    ...overrides,
  };
}

describe("catalogoDepartamentos", () => {
  it("lists each departamento once, sorted, with the DANE prefix only when its municipios agree", () => {
    const catalogo = catalogoDepartamentos([
      { departamento: "Santander", codigo_dane: "68001" },
      { departamento: "Antioquia", codigo_dane: "05001" },
      { departamento: "Antioquia", codigo_dane: null },
      { departamento: "Bolívar", codigo_dane: null },
      { departamento: "Caldas", codigo_dane: "17001" },
      { departamento: "Caldas", codigo_dane: "99001" },
    ]);
    expect(catalogo).toEqual([
      { departamento: "Antioquia", codigo: "05" },
      { departamento: "Bolívar", codigo: null },
      { departamento: "Caldas", codigo: null },
      { departamento: "Santander", codigo: "68" },
    ]);
  });
});

describe("agregarPorDepartamento", () => {
  const catalogo = [
    { departamento: "Antioquia", codigo: "05" },
    { departamento: "Caldas", codigo: "17" },
  ];

  it("counts only clients with a departamento and keeps the rest apart, ignoring ubicacion", () => {
    const mapa = agregarPorDepartamento(
      [
        fila({ id: "a", nombre: "B aliado", departamento: "Antioquia", proyectos: 2 }),
        fila({ id: "b", nombre: "A aliado", departamento: "Antioquia", proyectos: 1 }),
        // ubicacion names Caldas, but there is no departamento: it must not count for Caldas.
        fila({ id: "c", departamento: null, ubicacion: "Manizales, Caldas", proyectos: 3 }),
      ],
      catalogo,
    );

    expect(mapa.total).toBe(3);
    expect(mapa.con_departamento).toBe(2);
    expect(mapa.departamentos.map((d) => [d.departamento, d.codigo, d.aliados, d.proyectos])).toEqual([
      ["Antioquia", "05", 2, 3],
      ["Caldas", "17", 0, 0],
    ]);
    expect(mapa.departamentos[0].clientes.map((c) => c.nombre)).toEqual(["A aliado", "B aliado"]);
    expect(mapa.sin_departamento).toMatchObject({ aliados: 1, proyectos: 3 });
    expect(mapa.sin_departamento.clientes.map((c) => c.id)).toEqual(["c"]);
    expect(mapa.max_aliados).toBe(2);
  });

  it("keeps a stored departamento that left the catalogue as its own tile instead of dropping it", () => {
    const mapa = agregarPorDepartamento([fila({ id: "x", departamento: "Departamento renombrado" })], catalogo);
    expect(mapa.departamentos.map((d) => [d.departamento, d.codigo, d.aliados])).toEqual([
      ["Antioquia", "05", 0],
      ["Caldas", "17", 0],
      ["Departamento renombrado", null, 1],
    ]);
  });
});
