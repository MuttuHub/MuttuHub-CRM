"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft, Search } from "lucide-react";
import { NAV_GROUPS, isNavActive } from "@/lib/nav";
import { useNavCounts } from "@/hooks/nav";
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
  const counts = useNavCounts().data;
  const countByHref: Partial<Record<string, number>> = {
    "/clientes": counts?.clientes,
    "/tablero": counts?.tablero,
    "/documentos": counts?.documentos,
  };

  // Navigation search: filters NAV_GROUPS by label as you type; ⌘K / Ctrl+K
  // focuses the input from anywhere in the shell.
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const q = query.trim().toLocaleLowerCase();
  const groups = q
    ? NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLocaleLowerCase().includes(q),
        ),
      })).filter((group) => group.items.length > 0)
    : NAV_GROUPS;
  const sinResultados = q !== "" && groups.length === 0;

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
          className={cn(
            "flex items-center rounded-[9px] focus-visible:ring-3 focus-visible:ring-ring/50",
            rail ? "flex-col gap-2" : "gap-2.5",
          )}
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
            "relative grid size-[26px] shrink-0 place-items-center rounded-[9px] border border-shell-border text-shell-muted transition-colors after:absolute after:content-[''] after:-inset-2.5 hover:border-shell-kbd hover:text-shell-text focus-visible:ring-3 focus-visible:ring-ring/50",
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
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el Hub"
            aria-label="Buscar en el Hub"
            className="h-[38px] w-full rounded-12 border border-shell-chip bg-shell-surface pr-10 pl-9 text-[13px] text-shell-text placeholder:text-shell-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md border border-shell-border bg-shell-chip px-1.5 py-0.5 font-mono text-[10px] text-shell-muted">
            ⌘K
          </kbd>
        </div>
      )}

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {rail ? (
              <div className="mx-2 mb-1 h-px bg-shell-chip" aria-hidden="true" />
            ) : (
              <span className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.12em] text-shell-faint uppercase">
                {group.title}
              </span>
            )}
            {group.items.map((item) => {
              const active = isNavActive(pathname, item.href, item.exact);
              const Icon = item.icon;
              const count = countByHref[item.href];
              const link = (
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex h-[36px] w-full items-center gap-2.5 rounded-11 transition-colors after:absolute after:content-[''] after:-inset-y-px focus-visible:ring-3 focus-visible:ring-ring/50",
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
                      {count !== undefined && count > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-px font-mono text-[10px] font-semibold",
                            active
                              ? "bg-white/20 text-white"
                              : "bg-shell-chip text-shell",
                          )}
                        >
                          {count}
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
        {sinResultados && (
          <p className="px-3 pb-1 text-[12px] text-shell-faint">
            Sin resultados para &quot;{query}&quot;
          </p>
        )}
      </nav>
    </>
  );
}

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const mobileOpen = useSidebarStore((s) => s.mobileOpen);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);

  // Cierre del drawer móvil con Escape (misma convención que notification-panel).
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, setMobileOpen]);

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
            className="absolute inset-0 bg-[#191113]/50 backdrop-blur-[2px]"
          />
          <aside id="sidebar-drawer" className="absolute inset-y-0 left-0 flex w-[264px] flex-col rounded-r-[26px] border-r border-shell-border bg-shell-surface px-3.5 py-3.5">
            <SidebarContent rail={false} />
          </aside>
        </div>
      )}
    </TooltipProvider>
  );
}