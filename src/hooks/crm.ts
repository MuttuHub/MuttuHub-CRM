// TanStack Query data layer for the CRM module (Hito 2).
// DTOs mirror the server response shapes from src/app/api/v1 (clients,
// contacts, opportunities, tasks, log, catalogs/users). Mutation hooks handle
// error toasts centrally: any server envelope (PRD §8.2) surfaces as a
// Spanish sonner toast and is re-thrown so callers can branch if needed.

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  ApiError,
  type ApiVoid,
} from "@/lib/api/http";
import type {
  EstadoCliente,
  EstadoOportunidad,
  EstadoTarea,
  FaseOportunidad,
  OrigenTarea,
  PrioridadCliente,
  PrioridadTarea,
  RolContacto,
  TipoCliente,
  TipoInteraccion,
} from "@prisma/client";
import { taskQueryKeys } from "@/hooks/kanban";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

export type NextCompromiso = {
  id: string;
  titulo: string;
  fecha_entrega: string | null;
};

export type ClientListRow = {
  id: string;
  nombre: string;
  empresa: string | null;
  tipo_cliente: TipoCliente;
  estado: EstadoCliente;
  prioridad: PrioridadCliente | null;
  ubicacion: string | null;
  responsable_id: string;
  responsable_nombre: string;
  valor_potencial: number;
  compromisos_abiertos: number;
  next_compromiso: NextCompromiso | null;
  updated_at: string;
  /**
   * PR 2 (Slice A) + PR 4 (Slice B2): server-authoritative write flag.
   * `false` ⇒ the current user would get 403 on PATCH/DELETE. The UI hides
   * destructive controls and disables edit fields on this signal. Server is
   * the authority — a spoofed `true` in a request body is ignored.
   */
  puede_editar: boolean;
  /**
   * D3 (oportunidades-comerciales): server-authoritative commercial flag.
   * `false` ⇒ the Oportunidades tab is hidden/read-only — see
   * canManageOpportunity in src/lib/permissions.ts.
   */
  puede_gestionar_oportunidades: boolean;
};

export type ClientListResponse = {
  page: number;
  limit: number;
  total: number;
  items: ClientListRow[];
};

export type ClientDetail = ClientListRow & {
  tamano_org: string | null;
  canal_contacto_inicial: string | null;
  fecha_primer_contacto: string | null;
  prioridades_identificadas: string | null;
  riesgos_barreras: string | null;
  resumen_relacion: string | null;
  created_at: string;
  contactos_count: number;
  oportunidades_count: number;
  bitacora_count: number;
  tareas_abiertas_count: number;
};

export type Contacto = {
  id: string;
  nombre: string;
  cargo: string | null;
  correo: string | null;
  telefono: string | null;
  rol_decision: RolContacto | null;
  notas: string | null;
  /** v7 alignment C4a: power axis of the power × interest matrix (1..5). */
  poder: number | null;
  /** v7 C4a: interest axis of the power × interest matrix (1..5). */
  interes: number | null;
  /** v7 C4a: relationship strength (1..3). */
  fuerza_relacion: number | null;
  /** v7 C4a: optional internal owner ("Relación: owner"). */
  owner_id: string | null;
  created_at: string;
};

/** v7 C4a: a contact as it appears in the cross-client Relaciones feed. */
export type ContactoFeedItem = Contacto & {
  /** The API projection carries the client id too; the chips key on it. */
  cliente_id: string;
  cliente_nombre: string;
  owner_nombre: string | null;
};

export type ContactoFilters = {
  cliente_id?: string;
  /** true ⇒ only contacts with both poder and interes set. */
  con_quadrante?: boolean;
  poder?: number;
  interes?: number;
};

/** v7 alignment C7a: categorías del resumen diario que se pueden activar/desactivar. */
export type AutomatizacionesCategorias = {
  vencidos: boolean;
  hoy: boolean;
  proximos: boolean;
};

/** v7 C7a: configuración del seguimiento automático que lee el cron diario. */
export type Automatizaciones = {
  resumen_diario: boolean;
  dias_por_vencer: number;
  categorias: AutomatizacionesCategorias;
};

