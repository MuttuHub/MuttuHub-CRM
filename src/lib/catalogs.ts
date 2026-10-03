// Spanish labels + UI badge tone for every CRM/Kanban enum (PRD §4.7).
// Single source of truth: frontend badges and API validation read from here.
// Tone keys: neutro | activo | info | riesgo | exito | alerta | destructivo.

import type {
  EstadoCliente,
  EstadoOportunidad,
  EstadoTarea,
  OrigenTarea,
  PrioridadCliente,
  PrioridadTarea,
  RolContacto,
  TipoCliente,
} from "@prisma/client";

export type UiTone =
  | "neutro"
  | "activo"
  | "info"
  | "riesgo"
  | "exito"
  | "alerta"
  | "destructivo";

export type CatalogEntry = { label: string; tone: UiTone };
export type Catalog<T extends string> = Record<T, CatalogEntry>;

// Roles keep ROLE_LABELS in src/lib/auth/types.ts (existing, don't duplicate).

export const ESTADO_CLIENTE_LABELS: Catalog<EstadoCliente> = {
  PROSPECTO: { label: "Prospecto", tone: "info" },
  EN_ACERCAMIENTO: { label: "En acercamiento", tone: "activo" },
  CLIENTE_ACTIVO: { label: "Cliente activo", tone: "exito" },
  EN_PAUSA: { label: "En pausa", tone: "alerta" },
  STANDBY: { label: "Standby", tone: "neutro" },
  INACTIVO: { label: "Inactivo", tone: "riesgo" },
  CERRADO: { label: "Cerrado", tone: "destructivo" },
};

export const TIPO_CLIENTE_LABELS: Catalog<TipoCliente> = {
  GOBIERNO_LOCAL: { label: "Gobierno local", tone: "info" },
  GOBIERNO_NACIONAL: { label: "Gobierno nacional", tone: "info" },
  COOPERANTE_MULTILATERAL: { label: "Cooperante multilateral", tone: "activo" },
  EMPRESA_PRIVADA: { label: "Empresa privada", tone: "exito" },
  FUNDACION: { label: "Fundación", tone: "activo" },
  ALIADO_ACADEMICO: { label: "Aliado académico", tone: "info" },
  OTRO: { label: "Otro", tone: "neutro" },
};

export const PRIORIDAD_CLIENTE_LABELS: Catalog<PrioridadCliente> = {
  ALTA: { label: "Alta", tone: "riesgo" },
  MEDIA: { label: "Media", tone: "alerta" },
  BAJA: { label: "Baja", tone: "neutro" },
};

export const PRIORIDAD_TAREA_LABELS: Catalog<PrioridadTarea> = {
  ALTA: { label: "Alta", tone: "riesgo" },
  MEDIA: { label: "Media", tone: "alerta" },
  BAJA: { label: "Baja", tone: "neutro" },
};

export const ROL_CONTACTO_LABELS: Catalog<RolContacto> = {
  DECISOR: { label: "Decisor", tone: "activo" },
  TECNICO: { label: "Técnico", tone: "info" },
  INFLUENCIADOR: { label: "Influenciador", tone: "alerta" },
  OTRO: { label: "Otro", tone: "neutro" },
};

export const ESTADO_OPORTUNIDAD_LABELS: Catalog<EstadoOportunidad> = {
  DISENANDO_PROPUESTA: { label: "Diseñando propuesta", tone: "info" },
  PRESENTADA: { label: "Presentada", tone: "activo" },
  EN_REVISION: { label: "En revisión", tone: "alerta" },
  EN_NEGOCIACION: { label: "En negociación", tone: "activo" },
  GANADA: { label: "Ganada", tone: "exito" },
  PERDIDA: { label: "Perdida", tone: "destructivo" },
  STANDBY: { label: "Standby", tone: "neutro" },
};

export const ESTADO_TAREA_LABELS: Catalog<EstadoTarea> = {
  POR_HACER: { label: "Por hacer", tone: "neutro" },
  EN_CURSO: { label: "En curso", tone: "activo" },
  EN_REVISION: { label: "En revisión", tone: "alerta" },
  COMPLETADA: { label: "Completada", tone: "exito" },
  BLOQUEADA: { label: "Bloqueada", tone: "destructivo" },
  EN_ESPERA: { label: "En espera", tone: "info" },
  CANCELADA: { label: "Cancelada", tone: "neutro" },
};

export const ORIGEN_TAREA_LABELS: Catalog<OrigenTarea> = {
  CRM: { label: "CRM", tone: "info" },
  KANBAN: { label: "Kanban", tone: "activo" },
  AMBOS: { label: "Ambos", tone: "neutro" },
};

// Etiquetas de tarea (PRD §5.2). Constantes = default de fábrica; el valor
// LIVE admin-configurable vive en la tabla `settings` (clave task_tags, Hito
// 7 — ver src/lib/settings.ts). Almacenadas en crudo en `Tarea.etiquetas`
// (String[]).
export const TASK_TAGS: readonly string[] = [
  "Comercial",
  "Administrativo",
  "Proyecto",
  "Interno",
];

