"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Menu } from "lucide-react";
import { PAGE_HEADERS } from "@/lib/nav";
import { useCurrentUser } from "@/hooks/kanban";
import { apiGet } from "@/lib/api/http";
import { DEMO_USER } from "@/lib/mock/demo";
import { useSidebarStore } from "@/store/sidebar";
import { RANGO_HEADER_LABELS, RANGO_OPCIONES, useFiltersStore, type RangoFiltro } from "@/store/filters";
import {
  NotificationPanel,
  notificationQueryKey,
  type NotificationsSnapshot,
} from "@/components/shell/notification-panel";
import { UserMenu } from "@/components/shell/user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Today as "Jueves 6 de agosto" (es-CO, capitalised, no comma). */
function fechaHoy(): string {
  const hoy = new Date();
  const texto = hoy.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const limpio = texto.replace(/,/g, "").trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Home subtitle: today's date plus real counts from the notifications snapshot. */
function subtituloInicio(snapshot: NotificationsSnapshot | undefined): string {
  const fecha = fechaHoy();
  if (!snapshot) return fecha;
  const vencidos = snapshot.vencidos.filter((i) => i.origen === "CRM").length;
  const hoy = snapshot.hoy.filter((i) => i.origen !== "CRM").length;
  const partes: string[] = [];
  if (vencidos > 0) {
    partes.push(`${vencidos} ${vencidos === 1 ? "compromiso vencido" : "compromisos vencidos"}`);
  }
  if (hoy > 0) {
    partes.push(`${hoy} ${hoy === 1 ? "tarea que vence hoy" : "tareas que vencen hoy"}`);
  }
  return partes.length > 0 ? `${fecha} · ${partes.join(" y ")}` : fecha;
}

export function Header() {
  const pathname = usePathname();
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const rango = useFiltersStore((s) => s.rango);
  const setRango = useFiltersStore((s) => s.setRango);
  const userQuery = useCurrentUser();
  // Same query as the notification bell: shared cache, no extra fetch.
  const notificationsQuery = useQuery({
    queryKey: notificationQueryKey,
    queryFn: () => apiGet<NotificationsSnapshot>("/api/v1/notifications"),
    enabled: pathname === "/",
    retry: false,
  });

  const page = PAGE_HEADERS[pathname] ?? {
    title: "Muttu Hub",
    subtitle: "",
  };
  const nombre = userQuery.data?.nombre ?? DEMO_USER.nombre;
  const title = pathname === "/" ? `Hola, ${nombre.split(" ")[0]}` : page.title;
  const subtitle =
    pathname === "/" ? subtituloInicio(notificationsQuery.data) : page.subtitle;

  // The global date-range store is only consumed on Inicio and Reportes
  // (dashboard-page.tsx, reportes-page.tsx); elsewhere the dropdown is dead.
  const rangoActivo = pathname === "/" || pathname === "/reportes";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          className="mt-1 grid size-9 shrink-0 place-items-center rounded-[12px] border border-ink-200 bg-white text-ink-700 transition-colors hover:bg-ink-100 lg:hidden"
        >
          <Menu className="size-4" strokeWidth={1.8} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-[31px] leading-none tracking-[-0.03em] font-extrabold text-ink-950 lg:text-[34px]">
            {title}
          </h1>
          <p className="mt-2 text-[14px] text-ink-600">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {rangoActivo && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Rango de fechas"
              className="hidden h-10 cursor-pointer items-center gap-2 rounded-[13px] border border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 transition-colors hover:bg-ink-100 sm:inline-flex"
            >
              {RANGO_HEADER_LABELS[rango]}
              <ChevronDown className="size-3 text-ink-600" strokeWidth={1.8} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuRadioGroup
                value={rango}
                onValueChange={(value) => setRango(value as RangoFiltro)}
              >
                {RANGO_OPCIONES.map((opcion) => (
                  <DropdownMenuRadioItem key={opcion.value} value={opcion.value}>
                    {RANGO_HEADER_LABELS[opcion.value]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <NotificationPanel />

        <UserMenu />
      </div>
    </div>
  );
}