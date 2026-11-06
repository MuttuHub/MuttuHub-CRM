// Pestaña "Historial" de la ficha (rediseño «Interacciones-Historial»): un segmentado con el Registro de cambios
// (antes «Auditoría»), las Solicitudes de modificación y las Versiones del plan. Abre en el Registro de cambios.
// Solo se monta el segmento activo, igual que las pestañas de la ficha. En móvil los nombres se acortan
// («Solicitudes · N», «Versiones · N») y la fila se desplaza en horizontal.

"use client";

import { useState } from "react";
import { ProjectHistorial, type DestinoFicha } from "@/components/proyectos/project-historial";
import { ProjectModificaciones } from "@/components/proyectos/project-modificaciones";
import { ProjectVersiones } from "@/components/proyectos/project-versiones";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectModifications, useProjectVersions, type ProjectListRow } from "@/hooks/projects";

const PANEL_CLASS = "mt-0 flex flex-col gap-6";

export type SegmentoHistorial = "registro" | "solicitudes" | "versiones";
type Segmento = SegmentoHistorial;

/**
 * « · N» after a segment name, only once its data loaded (nothing while loading or on error). A bare text node,
 * so the tab reads as one run («Versiones del plan · 3»): a wrapping element would lose the space in the
 * accessible name.
 */
function ContadorSegmento({ cantidad }: { cantidad: number | undefined }) {
  return cantidad === undefined ? null : ` · ${cantidad}`;
}

// Same queries (same keys) as the Solicitudes and Versiones segments: no extra request once a segment is
// open. They are mounted only outside BORRADOR, where those segments read nothing either.
function ContadorModificaciones({ proyectoId }: { proyectoId: string }) {
  const query = useProjectModifications(proyectoId);
  return <ContadorSegmento cantidad={query.isSuccess ? query.data?.length : undefined} />;
}

function ContadorVersiones({ proyectoId }: { proyectoId: string }) {
  const query = useProjectVersions(proyectoId);
  return <ContadorSegmento cantidad={query.isSuccess ? query.data?.length : undefined} />;
}

/** The tail of a long name, dropped on phones. Its leading space lives inside, so the short name keeps none. */
function SoloEnPantallaAncha({ children }: { children: string }) {
  return <span className="hidden sm:inline">{children}</span>;
}

export function FichaHistorial({
  proyecto,
  onIrA,
  segmentoInicial = "registro",
}: {
  proyecto: ProjectListRow;
  /** Switches the ficha's tab: «Ver actividad» and «Ver gasto» of the change log. Without it those links hide. */
  onIrA?: (destino: DestinoFicha) => void;
  /** Segment to open on mount (the tab mounts lazily): «Solicitar modificación» from the Resumen lands on Solicitudes. */
  segmentoInicial?: SegmentoHistorial;
}) {
  const contar = proyecto.estado !== "BORRADOR";
  const [segmento, setSegmento] = useState<Segmento>(segmentoInicial);
  return (
    <Tabs
      value={segmento}
      onValueChange={(valor) => setSegmento(valor as Segmento)}
      className="flex flex-col gap-0"
    >
      <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <TabsList variant="pill" className="w-max min-w-full justify-start">
          <TabsTrigger value="registro" className="flex-none">
            Registro de cambios
          </TabsTrigger>
          <TabsTrigger value="solicitudes" className="flex-none">
            Solicitudes{" "}
            <SoloEnPantallaAncha>de modificación</SoloEnPantallaAncha>
            {contar && <ContadorModificaciones proyectoId={proyecto.id} />}
          </TabsTrigger>
          <TabsTrigger value="versiones" className="flex-none">
            Versiones{" "}
            <SoloEnPantallaAncha>del plan</SoloEnPantallaAncha>
            {contar && <ContadorVersiones proyectoId={proyecto.id} />}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="registro" className={PANEL_CLASS}>
        <ProjectHistorial proyecto={proyecto} onIrA={onIrA} />
      </TabsContent>

      <TabsContent value="solicitudes" className={PANEL_CLASS}>
        <ProjectModificaciones proyecto={proyecto} />
      </TabsContent>

      <TabsContent value="versiones" className={PANEL_CLASS}>
        <ProjectVersiones proyecto={proyecto} onVerSolicitudes={() => setSegmento("solicitudes")} />
      </TabsContent>
    </Tabs>
  );
}
