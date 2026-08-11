import {
  FileText,
  FolderOpen,
  House,
  Settings,
  SquareKanban,
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
      { href: "/tablero", label: "Tablero", icon: SquareKanban },
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
    ],
  },
];

export type PageHeader = {
  title: string;
  subtitle: string;
};

export const PAGE_HEADERS: Record<string, PageHeader> = {
  "/": {
    title: "Hola, Adriana",
    subtitle:
      "Jueves 6 de agosto · 3 compromisos vencidos y 4 tareas que vencen hoy.",
  },
  "/clientes": {
    title: "Aliados y clientes",
    subtitle:
      "Busca, filtra y abre la ficha completa de cada cliente.",
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
};

export function isNavActive(pathname: string, href: string, exact = false): boolean {
  if (!exact) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }
  return pathname === href;
}
