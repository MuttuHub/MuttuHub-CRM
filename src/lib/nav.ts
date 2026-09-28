import {
  BarChart2,
  FileText,
  FolderOpen,
  House,
  Settings,
  SquareKanban,
  Target,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact-match only (no prefix): for items whose path starts with another item's. */
  exact?: boolean;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operación",
    items: [
      { href: "/", label: "Inicio", icon: House },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/proyectos", label: "Proyectos", icon: Target },
      {
        href: "/tablero",
        label: "Tablero",
        icon: SquareKanban,
        // Exact-match: "/tablero" is a prefix of "/tablero-gerencial" (a
        // sibling item elsewhere in nav), so without this both lit up
        // together when Tablero Gerencial was active. /tablero has no nested
        // sub-routes (task detail is a dialog via query param, not a path).
        exact: true,
      },
      { href: "/documentos", label: "Documentos", icon: FolderOpen },
      { href: "/reportes", label: "Reportes", icon: FileText },
    ],
  },
  {
    title: "Dirección",
    items: [
      {
        href: "/administracion",
        label: "Administración",
        icon: Settings,
        // Exact-match: /administracion/solicitudes is a sibling listed in the
        // same group — without this, both items stay highlighted there.
        exact: true,
      },
      {
        href: "/administracion/solicitudes",
        label: "Solicitudes de acceso",
        icon: UserRoundCheck,
        exact: true,
      },
      {
        // F1.6 (tablero-gerencial-unificado): apunta a la 5.ª cara del
        // shell de Inicio en vez de a la ruta standalone eliminada. La ruta
        // vieja sigue existiendo como redirect 308 (bookmarks externos).
        href: "/?cara=management",
        label: "Tablero Gerencial",
        icon: BarChart2,
      },
    ],
  },
];

export type PageHeader = {
  title: string;
  subtitle: string;
};

export const PAGE_HEADERS: Record<string, PageHeader> = {
  // "/" is a placeholder: header.tsx overrides it with the signed-in user's
  // first name, today's date and real notification counts.
  "/": { title: "Hola", subtitle: "" },
  "/clientes": {
    title: "Aliados y clientes",
    subtitle:
      "Busca, filtra y abre la ficha completa de cada cliente.",
  },
  "/proyectos": {
    title: "Proyectos",
    subtitle: "Crea, filtra y abre el workspace de cada proyecto.",
  },
  "/tablero": {
    title: "Tablero del equipo",
    subtitle: "Tareas y compromisos del equipo en un solo tablero.",
  },
  "/documentos": {
    title: "Repositorio documental",
    subtitle: "Archivos versionados con metadatos: búscalos, súbelos y descárgalos.",
  },
  "/reportes": {
    title: "Reportes",
    subtitle: "Reportes de tareas y caras del dashboard · exportables a Excel y PDF.",
  },
  "/administracion": {
    title: "Usuarios y permisos",
    subtitle: "Crea usuarios, asigna roles y desactiva accesos.",
  },
  "/administracion/solicitudes": {
    title: "Solicitudes de acceso",
    subtitle: "Revisa quién pidió entrar al Hub y asigna el rol antes de aprobar.",
  },
  // "/tablero-gerencial" ya no tiene entrada propia (F1.6): la ruta ahora es
  // un redirect a "/", que ya resuelve su propio header dinámicamente.
};

/**
 * F1.6 (tablero-gerencial-unificado, design.md D3): un `href` puede llevar
 * un `cara=` query (ej. `/?cara=management`) para apuntar a una pestaña
 * específica del shell de Inicio. Sin esto, "Tablero Gerencial" e "Inicio"
 * se resaltarían juntos en `/` — acá se exige que el `cara` actual (leído
 * por el caller vía `useSearchParams`) coincida con el del item, además del
 * match de `pathname` de siempre. Un `href` sin query no cambia de
 * comportamiento (los demás items de nav no llevan uno).
 */
export function isNavActive(
  pathname: string,
  href: string,
  exact = false,
  searchParams?: URLSearchParams,
): boolean {
  const [hrefPath, hrefQuery] = href.split("?");
  const pathMatches = exact
    ? pathname === hrefPath
    : hrefPath === "/"
      ? pathname === "/"
      : pathname.startsWith(hrefPath);
  if (!pathMatches) return false;

  if (!hrefQuery) return true;
  const caraEsperada = new URLSearchParams(hrefQuery).get("cara");
  if (caraEsperada === null) return true;
  return (searchParams?.get("cara") ?? null) === caraEsperada;
}

/** Fallback header for `PAGE_HEADERS` lookups. */
const DEFAULT_PAGE_HEADER: PageHeader = { title: "Muttu Hub", subtitle: "" };

/**
 * Resolves the page header for a pathname: exact `PAGE_HEADERS` match first,
 * then a `/proyectos/` prefix fallback (the dynamic workspace route
 * `/proyectos/<id>` has no exact entry — its real title/código lives in the
 * in-page workspace header, T9), then the generic "Muttu Hub" default.
 */
export function resolvePageHeader(pathname: string): PageHeader {
  const exact = PAGE_HEADERS[pathname];
  if (exact) return exact;
  if (pathname.startsWith("/proyectos/")) return PAGE_HEADERS["/proyectos"]!;
  return DEFAULT_PAGE_HEADER;
}
