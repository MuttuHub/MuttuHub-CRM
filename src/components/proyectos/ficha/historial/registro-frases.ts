// Sentences of the Historial › Registro de cambios («Laura Jiménez registró 50 % en la actividad 1.3, con fecha
// 05 nov.»). The ledger rows carry ids and raw values; this turns the movements people care about (avances,
// anulaciones, gastos, solicitudes and versiones) into one sentence each, with the names the ficha already has
// loaded. A row it does not know returns `null` and the Historial shows it with the generic field reading.
// Pure functions, no I/O.

import type { UiTone } from "@/lib/catalogs";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import { diaMes } from "@/components/proyectos/ficha/historial/fechas";

/** The «Mostrar» filters: every described movement falls in one of them; the rest only in «Todo». */
export type TipoMovimiento = "avances" | "gastos" | "anulaciones" | "plan" | "otros";

export type EntradaRegistro = {
  id: string;
  accion: string;
  entidad: string;
  entidad_id: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
};

export type Frase = {
  tipo: TipoMovimiento;
  /** The sentence without its subject, starting in lower case: «registró 50 % en la actividad 1.3…». */
  predicado: string;
  etiqueta: string;
  tono: UiTone;
  /** A quoted observation or motive, shown under the sentence. */
  cita?: string;
  /** Motive of a void: shown as «Motivo: «…» Ya no cuenta para el avance.». */
  motivoAnulacion?: string;
  /** Summary line of a gasto («tercero · descripción · periodo · Sin IVA · 1 soporte.»). */
  nota?: string;
  /** Activity the movement belongs to, for «Ver actividad». */
  actividadId?: string;
  /** Gasto the movement belongs to, for «Ver gasto». */
  gastoId?: string;
};

/** Names and codes by id, from the queries the ficha already has, plus what the other ledger rows say. */
export type ContextoFrases = {
  actividades: ReadonlyMap<string, string>;
  entregables: ReadonlyMap<string, string>;
  indicadores: ReadonlyMap<string, string>;
  rubros: ReadonlyMap<string, { codigo: string | null; nombre: string }>;
  tiposModificacion: Readonly<Record<string, string>>;
  /** Gasto id -> document number, read from any row of that gasto. */
  gastos: ReadonlyMap<string, string>;
  /** Activity report id -> activity id, read from the row that created the report. */
  reportes: ReadonlyMap<string, string>;
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

const objeto = (valor: unknown): Record<string, unknown> => (esObjeto(valor) ? valor : {});

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

const NUMERO = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** «50», «12,5»: a percentage or a quantity stored as a decimal string or a number. */
function numero(valor: unknown): string | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  return Number.isFinite(n) ? NUMERO.format(n) : null;
}

function dinero(valor: unknown): string | null {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  try {
    return formatCOP(toCents(valor));
  } catch {
    return null;
  }
}

function periodo(valor: unknown): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(texto(valor));
  return match ? `${MESES[Number(match[2]) - 1]} ${match[1]}` : texto(valor);
}

/** Collects what the other rows say about a gasto or a report, so a later row can be named. */
export function contextoDeEntradas(
  entradas: readonly EntradaRegistro[],
  base: Omit<ContextoFrases, "gastos" | "reportes">,
): ContextoFrases {
  const gastos = new Map<string, string>();
  const reportes = new Map<string, string>();
  for (const entrada of entradas) {
    const nuevo = objeto(entrada.valor_nuevo);
    if (entrada.entidad === "gasto" && texto(nuevo.numero_documento)) {
      gastos.set(entrada.entidad_id, texto(nuevo.numero_documento));
    }
    if (entrada.entidad === "reporte_actividad" && texto(nuevo.actividad_id)) {
      reportes.set(entrada.entidad_id, texto(nuevo.actividad_id));
    }
  }
  return { ...base, gastos, reportes };
}

/** The filter of a row, also for the rows that keep the generic reading. */
export function tipoDeEntrada(entrada: Pick<EntradaRegistro, "accion" | "entidad">): TipoMovimiento {
  if (entrada.accion === "ANULAR") return "anulaciones";
  if (entrada.entidad === "gasto") return "gastos";
  if (["reporte_actividad", "avance", "medicion"].includes(entrada.entidad)) return "avances";
  if (entrada.entidad === "solicitud" || entrada.entidad === "version") return "plan";
  return "otros";
}

