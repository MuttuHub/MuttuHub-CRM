-- CreateTable
CREATE TABLE "solicitudes_acceso" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cargo" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'form',
    "auth_id" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "revisado_por" TEXT,
    "revisado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_acceso_pkey" PRIMARY KEY ("id")
);
