import {
  FileText,
  FolderOpen,
  House,
  Settings,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: string;
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
      { href: "/clientes", label: "Clientes", icon: Users, count: "34" },
      {
        href: "/tablero",
        label: "Tablero",
        icon: SquareKanban,
        count: "27",
      },
      {
        href: "/documentos",
        label: "Documentos",
        icon: FolderOpen,
        count: "118",
      },
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
      "7 aliados de demostración · la ficha completa llega en el Hito 2.",
  },
  "/tablero": {
    title: "Tablero del equipo",
    subtitle: "27 tareas abiertas · el Kanban llega en el Hito 3 del roadmap.",
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
};

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}
