"use client";

// Bitácora de accesos del admin (PRD §3.3, Hito 7): lista de ingresos
// exitosos con paginación por keyset (`Cargar más` usa el next_before de la
// última fila). La primera página fallida muestra la tarjeta de error con
// reintento; una página siguiente fallida solo avisa junto al botón.

import { useState } from "react";
import {
  AlertTriangle,
  Fingerprint,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { formatFechaHora, iniciales } from "@/hooks/crm";
import { useAccesos } from "@/hooks/admin";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatRelativo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `hace ${diffHrs} h`;
  const diffDias = Math.floor(diffHrs / 24);
  return `hace ${diffDias} d`;
}

export function AccesosSection() {
  const query = useAccesos();
  const [moreError, setMoreError] = useState<string | null>(null);
  const accesos = query.data?.pages.flatMap((p) => p.accesos) ?? [];
  const hasMore = query.hasNextPage ?? false;

  if (query.isLoading) {
    return (
      <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-3.5 w-64" />
        <Skeleton className="mt-5 h-10 w-full" />
        <Skeleton className="mt-2 h-10 w-full" />
        <Skeleton className="mt-2 h-10 w-full" />
        <Skeleton className="mt-2 h-10 w-full" />
      </section>
    );
  }

  if (query.isError) {
    const message =
      query.error instanceof Error
        ? query.error.message
        : "No pudimos cargar la bitácora de accesos. Inténtalo de nuevo.";
    return (
      <section className="grid min-h-[280px] place-items-center rounded-[22px] border border-ink-200 bg-panel p-8">
        <div className="max-w-[46ch] text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-alerta-bg text-alerta">
            <AlertTriangle className="size-5" strokeWidth={1.7} />
          </span>
          <h3 className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
            No pudimos cargar la bitácora de accesos
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{message}</p>
          <Button
            onClick={() => void query.refetch()}
            variant="outline"
            className="mt-4 rounded-lg px-4 font-semibold"
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  async function loadMore() {
    setMoreError(null);
    try {
      await query.fetchNextPage();
    } catch (err) {
      setMoreError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar más accesos. Inténtalo de nuevo.",
      );
    }
  }

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            Bitácora de accesos
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-600">
            Últimos ingresos registrados, ordenados del más reciente al más
            antiguo.
          </p>
        </div>
        {accesos.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-ink-100/60 px-3 py-1 text-[11.5px] font-semibold text-ink-700">
            <Fingerprint className="size-3.5 text-ink-500" strokeWidth={1.8} />
            {accesos.length} registros
          </span>
        )}
      </div>

      {accesos.length === 0 ? (
        <div className="grid min-h-[180px] place-items-center rounded-[18px] border border-dashed border-ink-200 px-6 py-10 text-center">
          <div>
            <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-ink-100 text-ink-700">
              <Fingerprint className="size-5" strokeWidth={1.7} />
            </span>
            <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
              Aún no hay accesos registrados
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-600">
              Cada ingreso exitoso queda anotado automáticamente en esta
              bitácora.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-ink-200">
          {/* Patrón C (plan Fase 5): min-w para que scrollee en vez de aplastarse */}
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Fecha
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Usuario
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  IP
                </TableHead>
                <TableHead className="pr-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Agente
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accesos.map((acceso) => (
                <TableRow key={acceso.id} className="hover:bg-ink-100/60">
                  <TableCell className="pl-5">
                    <span className="block font-mono text-[12px] tabular-nums text-ink-800">
                      {formatFechaHora(acceso.created_at)}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-500">
                      {formatRelativo(acceso.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-50 text-[11px] font-bold text-rose-700 dark:text-rose-400">
                        {iniciales(acceso.usuario.nombre)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-ink-900">
                          {acceso.usuario.nombre}
                        </div>
                        <div className="truncate text-[11.5px] text-ink-600">
                          {acceso.usuario.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-ink-600">
                    {acceso.ip ?? "—"}
                  </TableCell>
                  <TableCell className="pr-5">
                    <span
                      title={acceso.user_agent ?? undefined}
                      className="block max-w-[260px] truncate font-mono text-[11.5px] text-ink-600"
                    >
                      {acceso.user_agent ?? "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {query.isFetchingNextPage &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                    <TableCell className="pl-5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="mt-1.5 h-3 w-16" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-16" />
                    </TableCell>
                    <TableCell className="pr-5">
                      <Skeleton className="h-3.5 w-40" />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(hasMore || moreError) && (
        <div className="flex flex-col items-center gap-2 pt-4">
          {moreError && (
            <p role="alert" className="text-[12.5px] font-medium text-destructivo">
              {moreError}
            </p>
          )}
          {hasMore && (
            <Button
              onClick={() => void loadMore()}
              variant="outline"
              disabled={query.isFetchingNextPage}
              className="rounded-lg px-4 font-semibold"
            >
              {query.isFetchingNextPage ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" strokeWidth={2} />
              )}
              Cargar más
            </Button>
          )}
        </div>
      )}
    </section>
  );
}