/** v7 C7a: cuerpo del PUT — actualización parcial de `Automatizaciones`. */
export type AutomatizacionesInput = {
  resumen_diario?: boolean;
  dias_por_vencer?: number;
  categorias?: Partial<AutomatizacionesCategorias>;
};

export type Oportunidad = {
  id: string;
  nombre: string;
  problema_detectado: string | null;
  solucion_propuesta: string | null;
  servicios_interes: string | null;
  valor_estimado_cop: number | null;
  estado: EstadoOportunidad;
  fecha_ultima_gestion: string | null;
  /**
   * oportunidades-comerciales (D2): `fase` distinguishes prospección de
   * ejecución tras la conversión explícita y auditada de una oportunidad
   * GANADA. `fecha_adjudicacion` se fija una sola vez por esa acción.
   * `fecha_envio_propuesta` (RF-C03) es fija: nunca se sobreescribe en un
   * PATCH posterior, a diferencia de `fecha_ultima_gestion`.
   */
  fase: FaseOportunidad;
  fecha_adjudicacion: string | null;
  fecha_envio_propuesta: string | null;
  /** @deprecated D8 — superseded by `fase` + `Tarea.oportunidad_id`. */
  proyectos_relacionados: string | null;
  created_at: string;
};

export type BitacoraEntrada = {
  id: string;
  autor_id: string;
  autor_nombre: string;
  texto: string;
  /** RF-C03: optional link to the client's commercial cycle. */
  oportunidad_id: string | null;
  /**
   * v7 alignment C3a: kind of interaction; the server always sends it (OTRO
   * default). Optional here so pre-existing consumers (the C3b UI and its
   * fixtures) keep compiling without a coordinated edit.
   */
  tipo?: TipoInteraccion;
  /** v7 C3a: optional next step agreed in the interaction. */
  proximo_paso?: string | null;
  created_at: string;
};

/** v7 C3a: a bitácora entry as it appears in the cross-client feed. */
export type InteractionFeedItem = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  oportunidad_id: string | null;
  oportunidad_nombre: string | null;
  autor_id: string;
  autor_nombre: string;
  texto: string;
  tipo: TipoInteraccion;
  proximo_paso: string | null;
  created_at: string;
};

export type InteractionFilters = {
  cliente_id?: string;
  tipo?: TipoInteraccion;
};

/** v7 alignment C5a: bucket de salud de un aliado. */
export type SaludBucket = "SANA" | "ATENCION" | "RIESGO" | "SIN_DATOS";

/** v7 C5a: sub-scores del score de salud (null = componente sin datos). */
export type SaludSubscores = {
  contacto: number | null;
  compromisos: number | null;
  proyectos: number | null;
};

/** v7 C5a: score de salud de un aliado en el feed de la cartera. */
export type SaludClienteRow = {
  cliente_id: string;
  cliente_nombre: string;
  score: number | null;
  bucket: SaludBucket;
  subscores: SaludSubscores;
  motivo: string;
};

/** v7 C5a: resumen de la cartera completa. */
export type SaludCartera = {
  sana: number;
  atencion: number;
  riesgo: number;
  sin_datos: number;
  total: number;
  promedio: number | null;
};

/** v7 C5a: payload de GET /api/v1/clients/health. */
export type SaludCarteraData = {
  clientes: SaludClienteRow[];
  cartera: SaludCartera;
};

