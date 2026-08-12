// Campana de notificaciones del header (PRD §4.4 / §8.2): fetchea el
// snapshot de alertas (GET /api/v1/notifications) con TanStack Query,
// refresca cada 60s y al abrir el panel; los buckets pintan VENCIDOS (rose),
// VENCEN HOY (ámbar) y PRÓXIMOS 3 DÍAS (ink). Sin plataforma configurada
// (envelope 500) el panel queda inerte: sin badge y con estado desconectado,
// sin reintentos rápidos (retry: false, el poll respeta el intervalo).

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch } from "@/lib/api/http";
import { ESTADO_TAREA_LABELS } from "@/lib/catalogs";
import type { EstadoTarea, OrigenTarea } from "@prisma/client";
import { Skeleton } from "@/components/ui/skeleton";

/* ── DTOs (server shapes de src/app/api/v1/notifications) ───────────────── */

export type AlertItemNotificacion = {
  id: string;
  titulo: string;
  estado: EstadoTarea;
  fecha_entrega: string;
  origen: OrigenTarea;
  responsable_id: string;
  responsable_nombre: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  notificacion_id: string | null;
};

export type NotificationsSnapshot = {
  total: number;
  vencidos: AlertItemNotificacion[];
  hoy: AlertItemNotificacion[];
  proximos3: AlertItemNotificacion[];
  leidas_ids: string[];
};

// Shared query key: the header home greeting reads the same snapshot to show
// real "vencidos / vencen hoy" counts (TanStack Query dedupes the fetch).
export const notificationQueryKey = ["notifications", "snapshot"] as const;

const REFETCH_INTERVAL_MS = 60_000;

/* ── Constantes de UI ──────────────────────────────────────────────────── */

type BucketKey = "vencidos" | "hoy" | "proximos3";

const BUCKETS: { key: BucketKey; label: string; className: string }[] = [
  { key: "vencidos", label: "VENCIDOS", className: "text-rose-700" },
  { key: "hoy", label: "VENCEN HOY", className: "text-alerta" },
  { key: "proximos3", label: "PRÓXIMOS 3 DÍAS", className: "text-ink-600" },
];

/** "5 ago" — fecha corta es-CO sin puntos (mismo criterio que formatVersionFecha). */
function fechaCorta(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date
    .toLocaleDateString("es-CO", { day: "numeric", month: "short" })
    .replace(/\./g, "");
}

