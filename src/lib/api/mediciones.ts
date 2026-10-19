// Projections of the S4 measurements and beneficiary records. Voided rows are
// listed but never feed `ultima`, `tendencia` or the beneficiary total
// (REQ-EXE-07).

import { isoDate } from "@/lib/proyectos/proyecto-general";
import { tendencia as calcularTendencia, type Tendencia } from "@/lib/proyectos/avance";

type VoidColumns = {
  registrado_por_id: string;
  created_at: Date;
  anulado_at: Date | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
};

export type MedicionRow = VoidColumns & {
  id: string;
  proyecto_id: string;
  indicador_id: string;
  fecha: Date;
  valor: { toString(): string };
  observacion: string | null;
};

export type MedicionView = {
  id: string;
  proyecto_id: string;
  indicador_id: string;
  fecha: string;
  valor: string;
  observacion: string | null;
  registrado_por_id: string;
  created_at: string;
  anulado_at: string | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
};

function voidView(row: VoidColumns) {
  return {
    registrado_por_id: row.registrado_por_id,
    created_at: row.created_at.toISOString(),
    anulado_at: row.anulado_at ? row.anulado_at.toISOString() : null,
    anulado_por_id: row.anulado_por_id,
    motivo_anulacion: row.motivo_anulacion,
  };
}

export function toMedicionView(row: MedicionRow): MedicionView {
  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    indicador_id: row.indicador_id,
    fecha: isoDate(row.fecha),
    valor: row.valor.toString(),
    observacion: row.observacion,
    ...voidView(row),
  };
}

/** Last live measurement (by fecha, then creation) and its trend against the previous live one. */
export function resumenMediciones(rows: MedicionRow[]): { ultima: MedicionView | null; tendencia: Tendencia | null } {
  const vivas = rows
    .filter((row) => row.anulado_at === null)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.created_at.getTime() - b.created_at.getTime());
  const ultima = vivas.at(-1);
  if (!ultima) return { ultima: null, tendencia: null };
  const previa = vivas.at(-2);
  return {
    ultima: toMedicionView(ultima),
    tendencia: calcularTendencia(Number(ultima.valor.toString()), previa ? Number(previa.valor.toString()) : null),
  };
}

export type BeneficiarioRow = VoidColumns & {
  id: string;
  proyecto_id: string;
  actividad_id: string | null;
  fecha: Date;
  cantidad: number;
  observacion: string | null;
};

export type BeneficiarioView = {
  id: string;
  proyecto_id: string;
  actividad_id: string | null;
  fecha: string;
  cantidad: number;
  observacion: string | null;
  registrado_por_id: string;
  created_at: string;
  anulado_at: string | null;
  anulado_por_id: string | null;
  motivo_anulacion: string | null;
};

export function toBeneficiarioView(row: BeneficiarioRow): BeneficiarioView {
  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    actividad_id: row.actividad_id,
    fecha: isoDate(row.fecha),
    cantidad: row.cantidad,
    observacion: row.observacion,
    ...voidView(row),
  };
}

/** Sum of the live (non-voided) beneficiary counts. */
export function totalBeneficiarios(rows: BeneficiarioRow[]): number {
  return rows.reduce((sum, row) => (row.anulado_at === null ? sum + row.cantidad : sum), 0);
}
