// Pestaña "Finanzas" de la ficha (carril X, UX-1): un segmentado que agrupa el resumen financiero, los
// gastos y el presupuesto, que antes vivían en tres pestañas. En BORRADOR abre en Presupuesto, el único
// segmento editable entonces; en el resto de estados abre en Resumen. Solo se monta el segmento activo,
// igual que las pestañas de la ficha. El segmento activo es controlado: «Ver todos los gastos» del Resumen cambia a
// Gastos, y la cabecera puede abrir Finanzas directo en Gastos con el formulario «Registrar gasto» abierto.

"use client";

import { useState } from "react";
import { ProjectFinanciero } from "@/components/proyectos/project-financiero";
import { ProjectGastos } from "@/components/proyectos/project-gastos";
import { ProjectPresupuesto } from "@/components/proyectos/project-presupuesto";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectExpenses, type ProjectListRow } from "@/hooks/projects";

const PANEL_CLASS = "mt-0 flex flex-col gap-6";

/**
 * « · N» after a segment name, only once its data loaded (nothing while loading or on error). A bare text node,
 * so the tab reads as one run («Gastos · 3»): a wrapping element would lose the space in the accessible name.
 */
function ContadorSegmento({ cantidad }: { cantidad: number | undefined }) {
  return cantidad === undefined ? null : ` · ${cantidad}`;
}

/** Same expenses query as the Gastos segment (same key): no extra request once that segment is open. */
function ContadorGastos({ proyectoId }: { proyectoId: string }) {
  const query = useProjectExpenses(proyectoId);
  return <ContadorSegmento cantidad={query.isSuccess ? query.data?.gastos.length : undefined} />;
}

type Segmento = "resumen" | "gastos" | "presupuesto";

export function FichaFinanzas({
  proyecto,
  onVerActividades,
}: {
  proyecto: ProjectListRow;
  /** «Ver actividades» of the possible-delay notice: switches the ficha to Actividades. */
  onVerActividades?: () => void;
}) {
  const [segmento, setSegmento] = useState<Segmento>(proyecto.estado === "BORRADOR" ? "presupuesto" : "resumen");

  return (
    <Tabs
      value={segmento}
      onValueChange={(valor) => setSegmento(valor as Segmento)}
      className="flex flex-col gap-0"
    >
      <TabsList variant="pill" className="w-full justify-start">
        <TabsTrigger value="resumen">Resumen</TabsTrigger>
        <TabsTrigger value="gastos">
          Gastos
          <ContadorGastos proyectoId={proyecto.id} />
        </TabsTrigger>
        <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>
      </TabsList>

      <TabsContent value="resumen" className={PANEL_CLASS}>
        <ProjectFinanciero
          proyecto={proyecto}
          onVerActividades={onVerActividades}
          onVerGastos={() => setSegmento("gastos")}
        />
      </TabsContent>

      <TabsContent value="gastos" className={PANEL_CLASS}>
        <ProjectGastos proyecto={proyecto} />
      </TabsContent>

      <TabsContent value="presupuesto" className={PANEL_CLASS}>
        <ProjectPresupuesto proyecto={proyecto} />
      </TabsContent>
    </Tabs>
  );
}
