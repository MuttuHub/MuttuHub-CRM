/**
 * Presentation of the change ledger rows (Cambios > Historial). The API hands back the raw rows
 * (`campo`, JSON before/after); this turns them into text a person can read: no bare uuids, no
 * no-op changes, money through `formatCOP`, programming month keys as months and sentence-case
 * labels. Pure functions, no I/O.
 */

import type { ProjectListRow } from "@/hooks/projects";
import { formatCOP, toCents } from "@/lib/proyectos/money";
import {
  ESTADO_PROYECTO_META,
  agruparHistorial,
  type AuditHistoryEntryLike,
  ORIGEN_PROYECTO_META,
  describeAuditValue,
  etiquetaCampoAuditoria,
  formatFechaCalendario,
  formatFechaHora,
} from "@/components/proyectos/project-display";

export type NombresPorId = ReadonlyMap<string, string>;

export type CambioLegible = {
  /** Label of the changed field, `null` when the row has no field or nothing readable to attach it to. */
  campo: string | null;
  anterior: string;
  nuevo: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DECIMAL = /^-?\d+\.\d{2}$/;
const ENUM = /^[A-Z][A-Z0-9_]+$/;

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Names the ficha already has loaded (cliente, responsable, líneas, municipios), by id. */
export function nombresDelProyecto(
  proyecto: Pick<ProjectListRow, "cliente" | "responsable" | "lineas" | "municipios">,
): Map<string, string> {
  const nombres = new Map<string, string>();
  nombres.set(proyecto.cliente.id, proyecto.cliente.nombre);
  if (proyecto.responsable) nombres.set(proyecto.responsable.id, proyecto.responsable.nombre);
  for (const linea of proyecto.lineas) nombres.set(linea.id, linea.nombre);
  for (const municipio of proyecto.municipios) nombres.set(municipio.id, municipio.nombre);
  return nombres;
}

function mesLegible(clave: string): string | null {
  const match = MES.exec(clave);
  return match ? `${MESES[Number(match[2]) - 1]} ${match[1]}` : null;
}

function enumLegible(valor: string): string {
  const conocido = describeAuditValue(valor);
  if (conocido !== valor) return conocido;
  const estado = ESTADO_PROYECTO_META[valor as keyof typeof ESTADO_PROYECTO_META];
  if (estado) return estado.label;
  const texto = valor.replace(/_/g, " ").toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearTexto(valor: string, nombres: NombresPorId): string {
  if (UUID.test(valor)) return nombres.get(valor) ?? "";
  const mes = mesLegible(valor);
  if (mes) return mes;
  if (INSTANTE.test(valor)) return formatFechaHora(valor);
  if (FECHA.test(valor)) return formatFechaCalendario(valor);
  if (DECIMAL.test(valor)) return formatCOP(toCents(valor));
  if (ENUM.test(valor)) return enumLegible(valor);
  return valor;
}

/**
 * One JSON value of the ledger -> text. A uuid is replaced by its name when `nombres` knows it and
 * omitted otherwise (an empty string); null keys of an object are omitted.
 */
export function formatearValorHistorial(valor: unknown, nombres: NombresPorId): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return formatearTexto(valor, nombres);
  if (typeof valor === "number" || typeof valor === "boolean") return describeAuditValue(valor);
  if (Array.isArray(valor)) {
    return valor.map((item) => formatearValorHistorial(item, nombres)).filter(Boolean).join(", ");
  }
  if (typeof valor === "object") {
    return Object.entries(valor as Record<string, unknown>)
      .map(([clave, item]) => {
        if (clave === "origen" && typeof item === "string") {
          const origen = ORIGEN_PROYECTO_META[item as keyof typeof ORIGEN_PROYECTO_META] ?? item;
          return `${etiquetaCampoAuditoria(clave)}: ${origen}`;
        }
        const texto = formatearValorHistorial(item, nombres);
        if (texto === "") return "";
        return clave === "id" ? texto : `${etiquetaCampoAuditoria(clave)}: ${texto}`;
      })
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

const igual = (a: unknown, b: unknown): boolean => {
  if ((a ?? null) === (b ?? null)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/** Drops the keys both sides share unchanged; `null` and a missing key count as the same. */
function soloLoQueCambio(
  anterior: Record<string, unknown>,
  nuevo: Record<string, unknown>,
): { anterior: Record<string, unknown>; nuevo: Record<string, unknown>; hayClaves: boolean } {
  const claves = new Set([...Object.keys(anterior), ...Object.keys(nuevo)]);
  const salidaAnterior: Record<string, unknown> = {};
  const salidaNueva: Record<string, unknown> = {};
  for (const clave of claves) {
    if (igual(anterior[clave], nuevo[clave])) continue;
    if (clave in anterior) salidaAnterior[clave] = anterior[clave];
    if (clave in nuevo) salidaNueva[clave] = nuevo[clave];
  }
  return { anterior: salidaAnterior, nuevo: salidaNueva, hayClaves: claves.size > 0 };
}

/**
 * One ledger row -> what the Historial shows, or `null` when the row changes nothing (before and after
 * equal) and must not be listed. A row whose ids cannot be resolved stays listed, without the ids.
 */
export function resumirCambio(
  fila: { campo: string | null; valor_anterior: unknown; valor_nuevo: unknown },
  nombres: NombresPorId,
): CambioLegible | null {
  let { valor_anterior: anterior, valor_nuevo: nuevo } = fila;

  if (esObjeto(anterior) && esObjeto(nuevo)) {
    const reducido = soloLoQueCambio(anterior, nuevo);
    if (reducido.hayClaves && Object.keys(reducido.anterior).length + Object.keys(reducido.nuevo).length === 0) {
      return null;
    }
    anterior = reducido.anterior;
    nuevo = reducido.nuevo;
  } else if (anterior !== null && anterior !== undefined && igual(anterior, nuevo)) {
    return null;
  }

  const textoAnterior = formatearValorHistorial(anterior, nombres);
  const textoNuevo = formatearValorHistorial(nuevo, nombres);
  if (textoAnterior !== "" && textoAnterior === textoNuevo) return null;

  const tieneValor = textoAnterior !== "" || textoNuevo !== "";
  const campo = fila.campo && tieneValor ? (mesLegible(fila.campo) ?? etiquetaCampoAuditoria(fila.campo)) : null;
  return { campo, anterior: textoAnterior, nuevo: textoNuevo };
}

export type PasoLegible<T extends AuditHistoryEntryLike> = {
  key: string;
  created_at: string;
  entradas: { entry: T; cambio: CambioLegible }[];
};

/** Steps of the Historial with the no-op rows removed; a step left with no row disappears. */
export function pasosLegibles<
  T extends AuditHistoryEntryLike & { campo: string | null; valor_anterior: unknown; valor_nuevo: unknown },
>(entries: readonly T[], nombres: NombresPorId): PasoLegible<T>[] {
  const pasos: PasoLegible<T>[] = [];
  for (const paso of agruparHistorial(entries)) {
    const entradas: PasoLegible<T>["entradas"] = [];
    for (const entry of paso.entries) {
      const cambio = resumirCambio(entry, nombres);
      if (cambio) entradas.push({ entry, cambio });
    }
    if (entradas.length > 0) pasos.push({ key: paso.key, created_at: paso.created_at, entradas });
  }
  return pasos;
}
