"use client";

// V1 (S1/S2/S3): the global opportunities board. Seven columns in the decided
// S1 mapping order, each with its COP total; cards carry client, opportunity
// and value. Moving a card reuses the existing per-client PATCH through
// `useMoveOpportunity` — no new write endpoint, no schema change (S4).
//
// The labels below are the S1 decision verbatim, NOT the generic
// ESTADO_OPORTUNIDAD_LABELS catalog (that one still serves the per-client
// sheet and is out of this task's surface). The enum itself is untouched.

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EstadoOportunidad } from "@prisma/client";
import { ApiError } from "@/lib/api/http";
import { formatCOP } from "@/hooks/crm";
import {
  useGlobalOpportunities,
  useMoveOpportunity,
  type OportunidadEstadoTotal,
  type OportunidadFeedItem,
} from "@/hooks/opportunities";
import { Skeleton } from "@/components/ui/skeleton";

/** The seven S1 columns, in the order the decided mapping lists them. */
const OPORTUNIDAD_COLUMNS: readonly { estado: EstadoOportunidad; label: string }[] = [
  { estado: "EN_REVISION", label: "Revisión TDR" },
  { estado: "DISENANDO_PROPUESTA", label: "En formulación" },
  { estado: "PRESENTADA", label: "Enviada · seguimiento" },
  { estado: "EN_NEGOCIACION", label: "En negociación" },
  { estado: "GANADA", label: "Aceptada" },
  { estado: "PERDIDA", label: "Rechazada" },
  { estado: "STANDBY", label: "En espera" },
];

function totalDe(totales: readonly OportunidadEstadoTotal[], estado: EstadoOportunidad): number {
  return totales.find((total) => total.estado === estado)?.total_cop ?? 0;
}

const MOVE_BUTTON_CLASS =
  "grid size-7 place-items-center rounded-full text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-950 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

export function OportunidadesKanban({ enabled = true }: { enabled?: boolean }) {
  const query = useGlobalOpportunities({ enabled });
  const move = useMoveOpportunity();
  const oportunidades = query.data?.oportunidades ?? [];
  const totales = query.data?.totales ?? [];

  if (query.isLoading) {
    return (
      <div
        role="status"
        aria-label="Cargando oportunidades"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {OPORTUNIDAD_COLUMNS.map((column) => (
          <Skeleton key={column.estado} className="h-44 w-full rounded-inner" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    // The route's 403 is the same commercial gate as the per-client read; show
    // its message instead of a generic failure so the reason is honest.
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <div
        role="alert"
        className="rounded-inner border border-destructivo/25 bg-destructivo-bg px-4 py-3 text-[13px] font-medium text-destructivo"
      >
        {forbidden
          ? query.error.message
          : "No pudimos cargar las oportunidades. Inténtalo de nuevo."}
      </div>
    );
  }

  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {OPORTUNIDAD_COLUMNS.map((column, columnIndex) => {
        const tarjetas = oportunidades.filter((o) => o.estado === column.estado);
        const headingId = `oportunidades-col-${column.estado}`;
        return (
          <section
            key={column.estado}
            aria-labelledby={headingId}
            className="flex w-[264px] shrink-0 flex-col gap-2 rounded-inner border border-ink-200 bg-ink-100/40 p-2.5"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 id={headingId} className="text-[13.5px] font-semibold text-ink-950">
                {column.label}
              </h2>
              <p className="font-mono text-[11.5px] text-ink-600">
                Total: {formatCOP(totalDe(totales, column.estado))}
              </p>
            </div>

            {tarjetas.length === 0 ? (
              <p className="px-1 py-4 text-center text-[12px] text-ink-500">Sin oportunidades</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tarjetas.map((oportunidad) => (
                  <OportunidadCard
                    key={oportunidad.id}
                    oportunidad={oportunidad}
                    anterior={OPORTUNIDAD_COLUMNS[columnIndex - 1]}
                    siguiente={OPORTUNIDAD_COLUMNS[columnIndex + 1]}
                    disabled={move.isPending}
                    onMove={(estado) =>
                      move.mutate({
                        clienteId: oportunidad.cliente_id,
                        oportunidadId: oportunidad.id,
                        estado,
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function OportunidadCard({
  oportunidad,
  anterior,
  siguiente,
  disabled,
  onMove,
}: {
  oportunidad: OportunidadFeedItem;
  anterior?: { estado: EstadoOportunidad; label: string };
  siguiente?: { estado: EstadoOportunidad; label: string };
  disabled: boolean;
  onMove: (estado: EstadoOportunidad) => void;
}) {
  // `puede_gestionar` comes from the server's canManageOpportunity for this
  // opportunity's client. The PATCH re-enforces that same rule, so this is a
  // deliberate client-side duplicate of the gate: it exists only to avoid
  // offering a move that would come back 403 (a broken affordance), never to
  // authorize one. The server remains the authority.
  const canMove = oportunidad.puede_gestionar;
  return (
    <li className="surface p-2.5">
      <p className="truncate text-[11.5px] font-medium text-ink-500">
        {oportunidad.cliente_nombre}
      </p>
      <p className="mt-0.5 text-[13px] leading-snug font-semibold text-ink-950">
        {oportunidad.nombre}
      </p>
      <p className="mt-1 font-mono text-[11.5px] text-ink-700">
        {formatCOP(oportunidad.valor_estimado_cop)}
      </p>

      {canMove && (anterior || siguiente) && (
        <div className="mt-2 flex items-center justify-end gap-1">
          {anterior && (
            <button
              type="button"
              aria-label={`Mover a ${anterior.label}`}
              disabled={disabled}
              onClick={() => onMove(anterior.estado)}
              className={MOVE_BUTTON_CLASS}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
          )}
          {siguiente && (
            <button
              type="button"
              aria-label={`Mover a ${siguiente.label}`}
              disabled={disabled}
              onClick={() => onMove(siguiente.estado)}
              className={MOVE_BUTTON_CLASS}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
