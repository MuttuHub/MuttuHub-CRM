// Pestaña "Historial" de la ficha (carril X, UX-1): un segmentado que agrupa las modificaciones, las
// versiones y la auditoría, que antes compartían la pestaña "Cambios" con los KPI. Abre en
// Modificaciones (la cola de trabajo del día a día). Solo se monta el segmento activo, igual que las
// pestañas de la ficha.

"use client";

import { ProjectHistorial } from "@/components/proyectos/project-historial";
import { ProjectModificaciones } from "@/components/proyectos/project-modificaciones";
import { ProjectVersiones } from "@/components/proyectos/project-versiones";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectModifications, useProjectVersions, type ProjectListRow } from "@/hooks/projects";

const PANEL_CLASS = "mt-0 flex flex-col gap-6";

/**
 * « · N» after a segment name, only once its data loaded (nothing while loading or on error). A bare text node,
 * so the tab reads as one run («Versiones · 3»): a wrapping element would lose the space in the accessible name.
 */
function ContadorSegmento({ cantidad }: { cantidad: number | undefined }) {
  return cantidad === undefined ? null : ` · ${cantidad}`;
}

// Same queries (same keys) as the Modificaciones and Versiones segments: no extra request once a segment is
// open. They are mounted only outside BORRADOR, where those segments read nothing either.
function ContadorModificaciones({ proyectoId }: { proyectoId: string }) {
  const query = useProjectModifications(proyectoId);
  return <ContadorSegmento cantidad={query.isSuccess ? query.data?.length : undefined} />;
}

function ContadorVersiones({ proyectoId }: { proyectoId: string }) {
  const query = useProjectVersions(proyectoId);
  return <ContadorSegmento cantidad={query.isSuccess ? query.data?.length : undefined} />;
}

export function FichaHistorial({ proyecto }: { proyecto: ProjectListRow }) {
  const contar = proyecto.estado !== "BORRADOR";
  return (
    <Tabs defaultValue="modificaciones" className="flex flex-col gap-0">
      <TabsList variant="pill" className="w-full justify-start">
        <TabsTrigger value="modificaciones">
          Modificaciones
          {contar && <ContadorModificaciones proyectoId={proyecto.id} />}
        </TabsTrigger>
        <TabsTrigger value="versiones">
          Versiones
          {contar && <ContadorVersiones proyectoId={proyecto.id} />}
        </TabsTrigger>
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
