// Pestaña "Finanzas" de la ficha (carril X, UX-1): un segmentado que agrupa el resumen financiero, los
// gastos y el presupuesto, que antes vivían en tres pestañas. En BORRADOR abre en Presupuesto, el único
// segmento editable entonces; en el resto de estados abre en Resumen. Solo se monta el segmento activo,
// igual que las pestañas de la ficha. El segmento activo es controlado: «Ver todos los gastos» del Resumen cambia a
// Gastos, y la cabecera puede abrir Finanzas directo en Gastos con el formulario «Registrar gasto» abierto.
// AJ-09: junto al segmentado, «Solicitar traslado» abre el formulario simple de traslado entre rubros para
// quien puede solicitar una modificación (gestores e integrantes del equipo, con el proyecto en ejecución).

"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ProjectFinanciero } from "@/components/proyectos/project-financiero";
import { ProjectGastos } from "@/components/proyectos/project-gastos";
import { usePuedeSolicitarModificacion } from "@/components/proyectos/project-modificaciones";
import { ProjectPresupuesto } from "@/components/proyectos/project-presupuesto";
import { TrasladoForm } from "@/components/proyectos/traslado-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [trasladoAbierto, setTrasladoAbierto] = useState(false);
  // A convenience, like every button by role: the API decides who may request.
  const puedeSolicitar = usePuedeSolicitarModificacion(proyecto);

  return (
    <Tabs
      value={segmento}
      onValueChange={(valor) => setSegmento(valor as Segmento)}
      className="flex flex-col gap-0"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <TabsList variant="pill" className="w-full justify-start sm:min-w-0 sm:flex-1">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="gastos">
            Gastos
            <ContadorGastos proyectoId={proyecto.id} />
          </TabsTrigger>
          <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>
        </TabsList>
        {puedeSolicitar && (
          <Button type="button" variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => setTrasladoAbierto(true)}>
            <ArrowLeftRight />
            Solicitar traslado
          </Button>
        )}
      </div>
      <Dialog open={trasladoAbierto} onOpenChange={setTrasladoAbierto}>
        <DialogContent className="sm:max-w-[min(560px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>Solicitar traslado</DialogTitle>
            <DialogDescription>
              Indica de qué rubro sale el valor, a cuál entra y por qué. El sistema lo reparte entre los meses que
              siguen abiertos. Gerencia revisa la solicitud y, si la aprueba, se crea una nueva versión del presupuesto.
            </DialogDescription>
          </DialogHeader>
          {trasladoAbierto && <TrasladoForm proyecto={proyecto} onDone={() => setTrasladoAbierto(false)} />}
        </DialogContent>
      </Dialog>

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
