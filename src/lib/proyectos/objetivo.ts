// View of an `Objetivo` row (S3 U1). Pure and DB-free.

export type ObjetivoRow = {
  id: string;
  proyecto_id: string;
  codigo: string;
  descripcion: string;
  orden: number;
  created_at: Date;
  updated_at: Date;
};

export type ObjetivoView = {
  id: string;
  proyecto_id: string;
  codigo: string;
  descripcion: string;
  orden: number;
  created_at: string;
  updated_at: string;
};

export function toObjetivoView(row: ObjetivoRow): ObjetivoView {
  return {
    id: row.id,
    proyecto_id: row.proyecto_id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    orden: row.orden,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
