-- S9 U2: gerencial read flag. Additive and idempotent: nobody gains or loses access by migrating.
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "puede_ver_tablero_gerencial" BOOLEAN NOT NULL DEFAULT false;
