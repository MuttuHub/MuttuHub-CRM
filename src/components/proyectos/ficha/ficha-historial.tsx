// Pestaña "Historial" de la ficha (carril X, UX-1): un segmentado que agrupa las modificaciones, las
// versiones y la auditoría, que antes compartían la pestaña "Cambios" con los KPI. Abre en
// Modificaciones (la cola de trabajo del día a día). Solo se monta el segmento activo, igual que las
// pestañas de la ficha.

"use client";

import { ProjectHistorial } from "@/components/proyectos/project-historial";
import { ProjectModificaciones } from "@/components/proyectos/project-modificaciones";
import { ProjectVersiones } from "@/components/proyectos/project-versiones";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectListRow } from "@/hooks/projects";

const PANEL_CLASS = "mt-0 flex flex-col gap-6";

export function FichaHistorial({ proyecto }: { proyecto: ProjectListRow }) {
  return (
    <Tabs defaultValue="modificaciones" className="flex flex-col gap-0">
      <TabsList variant="pill" className="w-full justify-start">
        <TabsTrigger value="modificaciones">Modificaciones</TabsTrigger>
        <TabsTrigger value="versiones">Versiones</TabsTrigger>
        <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
      </TabsList>

      <TabsContent value="modificaciones" className={PANEL_CLASS}>
        <ProjectModificaciones proyecto={proyecto} />
      </TabsContent>

      <TabsContent value="versiones" className={PANEL_CLASS}>
        <ProjectVersiones proyecto={proyecto} />
      </TabsContent>

      <TabsContent value="auditoria" className={PANEL_CLASS}>
        <ProjectHistorial proyecto={proyecto} />
      </TabsContent>
    </Tabs>
  );
}
