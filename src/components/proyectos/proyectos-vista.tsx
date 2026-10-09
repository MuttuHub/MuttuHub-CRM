// Vistas de `/proyectos` (S9 U6, D6): "Portafolio" (el listado de siempre) y "Tablero" (KPIs del portafolio,
// `?vista=tablero`). La pestaña Tablero solo se ofrece a quien puede leer el portafolio completo
// (ADMINISTRADOR, GERENCIA o un usuario con la bandera `puede_ver_tablero_gerencial`) o es COORDINADOR; el
// resto ve únicamente el listado. Es comodidad de UI: el alcance real lo aplica la API (403 / filtro por
// membresía), de modo que abrir `?vista=tablero` a mano sin permiso no muestra nada del tablero.

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProjectDashboard } from "@/components/proyectos/project-dashboard";
import { ProjectList } from "@/components/proyectos/project-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/kanban";
import { canViewPortfolio } from "@/lib/permissions";

const VISTA_TABLERO = "tablero";
const VISTA_PORTAFOLIO = "portafolio";

export function ProyectosVista() {
  const usuario = useCurrentUser().data;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const puedeVerTablero = usuario
    ? canViewPortfolio({
        id: usuario.id,
        rol: usuario.rol,
        puede_ver_tablero_gerencial: usuario.puede_ver_tablero_gerencial ?? false,
      }) || usuario.rol === "COORDINADOR"
    : false;

  if (!puedeVerTablero) return <ProjectList />;

  const vista = search.get("vista") === VISTA_TABLERO ? VISTA_TABLERO : VISTA_PORTAFOLIO;

  return (
    <Tabs
      value={vista}
      onValueChange={(next) => router.replace(next === VISTA_TABLERO ? `${pathname}?vista=${VISTA_TABLERO}` : pathname)}
    >
      <TabsList variant="line">
        <TabsTrigger value={VISTA_PORTAFOLIO}>Portafolio</TabsTrigger>
        <TabsTrigger value={VISTA_TABLERO}>Tablero</TabsTrigger>
      </TabsList>
      <TabsContent value={VISTA_PORTAFOLIO}>
        <ProjectList />
      </TabsContent>
      <TabsContent value={VISTA_TABLERO}>
        <ProjectDashboard />
      </TabsContent>
    </Tabs>
  );
}
