// Actividad (S9): feed de eventos de auditoría de documentos desde
// GET /api/v1/auditoria?entidad=documento (solo ADMINISTRADOR).

"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVersionFecha, useDocumentActivity } from "@/hooks/documents";

const VERBOS: Record<string, string> = {
  crear: "subió",
  editar: "editó",
  eliminar: "envió a la papelera",
  restaurar: "restauró",
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function cuando(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  return `${formatVersionFecha(d)} · ${hora}`;
}

export function ActivityTab() {
  const query = useDocumentActivity({ enabled: true });
  const events = query.data ?? [];

  return (
    <section aria-label="Actividad" className="surface min-w-0 p-4 sm:p-5">
      <h2 className="font-display text-[16px] font-bold text-ink-950">Actividad reciente</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-600">
        Quién subió, editó, eliminó o restauró documentos.
      </p>
      {query.isLoading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-12" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          title="No se pudo cargar la actividad"
          description="Revisa tu conexión e inténtalo de nuevo."
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={
            <span className="grid size-11 place-items-center rounded-14 bg-ink-100 text-ink-500">
              <History className="size-5" strokeWidth={1.7} />
            </span>
          }
          title="Sin actividad todavía"
          description="Los cambios sobre documentos aparecerán aquí."
          className="min-h-[220px]"
        />
      ) : (
        <ol aria-label="Eventos de documentos" className="mt-4 flex flex-col gap-3.5">
          {events.map((ev) => {
            const quien = ev.usuario_nombre ?? "Usuario eliminado";
            const peligro = ev.accion === "eliminar";
            return (
              <li key={ev.id} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    peligro
                      ? "bg-destructivo-bg text-destructivo"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
                  )}
                >
                  {iniciales(quien)}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-[13px] leading-snug text-ink-900">
                    <strong className="font-semibold">{quien}</strong>{" "}
                    {VERBOS[ev.accion] ?? ev.accion}{" "}
                    <span className="font-semibold break-words">
                      {ev.documento_titulo ?? "un documento"}
                    </span>
                  </p>
                  <time dateTime={ev.created_at} className="text-[12px] text-ink-600">
                    {cuando(ev.created_at)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
