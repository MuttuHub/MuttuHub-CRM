// Spanish labels + UI badge tone for every CRM/Kanban enum (PRD §4.7).
// Single source of truth: frontend badges and API validation read from here.
// Tone keys: neutro | activo | info | riesgo | exito | alerta | destructivo.

import type {
  EstadoCliente,
  EstadoOportunidad,
  EstadoTarea,
  LineaEstrategica,
  OrigenTarea,
  PrioridadCliente,
  PrioridadTarea,
  RolContacto,
  TipoCliente,
  TipoSoporte,
} from "@prisma/client";
import type { UmbralesSemaforo } from "@/lib/semaforo";

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

// tablero-seguimiento-social (D5, RF-01): línea estratégica del Proyecto,
// lista cerrada. Adelantado desde tasks.md Fase 3a.7 porque el zod schema de
// creación de Proyecto (Fase 2b, T2) ya necesita validar este enum — ver
// Deviations en apply-progress. Fase 3a.7 no debe volver a agregarlo.
export const LINEA_ESTRATEGICA_LABELS: Catalog<LineaEstrategica> = {
  EMPLEABILIDAD: { label: "Empleabilidad", tone: "info" },
  EMPRENDIMIENTO: { label: "Emprendimiento", tone: "activo" },
  PRODUCTIVIDAD: { label: "Productividad", tone: "exito" },
  CULTURAL: { label: "Cultural", tone: "alerta" },
  SOCIAL: { label: "Social", tone: "info" },
  CIVICO_POLITICO: { label: "Cívico-político", tone: "riesgo" },
  METODO_MUTTU: { label: "Método Muttu", tone: "activo" },
  AMBIENTAL: { label: "Ambiental", tone: "exito" },
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

// tablero-seguimiento-social (D10/T5, Fase 3a.7): default de fábrica del
// setting `semaforo_umbrales` — igual patrón que DOC_CATEGORIES: no es el
// valor que lee la comparación (`resolverUmbrales` en semaforo.ts), es el
// valor inicial de la fila cuando `getSetting` no la encuentra. Los números
// mismos son los REALES confirmados por el negocio el 2026-09-18 (D10 en la
// propuesta) — Unit 1's migración ya sembró esta misma fila con
// `confirmado: true`, así que este default NO es un placeholder pendiente.
export const UMBRALES_SEMAFORO_DEFAULT: UmbralesSemaforo = {
  confirmado: true,
  tecnico: { verde: 0.85, rojo: 0.6 },
  financiero: { verde_min: 0.85, verde_max: 1.15, amarillo_min: 0.6, amarillo_max: 1.4 },
};

// tablero-seguimiento-social (RF-04/RF-06, Fase 3b): tipo de soporte de
// proyecto. Deviation menor no listada en tasks.md 3b: sigue el mismo
// patrón `Catalog<T>` + `ENUM_VALUES` que TODO otro enum de este archivo
// (LineaEstrategica incluido), en vez de un `Set` ad-hoc solo para la
// validación de la API — una sola fuente de verdad para label + validación.
export const TIPO_SOPORTE_LABELS: Catalog<TipoSoporte> = {
  VERIFICACION: { label: "Verificación", tone: "info" },
  LEGALIZACION: { label: "Legalización", tone: "activo" },
};

export const ENUM_VALUES = {
  EstadoCliente: Object.keys(ESTADO_CLIENTE_LABELS),
  TipoCliente: Object.keys(TIPO_CLIENTE_LABELS),
  PrioridadCliente: Object.keys(PRIORIDAD_CLIENTE_LABELS),
  PrioridadTarea: Object.keys(PRIORIDAD_TAREA_LABELS),
  RolContacto: Object.keys(ROL_CONTACTO_LABELS),
  EstadoOportunidad: Object.keys(ESTADO_OPORTUNIDAD_LABELS),
  EstadoTarea: Object.keys(ESTADO_TAREA_LABELS),
  OrigenTarea: Object.keys(ORIGEN_TAREA_LABELS),
  LineaEstrategica: Object.keys(LINEA_ESTRATEGICA_LABELS),
  TipoSoporte: Object.keys(TIPO_SOPORTE_LABELS),
} as const;