function enActividad(actividadId: string | undefined, ctx: ContextoFrases): string {
  const codigo = actividadId ? ctx.actividades.get(actividadId) : undefined;
  return codigo ? ` en la actividad ${codigo}` : "";
}

function conFecha(valor: unknown): string {
  const dia = diaMes(valor);
  return dia ? `, con fecha ${dia}` : "";
}

function delDia(valor: unknown): string {
  const dia = diaMes(valor);
  return dia ? ` del ${dia}` : "";
}

function fraseReporte(entrada: EntradaRegistro, ctx: ContextoFrases): Frase | null {
  const nuevo = objeto(entrada.valor_nuevo);
  const actividadId = texto(nuevo.actividad_id) || ctx.reportes.get(entrada.entidad_id) || undefined;
  if (entrada.accion === "ANULAR") {
    const anterior = objeto(entrada.valor_anterior);
    const pct = numero(anterior.porcentaje);
    return {
      tipo: "anulaciones",
      predicado: `anuló el reporte${pct ? ` de ${pct} %` : ""}${delDia(anterior.fecha)}${enActividad(actividadId, ctx)}.`,
      etiqueta: "Anulación",
      tono: "destructivo",
      motivoAnulacion: texto(nuevo.motivo_anulacion) || undefined,
      actividadId,
    };
  }
  if (entrada.accion !== "CREAR") return null;
  if (entrada.campo === "medio") {
    const nombre = texto(nuevo.nombre);
    return {
      tipo: "avances",
      predicado: `adjuntó ${nombre ? `«${nombre}»` : "un soporte"} a un reporte de avance${enActividad(actividadId, ctx)}.`,
      etiqueta: "Avance",
      tono: "info",
      actividadId,
    };
  }
  const pct = numero(nuevo.porcentaje);
  if (pct === null) return null;
  return {
    tipo: "avances",
    predicado: `registró ${pct} %${enActividad(actividadId, ctx)}${conFecha(nuevo.fecha)}.`,
    etiqueta: "Avance",
    tono: "info",
    cita: texto(nuevo.observacion) || undefined,
    actividadId,
  };
}

function fraseAvanceEntregable(entrada: EntradaRegistro, ctx: ContextoFrases): Frase | null {
  const nuevo = objeto(entrada.valor_nuevo);
  if (entrada.accion === "ANULAR") {
    const anterior = objeto(entrada.valor_anterior);
    const cantidad = numero(anterior.cantidad);
    return {
      tipo: "anulaciones",
      predicado: `anuló el avance${cantidad ? ` de ${cantidad}` : ""}${delDia(anterior.fecha)} de un entregable.`,
      etiqueta: "Anulación",
      tono: "destructivo",
      motivoAnulacion: texto(nuevo.motivo_anulacion) || undefined,
    };
  }
  if (entrada.accion !== "CREAR") return null;
  const cantidad = numero(nuevo.cantidad);
  const codigo = ctx.entregables.get(texto(nuevo.entregable_id));
  return {
    tipo: "avances",
    predicado: `registró ${cantidad ?? "un avance"}${codigo ? ` en el entregable ${codigo}` : " en un entregable"}${conFecha(nuevo.fecha)}.`,
    etiqueta: "Avance",
    tono: "info",
    cita: texto(nuevo.observacion) || undefined,
  };
}

function fraseMedicion(entrada: EntradaRegistro, ctx: ContextoFrases): Frase | null {
  if (entrada.accion !== "CREAR") return null;
  const nuevo = objeto(entrada.valor_nuevo);
  const valor = numero(nuevo.valor);
  const codigo = ctx.indicadores.get(texto(nuevo.indicador_id));
  return {
    tipo: "avances",
    predicado: `registró la medición${valor ? ` ${valor}` : ""}${codigo ? ` del indicador ${codigo}` : ""}${conFecha(nuevo.fecha)}.`,
    etiqueta: "Medición",
    tono: "info",
    cita: texto(nuevo.observacion) || undefined,
  };
}

