// View of an `Entregable` row (S3 U3). Pure and DB-free. `Decimal(15,2)` columns
// serialise as strings, like every other money/quantity column of the module.

export type EntregableRow = {
  id: string;
  proyecto_id: string;
  actividad_id: string;
  codigo: string;
  descripcion: string;
  cantidad_meta: { toString(): string };
  unidad: string;
  tipo_medio_exigido: string;
  created_at: Date;
  updated_at: Date;
};

export type EntregableView = Omit<EntregableRow, "cantidad_meta" | "created_at" | "updated_at"> & {
  cantidad_meta: string;
  created_at: string;
  updated_at: string;
};

export function toEntregableView(row: EntregableRow): EntregableView {
  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    actividad_id: row.actividad_id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    cantidad_meta: row.cantidad_meta.toString(),
    unidad: row.unidad,
    tipo_medio_exigido: row.tipo_medio_exigido,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
