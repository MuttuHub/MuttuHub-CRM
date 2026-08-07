"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Menu } from "lucide-react";
import { PAGE_HEADERS } from "@/lib/nav";
import { DEMO_USER } from "@/lib/mock/demo";
import { useSidebarStore } from "@/store/sidebar";

export function Header() {
  const pathname = usePathname();
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
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
        <button
          type="button"
          className="hidden h-10 items-center gap-2 rounded-[13px] border border-ink-200 bg-white px-3.5 text-[13px] font-semibold text-ink-800 transition-colors hover:bg-ink-100 sm:inline-flex"
        >
          Este mes
          <ChevronDown className="size-3 text-ink-600" strokeWidth={1.8} />
        </button>

        <button
          type="button"
          aria-label="Alertas"
          className="relative grid size-10 place-items-center rounded-[13px] border border-ink-200 bg-white text-ink-700 transition-colors hover:bg-ink-100"
        >
          <Bell className="size-4" strokeWidth={1.7} />
          <span className="absolute top-[7px] right-[8px] size-[7px] rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        <div className="flex h-10 items-center gap-2.5 rounded-full border border-ink-200 bg-white py-1 pr-4 pl-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-700">
            {DEMO_USER.iniciales}
          </span>
          <span className="hidden text-[13px] font-semibold text-ink-900 sm:block">
            {DEMO_USER.nombre}
          </span>
        </div>
      </div>
    </div>
  );
}