/** Origen del compromiso: los de CRM son "Compromiso", el resto "Tarea". */
function chipOrigen(origen: OrigenTarea): string {
  return origen === "CRM" ? "Compromiso" : "Tarea";
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export function NotificationPanel() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Ids sin leer al momento del click en "marcar todas": base del undo (5s).
  const unreadSnapshotRef = useRef<string[]>([]);
  // Guard sincrónico del toast: el closure del action no ve isPending a
  // tiempo, este flag evita un doble click que re-dispare el revert.
  const revertPendingRef = useRef(false);

  const query = useQuery({
    queryKey: notificationQueryKey,
    queryFn: () => apiGet<NotificationsSnapshot>("/api/v1/notifications"),
    retry: false,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const snapshot = query.data;

  const markRead = useMutation({
    mutationFn: (notificacionId: string) =>
      apiPatch(`/api/v1/notifications/${notificacionId}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationQueryKey }),
  });

  const revertAllRead = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => apiDelete(`/api/v1/notifications/${id}/read`))),
    onSettled: () => {
      // Mantiene el badge coherente aunque el revert falle (la query se
      // vuelve a leer desde el server tras read-all / fallo parcial).
      revertPendingRef.current = false;
      void qc.invalidateQueries({ queryKey: notificationQueryKey });
    },
    onError: () => {
      toast.error("No pudimos deshacer el cambio. Inténtalo de nuevo.");
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiPatch("/api/v1/notifications/read-all"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationQueryKey });
      toast.success("Todas las alertas marcadas como leídas.", {
        action: {
          label: "Deshacer",
          onClick: () => {
            if (revertPendingRef.current) return;
            revertPendingRef.current = true;
            revertAllRead.mutate(unreadSnapshotRef.current);
          },
        },
        duration: 5000,
      });
    },
  });

  /** Captura los ids sin leer que el usuario ve ahora (base del undo). */
  function handleMarkAllRead() {
    if (!snapshot) return;
    const leidasSet = new Set(snapshot.leidas_ids);
    unreadSnapshotRef.current = [
      ...snapshot.vencidos,
      ...snapshot.hoy,
      ...snapshot.proximos3,
    ]
      .filter(
        (item) => item.notificacion_id !== null && !leidasSet.has(item.notificacion_id),
      )
      .map((item) => item.notificacion_id!);
    markAllRead.mutate();
  }

  // Cierre por click-fuera, Escape o botón X; el setState vive en handlers.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void query.refetch();
  }

  function abrirAlerta(item: AlertItemNotificacion) {
    setOpen(false);
    if (item.notificacion_id) markRead.mutate(item.notificacion_id);
    // Compromisos CRM se resuelven en la ficha del cliente; el resto, en el tablero.
    if (item.origen === "CRM" && item.cliente_id) {
      router.push(`/clientes?cliente=${item.cliente_id}`);
    } else {
      router.push("/tablero");
    }
  }

  const allItems = snapshot
    ? [...snapshot.vencidos, ...snapshot.hoy, ...snapshot.proximos3]
    : [];
  const leidasSet = new Set(snapshot?.leidas_ids ?? []);
  const unread = allItems.filter(
    (item) => item.notificacion_id === null || !leidasSet.has(item.notificacion_id),
  ).length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative grid size-10 place-items-center rounded-lg border border-ink-200 bg-white text-ink-700 transition-colors after:absolute after:content-[''] after:-inset-0.5 hover:bg-ink-100"
      >
        <Bell className="size-4" strokeWidth={1.7} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-[5px] right-[6px] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rose-500 px-1 text-[9.5px] leading-none font-bold text-white ring-2 ring-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute top-[calc(100%+10px)] right-0 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-200 bg-panel shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
            <h2 className="text-[14px] font-bold text-ink-900">Notificaciones</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar notificaciones"
              className="relative grid size-7 place-items-center rounded-[9px] text-ink-500 transition-colors after:absolute after:content-[''] after:-inset-2 hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="size-4" strokeWidth={1.8} />
            </button>
          </div>

          {!snapshot ? (
            query.isError ? (
              <DisconnectedState />
            ) : (
              <LoadingState />
            )
          ) : snapshot.total === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="max-h-[480px] overflow-y-auto px-4 py-4">
                {BUCKETS.map((bucket) => {
                  const items = snapshot[bucket.key];
                  if (items.length === 0) return null;
                  return (
                    <section key={bucket.key} className="flex flex-col gap-1.5">
                      <h3
                        className={`flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase ${bucket.className}`}
                      >
                        {bucket.label}
                        <span className="font-sans text-[10.5px] font-semibold tracking-normal normal-case text-ink-500">
                          · {items.length}
                        </span>
                      </h3>
                      <ul className="flex flex-col gap-0.5">
                        {items.map((item) => (
                          <AlertRow key={item.id} item={item} onOpen={abrirAlerta} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
              <div className="border-t border-ink-200 p-3">
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending || unread === 0}
                  className="relative flex h-9 w-full items-center justify-center gap-2 rounded-12 bg-ink-100 text-[12.5px] font-semibold text-ink-800 transition-colors after:absolute after:content-[''] after:-inset-1 hover:bg-ink-200 disabled:opacity-45"
                >
                  <CheckCheck className="size-3.5" strokeWidth={1.9} />
                  {markAllRead.isPending ? "Marcando…" : "Marcar todas como leídas"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Fila de alerta ────────────────────────────────────────────────────── */

function AlertRow({
  item,
  onOpen,
}: {
  item: AlertItemNotificacion;
  onOpen: (item: AlertItemNotificacion) => void;
}) {
  const estadoLabel = ESTADO_TAREA_LABELS[item.estado]?.label ?? "—";
  const meta = [item.cliente_nombre, item.responsable_nombre, fechaCorta(item.fecha_entrega)]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex w-full flex-col gap-1 rounded-12 px-3 py-2.5 text-left transition-colors hover:bg-ink-100/70"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-ink-800">{item.titulo}</span>
          <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-ink-600 uppercase">
            {estadoLabel}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-600">
          <span className="truncate">{meta}</span>
          <span className="ml-auto shrink-0 rounded-md bg-ink-100 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-ink-700 uppercase">
            {chipOrigen(item.origen)}
          </span>
        </span>
      </button>
    </li>
  );
}

/* ── Estados auxiliares ────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="space-y-3 px-4 py-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-11 w-full rounded-12" />
      <Skeleton className="h-11 w-full rounded-12" />
      <Skeleton className="h-11 w-full rounded-12" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[14px] font-semibold text-ink-800">Todo al día ✦</p>
      <p className="mt-1 text-[12.5px] text-ink-600">No hay alertas pendientes.</p>
    </div>
  );
}

function DisconnectedState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid size-9 place-items-center rounded-full bg-ink-100 text-ink-600">
        <Bell className="size-4" strokeWidth={1.8} />
      </span>
      <p className="text-[13.5px] font-semibold text-ink-900">Plataforma no conectada</p>
      <p className="max-w-[32ch] text-[12px] leading-relaxed text-ink-600">
        Las alertas aparecerán aquí cuando la plataforma esté configurada.
      </p>
    </div>
  );
}