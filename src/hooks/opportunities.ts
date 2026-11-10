// V1 (S1/S2/S3): cross-client opportunities data layer. It is the UI half of
// `GET /api/v1/opportunities` (rows + one COP total per S1 column) and the
// move mutation over the EXISTING
// `PATCH /api/v1/clients/:clientId/opportunities/:opportunityId`, which keeps
// `canManageOpportunity` authoritative on the server. No new write endpoint.
//
// Deliberately separate from src/hooks/crm.ts: that file is owned by another
// lane in the v7 plan and already exposes the per-client `useOpportunities`.

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, ApiError } from "@/lib/api/http";
import type { EstadoOportunidad } from "@prisma/client";

/* ── DTOs (server response shapes) ─────────────────────────────────────── */

/** One opportunity as the global list serves it. */
export type OportunidadFeedItem = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  nombre: string;
  estado: EstadoOportunidad;
  valor_estimado_cop: number | null;
  /**
   * Server-authoritative write flag: `canManageOpportunity` for the owning
   * client. The PATCH re-checks it; the board only uses it to avoid offering
   * a move that would answer 403.
   */
  puede_gestionar: boolean;
};

/** One S1 column: its enum value, row count and COP sum. */
export type OportunidadEstadoTotal = {
  estado: EstadoOportunidad;
  count: number;
  total_cop: number;
};

export type OportunidadesGlobales = {
  oportunidades: OportunidadFeedItem[];
  /** Always the seven S1 columns, in the S1 mapping order. */
  totales: OportunidadEstadoTotal[];
};

export type MoveOpportunityInput = {
  clienteId: string;
  oportunidadId: string;
  estado: EstadoOportunidad;
};

const opportunityQueryKeys = {
  all: ["opportunities"] as const,
  global: () => ["opportunities", "global"] as const,
};

/* ── Queries ───────────────────────────────────────────────────────────── */

/**
 * The global board feed. `enabled` lets a caller hold the request (e.g. until
 * it knows the viewer should see the board); the route still answers 403 to a
 * COLABORADOR without commercial access.
 */
export function useGlobalOpportunities(
  options: { enabled?: boolean } = {},
): UseQueryResult<OportunidadesGlobales> {
  return useQuery({
    queryKey: opportunityQueryKeys.global(),
    enabled: options.enabled ?? true,
    queryFn: () => apiGet<OportunidadesGlobales>("/api/v1/opportunities"),
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────── */

/**
 * Moves one card to another stage. Reuses the per-client PATCH with the same
 * `{ estado }` body the client sheet sends, so the enum and the write gate
 * (canManageOpportunity) stay in one place. Invalidates the global board plus
 * the `["clients"]` subtree, which owns every per-client opportunity key.
 */
export function useMoveOpportunity(): UseMutationResult<
  { oportunidad: { id: string; estado: EstadoOportunidad } },
  Error,
  MoveOpportunityInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, oportunidadId, estado }) =>
      apiPatch<{ oportunidad: { id: string; estado: EstadoOportunidad } }>(
        `/api/v1/clients/${clienteId}/opportunities/${oportunidadId}`,
        { estado },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: opportunityQueryKeys.global() });
      void qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No pudimos mover la oportunidad. Inténtalo de nuevo.",
      );
    },
  });
}
