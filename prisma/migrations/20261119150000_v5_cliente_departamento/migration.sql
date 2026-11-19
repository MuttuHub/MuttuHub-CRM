-- V5 (odd/tasks/producto-pendientes-2026-11.md, S3, decision L8 «Campo departamento», closes PO-14):
-- the client gets an optional departamento for the coverage map. Additive: one nullable column, no
-- existing row changes (every current client stays valid, shown as «sin departamento»).
--
-- Only real departamentos: the official list is the one already in the municipios catalogue
-- (`municipios.departamento`). That column is not unique (one row per municipio), so there is no
-- natural key for a FK; a trigger refuses an INSERT, or an UPDATE that changes the value, when it
-- names a departamento no municipio carries. A suspended municipio still names a real departamento,
-- so `activo` is not checked. The value is never derived from the free-text `ubicacion`.
--
-- Revert: DROP TRIGGER clientes_departamento_en_catalogo ON "clientes";
--         DROP FUNCTION clientes_departamento_en_catalogo();
--         ALTER TABLE "clientes" DROP COLUMN "departamento";

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "departamento" TEXT;

CREATE OR REPLACE FUNCTION clientes_departamento_en_catalogo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.departamento IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.departamento IS DISTINCT FROM OLD.departamento)
     AND NOT EXISTS (SELECT 1 FROM "municipios" m WHERE m.departamento = NEW.departamento) THEN
    RAISE EXCEPTION 'clientes.departamento «%» no está en el catálogo de municipios', NEW.departamento
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clientes_departamento_en_catalogo ON "clientes";
CREATE TRIGGER clientes_departamento_en_catalogo
  BEFORE INSERT OR UPDATE OF departamento ON "clientes"
  FOR EACH ROW EXECUTE FUNCTION clientes_departamento_en_catalogo();