export type TaskItem = {
  id: string;
  titulo: string;
  descripcion: string | null;
  responsable_id: string;
  responsable_nombre: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  /** RNF-C01 (opportunity-task-linking): drives the Kanban prospección/ejecución chip. */
  oportunidad_id: string | null;
  oportunidad_nombre: string | null;
  oportunidad_fase: FaseOportunidad | null;
  /** D3: el proyecto en que se convirtió la oportunidad de la tarea; null si no hay (o se eliminó). Opcional en el tipo para no obligar a todos los fixtures. */
  proyecto?: { id: string; codigo: string } | null;
  estado: EstadoTarea;
  origen: OrigenTarea;
  prioridad: PrioridadTarea | null;
  fecha_entrega: string | null;
  etiquetas: string[];
  motivo_bloqueo: string | null;
  comentarios_count: number;
  subtotal: number;
  created_at: string;
  updated_at: string;
  /**
   * PR 2 (Slice A) + PR 4 (Slice B2): server-authoritative write flag.
   * `false` ⇒ the current user would get 403 on PATCH/DELETE. The UI gates
   * the kanban drag, the task dialog fields, and hides destructive controls
   * on this signal. Server is the authority — a spoofed `true` in the
   * request body is ignored.
   */
  puede_editar: boolean;
};

export type TaskListResponse = {
  page: number;
  limit: number;
  total: number;
  items: TaskItem[];
};

export type UsuarioMini = { id: string; nombre: string };

/* ── Filter shape (query params mirror the server parser) ──────────────── */

export type ClientFilters = {
  q?: string;
  tipo?: string;
  estado?: string;
  prioridad?: string;
  responsable?: string;
  desde?: string;
  hasta?: string;
  valorMin?: string;
  valorMax?: string;
  page?: number;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

export type ClientFiltersPatch = {
  q?: string;
  tipo?: string;
  estado?: string;
  prioridad?: string;
  responsable?: string;
  desde?: string;
  hasta?: string;
  valorMin?: string;
  valorMax?: string;
};

/* ── Query keys ────────────────────────────────────────────────────────── */

export const clientQueryKeys = {
  all: ["clients"] as const,
  list: (filters: ClientFilters) => ["clients", "list", filters] as const,
  detail: (id: string) => ["clients", "detail", id] as const,
  contacts: (id: string) => ["clients", id, "contacts"] as const,
  opportunities: (id: string) => ["clients", id, "opportunities"] as const,
  opportunityTasks: (clientId: string, oportunidadId: string) =>
    ["clients", clientId, "opportunities", oportunidadId, "tasks"] as const,
  tasks: (clientId: string) => ["tasks", "client", clientId] as const,
  log: (id: string) => ["clients", id, "log"] as const,
  interactions: (filters: InteractionFilters) => ["interactions", "list", filters] as const,
  contactsFeed: (filters: ContactoFilters) => ["contacts", "list", filters] as const,
  saludCartera: () => ["clients", "salud"] as const,
  users: () => ["catalogs", "users"] as const,
};

/** v7 C7a: settings query keys (automatizaciones). */
export const automatizacionesQueryKeys = {
  detail: () => ["settings", "automatizaciones"] as const,
};

/* ── Queries ───────────────────────────────────────────────────────────── */

export function useClients(filters: ClientFilters): UseQueryResult<ClientListResponse> {
  return useQuery({
    queryKey: clientQueryKeys.list(filters),
    queryFn: () => {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") sp.set(key, String(value));
      }
      return apiGet<ClientListResponse>(`/api/v1/clients?${sp.toString()}`);
    },
  });
}

export function useUsers(): UseQueryResult<UsuarioMini[]> {
  return useQuery({
    queryKey: clientQueryKeys.users(),
    queryFn: async () => {
      const res = await apiGet<{ users: UsuarioMini[] }>("/api/v1/catalogs/users");
      return res.users;
    },
  });
}

export function useClientDetail(id: string | null): UseQueryResult<ClientDetail> {
  return useQuery({
    queryKey: clientQueryKeys.detail(id ?? "none"),
    enabled: id !== null,
    queryFn: async () => {
      const res = await apiGet<{ cliente: ClientDetail }>(`/api/v1/clients/${id}`);
      return res.cliente;
    },
  });
}

export function useContacts(id: string | null): UseQueryResult<Contacto[]> {
  return useQuery({
    queryKey: clientQueryKeys.contacts(id ?? ""),
    enabled: id !== null,
    queryFn: async () => {
      const res = await apiGet<{ contactos: Contacto[] }>(
        `/api/v1/clients/${id}/contacts`,
      );
      return res.contactos;
    },
  });
}

