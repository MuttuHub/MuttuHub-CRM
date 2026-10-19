// View of an `Indicador` row (S3 U3). Pure and DB-free. `Decimal(15,2)` columns
// serialise as strings, like every other money/quantity column of the module.

export type IndicadorRow = {
  id: string;
  proyecto_id: string;
  objetivo_id: string;
  codigo: string;
  nombre: string;
  meta: { toString(): string };
  unidad: string;
  linea_base: { toString(): string } | null;
  created_at: Date;
  updated_at: Date;
};

export type IndicadorView = Omit<IndicadorRow, "meta" | "linea_base" | "created_at" | "updated_at"> & {
  meta: string;
  linea_base: string | null;
  created_at: string;
  updated_at: string;
};

export function toIndicadorView(row: IndicadorRow): IndicadorView {
  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    objetivo_id: row.objetivo_id,
    codigo: row.codigo,
    nombre: row.nombre,
    meta: row.meta.toString(),
    unidad: row.unidad,
    linea_base: row.linea_base === null ? null : row.linea_base.toString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
