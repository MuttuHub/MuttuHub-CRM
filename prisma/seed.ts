// prisma/seed.ts
//
// Demo/recording data seed for Muttu Hub (CRM + Kanban + Documentos +
// Notificaciones + Administración). Populates every module with realistic,
// FICTIONAL data so a screen recording or live presentation has something to
// show in every screen: every enum value appears at least once, every Kanban
// column has cards, the alert engine has overdue/today/upcoming/terminal
// tasks to prove its filtering rules, and the admin queues (access requests,
// access log) are not empty on first login.
//
// IDEMPOTENT / SAFE TO RE-RUN:
//   - Every non-Usuario row uses a FIXED literal UUID-shaped id (see
//     `fixedId` below) and is written with `upsert({ where: { id } })`, so
//     re-running this script refreshes the same rows instead of duplicating
//     them or requiring a destructive delete of the whole table (which would
//     risk wiping unrelated/real data in a shared dev database).
//   - The 4 demo `Usuario` rows are looked up/created by email (Supabase Auth
//     has no natural "fixed id" you can pre-assign), then upserted by email.
//
// ⚠️  DANGER — DEV/DEMO ONLY, NEVER PRODUCTION ⚠️
//   This script creates Supabase Auth users with a shared, publicly-known
//   password and writes fictional-but-realistic CRM data. Only ever point it
//   at a throwaway dev/demo Supabase project + Postgres database.
//
// Required environment variables (see README "Variables de entorno"):
//   - DATABASE_URL              Postgres connection string (src/lib/db.ts)
//   - NEXT_PUBLIC_SUPABASE_URL  Supabase project URL
//   - SUPABASE_SERVICE_ROLE_KEY Supabase service-role key (admin auth + storage)
//   - SEED_DEMO_PASSWORD        optional — password for the 4 demo logins
//                                (defaults to a clearly-labeled placeholder)
//
// Usage: `npm run db:seed` (wraps `prisma db seed`, wired to
// `tsx prisma/seed.ts` via the "prisma.seed" key in package.json).

import "dotenv/config";
import { db } from "../src/lib/db";
import { DOC_CATEGORIES, RESTRICTED_DOC_CATEGORIES, TASK_TAGS } from "../src/lib/catalogs";
import { ensureDefaultSettings } from "../src/lib/settings";
import { createSupabaseAdmin } from "../src/lib/supabase/admin";
import { documentStoragePath, STORAGE_BUCKET } from "../src/lib/api/files";
import type { RolUsuario } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────
// Fixed-id helpers
// ─────────────────────────────────────────────────────────────────────────

/** 4-hex-digit code per entity type, used as the 4th group of the fixed id. */
const ENTITY_CODE = {
  cliente: "a001",
  contacto: "a002",
  oportunidad: "a003",
  tarea: "a004",
  subtarea: "a005",
  comentario: "a006",
  adjunto: "a007",
  bitacora: "a008",
  documento: "a009",
  version: "a00a",
  acceso: "a00b",
  solicitud: "a00c",
} as const;

type Entity = keyof typeof ENTITY_CODE;

/**
 * Builds a fixed, deterministic, uuid-SHAPED id (8-4-4-4-12 hex groups) for a
 * given entity type + index, e.g. fixedId("cliente", 1) ->
 * "00000000-0000-4000-a001-000000000001". Stable across re-runs so upserts
 * by id never duplicate rows.
 */
function fixedId(entity: Entity, index: number): string {
  return `00000000-0000-4000-${ENTITY_CODE[entity]}-${index.toString(16).padStart(12, "0")}`;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  return daysFromNow(-days);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Usuarios (demo personas, one per RolUsuario)
// ─────────────────────────────────────────────────────────────────────────

const DEMO_EMAIL_DOMAIN = "demo.muttuhub.local";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "MuttuDemo2026!";

type PersonaDef = { key: string; nombre: string; rol: RolUsuario; email: string };

const PERSONAS: PersonaDef[] = [
  { key: "administrador", nombre: "Camila Restrepo", rol: "ADMINISTRADOR", email: `admin@${DEMO_EMAIL_DOMAIN}` },
  { key: "gerencia", nombre: "Mateo Salazar", rol: "GERENCIA", email: `gerencia@${DEMO_EMAIL_DOMAIN}` },
  { key: "coordinador", nombre: "Laura Jiménez", rol: "COORDINADOR", email: `coordinador@${DEMO_EMAIL_DOMAIN}` },
  { key: "colaborador", nombre: "Andrés Torres", rol: "COLABORADOR", email: `colaborador@${DEMO_EMAIL_DOMAIN}` },
];

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

/** Paginates auth.admin.listUsers looking for an exact email match (no getUserByEmail API exists). */
async function findAuthUserByEmail(admin: SupabaseAdmin, email: string) {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

/** Idempotent create/lookup of the Supabase Auth user, then upsert of the app-level Usuario row. */
async function upsertDemoUsuario(admin: SupabaseAdmin, def: PersonaDef) {
  let authUser = await findAuthUserByEmail(admin, def.email);
  let createdAuthUser = false;

  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: def.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error(`No se pudo crear el usuario auth para ${def.email}`);
    }
    authUser = data.user;
    createdAuthUser = true;
    console.log(`  + auth user creado: ${def.email}`);
  } else {
    console.log(`  = auth user existente: ${def.email}`);
  }

  try {
    const usuario = await db.usuario.upsert({
      where: { email: def.email },
      create: { id: authUser.id, email: def.email, nombre: def.nombre, rol: def.rol, activo: true },
      update: { nombre: def.nombre, rol: def.rol, activo: true },
    });
    return usuario;
  } catch (err) {
    // Mirror src/app/api/v1/users/route.ts: roll back the auth user we just
    // created if the Prisma side fails, so we never leave an orphan.
    if (createdAuthUser) {
      await admin.auth.admin.deleteUser(authUser.id).catch(() => {});
    }
    throw err;
  }
}