export function useOpportunities(id: string | null): UseQueryResult<Oportunidad[]> {
  return useQuery({
    queryKey: clientQueryKeys.opportunities(id ?? ""),
    enabled: id !== null,
    queryFn: async () => {
      const res = await apiGet<{ oportunidades: Oportunidad[] }>(
        `/api/v1/clients/${id}/opportunities`,
      );
      return res.oportunidades;
    },
  });
}

export function useTasksByClient(clientId: string | null): UseQueryResult<TaskItem[]> {
  return useQuery({
    queryKey: clientQueryKeys.tasks(clientId ?? ""),
    enabled: clientId !== null,
    queryFn: async () => {
      // Unified engine: every task linked to the client (CRM + Kanban).
      const res = await apiGet<TaskListResponse>(
        `/api/v1/tasks?cliente=${clientId}&limit=100`,
      );
      return res.items;
    },
  });
}

/** Tasks linked to a specific opportunity (opportunity-task-linking spec). */
export function useTasksByOportunidad(
  clientId: string | null,
  oportunidadId: string | null,
): UseQueryResult<TaskItem[]> {
  return useQuery({
    queryKey: clientQueryKeys.opportunityTasks(clientId ?? "", oportunidadId ?? ""),
    enabled: clientId !== null && oportunidadId !== null,
    queryFn: async () => {
      const res = await apiGet<{ tareas: TaskItem[] }>(
        `/api/v1/clients/${clientId}/opportunities/${oportunidadId}/tasks`,
      );
      return res.tareas;
    },
  });
}

export function useBitacora(id: string | null): UseQueryResult<BitacoraEntrada[]> {
  return useQuery({
    queryKey: clientQueryKeys.log(id ?? ""),
    enabled: id !== null,
    queryFn: async () => {
      const res = await apiGet<{ entradas: BitacoraEntrada[] }>(
        `/api/v1/clients/${id}/log`,
      );
      return res.entradas;
    },
  });
}

/**
 * v7 alignment C3a: the cross-client Interacciones feed. Optional filters by
 * cliente and tipo; the server applies the read scope (a COLABORADOR only sees
 * the clients they are responsable for).
 */
export function useInteractions(
  filters: InteractionFilters = {},
): UseQueryResult<InteractionFeedItem[]> {
  return useQuery({
    queryKey: clientQueryKeys.interactions(filters),
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (filters.cliente_id) sp.set("cliente_id", filters.cliente_id);
      if (filters.tipo) sp.set("tipo", filters.tipo);
      const qs = sp.toString();
      const res = await apiGet<{ interacciones: InteractionFeedItem[] }>(
        `/api/v1/interactions${qs ? `?${qs}` : ""}`,
      );
      return res.interacciones;
    },
  });
}

/**
 * v7 alignment C4a: the cross-client Relaciones contact list. Optional filters
 * by cliente and quadrant; reads are global, matching the client list (PR 3).
 */
export function useGlobalContacts(
  filters: ContactoFilters = {},
): UseQueryResult<ContactoFeedItem[]> {
  return useQuery({
    queryKey: clientQueryKeys.contactsFeed(filters),
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (filters.cliente_id) sp.set("cliente_id", filters.cliente_id);
      if (filters.con_quadrante) sp.set("con_quadrante", "true");
      if (filters.poder !== undefined) sp.set("poder", String(filters.poder));
      if (filters.interes !== undefined) sp.set("interes", String(filters.interes));
      const qs = sp.toString();
      const res = await apiGet<{ contactos: ContactoFeedItem[] }>(
        `/api/v1/contacts${qs ? `?${qs}` : ""}`,
      );
      return res.contactos;
    },
  });
}

/**
 * v7 alignment C5a: the global "Salud de la cartera" read. The server computes
 * every score (contacto, compromisos, proyectos) and the portfolio summary; the
 * client only renders the ranked list. Reads are global, matching the client
 * list (PR 3).
 */
export function useSaludCartera(): UseQueryResult<SaludCarteraData> {
  return useQuery({
    queryKey: clientQueryKeys.saludCartera(),
    queryFn: async () => {
      const res = await apiGet<{ data: SaludCarteraData }>("/api/v1/clients/health");
      return res.data;
    },
  });
}

