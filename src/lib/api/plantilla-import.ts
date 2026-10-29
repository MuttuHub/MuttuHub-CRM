// Server layer of the S7 Excel template (E-23 download, E-24 import).
//
// The pure pieces (generate, parse, validate, plan) live in
// `src/lib/proyectos/plantilla/`; this module is the only one that touches the
// database or the zip container:
//
//   - `cargarPlantillaInput` — the project's current state as a template input
//     (download -> edit -> import is the edit loop);
//   - `cargarContexto` / `contarReemplazo` — the catalogs the validators resolve
//     against and what an import would replace;
//   - `inspeccionarZip` — the zip-bomb guard that runs before `exceljs` sees the bytes;
//   - `importarPlantilla` — the atomic writer. It runs inside the caller's single
//     transaction, mirrors the inline writes of the S3/S5 routes (same lock, same
//     soft-delete policy, same budget/programming diff) and logs ONE audit lote.
//
// The routes write inline and this module deliberately does not refactor them.

import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api/errors";
import { logChanges, diffFields, type CambioInput } from "@/lib/api/audit-cambios";
import {
  RespuestaAbortada,
  decimalFromCents,
  lockProyectoBorrador,
  PROYECTO_NO_EXISTE,
} from "@/lib/api/presupuesto";
import { diffLineas, diffMunicipios } from "@/lib/api/projects";
import { diferenciaValor, isoDate } from "@/lib/proyectos/proyecto-general";
import { fromCents, toCents } from "@/lib/proyectos/money";
import type { Periodo } from "@/lib/proyectos/weeks";
import type { PlantillaInput } from "@/lib/proyectos/plantilla/generate";
import type { PlanImportacion } from "@/lib/proyectos/plantilla/mapear";
import type { ContextoValidacion } from "@/lib/proyectos/plantilla/validate";

/** Zip guard limits (a template is a few dozen KB; the 4 MB upload cap binds first). */
export const ZIP_MAX_ENTRADAS = 200;
export const ZIP_MAX_DESCOMPRIMIDO = 50 * 1024 * 1024;

export const HISTORIAL_MESSAGE =
  "El proyecto ya tiene avances, mediciones o registros de beneficiarios: no se puede reemplazar su estructura.";

/**
 * True when the buffer is a zip whose central directory looks like a normal
 * workbook: at most `ZIP_MAX_ENTRADAS` entries and `ZIP_MAX_DESCOMPRIMIDO` bytes
 * once inflated. Only the directory is read; nothing is decompressed here.
 */
