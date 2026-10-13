"use client";

// v7 alignment, unit C1a: the Clientes sub-navigation shell. Seven sections —
// the user's list, so v7's extra "Convocatorias" is intentionally left out —
// each backed by its own route under `/clientes`. These items navigate between
// pages, so they are links carrying `aria-current="page"` (the app's route
// convention, see `shell/sidebar.tsx`), not an ARIA tablist: tabs own in-page
// panels, and every section here is its own route with its own content.
//
// Only Aliados has real content today; the other six routes render the honest
// placeholder in `clientes-section-placeholder.tsx` until units C2..C7 land.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type ClientesSection = {
  href: string;
  label: string;
};

/** The v7 CRM sections, in the order the user asked for them. */
export const CLIENTES_SECTIONS: readonly ClientesSection[] = [
  { href: "/clientes", label: "Aliados" },
  { href: "/clientes/oportunidades", label: "Oportunidades" },
  { href: "/clientes/interacciones", label: "Interacciones" },
  { href: "/clientes/relaciones", label: "Relaciones" },
  { href: "/clientes/salud", label: "Salud" },
  { href: "/clientes/mapa", label: "Mapa" },
  { href: "/clientes/automatizaciones", label: "Automatizaciones" },
];

/** Exact match: `/clientes` must not stay active on `/clientes/oportunidades`. */
export function clientesSectionActive(pathname: string, href: string): boolean {
  return pathname === href;
}

export function ClientesSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones de clientes"
      className="no-scrollbar overflow-x-auto border-b border-ink-200"
    >
      <ul className="flex w-max items-center gap-5">
        {CLIENTES_SECTIONS.map((section) => {
          const active = clientesSectionActive(pathname, section.href);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center pb-3 whitespace-nowrap text-[15.5px] transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-primary after:transition-opacity focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "font-semibold text-ink-950 after:opacity-100"
                    : "font-medium text-ink-600 after:opacity-0 hover:text-ink-900",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