/**
 * v7 alignment C7a: the Automatizaciones settings (admin-only on the server).
 * Reads the daily-summary configuration that the cron consumes.
 */
export function useAutomatizaciones(): UseQueryResult<Automatizaciones> {
  return useQuery({
    queryKey: automatizacionesQueryKeys.detail(),
    queryFn: async () => {
      const res = await apiGet<{ automatizaciones: Automatizaciones }>(
        "/api/v1/settings/automatizaciones",
      );
      return res.automatizaciones;
    },
  });
}

/**
 * v7 C7a: partial update of the Automatizaciones settings. Seeds the cache with
 * the server's fresh value and invalidates so every consumer re-reads it.
 */
export function useUpdateAutomatizaciones(): UseMutationResult<
  { automatizaciones: Automatizaciones },
  Error,
  AutomatizacionesInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiPut<{ automatizaciones: Automatizaciones }>(
        "/api/v1/settings/automatizaciones",
        input,
      ),
    onError: (err) => toastError(err, "No pudimos guardar las automatizaciones."),
    onSuccess: (data) => {
      qc.setQueryData(automatizacionesQueryKeys.detail(), data.automatizaciones);
      void qc.invalidateQueries({ queryKey: automatizacionesQueryKeys.detail() });
    },
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────── */

// Los campos de texto libre son nullable (no solo opcionales): el PATCH del
// servidor (PATCH_CLIENT_SCHEMA) los acepta en `null` para vaciarlos
// explícitamente — un `undefined` se omite del JSON y el servidor lo
// interpreta como "no tocar este campo", que es justo lo que necesita la
// edición inline (QA audit #3) para poder limpiar un campo con un solo PATCH.
export type ClientInput = {
  nombre: string;
  tipo_cliente: TipoCliente;
  responsable_id: string;
  empresa?: string | null;
  tamano_org?: string | null;
  ubicacion?: string | null;
  canal_contacto_inicial?: string | null;
  fecha_primer_contacto?: string | null;
  prioridad?: PrioridadCliente | null;
  estado?: EstadoCliente;
  prioridades_identificadas?: string | null;
  riesgos_barreras?: string | null;
  resumen_relacion?: string | null;
};

export function useCreateClient(): UseMutationResult<{ cliente: ClientDetail }, Error, ClientInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPost<{ cliente: ClientDetail }>("/api/v1/clients", input);
      } catch (err) {
        return toastError(err, "No pudimos guardar el cliente.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      toast.success("Cliente creado.");
    },
  });
}

export function useUpdateClient(id: string): UseMutationResult<
  { cliente: ClientDetail },
  string,
  Partial<ClientInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPatch<{ cliente: ClientDetail }>(`/api/v1/clients/${id}`, input);
      } catch (err) {
        return toastError(err, "No pudimos actualizar el cliente.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      toast.success("Cliente actualizado.");
    },
  });
}

