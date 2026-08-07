-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMINISTRADOR', 'GERENCIA', 'COORDINADOR', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('PROSPECTO', 'EN_ACERCAMIENTO', 'CLIENTE_ACTIVO', 'EN_PAUSA', 'STANDBY', 'INACTIVO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('GOBIERNO_LOCAL', 'GOBIERNO_NACIONAL', 'COOPERANTE_MULTILATERAL', 'EMPRESA_PRIVADA', 'FUNDACION', 'ALIADO_ACADEMICO', 'OTRO');

-- CreateEnum
CREATE TYPE "PrioridadCliente" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "RolContacto" AS ENUM ('DECISOR', 'TECNICO', 'INFLUENCIADOR', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoOportunidad" AS ENUM ('DISENANDO_PROPUESTA', 'PRESENTADA', 'EN_REVISION', 'EN_NEGOCIACION', 'GANADA', 'PERDIDA', 'STANDBY');

-- CreateEnum
CREATE TYPE "EstadoTarea" AS ENUM ('POR_HACER', 'EN_CURSO', 'EN_REVISION', 'COMPLETADA', 'BLOQUEADA', 'EN_ESPERA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigenTarea" AS ENUM ('CRM', 'KANBAN', 'AMBOS');

-- CreateEnum
CREATE TYPE "PrioridadTarea" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('COMPROMISO_VENCIDO', 'TAREA_VENCIDA', 'POR_VENCER');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'COLABORADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "empresa" TEXT,
    "tipo_cliente" "TipoCliente" NOT NULL,
    "tamano_org" TEXT,
    "ubicacion" TEXT,
    "canal_contacto_inicial" TEXT,
    "fecha_primer_contacto" TIMESTAMP(3),
    "prioridad" "PrioridadCliente",
    "prioridades_identificadas" TEXT,
    "riesgos_barreras" TEXT,
    "resumen_relacion" TEXT,
    "estado" "EstadoCliente" NOT NULL DEFAULT 'PROSPECTO',
    "responsable_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "correo" TEXT,
    "telefono" TEXT,
    "rol_decision" "RolContacto",
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "problema_detectado" TEXT,
    "solucion_propuesta" TEXT,
    "servicios_interes" TEXT,
    "valor_estimado_cop" DECIMAL(15,2),
    "estado" "EstadoOportunidad" NOT NULL DEFAULT 'DISENANDO_PROPUESTA',
    "fecha_ultima_gestion" TIMESTAMP(3),
    "proyectos_relacionados" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "responsable_id" TEXT NOT NULL,
    "cliente_id" TEXT,
    "estado" "EstadoTarea" NOT NULL DEFAULT 'POR_HACER',
    "origen" "OrigenTarea" NOT NULL DEFAULT 'KANBAN',
    "prioridad" "PrioridadTarea",
    "fecha_entrega" TIMESTAMP(3),
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "motivo_bloqueo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora_entradas" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_entradas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_versiones" (
    "id" TEXT NOT NULL,
    "documento_id" TEXT NOT NULL,
    "numero_version" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "tamano_bytes" INTEGER,
    "tipo_archivo" TEXT,
    "subido_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_versiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_clientes" (
    "documento_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,

    CONSTRAINT "documentos_clientes_pkey" PRIMARY KEY ("documento_id","cliente_id")
);

-- CreateTable
CREATE TABLE "comentarios_tareas" (
    "id" TEXT NOT NULL,
    "tarea_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtareas" (
    "id" TEXT NOT NULL,
    "tarea_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "completada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "subtareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjuntos_tareas" (
    "id" TEXT NOT NULL,
    "tarea_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjuntos_tareas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "tarea_id" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accesos" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "accesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_logs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "detalle" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "documento_versiones_documento_id_numero_version_key" ON "documento_versiones"("documento_id", "numero_version");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_entradas" ADD CONSTRAINT "bitacora_entradas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_entradas" ADD CONSTRAINT "bitacora_entradas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_versiones" ADD CONSTRAINT "documento_versiones_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_clientes" ADD CONSTRAINT "documentos_clientes_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_clientes" ADD CONSTRAINT "documentos_clientes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_tareas" ADD CONSTRAINT "comentarios_tareas_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtareas" ADD CONSTRAINT "subtareas_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjuntos_tareas" ADD CONSTRAINT "adjuntos_tareas_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tareas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tareas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