// Categorías de documentos (PRD §6.2). Constantes = default de fábrica; el
// valor LIVE admin-configurable vive en la tabla `settings` (clave
// `doc_categories`, Hito 7 — ver src/lib/settings.ts). Almacenadas en crudo
// en `Documento.categoria` (String).
export const DOC_CATEGORIES: readonly string[] = [
  "Comercial",
  "Proyectos",
  "Legal",
  "Administrativo-financiero",
  "Institucional",
  "Operativo",
  "Informes",
  "Otro",
];

// Categorías restringidas (default v1): los COLABORADOR no ven ni descargan
// documentos de estas categorías (PRD §6.2 "Permisos por categoría"); los
// roles completos (ADMINISTRADOR/GERENCIA/COORDINADOR) ven todo. El valor
// live (flag `restringida` por categoría) vive en `settings`
// (doc_categories, Hito 7).
export const RESTRICTED_DOC_CATEGORIES: readonly string[] = [
  "Legal",
  "Administrativo-financiero",
];

// Catálogo único de rubros del módulo v2 de proyectos (REQ-CAT-01, codes
// PO-P). Fuente de verdad en TypeScript: la migración adoptiva, el seed, el
// script de importación y la API derivan de esta constante — la lista NUNCA
// se duplica. Los códigos R01..R15 son inmutables (trigger en la base de
// datos) y `orden` fija la secuencia R01..R15. "Material POP" y "Operación
// logística" quedan fuera del catálogo (suspendidos, sin código) en la
// migración adoptiva; no forman parte de RUBROS_V2.
export type RubroV2 = { codigo: string; nombre: string; orden: number };

export const RUBROS_V2: readonly RubroV2[] = [
  { codigo: "R01", nombre: "Personal", orden: 1 },
  { codigo: "R02", nombre: "Consultor", orden: 2 },
  { codigo: "R03", nombre: "Subsidio arriendo", orden: 3 },
  { codigo: "R04", nombre: "Promoción y divulgación", orden: 4 },
  { codigo: "R05", nombre: "Alistamiento", orden: 5 },
  { codigo: "R06", nombre: "Caracterización", orden: 6 },
  { codigo: "R07", nombre: "Acompañamiento", orden: 7 },
  { codigo: "R08", nombre: "Formación", orden: 8 },
  { codigo: "R09", nombre: "Capital semilla", orden: 9 },
  { codigo: "R10", nombre: "Viáticos", orden: 10 },
  { codigo: "R11", nombre: "Varios", orden: 11 },
  { codigo: "R12", nombre: "Transporte", orden: 12 },
  { codigo: "R13", nombre: "Suministros", orden: 13 },
  { codigo: "R14", nombre: "Oficina", orden: 14 },
  { codigo: "R15", nombre: "Dotación", orden: 15 },
];

// Strategic-lines catalog for the v2 projects module (REQ-CAT-03, codes
// LE01..LE08). Single TS source of truth: the migration, the seed and the API
// all derive from this constant — the list is NEVER duplicated in the
// application. LE01..LE08 are immutable (database trigger) and `orden` fixes
// the LE01..LE08 sequence.
//
// There is deliberately NO `LineaEstrategica` enum here: REQ-CAT-03 cited one
// from an earlier branch and that citation is false (this schema declares no
// such enum), so the codes are assigned by this constant instead.
export type LineaEstrategicaV2 = { codigo: string; nombre: string; orden: number };

export const LINEAS_ESTRATEGICAS_V2: readonly LineaEstrategicaV2[] = [
  { codigo: "LE01", nombre: "Empleabilidad", orden: 1 },
  { codigo: "LE02", nombre: "Emprendimiento", orden: 2 },
  { codigo: "LE03", nombre: "Productividad", orden: 3 },
  { codigo: "LE04", nombre: "Cultural", orden: 4 },
  { codigo: "LE05", nombre: "Social", orden: 5 },
  { codigo: "LE06", nombre: "Cívico-político", orden: 6 },
  { codigo: "LE07", nombre: "Método Muttu", orden: 7 },
  { codigo: "LE08", nombre: "Ambiental", orden: 8 },
];

export const ENUM_VALUES = {
  EstadoCliente: Object.keys(ESTADO_CLIENTE_LABELS),
  TipoCliente: Object.keys(TIPO_CLIENTE_LABELS),
  PrioridadCliente: Object.keys(PRIORIDAD_CLIENTE_LABELS),
  PrioridadTarea: Object.keys(PRIORIDAD_TAREA_LABELS),
  RolContacto: Object.keys(ROL_CONTACTO_LABELS),
  EstadoOportunidad: Object.keys(ESTADO_OPORTUNIDAD_LABELS),
  EstadoTarea: Object.keys(ESTADO_TAREA_LABELS),
  OrigenTarea: Object.keys(ORIGEN_TAREA_LABELS),
} as const;