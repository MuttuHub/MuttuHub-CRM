"use client";

// Bitácora de auditoría de negocio (QA audit finding #9): creación/edición/
// eliminación de Cliente, Tarea y Documento — separada de la bitácora de
// accesos (solo login, ver accesos-section.tsx), que sigue existiendo tal
// cual. Misma paginación por keyset (`Cargar más` usa el next_before de la
// última fila).

import { useState } from "react";
import { AlertTriangle, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import { formatFechaHora, iniciales } from "@/hooks/crm";
import { useAuditoria, type AuditAccion, type AuditEntidad } from "@/hooks/admin";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge } from "@/components/crm/shared";

const ENTIDAD_LABELS: Record<AuditEntidad, { label: string; tone: "info" | "activo" | "neutro" }> = {
  cliente: { label: "Cliente", tone: "info" },
  tarea: { label: "Tarea", tone: "activo" },
  documento: { label: "Documento", tone: "neutro" },
};

const ACCION_LABELS: Record<AuditAccion, { label: string; tone: "exito" | "info" | "destructivo" }> = {
  crear: { label: "Creó", tone: "exito" },
  editar: { label: "Editó", tone: "info" },
  eliminar: { label: "Eliminó", tone: "destructivo" },
};

/** "titulo, categoria" — los nombres de los campos enviados, no sus valores
 * (que pueden ser largos o sensibles); el JSON completo va en el `title`. */
function resumenCambios(cambios: Record<string, unknown> | null): string {
  if (!cambios) return "—";
  const keys = Object.keys(cambios);
  return keys.length > 0 ? keys.join(", ") : "—";
}

export function AuditLogSection() {
  const [entidad, setEntidad] = useState<AuditEntidad | "todas">("todas");
  const query = useAuditoria(entidad === "todas" ? undefined : entidad);
  const [moreError, setMoreError] = useState<string | null>(null);
  const registros = query.data?.pages.flatMap((p) => p.registros) ?? [];
  const hasMore = query.hasNextPage ?? false;

  async function loadMore() {
    setMoreError(null);
    try {
      await query.fetchNextPage();
    } catch (err) {
      setMoreError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar más registros. Inténtalo de nuevo.",
      );
    }
  }

  return (
    <section className="rounded-[22px] border border-ink-200 bg-panel p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-950">
            Bitácora de auditoría
          </h2>
          <p className="mt-0.5 text-[12.5px] text-ink-600">
            Creación, edición y eliminación de clientes, tareas y documentos.
          </p>
        </div>
        <Select value={entidad} onValueChange={(v) => setEntidad((v as AuditEntidad | "todas") ?? "todas")}>
          <SelectTrigger className="h-9 w-[170px] rounded-10 bg-panel px-3 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos los registros</SelectItem>
            <SelectItem value="cliente">Clientes</SelectItem>
            <SelectItem value="tarea">Tareas</SelectItem>
            <SelectItem value="documento">Documentos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
        </>
      ) : query.isError ? (
        <div className="grid min-h-[220px] place-items-center rounded-[18px] border border-ink-200 p-8">
          <div className="max-w-[46ch] text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-alerta-bg text-alerta">
              <AlertTriangle className="size-5" strokeWidth={1.7} />
            </span>
            <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
              No pudimos cargar la bitácora de auditoría
            </h3>
            <Button
              onClick={() => void query.refetch()}
              variant="outline"
              className="mt-4 rounded-lg px-4 font-semibold"
            >
              Reintentar
            </Button>
          </div>
        </div>
      ) : registros.length === 0 ? (
        <div className="grid min-h-[180px] place-items-center rounded-[18px] border border-dashed border-ink-200 px-6 py-10 text-center">
          <div>
            <span className="mx-auto grid size-11 place-items-center rounded-[15px_15px_15px_5px] bg-ink-100 text-ink-700">
              <ShieldCheck className="size-5" strokeWidth={1.7} />
            </span>
            <h3 className="mt-4 font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">
              Aún no hay registros
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-600">
              Cada creación, edición o eliminación de un cliente, tarea o
              documento queda anotada acá automáticamente.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-ink-200">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Fecha
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Usuario
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Entidad
                </TableHead>
                <TableHead className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Acción
                </TableHead>
                <TableHead className="pr-5 text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">
                  Campos
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((r) => (
                <TableRow key={r.id} className="hover:bg-ink-100/60">
                  <TableCell className="pl-5">
                    <span className="block font-mono text-[12px] tabular-nums text-ink-800">
                      {formatFechaHora(r.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-50 text-[11px] font-bold text-rose-700 dark:text-rose-400">
                        {iniciales(r.usuario.nombre)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-ink-900">
                          {r.usuario.nombre}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={ENTIDAD_LABELS[r.entidad].tone} label={ENTIDAD_LABELS[r.entidad].label} />
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={ACCION_LABELS[r.accion].tone} label={ACCION_LABELS[r.accion].label} />
                  </TableCell>
                  <TableCell className="pr-5">
                    <span
                      title={r.cambios ? JSON.stringify(r.cambios, null, 2) : undefined}
                      className="block max-w-[260px] truncate font-mono text-[11.5px] text-ink-600"
                    >
                      {resumenCambios(r.cambios)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {query.isFetchingNextPage &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                    <TableCell className="pl-5" colSpan={5}>
                      <Skeleton className="h-3.5 w-full" />
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
