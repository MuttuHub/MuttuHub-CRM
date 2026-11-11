-- PR-M1 (Frente M) — transactional email outbox.
--
-- Purely additive: one new enum, one new table, its indexes and an optional FK to `usuarios`
-- (ON DELETE SET NULL). Nothing existing is altered or dropped, so the code deployed before and
-- after this migration both work against it, in either order.
--
-- `clave_idempotencia` is UNIQUE: an event enqueues with INSERT ... ON CONFLICT DO NOTHING, so the
-- same event can never produce two rows. `(estado, proximo_intento_at)` serves the worker's claim
-- query (`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`).

-- CreateEnum
CREATE TYPE "EstadoEmailOutbox" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "destinatario_email" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "estado" "EstadoEmailOutbox" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" TEXT,
    "proximo_intento_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueado_hasta" TIMESTAMP(3),
    "enviado_at" TIMESTAMP(3),
    "proveedor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_clave_idempotencia_key" ON "email_outbox"("clave_idempotencia");

-- CreateIndex
CREATE INDEX "email_outbox_estado_proximo_intento_at_idx" ON "email_outbox"("estado", "proximo_intento_at");

-- CreateIndex
CREATE INDEX "email_outbox_usuario_id_idx" ON "email_outbox"("usuario_id");

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