async function seedUsuarios(admin: SupabaseAdmin) {
  console.log("\n[1/11] Usuarios demo (uno por rol)...");
  const usuarios: Record<string, { id: string; nombre: string; email: string; rol: RolUsuario }> = {};
  for (const def of PERSONAS) {
    const usuario = await upsertDemoUsuario(admin, def);
    usuarios[def.key] = usuario;
  }
  return usuarios;
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Clientes (fictional organizations — never reuse real names)
// ─────────────────────────────────────────────────────────────────────────

type ClienteDef = {
  nombre: string;
  empresa?: string;
  tipo_cliente: string;
  estado: string;
  prioridad: string;
  tamano_org?: string;
  ubicacion: string;
  canal_contacto_inicial: string;
  responsableKey: string;
  resumen_relacion: string;
  riesgos_barreras: string;
  prioridades_identificadas: string;
};

const CLIENTES: ClienteDef[] = [
  {
    nombre: "Alcaldía de Puerto Esperanza",
    tipo_cliente: "GOBIERNO_LOCAL",
    estado: "PROSPECTO",
    prioridad: "ALTA",
    tamano_org: "Mediana (200-500 funcionarios)",
    ubicacion: "Puerto Esperanza, Meta",
    canal_contacto_inicial: "Referido por Gobernación de Sierra Verde",
    responsableKey: "colaborador",
    resumen_relacion:
      "Primer acercamiento en feria de innovación pública; interesados en un diagnóstico de participación ciudadana.",
    riesgos_barreras: "Cambio de administración municipal previsto para el próximo año.",
    prioridades_identificadas: "Fortalecer canales de atención ciudadana antes de fin de año fiscal.",
  },
  {
    nombre: "Gobernación de Sierra Verde",
    tipo_cliente: "GOBIERNO_LOCAL",
    estado: "EN_ACERCAMIENTO",
    prioridad: "MEDIA",
    tamano_org: "Grande (+1000 funcionarios)",
    ubicacion: "Sierra Verde",
    canal_contacto_inicial: "Correo institucional",
    responsableKey: "coordinador",
    resumen_relacion: "Reunión exploratoria sobre modernización de trámites departamentales.",
    riesgos_barreras: "Presupuesto sujeto a aprobación de asamblea departamental.",
    prioridades_identificadas: "Digitalización de trámites de mayor demanda ciudadana.",
  },
  {
    nombre: "Instituto Nacional de Desarrollo Rural",
    tipo_cliente: "GOBIERNO_NACIONAL",
    estado: "CLIENTE_ACTIVO",
    prioridad: "ALTA",
    tamano_org: "Grande (+1000 funcionarios)",
    ubicacion: "Bogotá D.C.",
    canal_contacto_inicial: "Licitación pública",
    responsableKey: "gerencia",
    resumen_relacion: "Contrato marco vigente para acompañamiento técnico a proyectos rurales.",
    riesgos_barreras: "Alta rotación de interventores del contrato.",
    prioridades_identificadas: "Renovación anticipada del contrato marco.",
  },
  {
    nombre: "Agencia de Cooperación Nórdica",
    tipo_cliente: "COOPERANTE_MULTILATERAL",
    estado: "CLIENTE_ACTIVO",
    prioridad: "ALTA",
    tamano_org: "Mediana",
    ubicacion: "Bogotá D.C. (oficina regional)",
    canal_contacto_inicial: "Alianza previa en otro proyecto",
    responsableKey: "administrador",
    resumen_relacion: "Cooperante clave en dos proyectos activos de desarrollo territorial.",
    riesgos_barreras: "Ciclo de aprobación de desembolsos lento (60-90 días).",
    prioridades_identificadas: "Informe de impacto para renovar cooperación 2027.",
  },
  {
    nombre: "Constructora Río Claro S.A.S.",
    tipo_cliente: "EMPRESA_PRIVADA",
    estado: "EN_PAUSA",
    prioridad: "MEDIA",
    tamano_org: "Mediana",
    ubicacion: "Medellín",
    canal_contacto_inicial: "Referido comercial",
    responsableKey: "colaborador",
    resumen_relacion: "Proyecto de responsabilidad social empresarial pausado por reestructuración interna.",
    riesgos_barreras: "Sin presupuesto asignado hasta el próximo trimestre.",
    prioridades_identificadas: "Retomar contacto al cierre del trimestre fiscal.",
  },
  {
    nombre: "Textiles del Caribe S.A.",
    tipo_cliente: "EMPRESA_PRIVADA",
    estado: "STANDBY",
    prioridad: "BAJA",
    tamano_org: "Pequeña",
    ubicacion: "Barranquilla",
    canal_contacto_inicial: "Formulario web",
    responsableKey: "coordinador",
    resumen_relacion: "Interesados en capacitación de equipos, a la espera de definición de presupuesto anual.",
    riesgos_barreras: "Decisión depende de junta directiva sin fecha definida.",
    prioridades_identificadas: "Programa de capacitación en liderazgo para mandos medios.",
  },
  {
    nombre: "Fundación Horizonte Nuevo",
    tipo_cliente: "FUNDACION",
    estado: "CLIENTE_ACTIVO",
    prioridad: "ALTA",
    tamano_org: "Mediana",
    ubicacion: "Cali",
    canal_contacto_inicial: "Evento de sector social",
    responsableKey: "gerencia",
    resumen_relacion: "Aliado activo en programas de primera infancia; reporta trimestralmente a su junta.",
    riesgos_barreras: "Metas de cobertura muy ambiciosas para el presupuesto disponible.",
    prioridades_identificadas: "Entregar informe trimestral de gestión a tiempo para la junta.",
  },
  {
    nombre: "Fundación Semillas de Cambio",
    tipo_cliente: "FUNDACION",
    estado: "INACTIVO",
    prioridad: "BAJA",
    tamano_org: "Pequeña",
    ubicacion: "Pasto",
    canal_contacto_inicial: "Referido académico",
    responsableKey: "administrador",
    resumen_relacion: "Sin actividad desde el cierre del último proyecto financiado.",
    riesgos_barreras: "Sin financiación vigente ni interlocutor activo.",
    prioridades_identificadas: "Reactivar relación si surge nueva convocatoria de financiación.",
  },
  {
    nombre: "Universidad Central del Valle",
    tipo_cliente: "ALIADO_ACADEMICO",
    estado: "CLIENTE_ACTIVO",
    prioridad: "MEDIA",
    tamano_org: "Grande",
    ubicacion: "Cali",
    canal_contacto_inicial: "Convenio interinstitucional previo",
    responsableKey: "colaborador",
    resumen_relacion: "Convenio de investigación aplicada activo, con renovación en trámite.",
    riesgos_barreras: "Firma del representante legal pendiente hace varias semanas.",
    prioridades_identificadas: "Cerrar la renovación del convenio antes del semestre académico.",
  },
  {
    nombre: "Corporación Ambiental Bosque Vivo",
    tipo_cliente: "OTRO",
    estado: "CERRADO",
    prioridad: "BAJA",
    tamano_org: "Pequeña",
    ubicacion: "Manizales",
    canal_contacto_inicial: "Convocatoria pública",
    responsableKey: "coordinador",
    resumen_relacion: "Proyecto de reforestación comunitaria ejecutado y cerrado satisfactoriamente.",
    riesgos_barreras: "Ninguno vigente — relación cerrada.",
    prioridades_identificadas: "Archivar y evaluar oportunidad de nueva fase en el futuro.",
  },
  {
    nombre: "Cooperativa Agroindustrial del Sur",
    tipo_cliente: "EMPRESA_PRIVADA",
    estado: "PROSPECTO",
    prioridad: "MEDIA",
    tamano_org: "Pequeña",
    ubicacion: "Neiva",
    canal_contacto_inicial: "Feria agroindustrial regional",
    responsableKey: "gerencia",
    resumen_relacion: "Primer contacto en feria regional; interesados en fortalecimiento organizacional.",
    riesgos_barreras: "Sin punto de contacto único definido todavía.",
    prioridades_identificadas: "Agendar diagnóstico organizacional inicial.",
  },
  {
    nombre: "Fondo Multilateral para la Niñez",
    tipo_cliente: "COOPERANTE_MULTILATERAL",
    estado: "EN_ACERCAMIENTO",
    prioridad: "ALTA",
    tamano_org: "Grande",
    ubicacion: "Bogotá D.C.",
    canal_contacto_inicial: "Invitación a convocatoria cerrada",
    responsableKey: "administrador",
    resumen_relacion: "En conversaciones para una nueva línea de financiación, alcance aún en discusión.",
    riesgos_barreras: "Cambio de alcance solicitado a mitad de la negociación.",
    prioridades_identificadas: "Definir alcance final antes de la próxima convocatoria interna del fondo.",
  },
];

async function seedClientes(usuarios: Record<string, { id: string }>) {
  console.log("\n[2/11] Clientes...");
  const ids: string[] = [];
  for (let i = 0; i < CLIENTES.length; i++) {
    const def = CLIENTES[i];
    const id = fixedId("cliente", i + 1);
    ids.push(id);
    await db.cliente.upsert({
      where: { id },
      create: {
        id,
        nombre: def.nombre,
        tipo_cliente: def.tipo_cliente as never,
        estado: def.estado as never,
        prioridad: def.prioridad as never,
        tamano_org: def.tamano_org,
        ubicacion: def.ubicacion,
        canal_contacto_inicial: def.canal_contacto_inicial,
        fecha_primer_contacto: daysAgo(120 - i * 5),
        responsable_id: usuarios[def.responsableKey].id,
        resumen_relacion: def.resumen_relacion,
        riesgos_barreras: def.riesgos_barreras,
        prioridades_identificadas: def.prioridades_identificadas,
      },
      update: {
        nombre: def.nombre,
        tipo_cliente: def.tipo_cliente as never,
        estado: def.estado as never,
        prioridad: def.prioridad as never,
        tamano_org: def.tamano_org,
        ubicacion: def.ubicacion,
        canal_contacto_inicial: def.canal_contacto_inicial,
        responsable_id: usuarios[def.responsableKey].id,
        resumen_relacion: def.resumen_relacion,
        riesgos_barreras: def.riesgos_barreras,
        prioridades_identificadas: def.prioridades_identificadas,
      },
    });
  }
  console.log(`  ${CLIENTES.length} clientes upserted (cubren los 7 EstadoCliente).`);
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Contactos (2 per cliente, cycling through every RolContacto)
// ─────────────────────────────────────────────────────────────────────────

const ROLES_CONTACTO = ["DECISOR", "TECNICO", "INFLUENCIADOR", "OTRO"] as const;

async function seedContactos(clienteIds: string[]) {
  console.log("\n[3/11] Contactos (2 por cliente, todos los RolContacto)...");
  let count = 0;
  let seq = 0;
  for (const clienteId of clienteIds) {
    for (let n = 0; n < 2; n++) {
      seq += 1;
      const rol = ROLES_CONTACTO[seq % ROLES_CONTACTO.length];
      const id = fixedId("contacto", seq);
      await db.contacto.upsert({
        where: { id },
        create: {
          id,
          cliente_id: clienteId,
          nombre: `Contacto ${seq} — ${rol}`,
          cargo: rol === "DECISOR" ? "Director(a)" : rol === "TECNICO" ? "Coordinador(a) técnico(a)" : "Enlace institucional",
          correo: `contacto${seq}@ejemplo-demo.org`,
          telefono: `+57 300 000 ${String(1000 + seq).slice(-4)}`,
          rol_decision: rol as never,
          notas: "Contacto de ejemplo generado por el seed de demo.",
        },
        update: {
          rol_decision: rol as never,
        },
      });
      count += 1;
    }
  }
  console.log(`  ${count} contactos upserted.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Oportunidades (every EstadoOportunidad at least once)
// ─────────────────────────────────────────────────────────────────────────

type OportunidadDef = {
  clienteIndex: number; // 1-based, matches CLIENTES order
  nombre: string;
  estado: string;
  valor: number;
};

const OPORTUNIDADES: OportunidadDef[] = [
  { clienteIndex: 1, nombre: "Diagnóstico de participación ciudadana", estado: "DISENANDO_PROPUESTA", valor: 45_000_000 },
  { clienteIndex: 2, nombre: "Modernización de trámites departamentales", estado: "PRESENTADA", valor: 120_000_000 },
  { clienteIndex: 3, nombre: "Renovación contrato marco 2027", estado: "EN_NEGOCIACION", valor: 260_000_000 },
  { clienteIndex: 4, nombre: "Informe de impacto — cooperación 2027", estado: "GANADA", valor: 80_000_000 },
  { clienteIndex: 5, nombre: "Programa de RSE — fase 2", estado: "PERDIDA", valor: 35_000_000 },
  { clienteIndex: 6, nombre: "Capacitación en liderazgo — mandos medios", estado: "STANDBY", valor: 15_000_000 },
  { clienteIndex: 7, nombre: "Informe trimestral de gestión Q3", estado: "EN_REVISION", valor: 95_000_000 },
  { clienteIndex: 8, nombre: "Segunda fase de financiación", estado: "PERDIDA", valor: 60_000_000 },
  { clienteIndex: 9, nombre: "Renovación convenio de investigación aplicada", estado: "GANADA", valor: 180_000_000 },
  { clienteIndex: 10, nombre: "Diagnóstico organizacional inicial", estado: "DISENANDO_PROPUESTA", valor: 22_000_000 },
];

async function seedOportunidades(clienteIds: string[]) {
  console.log("\n[4/11] Oportunidades (todas las EstadoOportunidad)...");
  for (let i = 0; i < OPORTUNIDADES.length; i++) {
    const def = OPORTUNIDADES[i];
    const id = fixedId("oportunidad", i + 1);
    await db.oportunidad.upsert({
      where: { id },
      create: {
        id,
        cliente_id: clienteIds[def.clienteIndex - 1],
        nombre: def.nombre,
        problema_detectado: "Necesidad identificada durante el primer acercamiento comercial.",
        solucion_propuesta: "Acompañamiento técnico y metodológico a la medida.",
        servicios_interes: "Consultoría, formación, acompañamiento en implementación.",
        valor_estimado_cop: def.valor,
        estado: def.estado as never,
        fecha_ultima_gestion: daysAgo(i + 1),
      },
      update: {
        estado: def.estado as never,
        valor_estimado_cop: def.valor,
        fecha_ultima_gestion: daysAgo(i + 1),
      },
    });
  }
  console.log(`  ${OPORTUNIDADES.length} oportunidades upserted.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Tareas (every EstadoTarea / OrigenTarea / PrioridadTarea, spread
// of fecha_entrega for the alert engine, cliente-linked + pure Kanban)
// ─────────────────────────────────────────────────────────────────────────

type TareaDef = {
  titulo: string;
  descripcion: string;
  clienteIndex: number | null; // 1-based CLIENTES index, or null for pure Kanban
  responsableKey: string;
  estado: string;
  origen: string;
  prioridad: string;
  etiquetas: string[];
  fechaEntrega: Date | null;
  motivoBloqueo?: string;
};

const T = TASK_TAGS; // ["Comercial", "Administrativo", "Proyecto", "Interno"]

const TAREAS: TareaDef[] = [
  { titulo: "Preparar propuesta técnica", descripcion: "Redactar propuesta para Puerto Esperanza.", clienteIndex: 1, responsableKey: "colaborador", estado: "POR_HACER", origen: "CRM", prioridad: "ALTA", etiquetas: [T[0]], fechaEntrega: daysFromNow(2) },
  { titulo: "Enviar cotización actualizada", descripcion: "Cotización revisada para Sierra Verde.", clienteIndex: 2, responsableKey: "coordinador", estado: "POR_HACER", origen: "KANBAN", prioridad: "MEDIA", etiquetas: [T[0], T[2]], fechaEntrega: daysFromNow(0) },
  { titulo: "Revisar contrato marco", descripcion: "Revisión legal del contrato marco vigente.", clienteIndex: 3, responsableKey: "gerencia", estado: "EN_CURSO", origen: "AMBOS", prioridad: "ALTA", etiquetas: [T[1]], fechaEntrega: daysAgo(1) },
  { titulo: "Actualizar base de datos de contactos", descripcion: "Depurar contactos duplicados en el CRM.", clienteIndex: null, responsableKey: "colaborador", estado: "EN_CURSO", origen: "KANBAN", prioridad: "BAJA", etiquetas: [T[3]], fechaEntrega: null },
  { titulo: "Diseñar landing page institucional", descripcion: "Wireframes de la nueva página institucional.", clienteIndex: null, responsableKey: "coordinador", estado: "EN_CURSO", origen: "KANBAN", prioridad: "MEDIA", etiquetas: [T[2]], fechaEntrega: daysFromNow(3) },
  { titulo: "Validar entregable con equipo técnico", descripcion: "Revisión conjunta del entregable de Horizonte Nuevo.", clienteIndex: 7, responsableKey: "gerencia", estado: "EN_REVISION", origen: "CRM", prioridad: "ALTA", etiquetas: [T[2]], fechaEntrega: daysFromNow(0) },
  { titulo: "Revisar informe financiero trimestral", descripcion: "Revisión de cifras antes de enviar al cooperante.", clienteIndex: 4, responsableKey: "administrador", estado: "EN_REVISION", origen: "AMBOS", prioridad: "MEDIA", etiquetas: [T[1]], fechaEntrega: daysFromNow(1) },
  { titulo: "Migrar documentos al nuevo repositorio", descripcion: "Migrar archivos sueltos al Repositorio de Documentos.", clienteIndex: null, responsableKey: "colaborador", estado: "EN_REVISION", origen: "KANBAN", prioridad: "BAJA", etiquetas: [T[3]], fechaEntrega: daysAgo(3) },
  { titulo: "Firmar acta de cierre", descripcion: "Acta de cierre del proyecto de reforestación.", clienteIndex: 10, responsableKey: "coordinador", estado: "COMPLETADA", origen: "CRM", prioridad: "MEDIA", etiquetas: [T[1]], fechaEntrega: daysAgo(5) },
  { titulo: "Entregar informe final de auditoría", descripcion: "Informe final entregado a Semillas de Cambio.", clienteIndex: 8, responsableKey: "administrador", estado: "COMPLETADA", origen: "AMBOS", prioridad: "ALTA", etiquetas: [T[0]], fechaEntrega: daysAgo(1) },
  { titulo: "Publicar reporte de impacto", descripcion: "Publicación interna del reporte anual de impacto.", clienteIndex: null, responsableKey: "gerencia", estado: "COMPLETADA", origen: "KANBAN", prioridad: "BAJA", etiquetas: [T[2]], fechaEntrega: null },
  { titulo: "Gestionar permisos con curaduría", descripcion: "Trámite de permisos para obra de Río Claro.", clienteIndex: 5, responsableKey: "colaborador", estado: "BLOQUEADA", origen: "CRM", prioridad: "ALTA", etiquetas: [T[2]], fechaEntrega: daysFromNow(2), motivoBloqueo: "A la espera de la aprobación de la curaduría urbana." },
  { titulo: "Renovar convenio interinstitucional", descripcion: "Renovación del convenio con la Universidad Central del Valle.", clienteIndex: 9, responsableKey: "coordinador", estado: "BLOQUEADA", origen: "AMBOS", prioridad: "MEDIA", etiquetas: [T[1]], fechaEntrega: daysAgo(4), motivoBloqueo: "Pendiente firma del representante legal." },
  { titulo: "Esperar aprobación de presupuesto", descripcion: "A la espera de aprobación de junta directiva.", clienteIndex: 6, responsableKey: "administrador", estado: "EN_ESPERA", origen: "CRM", prioridad: "BAJA", etiquetas: [T[0]], fechaEntrega: daysFromNow(1) },
  { titulo: "Depurar backlog de tareas antiguas", descripcion: "Revisar y archivar tareas internas obsoletas.", clienteIndex: null, responsableKey: "colaborador", estado: "EN_ESPERA", origen: "KANBAN", prioridad: "MEDIA", etiquetas: [T[3]], fechaEntrega: null },
  { titulo: "Actividad cancelada por cambio de alcance", descripcion: "Cancelada tras redefinir el alcance con el fondo.", clienteIndex: 12, responsableKey: "gerencia", estado: "CANCELADA", origen: "CRM", prioridad: "MEDIA", etiquetas: [T[2]], fechaEntrega: daysAgo(3) },
  { titulo: "Preparar taller de inducción", descripcion: "Taller de inducción para nuevos colaboradores.", clienteIndex: null, responsableKey: "coordinador", estado: "POR_HACER", origen: "KANBAN", prioridad: "MEDIA", etiquetas: [T[3]], fechaEntrega: daysFromNow(3) },
  { titulo: "Consolidar bitácora mensual", descripcion: "Consolidar bitácoras de la Cooperativa Agroindustrial.", clienteIndex: 11, responsableKey: "administrador", estado: "POR_HACER", origen: "CRM", prioridad: "BAJA", etiquetas: [T[1]], fechaEntrega: daysFromNow(0) },
  { titulo: "Actualizar tablero de indicadores", descripcion: "Refrescar indicadores del tablero interno.", clienteIndex: null, responsableKey: "colaborador", estado: "EN_CURSO", origen: "KANBAN", prioridad: "ALTA", etiquetas: [T[2], T[3]], fechaEntrega: daysFromNow(2) },
  { titulo: "Seguimiento post-implementación", descripcion: "Seguimiento cerrado con Puerto Esperanza.", clienteIndex: 1, responsableKey: "gerencia", estado: "COMPLETADA", origen: "AMBOS", prioridad: "MEDIA", etiquetas: [T[2]], fechaEntrega: daysAgo(5) },
];

async function seedTareas(clienteIds: string[], usuarios: Record<string, { id: string }>) {
  console.log("\n[5/11] Tareas (todas las EstadoTarea/OrigenTarea/PrioridadTarea, alertas)...");
  const ids: string[] = [];
  for (let i = 0; i < TAREAS.length; i++) {
    const def = TAREAS[i];
    const id = fixedId("tarea", i + 1);
    ids.push(id);
    const clienteId = def.clienteIndex ? clienteIds[def.clienteIndex - 1] : null;
    await db.tarea.upsert({
      where: { id },
      create: {
        id,
        titulo: def.titulo,
        descripcion: def.descripcion,
        responsable_id: usuarios[def.responsableKey].id,
        cliente_id: clienteId,
        estado: def.estado as never,
        origen: def.origen as never,
        prioridad: def.prioridad as never,
        fecha_entrega: def.fechaEntrega,
        etiquetas: def.etiquetas,
        motivo_bloqueo: def.motivoBloqueo ?? null,
      },
      update: {
        titulo: def.titulo,
        descripcion: def.descripcion,
        responsable_id: usuarios[def.responsableKey].id,
        cliente_id: clienteId,
        estado: def.estado as never,
        origen: def.origen as never,
        prioridad: def.prioridad as never,
        fecha_entrega: def.fechaEntrega,
        etiquetas: def.etiquetas,
        motivo_bloqueo: def.motivoBloqueo ?? null,
      },
    });
  }
  console.log(`  ${TAREAS.length} tareas upserted (7 estados x 3 orígenes x 3 prioridades cubiertos).`);
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Subtareas + ComentarioTarea (on a handful of tareas)
// ─────────────────────────────────────────────────────────────────────────

async function seedSubtareasYComentarios(tareaIds: string[], usuarios: Record<string, { id: string }>) {
  console.log("\n[6/11] Subtareas y comentarios...");

  // tareaIds is 1-based via TAREAS order: pick indices 1, 3, 6, 12, 19 (1-based).
  const subtareaDefs: { tareaIndex: number; titulos: { titulo: string; completada: boolean }[] }[] = [
    { tareaIndex: 1, titulos: [
      { titulo: "Levantar antecedentes del municipio", completada: true },
      { titulo: "Redactar alcance y cronograma", completada: false },
      { titulo: "Revisar presupuesto con finanzas", completada: false },
    ] },
    { tareaIndex: 3, titulos: [
      { titulo: "Revisar cláusulas de confidencialidad", completada: true },
      { titulo: "Consultar con jurídica", completada: false },
    ] },
    { tareaIndex: 6, titulos: [
      { titulo: "Compilar hallazgos del equipo técnico", completada: true },
      { titulo: "Ajustar redacción ejecutiva", completada: true },
      { titulo: "Enviar a revisión de gerencia", completada: false },
    ] },
    { tareaIndex: 12, titulos: [
      { titulo: "Radicar solicitud ante curaduría", completada: true },
      { titulo: "Hacer seguimiento telefónico", completada: false },
    ] },
    { tareaIndex: 19, titulos: [
      { titulo: "Actualizar indicador de pipeline", completada: true },
      { titulo: "Actualizar indicador de tareas vencidas", completada: false },
      { titulo: "Publicar captura en el canal interno", completada: false },
      { titulo: "Notificar a coordinación", completada: false },
    ] },
  ];

  let subtareaCount = 0;
  for (const { tareaIndex, titulos } of subtareaDefs) {
    const tareaId = tareaIds[tareaIndex - 1];
    for (let n = 0; n < titulos.length; n++) {
      subtareaCount += 1;
      const id = fixedId("subtarea", subtareaCount);
      await db.subtarea.upsert({
        where: { id },
        create: { id, tarea_id: tareaId, titulo: titulos[n].titulo, completada: titulos[n].completada },
        update: { titulo: titulos[n].titulo, completada: titulos[n].completada },
      });
    }
  }
  console.log(`  ${subtareaCount} subtareas upserted.`);

  const comentarioDefs: { tareaIndex: number; comentarios: { autorKey: string; texto: string }[] }[] = [
    { tareaIndex: 1, comentarios: [
      { autorKey: "colaborador", texto: "Agendé llamada con el enlace de la alcaldía para el jueves." },
      { autorKey: "coordinador", texto: "Perfecto, avísame si necesitas apoyo con el presupuesto." },
    ] },
    { tareaIndex: 3, comentarios: [
      { autorKey: "gerencia", texto: "Jurídica ya tiene el borrador, quedamos pendientes de su respuesta." },
    ] },
    { tareaIndex: 6, comentarios: [
      { autorKey: "gerencia", texto: "El equipo técnico entregó sus hallazgos, iniciamos consolidación." },
      { autorKey: "administrador", texto: "Recuerden incluir el resumen ejecutivo en la primera página." },
      { autorKey: "coordinador", texto: "Quedo atento a la versión final para revisión." },
    ] },
    { tareaIndex: 9, comentarios: [
      { autorKey: "coordinador", texto: "Acta firmada y archivada en el repositorio." },
    ] },
    { tareaIndex: 12, comentarios: [
      { autorKey: "colaborador", texto: "La curaduría indicó que el trámite puede tardar hasta 15 días hábiles." },
      { autorKey: "gerencia", texto: "Anotado, mantengamos informado al cliente sobre el tiempo estimado." },
    ] },
  ];

  let comentarioCount = 0;
  for (const { tareaIndex, comentarios } of comentarioDefs) {
    const tareaId = tareaIds[tareaIndex - 1];
    for (const c of comentarios) {
      comentarioCount += 1;
      const id = fixedId("comentario", comentarioCount);
      await db.comentarioTarea.upsert({
        where: { id },
        create: { id, tarea_id: tareaId, autor_id: usuarios[c.autorKey].id, texto: c.texto },
        update: { texto: c.texto },
      });
    }
  }
  console.log(`  ${comentarioCount} comentarios upserted.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: minimal real-file generation (uploaded to Supabase Storage so
// downloads/zip actually work live in the demo)
// ─────────────────────────────────────────────────────────────────────────

/** Escapes the chars that need escaping inside a PDF literal string. */
function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Builds a tiny, byte-valid single-page PDF with a title line — real enough to open. */
function buildDemoPdf(title: string, subtitle: string): Buffer {
  const content = [
    "BT",
    "/F1 18 Tf",
    "72 720 Td",
    `(${escapePdfText(title)}) Tj`,
    "0 -28 Td",
    "/F1 11 Tf",
    `(${escapePdfText(subtitle)}) Tj`,
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(body + xref + trailer, "latin1");
}

/** Best-effort upload: logs and continues on failure (e.g. no Supabase reachable here). */
async function uploadDemoFile(admin: SupabaseAdmin, path: string, buffer: Buffer, contentType: string) {
  try {
    const { error } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType, upsert: true });
    if (error) {
      console.warn(`  ! upload falló para ${path}: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`  ! upload falló para ${path}:`, err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Section: AdjuntoTarea (1-2 tareas get a real uploaded attachment)
// ─────────────────────────────────────────────────────────────────────────

async function seedAdjuntos(admin: SupabaseAdmin, tareaIds: string[]) {
  console.log("\n[7/11] Adjuntos de tareas (subida real a Storage)...");
  // tareaIds is 1-based via TAREAS order: task 3 ("Revisar contrato marco")
  // and task 12 ("Gestionar permisos con curaduría").
  const defs = [
    { tareaIndex: 3, nombre: "borrador-contrato-marco.pdf", titulo: "Borrador contrato marco", subtitulo: "Instituto Nacional de Desarrollo Rural" },
    { tareaIndex: 12, nombre: "solicitud-curaduria.pdf", titulo: "Solicitud radicada ante curaduría", subtitulo: "Constructora Río Claro S.A.S." },
  ];

  let count = 0;
  for (const def of defs) {
    count += 1;
    const id = fixedId("adjunto", count);
    const tareaId = tareaIds[def.tareaIndex - 1];
    // Deterministic path (reuses the fixed adjunto id instead of a fresh
    // randomUUID) so re-running the seed overwrites the same storage object
    // instead of leaving orphans, following the app's own
    // `tareas/{tarea_id}/{uuid}_{nombre}` convention (src/app/api/v1/tasks/[id]/attachments/route.ts).
    const storagePath = `tareas/${tareaId}/${id}_${def.nombre}`;
    const buffer = buildDemoPdf(def.titulo, def.subtitulo);
    await uploadDemoFile(admin, storagePath, buffer, "application/pdf");

    await db.adjuntoTarea.upsert({
      where: { id },
      create: { id, tarea_id: tareaId, storage_path: storagePath, nombre: def.nombre, tamano_bytes: buffer.byteLength },
      update: { storage_path: storagePath, nombre: def.nombre, tamano_bytes: buffer.byteLength },
    });
  }
  console.log(`  ${count} adjuntos upserted (con archivo real en el bucket "${STORAGE_BUCKET}").`);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: BitacoraEntrada (2 per cliente, rotating authors)
// ─────────────────────────────────────────────────────────────────────────

const BITACORA_AUTORES = ["administrador", "gerencia", "coordinador", "colaborador"];

async function seedBitacora(clienteIds: string[], usuarios: Record<string, { id: string }>) {
  console.log("\n[8/11] Bitácora de relacionamiento (2 por cliente)...");
  let seq = 0;
  for (let c = 0; c < clienteIds.length; c++) {
    const clienteId = clienteIds[c];
    const nombreCliente = CLIENTES[c].nombre;
    const textos = [
      `Reunión de seguimiento con ${nombreCliente}: se revisaron avances y próximos pasos acordados.`,
      `Llamada de actualización con ${nombreCliente}: se identificaron nuevas prioridades para el próximo trimestre.`,
    ];
    for (let n = 0; n < textos.length; n++) {
      seq += 1;
      const id = fixedId("bitacora", seq);
      const autorKey = BITACORA_AUTORES[seq % BITACORA_AUTORES.length];
      await db.bitacoraEntrada.upsert({
        where: { id },
        create: { id, cliente_id: clienteId, autor_id: usuarios[autorKey].id, texto: textos[n] },
        update: { texto: textos[n] },
      });
    }
  }
  console.log(`  ${seq} entradas de bitácora upserted.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Documento + DocumentoVersion + DocumentoCliente
// ─────────────────────────────────────────────────────────────────────────

const DOCUMENT_TITLES: Record<string, string> = {
  Comercial: "Brochure institucional 2026",
  Proyectos: "Propuesta técnica Puerto Esperanza",
  Legal: "Contrato marco de confidencialidad",
  "Administrativo-financiero": "Estados financieros 2025",
  Institucional: "Manual de identidad corporativa",
  Operativo: "Procedimiento de onboarding de clientes",
  Informes: "Informe trimestral de gestión",
  Otro: "Plantilla de documentos varios",
};

// Category -> 1-based CLIENTES index to link via DocumentoCliente (a few only).
const DOCUMENT_CLIENT_LINK: Record<string, number> = {
  Proyectos: 1, // Alcaldía de Puerto Esperanza
  Legal: 3, // Instituto Nacional de Desarrollo Rural
  Informes: 7, // Fundación Horizonte Nuevo
};

async function seedDocumentos(admin: SupabaseAdmin, usuarios: Record<string, { id: string }>, clienteIds: string[]) {
  console.log("\n[9/11] Documentos + versiones (todas las DOC_CATEGORIES, incluida una restringida)...");

  let restrictedSeen = false;
  for (let i = 0; i < DOC_CATEGORIES.length; i++) {
    const categoria = DOC_CATEGORIES[i];
    const titulo = DOCUMENT_TITLES[categoria] ?? `Documento de ejemplo — ${categoria}`;
    const isRestricted = RESTRICTED_DOC_CATEGORIES.includes(categoria);
    restrictedSeen = restrictedSeen || isRestricted;

    const documentoId = fixedId("documento", i + 1);
    const clienteIndex = DOCUMENT_CLIENT_LINK[categoria];
    const clienteId = clienteIndex ? clienteIds[clienteIndex - 1] : null;

    await db.documento.upsert({
      where: { id: documentoId },
      create: { id: documentoId, titulo, categoria, etiquetas: [categoria], autor_id: usuarios.administrador.id },
      update: { titulo, categoria, etiquetas: [categoria] },
    });

    if (clienteId) {
      await db.documentoCliente.upsert({
        where: { documento_id_cliente_id: { documento_id: documentoId, cliente_id: clienteId } },
        create: { documento_id: documentoId, cliente_id: clienteId },
        update: {},
      });
    }

    // "Informes" gets 2 versions to demo the version history in the UI.
    const versionCount = categoria === "Informes" ? 2 : 1;
    for (let v = 1; v <= versionCount; v++) {
      const nombreArchivo = `${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-v${v}.pdf`;
      const storagePath = documentStoragePath(clienteId, documentoId, v, nombreArchivo);
      const buffer = buildDemoPdf(`${titulo} (v${v})`, `Categoría: ${categoria}${isRestricted ? " — restringida" : ""}`);
      await uploadDemoFile(admin, storagePath, buffer, "application/pdf");

      const versionId = fixedId("version", i * 10 + v);
      await db.documentoVersion.upsert({
        where: { id: versionId },
        create: {
          id: versionId,
          documento_id: documentoId,
          numero_version: v,
          storage_path: storagePath,
          tamano_bytes: buffer.byteLength,
          tipo_archivo: "application/pdf",
          subido_por_id: usuarios.administrador.id,
        },
        update: {
          storage_path: storagePath,
          tamano_bytes: buffer.byteLength,
        },
      });
    }
  }

  console.log(`  ${DOC_CATEGORIES.length} documentos upserted, categoría restringida incluida: ${restrictedSeen}.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: SolicitudAcceso (1 PENDIENTE, 1 APROBADA, 1 RECHAZADA)
// ─────────────────────────────────────────────────────────────────────────

async function seedSolicitudesAcceso(usuarios: Record<string, { id: string }>) {
  console.log("\n[10/11] Solicitudes de acceso...");

  const solicitudes = [
    {
      index: 1,
      nombre: "Valentina Ortiz",
      email: "valentina.ortiz@ejemplo-demo.org",
      cargo: "Analista de proyectos",
      estado: "PENDIENTE",
      revisado_por: null as string | null,
      revisado_at: null as Date | null,
    },
    {
      index: 2,
      nombre: "Julián Méndez",
      email: "julian.mendez@ejemplo-demo.org",
      cargo: "Coordinador de campo",
      estado: "APROBADA",
      revisado_por: usuarios.administrador.id,
      revisado_at: daysAgo(10),
    },
    {
      index: 3,
      nombre: "Camilo Rincón",
      email: "camilo.rincon@ejemplo-demo.org",
      cargo: "Consultor externo",
      estado: "RECHAZADA",
      revisado_por: usuarios.administrador.id,
      revisado_at: daysAgo(15),
    },
  ];

  for (const s of solicitudes) {
    const id = fixedId("solicitud", s.index);
    await db.solicitudAcceso.upsert({
      where: { id },
      create: {
        id,
        nombre: s.nombre,
        email: s.email,
        cargo: s.cargo,
        origen: "form",
        estado: s.estado,
        revisado_por: s.revisado_por,
        revisado_at: s.revisado_at,
        created_at: daysAgo(s.index === 1 ? 1 : 20),
      },
      update: {
        estado: s.estado,
        revisado_por: s.revisado_por,
        revisado_at: s.revisado_at,
      },
    });
  }
  console.log(`  ${solicitudes.length} solicitudes de acceso upserted (1 pendiente, 1 aprobada, 1 rechazada).`);
}

// ─────────────────────────────────────────────────────────────────────────
// Section: Acceso (historical login-log rows so the admin table isn't empty)
// ─────────────────────────────────────────────────────────────────────────

async function seedAccesos(usuarios: Record<string, { id: string }>) {
  console.log("\n[11/11] Log de accesos históricos...");
  const fakeAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15",
  ];
  const fakeIps = ["190.60.10.21", "186.84.201.5"];

  let seq = 0;
  for (const persona of PERSONAS) {
    for (let n = 0; n < 2; n++) {
      seq += 1;
      const id = fixedId("acceso", seq);
      await db.acceso.upsert({
        where: { id },
        create: {
          id,
          usuario_id: usuarios[persona.key].id,
          created_at: daysAgo(3 + n * 4),
          ip: fakeIps[seq % fakeIps.length],
          user_agent: fakeAgents[seq % fakeAgents.length],
        },
        update: {},
      });
    }
  }
  console.log(`  ${seq} accesos históricos upserted.`);
}

// ─────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.warn(
    "\n" +
      "⚠️  ⚠️  ⚠️  ATENCIÓN — SEED DE DEMO ⚠️  ⚠️  ⚠️\n" +
      `Este script crea usuarios reales en Supabase Auth con la contraseña compartida "${DEMO_PASSWORD}".\n` +
      "Esta contraseña es SOLO para un proyecto Supabase de desarrollo/demo y NUNCA debe reutilizarse\n" +
      "en un entorno real ni para una cuenta real. No apuntes este script a producción.\n",
  );

  console.log("Muttu Hub — seed de datos demo/grabación\n=========================================");

  const admin = createSupabaseAdmin();

  const usuarios = await seedUsuarios(admin);
  const clienteIds = await seedClientes(usuarios);
  await seedContactos(clienteIds);
  await seedOportunidades(clienteIds);
  const tareaIds = await seedTareas(clienteIds, usuarios);
  await seedSubtareasYComentarios(tareaIds, usuarios);
  await seedAdjuntos(admin, tareaIds);
  await seedBitacora(clienteIds, usuarios);
  await seedDocumentos(admin, usuarios, clienteIds);
  await seedSolicitudesAcceso(usuarios);
  await seedAccesos(usuarios);

  console.log("\n[settings] Catálogos por defecto (task_tags, doc_categories)...");
  await ensureDefaultSettings();

  console.log(
    "\n=========================================\n" +
      "Seed completado.\n\n" +
      "Resumen:\n" +
      `  - Usuarios demo: ${PERSONAS.length}\n` +
      `  - Clientes: ${CLIENTES.length}\n` +
      `  - Oportunidades: ${OPORTUNIDADES.length}\n` +
      `  - Tareas: ${TAREAS.length}\n` +
      `  - Documentos: ${DOC_CATEGORIES.length}\n\n` +
      "Credenciales demo (NUNCA reutilizar fuera de este proyecto de desarrollo):\n" +
      PERSONAS.map((p) => `  - ${p.rol.padEnd(14)} ${p.email}  /  ${DEMO_PASSWORD}`).join("\n") +
      "\n",
  );
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err) => {
    console.error("\n❌ El seed falló:\n", err);
    await db.$disconnect();
    process.exit(1);
  });