function fraseGasto(entrada: EntradaRegistro, ctx: ContextoFrases): Frase | null {
  const nuevo = objeto(entrada.valor_nuevo);
  const numeroDocumento = texto(nuevo.numero_documento) || ctx.gastos.get(entrada.entidad_id) || "";
  const cual = numeroDocumento ? `el gasto ${numeroDocumento}` : "un gasto";
  const gastoId = entrada.entidad_id;
  if (entrada.accion === "CREAR") {
    const monto = dinero(nuevo.valor);
    const rubro = ctx.rubros.get(texto(nuevo.rubro_id));
    const enRubro = rubro ? ` en el rubro ${rubro.nombre}${rubro.codigo ? ` (${rubro.codigo})` : ""}` : "";
    const iva = dinero(nuevo.iva);
    const soportes = typeof nuevo.soportes === "number" ? nuevo.soportes : null;
    const nota = [
      texto(nuevo.tercero_nombre),
      texto(nuevo.descripcion),
      periodo(nuevo.periodo),
      iva === null ? "" : toCentsSeguro(nuevo.iva) === BigInt(0) ? "Sin IVA" : `IVA ${iva}`,
      soportes === null ? "" : `${soportes} ${soportes === 1 ? "soporte" : "soportes"}`,
    ].filter(Boolean);
    return {
      tipo: "gastos",
      predicado: `registró ${cual}${monto ? ` por ${monto}` : ""}${enRubro}.`,
      etiqueta: "Gasto",
      tono: "neutro",
      nota: nota.length > 0 ? `${nota.join(" · ")}.` : undefined,
      gastoId,
    };
  }
  if (entrada.accion === "VALIDAR") {
    return { tipo: "gastos", predicado: `validó ${cual}.`, etiqueta: "Validación", tono: "exito", gastoId };
  }
  if (entrada.accion === "RECHAZAR") {
    return {
      tipo: "gastos",
      predicado: `rechazó ${cual}.`,
      etiqueta: "Gasto rechazado",
      tono: "destructivo",
      cita: texto(nuevo.motivo) || undefined,
      gastoId,
    };
  }
  return null;
}

function toCentsSeguro(valor: unknown): bigint | null {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  try {
    return toCents(valor);
  } catch {
    return null;
  }
}

function fraseSolicitud(entrada: EntradaRegistro, ctx: ContextoFrases): Frase | null {
  if (entrada.accion === "SOLICITAR") {
    const nuevo = objeto(entrada.valor_nuevo);
    const tipo = ctx.tiposModificacion[texto(nuevo.tipo)];
    return {
      tipo: "plan",
      predicado: `solicitó una modificación${tipo ? ` (${tipo.toLowerCase()})` : ""}.`,
      etiqueta: "Solicitud",
      tono: "alerta",
      cita: texto(nuevo.motivo) || undefined,
    };
  }
  if (entrada.accion === "APROBAR") {
    return { tipo: "plan", predicado: "aprobó la solicitud de modificación.", etiqueta: "Cambio del plan", tono: "exito" };
  }
  if (entrada.accion === "RECHAZAR") {
    return {
      tipo: "plan",
      predicado: "rechazó la solicitud de modificación. El plan no cambia.",
      etiqueta: "Solicitud rechazada",
      tono: "destructivo",
    };
  }
  return null;
}

function fraseVersion(entrada: EntradaRegistro): Frase | null {
  if (entrada.accion !== "APROBAR") return null;
  const nuevo = objeto(entrada.valor_nuevo);
  if (nuevo.tipo === "LINEA_BASE") {
    return {
      tipo: "plan",
      predicado: "aprobó la línea base: nació la versión original del plan.",
      etiqueta: "Cambio del plan",
      tono: "exito",
    };
  }
  const n = typeof nuevo.numero === "number" ? nuevo.numero : null;
  return {
    tipo: "plan",
    predicado: n === null ? "creó una versión nueva del plan." : `creó la versión ${n} del plan.`,
    etiqueta: "Cambio del plan",
    tono: "exito",
  };
}

/** One ledger row -> its sentence, or `null` when the row keeps the generic field reading. */
export function describirEntrada(entrada: EntradaRegistro, ctx: ContextoFrases): Frase | null {
  switch (entrada.entidad) {
    case "reporte_actividad":
      return fraseReporte(entrada, ctx);
    case "avance":
      return fraseAvanceEntregable(entrada, ctx);
    case "medicion":
      return fraseMedicion(entrada, ctx);
    case "gasto":
      return fraseGasto(entrada, ctx);
    case "solicitud":
      return fraseSolicitud(entrada, ctx);
    case "version":
      return fraseVersion(entrada);
    default:
      return null;
  }
}

/** «LJ» for «Laura Jiménez»; the avatar is decorative. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return partes
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");
}
