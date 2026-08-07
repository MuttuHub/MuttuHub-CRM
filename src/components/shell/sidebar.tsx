"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, Search } from "lucide-react";
import { NAV_GROUPS, isNavActive } from "@/lib/nav";
import { useSidebarStore } from "@/store/sidebar";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function SidebarContent({ rail }: { rail: boolean }) {
  const pathname = usePathname();
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 items-center gap-2",
          rail
            ? "flex-col pt-1 pb-3"
            : "mb-1 justify-between px-1.5 pb-3",
        )}
      >
        <Link
          href="/"
          aria-label="Muttu Hub · Inicio"
          className={cn("flex items-center", rail ? "flex-col gap-2" : "gap-2.5")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rail ? "/brand/logo-iso.svg" : "/brand/logo-blanco.svg"}
            alt="Muttu"
            className={cn("h-auto", rail ? "w-7" : "w-[86px]")}
          />
          {!rail && (
            <span className="rounded-full bg-shell-chip px-2 py-0.5 font-display text-[15px] font-bold tracking-tight text-white">
              Hub
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={rail ? "Expandir menú" : "Contraer menú"}
          className={cn(
            "grid size-[26px] shrink-0 place-items-center rounded-[9px] border border-shell-border text-shell-muted transition-colors hover:border-shell-kbd hover:text-shell-text",
            rail ? "mt-1 block" : "block",
          )}
        >
          <PanelLeft className="size-3.5" strokeWidth={1.7} />
        </button>
      </div>

      {!rail && (
        <div className="relative mb-3 block">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-shell-muted" />
          <input
            type="search"
            placeholder="Buscar en el Hub"
            className="h-[38px] w-full rounded-[12px] border border-shell-chip bg-shell-surface pr-10 pl-9 text-[13px] text-shell-text placeholder:text-shell-faint focus:border-rose-600/50 focus:outline-none focus:ring-1 focus:ring-rose-600/40"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md border border-shell-border bg-shell-chip px-1.5 py-0.5 font-mono text-[10px] text-shell-faint">
            ⌘K
          </kbd>
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {rail ? (
              <div className="mx-2 mb-1 h-px bg-shell-chip" aria-hidden="true" />
            ) : (
              <span className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.12em] text-shell-faint uppercase">
                {group.title}
              </span>
            )}
            {group.items.map((item) => {
              const active = isNavActive(pathname, item.href);
              const Icon = item.icon;
              const link = (
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-[36px] w-full items-center gap-2.5 rounded-[11px] transition-colors",
                    rail ? "justify-center" : "px-3",
                    active
                      ? "bg-rose-500 font-semibold text-white"
                      : "font-medium text-shell-muted hover:bg-shell-chip hover:text-shell",
                  )}
                >
                  <Icon
                    className={cn(
                      rail ? "size-[19px]" : "size-[16px]",
                      active ? "text-white" : "text-shell-muted",
                    )}
                    strokeWidth={1.7}
                  />
                  {!rail && (
                    <>
                      <span className="flex-1 text-left text-[12.5px]">
                        {item.label}
                      </span>
                      {item.count && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-px font-mono text-[10px] font-semibold",
                            active
                              ? "bg-white/20 text-white"
                              : "bg-shell-chip text-shell",
                          )}
                        >
                          {item.count}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
              return rail ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger render={link} aria-label={item.label} />
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.href}>{link}</div>
              );
            })}
          </div>
        ))}
      </nav>

      {!rail && (
        <div className="mt-auto">
          <div className="rounded-[18px] bg-gradient-to-br from-rose-700 to-rose-500 p-4">
            <span className="text-[11px] font-bold tracking-[0.09em] text-rose-200 uppercase">
              Brief pendiente
            </span>
            <p className="mt-1.5 font-display text-[15px] leading-snug font-bold text-white">
              Alcaldía de Soledad quedó sin revisar
            </p>
            <button
              type="button"
              className="mt-2.5 h-[34px] rounded-[10px] bg-white px-3.5 text-[12px] font-bold text-rose-700 transition-colors hover:bg-rose-50"
            >
              Revisar campos
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const mobileOpen = useSidebarStore((s) => s.mobileOpen);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);

  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "sticky top-[14px] hidden h-[calc(100vh-28px)] shrink-0 flex-col rounded-[26px] border border-shell-border bg-sidebar lg:flex",
          collapsed ? "w-[72px] px-2.5 py-3.5" : "w-[244px] px-3.5 py-3.5",
        )}
      >
        <SidebarContent rail={collapsed} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col rounded-r-[26px] border-r border-shell-border bg-shell-surface px-3.5 py-3.5">
            <SidebarContent rail={false} />
          </aside>
        </div>
      )}
    </TooltipProvider>
  );
}