export async function inspeccionarZip(buffer: Buffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    let entradas = 0;
    let total = 0;
    for (const entrada of Object.values(zip.files)) {
      entradas += 1;
      if (entradas > ZIP_MAX_ENTRADAS) return false;
      if (entrada.dir) continue;
      const tamano = (entrada as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
      if (typeof tamano !== "number") return false;
      total += tamano;
      if (total > ZIP_MAX_DESCOMPRIMIDO) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export type ResumenImportacion = {
  objetivos: number;
  actividades: number;
  entregables: number;
  indicadores: number;
  rubros: number;
  celdas_programacion: number;
};

/** What an import creates, read off the plan (`rubros` = lines above $0). */
export function resumenDePlan(plan: PlanImportacion): ResumenImportacion {
  const cero = BigInt(0);
  return {
    objetivos: plan.objetivos.length,
    actividades: plan.actividades.length,
    entregables: plan.entregables.length,
    indicadores: plan.indicadores.length,
    rubros: plan.presupuesto.filter((linea) => linea.cents > cero).length,
    celdas_programacion: plan.programacion.length,
  };
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

type ContextoReader = Pick<
  Prisma.TransactionClient,
  "proyecto" | "rubro" | "lineaEstrategicaCatalogo" | "municipio" | "usuario"
>;

/** The catalogs and the project identity a workbook is validated against. */
export async function cargarContexto(client: ContextoReader, proyectoId: string): Promise<ContextoValidacion> {
  const proyecto = await client.proyecto.findFirst({
    where: { id: proyectoId, deleted_at: null },
    select: { codigo: true, estado: true },
  });
  if (!proyecto) throw new RespuestaAbortada(apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND"));

  const [rubros, lineas, municipios, usuarios] = await Promise.all([
    client.rubro.findMany({ where: { codigo: { not: null } }, select: { codigo: true, activo: true } }),
    client.lineaEstrategicaCatalogo.findMany({ select: { id: true, codigo: true, nombre: true, activo: true } }),
    client.municipio.findMany({
      select: { id: true, nombre: true, departamento: true, codigo_dane: true, activo: true },
    }),
    client.usuario.findMany({ where: { activo: true }, select: { id: true, email: true } }),
  ]);

  return {
    proyecto: { codigo: proyecto.codigo, estado: proyecto.estado },
    rubros: rubros.map((rubro) => ({ codigo: rubro.codigo as string, activo: rubro.activo })),
    lineas,
    municipios: municipios.map((municipio) => ({
      id: municipio.id,
      nombre: municipio.nombre,
      departamento: municipio.departamento,
      codigoDane: municipio.codigo_dane,
      activo: municipio.activo,
    })),
    usuarios,
  };
}

type ConteoReader = Pick<Prisma.TransactionClient, "objetivo" | "actividad" | "entregable" | "indicador">;

export type ConteoReemplazo = { objetivos: number; actividades: number; entregables: number; indicadores: number };

/** Live rows an import would soft-delete (the dry run reports them as "se reemplazará"). */
export async function contarReemplazo(client: ConteoReader, proyectoId: string): Promise<ConteoReemplazo> {
  const where = { proyecto_id: proyectoId, deleted_at: null };
  const [objetivos, actividades, entregables, indicadores] = await Promise.all([
    client.objetivo.count({ where }),
    client.actividad.count({ where }),
    client.entregable.count({ where }),
    client.indicador.count({ where }),
  ]);
  return { objetivos, actividades, entregables, indicadores };
}

type PlantillaReader = Pick<
  Prisma.TransactionClient,
  | "proyecto"
  | "objetivo"
  | "actividad"
  | "entregable"
  | "indicador"
  | "lineaPresupuestal"
  | "programacionPeriodo"
  | "rubro"
  | "lineaEstrategicaCatalogo"
  | "municipio"
>;

/** The project's current state as a template input, so the download is prefilled. */
export async function cargarPlantillaInput(client: PlantillaReader, proyectoId: string): Promise<PlantillaInput> {
  const proyecto = await client.proyecto.findFirst({
    where: { id: proyectoId, deleted_at: null },
    select: {
      codigo: true,
      fecha_inicio: true,
      fecha_fin: true,
      valor_total: true,
      beneficiarios_meta: true,
      cliente: { select: { nombre: true } },
      lineas: { select: { principal: true, linea: { select: { codigo: true, nombre: true } } } },
      municipios: { select: { municipio: { select: { nombre: true, departamento: true } } } },
    },
  });
  if (!proyecto) throw new RespuestaAbortada(apiError(PROYECTO_NO_EXISTE, 404, "NOT_FOUND"));
  if (!proyecto.fecha_inicio || !proyecto.fecha_fin) {
    throw new RespuestaAbortada(
      apiError("Define las fechas del proyecto antes de descargar la plantilla.", 409, "INVALID_STATE"),
    );
  }

  const vivos = { proyecto_id: proyectoId, deleted_at: null };
  const [objetivos, actividades, entregables, indicadores, lineasPres, celdas, rubros, lineas, municipios] =
    await Promise.all([
      client.objetivo.findMany({
        where: vivos,
        orderBy: [{ orden: "asc" }, { codigo: "asc" }],
        select: { codigo: true, descripcion: true },
      }),
      client.actividad.findMany({
        where: vivos,
        orderBy: [{ semana_inicio: "asc" }, { codigo: "asc" }],
        select: {
          codigo: true,
          nombre: true,
          semana_inicio: true,
          semana_fin: true,
          peso: true,
          peso_manual: true,
          objetivo: { select: { codigo: true } },
          responsable: { select: { email: true } },
        },
      }),
      client.entregable.findMany({
        where: vivos,
        orderBy: { codigo: "asc" },
        select: {
          codigo: true,
          descripcion: true,
          cantidad_meta: true,
          unidad: true,
          actividad: { select: { codigo: true } },
        },
      }),
      client.indicador.findMany({
        where: vivos,
        orderBy: { codigo: "asc" },
        select: {
          codigo: true,
          nombre: true,
          meta: true,
          linea_base: true,
          objetivo: { select: { codigo: true } },
        },
      }),
      client.lineaPresupuestal.findMany({
        where: { proyecto_id: proyectoId },
        select: { monto_proyectado_cop: true, rubro: { select: { codigo: true } } },
      }),
      client.programacionPeriodo.findMany({
        where: { proyecto_id: proyectoId },
        select: { periodo: true, valor: true, linea: { select: { rubro: { select: { codigo: true } } } } },
      }),
      client.rubro.findMany({
        where: { activo: true, codigo: { not: null } },
        orderBy: [{ orden: "asc" }, { nombre: "asc" }],
        select: { codigo: true, nombre: true },
      }),
      client.lineaEstrategicaCatalogo.findMany({
        where: { activo: true },
        orderBy: { orden: "asc" },
        select: { codigo: true, nombre: true },
      }),
      client.municipio.findMany({
        where: { activo: true },
        orderBy: [{ departamento: "asc" }, { nombre: "asc" }],
        select: { nombre: true, departamento: true, codigo_dane: true },
      }),
    ]);

  const presupuesto: Record<string, string> = {};
  for (const linea of lineasPres) {
    if (linea.rubro.codigo) presupuesto[linea.rubro.codigo] = linea.monto_proyectado_cop.toString();
  }
  const programacion: Record<string, Record<Periodo, string>> = {};
  for (const celda of celdas) {
    const codigo = celda.linea.rubro.codigo;
    if (!codigo) continue;
    (programacion[codigo] ??= {})[celda.periodo] = celda.valor.toString();
  }

  return {
    proyecto: {
      codigo: proyecto.codigo,
      cliente: proyecto.cliente.nombre,
      fechaInicio: isoDate(proyecto.fecha_inicio),
      fechaFin: isoDate(proyecto.fecha_fin),
      valorTotal: proyecto.valor_total === null ? null : proyecto.valor_total.toString(),
      beneficiariosMeta: proyecto.beneficiarios_meta,
      lineas: [...proyecto.lineas]
        .sort((a, b) => Number(b.principal) - Number(a.principal))
        .map((link) => ({ codigo: link.linea.codigo, nombre: link.linea.nombre, principal: link.principal })),
      municipios: proyecto.municipios.map((link) => ({
        nombre: link.municipio.nombre,
        departamento: link.municipio.departamento,
      })),
    },
    catalogo: {
      rubros: rubros.map((rubro) => ({ codigo: rubro.codigo as string, nombre: rubro.nombre })),
      lineas,
      municipios: municipios.map((municipio) => ({
        nombre: municipio.nombre,
        departamento: municipio.departamento,
        codigoDane: municipio.codigo_dane,
      })),
    },
    estructura: {
      objetivos,
      actividades: actividades.map((actividad) => ({
        codigo: actividad.codigo,
        objetivoCodigo: actividad.objetivo.codigo,
        nombre: actividad.nombre,
        semanaInicio: actividad.semana_inicio,
        semanaFin: actividad.semana_fin,
        responsable: actividad.responsable?.email ?? null,
        peso: actividad.peso_manual ? actividad.peso.toString() : null,
      })),
      entregables: entregables.map((entregable) => ({
        codigo: entregable.codigo,
        actividadCodigo: entregable.actividad.codigo,
        descripcion: entregable.descripcion,
        cantidad: entregable.cantidad_meta.toString(),
        unidad: entregable.unidad,
      })),
      indicadores: indicadores.map((indicador) => ({
        codigo: indicador.codigo,
        objetivoCodigo: indicador.objetivo.codigo,
        nombre: indicador.nombre,
        meta: indicador.meta.toString(),
        lineaBase: indicador.linea_base === null ? null : indicador.linea_base.toString(),
      })),
    },
    presupuesto,
    programacion,
  };
}

// ---------------------------------------------------------------------------
// Atomic writer
// ---------------------------------------------------------------------------

export type ImportarArgs = {
  proyectoId: string;
  usuarioId: string;
  plan: PlanImportacion;
  /** One id for every audit row of this import. */
  loteId: string;
};

const clave = (codigo: string) => codigo.trim().toLowerCase();

function diaUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function buscar(mapa: Map<string, string>, codigo: string, que: string): string {
  const id = mapa.get(clave(codigo));
  if (id === undefined) throw new Error(`La plantilla referencia ${que} "${codigo}" que no existe en el plan.`);
  return id;
}

/** Never orphan history: in BORRADOR none exists today, but fail closed if it does. */
export async function exigirSinHistorial(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const [avances, mediciones, beneficiarios] = await Promise.all([
    tx.avanceEntregable.count({ where: { proyecto_id: id } }),
    tx.medicionIndicador.count({ where: { proyecto_id: id } }),
    tx.registroBeneficiario.count({ where: { proyecto_id: id } }),
  ]);
  if (avances + mediciones + beneficiarios > 0) {
    throw new RespuestaAbortada(apiError(HISTORIAL_MESSAGE, 409, "CONFLICT"));
  }
}

/** Soft-deletes the live structure; the counts feed the `reemplazo` audit row. */
export async function borrarEstructura(tx: Prisma.TransactionClient, id: string): Promise<ConteoReemplazo> {
  const borrado = { deleted_at: new Date() };
  const where = { proyecto_id: id, deleted_at: null };
  return {
    entregables: (await tx.entregable.updateMany({ where, data: borrado })).count,
    actividades: (await tx.actividad.updateMany({ where, data: borrado })).count,
    indicadores: (await tx.indicador.updateMany({ where, data: borrado })).count,
    objetivos: (await tx.objetivo.updateMany({ where, data: borrado })).count,
  };
}

export type EstructuraPlan = Pick<PlanImportacion, "objetivos" | "actividades" | "entregables" | "indicadores">;
export type AuditoriaImportacion = { usuario_id: string; accion: "IMPORTAR"; proyecto_id: string; lote_id: string };

/**
 * Creates the plan's objetivos, actividades, entregables and indicadores (one
 * createMany per table) and appends one `IMPORTAR` audit row per created row to
 * `cambios`. Runs after `borrarEstructura`, inside the caller's transaction.
 */
export async function crearEstructura(
  tx: Prisma.TransactionClient,
  id: string,
  plan: EstructuraPlan,
  base: AuditoriaImportacion,
  cambios: CambioInput[],
): Promise<void> {
  // Ids are generated here so each table is ONE createMany.
  const objetivoIds = new Map(plan.objetivos.map((o) => [clave(o.codigo), randomUUID()]));
  await tx.objetivo.createMany({
    data: plan.objetivos.map((o) => ({
      id: buscar(objetivoIds, o.codigo, "el objetivo"),
      proyecto_id: id,
      codigo: o.codigo,
      descripcion: o.descripcion,
      orden: o.orden,
    })),
  });
  for (const o of plan.objetivos) {
    cambios.push({
      ...base,
      entidad: "objetivo",
      entidad_id: buscar(objetivoIds, o.codigo, "el objetivo"),
      valor_nuevo: { codigo: o.codigo, descripcion: o.descripcion, orden: o.orden },
    });
  }

  const actividadIds = new Map(plan.actividades.map((a) => [clave(a.codigo), randomUUID()]));
  const actividades = plan.actividades.map((a) => ({
    id: buscar(actividadIds, a.codigo, "la actividad"),
    proyecto_id: id,
    objetivo_id: buscar(objetivoIds, a.objetivoCodigo, "el objetivo"),
    codigo: a.codigo,
    nombre: a.nombre,
    semana_inicio: a.semanaInicio,
    semana_fin: a.semanaFin,
    peso: new Prisma.Decimal(a.peso),
    peso_manual: a.pesoManual,
    responsable_id: a.responsableId,
  }));
  await tx.actividad.createMany({ data: actividades });
  for (const a of actividades) {
    cambios.push({
      ...base,
      entidad: "actividad",
      entidad_id: a.id,
      valor_nuevo: {
        objetivo_id: a.objetivo_id,
        codigo: a.codigo,
        nombre: a.nombre,
        semana_inicio: a.semana_inicio,
        semana_fin: a.semana_fin,
        peso: a.peso,
        peso_manual: a.peso_manual,
        responsable_id: a.responsable_id,
      },
    });
  }

  const entregables = plan.entregables.map((e) => ({
    id: randomUUID(),
    proyecto_id: id,
    actividad_id: buscar(actividadIds, e.actividadCodigo, "la actividad"),
    codigo: e.codigo,
    descripcion: e.descripcion,
    cantidad_meta: new Prisma.Decimal(e.cantidadMeta),
    unidad: e.unidad,
    tipo_medio_exigido: e.tipoMedio,
  }));
  await tx.entregable.createMany({ data: entregables });
  for (const e of entregables) {
    cambios.push({
      ...base,
      entidad: "entregable",
      entidad_id: e.id,
      valor_nuevo: {
        actividad_id: e.actividad_id,
        codigo: e.codigo,
        descripcion: e.descripcion,
        cantidad_meta: e.cantidad_meta,
        unidad: e.unidad,
        tipo_medio_exigido: e.tipo_medio_exigido,
      },
    });
  }

  const indicadores = plan.indicadores.map((i) => ({
    id: randomUUID(),
    proyecto_id: id,
    objetivo_id: buscar(objetivoIds, i.objetivoCodigo, "el objetivo"),
    codigo: i.codigo,
    nombre: i.nombre,
    meta: new Prisma.Decimal(i.meta),
    unidad: i.unidad,
    linea_base: i.lineaBase === null ? null : new Prisma.Decimal(i.lineaBase),
  }));
  await tx.indicador.createMany({ data: indicadores });
  for (const i of indicadores) {
    cambios.push({
      ...base,
      entidad: "indicador",
      entidad_id: i.id,
      valor_nuevo: {
        objetivo_id: i.objetivo_id,
        codigo: i.codigo,
        nombre: i.nombre,
        meta: i.meta,
        unidad: i.unidad,
        linea_base: i.linea_base,
      },
    });
  }
}

/**
 * Replaces the project's structure, budget, programming, dates, líneas and
 * municipios with the (already validated) plan. It must run inside ONE
 * `$transaction` supplied by the caller: every statement below commits or rolls
 * back together, including the audit lote. Throws `RespuestaAbortada` (404/409)
 * for a project that is gone, left BORRADOR, or already carries execution history.
 */
export async function importarPlantilla(
  tx: Prisma.TransactionClient,
  { proyectoId: id, usuarioId, plan, loteId }: ImportarArgs,
): Promise<ResumenImportacion> {
  await lockProyectoBorrador(tx, id);
  await exigirSinHistorial(tx, id);

  const antes = await tx.proyecto.findUniqueOrThrow({
    where: { id },
    select: {
      fecha_inicio: true,
      fecha_fin: true,
      valor_total: true,
      beneficiarios_meta: true,
      oportunidad: { select: { valor_estimado_cop: true } },
      lineas: { select: { linea_id: true, principal: true } },
      municipios: { select: { municipio_id: true } },
    },
  });

  const cambios: CambioInput[] = [];
  const base = { usuario_id: usuarioId, accion: "IMPORTAR", proyecto_id: id, lote_id: loteId } as const;

  // 1. Soft-delete the live structure (the partial unique indexes only cover live rows).
  const reemplazados = await borrarEstructura(tx, id);

  // 2. Project fields (+ the opportunity difference, like the project PATCH).
  const valorTotal = decimalFromCents(plan.proyecto.valorTotalCents);
  const patch = {
    fecha_inicio: diaUtc(plan.proyecto.fechaInicio),
    fecha_fin: diaUtc(plan.proyecto.fechaFin),
    valor_total: valorTotal,
    beneficiarios_meta: plan.proyecto.beneficiariosMeta,
  };
  const diferencia = antes.oportunidad
    ? diferenciaValor(fromCents(plan.proyecto.valorTotalCents), antes.oportunidad.valor_estimado_cop)
    : null;
  await tx.proyecto.update({
    where: { id },
    data: {
      ...patch,
      ...(antes.oportunidad
        ? { diferencia_valor_oportunidad: diferencia === null ? null : new Prisma.Decimal(diferencia) }
        : {}),
    },
  });
  const auditoriaProyecto = { ...base, entidad: "proyecto", entidad_id: id } as const;
  for (const cambio of diffFields(antes, patch, [
    "fecha_inicio",
    "fecha_fin",
    "valor_total",
    "beneficiarios_meta",
  ] as const)) {
    cambios.push({ ...auditoriaProyecto, ...cambio });
  }

  // 3. Líneas estratégicas and municipios (full replacement).
  await tx.proyectoLinea.deleteMany({ where: { proyecto_id: id } });
  await tx.proyectoLinea.createMany({
    data: plan.proyecto.lineas.map((linea) => ({ proyecto_id: id, linea_id: linea.id, principal: linea.principal })),
  });
  await tx.proyectoMunicipio.deleteMany({ where: { proyecto_id: id } });
  await tx.proyectoMunicipio.createMany({
    data: plan.proyecto.municipioIds.map((municipioId) => ({ proyecto_id: id, municipio_id: municipioId })),
  });
  for (const cambio of [
    ...diffLineas(
      antes.lineas.map((link) => ({ id: link.linea_id, principal: link.principal })),
      plan.proyecto.lineas,
    ),
    ...diffMunicipios(
      antes.municipios.map((link) => link.municipio_id),
      plan.proyecto.municipioIds,
    ),
  ]) {
    cambios.push({ ...auditoriaProyecto, ...cambio });
  }

  // 4. Structure.
  await crearEstructura(tx, id, plan, base, cambios);

  // 5. Budget: update an existing line (even to $0, never delete: `Gasto` points at
  //    it), create a new one only above $0 — exactly like the budget PUT.
  const cero = BigInt(0);
  const rubros = await tx.rubro.findMany({
    where: { codigo: { in: plan.presupuesto.map((linea) => linea.rubroCodigo) } },
    select: { id: true, codigo: true },
  });
  const rubroIds = new Map(rubros.map((rubro) => [rubro.codigo as string, rubro.id]));
  const lineasExistentes = await tx.lineaPresupuestal.findMany({
    where: { proyecto_id: id },
    select: { id: true, rubro_id: true, monto_proyectado_cop: true },
  });
  const lineaPorRubro = new Map(lineasExistentes.map((linea) => [linea.rubro_id, linea.id]));
  const montoPrevio = new Map(lineasExistentes.map((linea) => [linea.rubro_id, toCents(linea.monto_proyectado_cop)]));
  const presupuestoBase = { ...base, entidad: "presupuesto", campo: "asignado" } as const;

  for (const linea of plan.presupuesto) {
    const rubroId = rubroIds.get(linea.rubroCodigo);
    if (rubroId === undefined) throw new Error(`El rubro ${linea.rubroCodigo} no existe en el catálogo.`);
    const lineaId = lineaPorRubro.get(rubroId);
    if (lineaId !== undefined) {
      const anterior = montoPrevio.get(rubroId) ?? cero;
      if (anterior === linea.cents) continue;
      await tx.lineaPresupuestal.update({
        where: { id: lineaId },
        data: { monto_proyectado_cop: decimalFromCents(linea.cents) },
      });
      cambios.push({
        ...presupuestoBase,
        entidad_id: lineaId,
        valor_anterior: fromCents(anterior),
        valor_nuevo: fromCents(linea.cents),
      });
    } else if (linea.cents > cero) {
      const creada = await tx.lineaPresupuestal.create({
        data: { proyecto_id: id, rubro_id: rubroId, monto_proyectado_cop: decimalFromCents(linea.cents) },
        select: { id: true },
      });
      lineaPorRubro.set(rubroId, creada.id);
      cambios.push({
        ...presupuestoBase,
        entidad_id: creada.id,
        valor_anterior: null,
        valor_nuevo: fromCents(linea.cents),
      });
    }
  }

  // 6. Programming by diff, like the programming PUT: cells above $0 are created or
  //    updated, every other existing cell goes away.
  const existentes = await tx.programacionPeriodo.findMany({
    where: { proyecto_id: id },
    select: { id: true, linea_id: true, periodo: true, valor: true },
  });
  const porClave = new Map(existentes.map((celda) => [`${celda.linea_id}|${celda.periodo}`, celda]));
  const programacionBase = { ...base, entidad: "programacion" } as const;
  const vistas = new Set<string>();
  const nuevas: { id: string; proyecto_id: string; linea_id: string; periodo: string; valor: Prisma.Decimal }[] = [];

  for (const celda of plan.programacion) {
    const rubroId = rubroIds.get(celda.rubroCodigo);
    const lineaId = rubroId === undefined ? undefined : lineaPorRubro.get(rubroId);
    if (lineaId === undefined) {
      throw new RespuestaAbortada(
        apiError("El rubro no tiene presupuesto asignado: asígnale un monto primero.", 400, "VALIDATION_ERROR"),
      );
    }
    const existente = porClave.get(`${lineaId}|${celda.periodo}`);
    if (existente) {
      vistas.add(existente.id);
      const anterior = toCents(existente.valor);
      if (anterior === celda.cents) continue;
      await tx.programacionPeriodo.update({ where: { id: existente.id }, data: { valor: decimalFromCents(celda.cents) } });
      cambios.push({
        ...programacionBase,
        entidad_id: existente.id,
        campo: celda.periodo,
        valor_anterior: fromCents(anterior),
        valor_nuevo: fromCents(celda.cents),
      });
    } else {
      const nueva = {
        id: randomUUID(),
        proyecto_id: id,
        linea_id: lineaId,
        periodo: celda.periodo,
        valor: decimalFromCents(celda.cents),
      };
      nuevas.push(nueva);
      cambios.push({
        ...programacionBase,
        entidad_id: nueva.id,
        campo: celda.periodo,
        valor_anterior: null,
        valor_nuevo: fromCents(celda.cents),
      });
    }
  }
  if (nuevas.length > 0) await tx.programacionPeriodo.createMany({ data: nuevas });

  const sobrantes = existentes.filter((celda) => !vistas.has(celda.id));
  if (sobrantes.length > 0) {
    await tx.programacionPeriodo.deleteMany({ where: { id: { in: sobrantes.map((celda) => celda.id) } } });
    for (const celda of sobrantes) {
      cambios.push({
        ...programacionBase,
        entidad_id: celda.id,
        campo: celda.periodo,
        valor_anterior: fromCents(toCents(celda.valor)),
        valor_nuevo: fromCents(cero),
      });
    }
  }

  // 7. One summary row, then the whole lote in one insert.
  const resumen = resumenDePlan(plan);
  cambios.push({
    ...auditoriaProyecto,
    campo: "reemplazo",
    valor_anterior: reemplazados,
    valor_nuevo: {
      objetivos: resumen.objetivos,
      actividades: resumen.actividades,
      entregables: resumen.entregables,
      indicadores: resumen.indicadores,
    },
  });
  await logChanges(tx, cambios);

  return resumen;
}