export function useDeleteClient(id: string): UseMutationResult<ApiVoid, string, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/clients/${id}`);
      } catch (err) {
        return toastError(err, "No pudimos desactivar el cliente.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: ["nav", "counts"] });
      toast.success("Cliente desactivado.");
    },
  });
}

export type ContactoInput = {
  nombre: string;
  cargo?: string | null;
  correo?: string | null;
  telefono?: string | null;
  rol_decision?: RolContacto | null;
  notas?: string | null;
  /** v7 C4a: quadrant + strength + owner (all optional, nullable to clear). */
  poder?: number | null;
  interes?: number | null;
  fuerza_relacion?: number | null;
  owner_id?: string | null;
};

export function useCreateContacto(clientId: string): UseMutationResult<
  { contacto: Contacto },
  string,
  ContactoInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPost<{ contacto: Contacto }>(
          `/api/v1/clients/${clientId}/contacts`,
          input,
        );
      } catch (err) {
        return toastError(err, "No pudimos guardar el contacto.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.contacts(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contacto agregado.");
    },
  });
}

export function useUpdateContacto(clientId: string, contactId: string): UseMutationResult<
  { contacto: Contacto },
  string,
  ContactoInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPatch<{ contacto: Contacto }>(
          `/api/v1/clients/${clientId}/contacts/${contactId}`,
          input,
        );
      } catch (err) {
        return toastError(err, "No pudimos actualizar el contacto.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.contacts(clientId) });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contacto actualizado.");
    },
  });
}

export function useDeleteContacto(clientId: string, contactId: string): UseMutationResult<
  ApiVoid,
  string,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/clients/${clientId}/contacts/${contactId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar el contacto.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.contacts(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contacto eliminado.");
    },
  });
}

export type OportunidadInput = {
  nombre: string;
  problema_detectado?: string | null;
  solucion_propuesta?: string | null;
  servicios_interes?: string | null;
  valor_estimado_cop?: number | null;
  estado?: EstadoOportunidad;
  fecha_ultima_gestion?: string | null;
  proyectos_relacionados?: string | null;
};

export function useCreateOportunidad(clientId: string): UseMutationResult<
  { oportunidad: Oportunidad },
  string,
  OportunidadInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPost<{ oportunidad: Oportunidad }>(
          `/api/v1/clients/${clientId}/opportunities`,
          input,
        );
      } catch (err) {
        return toastError(err, "No pudimos guardar la oportunidad.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.opportunities(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      toast.success("Oportunidad creada.");
    },
  });
}

export function useUpdateOportunidad(
  clientId: string,
  oportunidadId: string,
): UseMutationResult<{ oportunidad: Oportunidad }, string, Partial<OportunidadInput>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPatch<{ oportunidad: Oportunidad }>(
          `/api/v1/clients/${clientId}/opportunities/${oportunidadId}`,
          input,
        );
      } catch (err) {
        return toastError(err, "No pudimos actualizar la oportunidad.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.opportunities(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      toast.success("Oportunidad actualizada.");
    },
  });
}

export function useDeleteOportunidad(
  clientId: string,
  oportunidadId: string,
): UseMutationResult<ApiVoid, string, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiDelete<ApiVoid>(
          `/api/v1/clients/${clientId}/opportunities/${oportunidadId}`,
        );
      } catch (err) {
        return toastError(err, "No pudimos eliminar la oportunidad.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.opportunities(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      toast.success("Oportunidad eliminada.");
    },
  });
}

/**
 * D2/D5: converts a GANADA opportunity into "execution" — flips `fase` and
 * fixes `fecha_adjudicacion`. Zero writes to `tareas` (D6): the kanban chip
 * flips because it derives from `oportunidad.fase`, not because any task row
 * changed, so invalidating the opportunity + kanban task lists is enough.
 */
export function useConvertOportunidad(
  clientId: string,
  oportunidadId: string,
): UseMutationResult<{ oportunidad: Oportunidad }, string, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiPost<{ oportunidad: Oportunidad }>(
          `/api/v1/clients/${clientId}/opportunities/${oportunidadId}/convert`,
          {},
        );
      } catch (err) {
        return toastError(err, "No pudimos convertir la oportunidad.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.opportunities(clientId) });
      void qc.invalidateQueries({
        queryKey: clientQueryKeys.opportunityTasks(clientId, oportunidadId),
      });
      void qc.invalidateQueries({ queryKey: taskQueryKeys.all });
      toast.success("Oportunidad convertida a ejecución.");
    },
  });
}

export type TareaInput = {
  titulo: string;
  descripcion?: string | null;
  responsable_id: string;
  cliente_id?: string;
  oportunidad_id?: string | null;
  estado?: EstadoTarea;
  origen?: OrigenTarea;
  prioridad?: PrioridadTarea | null;
  fecha_entrega?: string | null;
  motivo_bloqueo?: string | null;
};

export function useCreateTarea(): UseMutationResult<
  { task: TaskItem },
  string,
  TareaInput & { cliente_id: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      try {
        return await apiPost<{ task: TaskItem }>("/api/v1/tasks", input);
      } catch (err) {
        return toastError(err, "No pudimos crear el compromiso.");
      }
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.tasks(variables.cliente_id) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(variables.cliente_id) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      toast.success("Compromiso creado.");
    },
  });
}

export function useUpdateTarea(): UseMutationResult<
  { task: TaskItem },
  string,
  { taskId: string; clienteId: string; input: Partial<TareaInput> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, input }) => {
      try {
        return await apiPatch<{ task: TaskItem }>(`/api/v1/tasks/${taskId}`, input);
      } catch (err) {
        return toastError(err, "No pudimos actualizar el compromiso.");
      }
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.tasks(variables.clienteId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(variables.clienteId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      // Prefix match: covers opportunityTasks(clienteId, *) regardless of
      // which oportunidad_id was linked/unlinked by this update.
      void qc.invalidateQueries({ queryKey: ["clients", variables.clienteId, "opportunities"] });
      toast.success("Compromiso actualizado.");
    },
  });
}

export function useUpdateTareaStatus(clientId: string): UseMutationResult<
  { task: TaskItem },
  string,
  { taskId: string; estado: EstadoTarea; motivo_bloqueo?: string | null }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, estado, motivo_bloqueo }) => {
      try {
        return await apiPatch<{ task: TaskItem }>(`/api/v1/tasks/${taskId}/status`, {
          estado,
          ...(motivo_bloqueo !== undefined ? { motivo_bloqueo } : {}),
        });
      } catch (err) {
        return toastError(err, "No pudimos actualizar el estado.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.tasks(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
    },
  });
}

export function useDeleteTarea(clientId: string, taskId: string): UseMutationResult<
  ApiVoid,
  string,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiDelete<ApiVoid>(`/api/v1/tasks/${taskId}`);
      } catch (err) {
        return toastError(err, "No pudimos eliminar el compromiso.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.tasks(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.list({}) });
      toast.success("Compromiso eliminado.");
    },
  });
}

export function useAddLogEntry(clientId: string): UseMutationResult<
  { entrada: BitacoraEntrada },
  string,
  { texto: string; oportunidad_id?: string | null; tipo?: TipoInteraccion; proximo_paso?: string | null }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ texto, oportunidad_id, tipo, proximo_paso }) => {
      try {
        return await apiPost<{ entrada: BitacoraEntrada }>(
          `/api/v1/clients/${clientId}/log`,
          {
            texto,
            ...(oportunidad_id !== undefined ? { oportunidad_id } : {}),
            ...(tipo !== undefined ? { tipo } : {}),
            ...(proximo_paso !== undefined ? { proximo_paso } : {}),
          },
        );
      } catch (err) {
        return toastError(err, "No pudimos guardar la nota.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.log(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
      // v7 C3a: the new entry also lands in the cross-client feed.
      void qc.invalidateQueries({ queryKey: ["interactions"] });
      toast.success("Nota agregada a la bitácora.");
    },
  });
}

/* ── Formatting helpers ────────────────────────────────────────────────── */

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCOP(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : copFormatter.format(value);
}

export function formatFecha(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Calendar day captured with a date input and normalized to UTC midnight
 * (`fecha_primer_contacto`, `fecha_ultima_gestion`): formatted in UTC so the
 * day the user picked is the day that shows. `formatFecha` would show the
 * previous day in UTC-5.
 *
 * Do NOT use it for `Tarea.fecha_entrega`: those rows can hold real instants
 * (the seed writes `daysFromNow`/`daysAgo`, and `esVencida` plus the tasks
 * report compare the column with `Date.now()`), so they must follow the
 * viewer's zone via `formatFecha`. The same applies to other real instants
 * such as `updated_at`.
 */
export function formatFechaDia(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatFechaHora(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function esVencida(fecha: string | Date | null | undefined): boolean {
  if (!fecha) return false;
  const date = typeof fecha === "string" ? new Date(fecha) : fecha;
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

function toastError(err: unknown, fallback: string): never {
  if (err instanceof ApiError) {
    toast.error(err.message);
  } else {
    toast.error(fallback);
  }
  throw err;
}