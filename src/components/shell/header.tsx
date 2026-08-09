"use client";

import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { PAGE_HEADERS } from "@/lib/nav";
import { useSidebarStore } from "@/store/sidebar";
import { RANGO_HEADER_LABELS, RANGO_OPCIONES, useFiltersStore, type RangoFiltro } from "@/store/filters";
import { NotificationPanel } from "@/components/shell/notification-panel";
import { UserMenu } from "@/components/shell/user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const pathname = usePathname();
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const rango = useFiltersStore((s) => s.rango);
  const setRango = useFiltersStore((s) => s.setRango);
  const page = PAGE_HEADERS[pathname] ?? {
    title: "Muttu Hub",
    subtitle: "",
  };

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
            {page.title}
          </h1>
          <p className="mt-2 text-[14px] text-ink-600">{page.subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
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

        <NotificationPanel />

        <UserMenu />
      </div>
    </div>
  );
}