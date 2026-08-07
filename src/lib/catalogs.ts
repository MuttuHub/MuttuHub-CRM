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

// Etiquetas de tarea (PRD §5.2). Catálogo admin-configurable que llega con el
// hito de admin-settings; por ahora la canonical set, almacenada en crudo en
// `Tarea.etiquetas` (String[]).
export const TASK_TAGS: readonly string[] = [
  "Comercial",
  "Administrativo",
  "Proyecto",
  "Interno",
];

// Categorías de documentos (PRD §6.2). Constantes v1 del Repositorio: el
// catálogo admin-configurable llega con el hito de admin-settings, como los
// TASK_TAGS. Almacenadas en crudo en `Documento.categoria` (String).
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

// Categorías restringidas (v1): los COLABORADOR no ven ni descargan
// documentos de estas categorías (PRD §6.2 "Permisos por categoría"); los
// roles completos (ADMINISTRADOR/GERENCIA/COORDINADOR) ven todo. Ajustable en
// este arreglo; el catálogo admin-configurable llega con el hito de
// admin-settings.
export const RESTRICTED_DOC_CATEGORIES: readonly string[] = [
  "Legal",
  "Administrativo-financiero",
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