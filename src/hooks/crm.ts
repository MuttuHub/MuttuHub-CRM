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
  ApiError,
  type ApiVoid,
} from "@/lib/api/http";
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
  created_at: string;
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
  proyectos_relacionados: string | null;
  created_at: string;
};

export type BitacoraEntrada = {
  id: string;
  autor_id: string;
  autor_nombre: string;
  texto: string;
  created_at: string;
};

export type TaskItem = {
  id: string;
  titulo: string;
  descripcion: string | null;
  responsable_id: string;
  responsable_nombre: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
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
  tasks: (clientId: string) => ["tasks", "client", clientId] as const,
  log: (id: string) => ["clients", id, "log"] as const,
  users: () => ["catalogs", "users"] as const,
};

/* ── Queries ───────────────────────────────────────────────────────────── */

export function useClients(filters: ClientFilters): UseQueryResult<ClientListResponse> {
  return useQuery({
    queryKey: clientQueryKeys.list(filters),
    queryFn: () => {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") sp.set(key, value);
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

export type TareaInput = {
  titulo: string;
  descripcion?: string | null;
  responsable_id: string;
  cliente_id?: string;
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
  { texto: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ texto }) => {
      try {
        return await apiPost<{ entrada: BitacoraEntrada }>(
          `/api/v1/clients/${clientId}/log`,
          { texto },
        );
      } catch (err) {
        return toastError(err, "No pudimos guardar la nota.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientQueryKeys.log(clientId) });
      void qc.invalidateQueries({ queryKey: clientQueryKeys.detail(clientId) });
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