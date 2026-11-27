// V5 (odd/tasks/producto-pendientes-2026-11.md, S3, decision L8 «Campo departamento»): the
// departamento of a client and the coverage map built on it.
//
// The official list of departamentos is the one already in the municipios catalogue
// (`municipios.departamento`); the migration's trigger refuses any other value in
// `clientes.departamento`. The map counts only clients that carry a departamento and shows the rest
// apart as «sin departamento»: it never reads the free-text `ubicacion`, because the criterion is
// «sin datos inventados».

import type { EstadoCliente } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

export const DEPARTAMENTO_NO_VALIDO = "El departamento no está en el catálogo oficial de departamentos.";

/** Body shape shared by POST /clients and PATCH /clients/:id; null clears it (PATCH only). */
export const DEPARTAMENTO_SCHEMA = z
  .string()
  .trim()
  .min(1, "El departamento no puede estar vacío.")
  .max(120, "El departamento es muy largo.");

export type DepartamentoCatalogo = {
  departamento: string;
  /** DANE departamento code (first two digits of its municipios' codes), null when unknown. */
  codigo: string | null;
};

/**
 * Pure: one entry per distinct departamento, sorted by name (Spanish collation). The code is the
 * shared two-digit prefix of the municipios' DANE codes, only when every coded municipio agrees.
 */
export function catalogoDepartamentos(
  rows: readonly { departamento: string; codigo_dane: string | null }[],
): DepartamentoCatalogo[] {
  const codigos = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = codigos.get(row.departamento) ?? new Set<string>();
    if (row.codigo_dane) set.add(row.codigo_dane.slice(0, 2));
    codigos.set(row.departamento, set);
  }
  return [...codigos]
    .map(([departamento, set]) => ({ departamento, codigo: set.size === 1 ? [...set][0] : null }))
    .sort((a, b) => a.departamento.localeCompare(b.departamento, "es"));
}

/** The official departamentos, read from the municipios catalogue (suspended rows included). */
export async function listarDepartamentos(): Promise<DepartamentoCatalogo[]> {
  const rows = await db.municipio.findMany({ select: { departamento: true, codigo_dane: true } });
  return catalogoDepartamentos(rows);
}

/** True when at least one municipio names this departamento (the same rule as the DB trigger). */
export async function departamentoEnCatalogo(departamento: string): Promise<boolean> {
  const row = await db.municipio.findFirst({ where: { departamento }, select: { id: true } });
  return row !== null;
}

export type MapaClienteFila = {
  id: string;
  nombre: string;
  estado: EstadoCliente;
  departamento: string | null;
  /** Carried for display only; the aggregation never reads it. */
  ubicacion: string | null;
  responsable_nombre: string;
  /** Live projects of the client. */
  proyectos: number;
};

type MapaGrupo = {
  aliados: number;
  proyectos: number;
  clientes: MapaClienteFila[];
};

type MapaDepartamento = MapaGrupo & DepartamentoCatalogo;

export type MapaAliados = {
  departamentos: MapaDepartamento[];
  sin_departamento: MapaGrupo;
  total: number;
  con_departamento: number;
  /** Highest aliados count among the tiles; the heat scale's top. */
  max_aliados: number;
};

function grupo(clientes: MapaClienteFila[]): MapaGrupo {
  const ordenados = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return {
    aliados: ordenados.length,
    proyectos: ordenados.reduce((sum, c) => sum + c.proyectos, 0),
    clientes: ordenados,
  };
}

/**
 * Pure: one tile per catalogue departamento (zero included), plus a tile for a stored value that
 * is no longer in the catalogue (a renamed departamento), so no visible client is dropped. Clients
 * without a departamento form the «sin departamento» group.
 */
export function agregarPorDepartamento(
  clientes: readonly MapaClienteFila[],
  catalogo: readonly DepartamentoCatalogo[],
): MapaAliados {
  const porDepartamento = new Map<string, MapaClienteFila[]>();
  const sin: MapaClienteFila[] = [];
  for (const cliente of clientes) {
    if (cliente.departamento === null) {
      sin.push(cliente);
      continue;
    }
    const lista = porDepartamento.get(cliente.departamento) ?? [];
    lista.push(cliente);
    porDepartamento.set(cliente.departamento, lista);
  }

  const enCatalogo = new Set(catalogo.map((d) => d.departamento));
  const fuera = [...porDepartamento.keys()]
    .filter((d) => !enCatalogo.has(d))
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((departamento) => ({ departamento, codigo: null }));

  const departamentos = [...catalogo, ...fuera].map((d) => ({
    ...d,
    ...grupo(porDepartamento.get(d.departamento) ?? []),
  }));

  const conDepartamento = clientes.length - sin.length;
  return {
    departamentos,
    sin_departamento: grupo(sin),
    total: clientes.length,
    con_departamento: conDepartamento,
    max_aliados: departamentos.reduce((max, d) => Math.max(max, d.aliados), 0),
  };
}
