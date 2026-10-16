// Encabezado de la ficha (U2): código y nombre a la izquierda; a la derecha el estado, los dos semáforos
// (únicos de la ficha, cada uno lleva a su pestaña), las acciones principales según rol y estado, y el menú
// "⋯" con la exportación a Excel y la ficha imprimible. «Aprobar línea base» es la acción principal en BORRADOR, así que queda
// como botón visible y no escondida en el menú.

"use client";

import { useState } from "react";
import { Download, Ellipsis, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusChip } from "@/components/ui/status-chip";
import { BaselineApproval } from "@/components/proyectos/baseline-approval";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display";
import { ProjectKpisPanel } from "@/components/proyectos/project-kpis-panel";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { useProjectKpis, type ProjectListRow } from "@/hooks/projects";

/** Pestañas a las que el encabezado puede llevar. */
export type FichaDestino = "actividades" | "finanzas";

const CHIP_BUTTON_CLASS =
  "rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer";

export function FichaHeader({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: FichaDestino) => void;
}) {
  const estado = ESTADO_PROYECTO_META[proyecto.estado];
  const [exportando, setExportando] = useState(false);

  return (
    <header
      data-testid="ficha-header"
      className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 p-5 sm:p-6"
    >
      <div className="min-w-0">
        <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">
          {proyecto.codigo}
        </span>
        <h1 className="mt-0.5 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">
          {proyecto.nombre}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={estado.tone}>{estado.label}</StatusChip>
        {proyecto.estado !== "BORRADOR" && (
          <FichaSemaforos proyectoId={proyecto.id} onIrA={onIrA} />
        )}
        <FichaAcciones proyecto={proyecto} onIrA={onIrA} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="outline" size="icon" aria-label="Más acciones">
                <Ellipsis className="size-4" strokeWidth={1.8} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuItem onClick={() => setExportando(true)}>
              <Download strokeWidth={1.8} />
              Exportar a Excel
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<a href={`/proyectos/${encodeURIComponent(proyecto.id)}/imprimir`} target="_blank" rel="noopener noreferrer" />}
            >
              <Printer strokeWidth={1.8} />
              Imprimir / PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={exportando} onOpenChange={setExportando}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(560px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Exportar a Excel
            </DialogTitle>
            <DialogDescription>Elige el corte y la base, y descarga la ficha.</DialogDescription>
          </DialogHeader>
          {exportando && <ProjectKpisPanel proyecto={proyecto} soloExportar />}
        </DialogContent>
      </Dialog>
    </header>
  );
}

/**
 * Semáforos del encabezado. Reutilizan la consulta de la sección Indicadores (misma clave: sin corte, base
 * vigente), así que no se pide dos veces ni se recalcula nada: el color llega del servidor. Un proyecto fuera de
 * ejecución (`medible: false`) no tiene semáforo. Cada chip es un botón que lleva a la pestaña de su causa.
 */
function FichaSemaforos({
  proyectoId,
  onIrA,
}: {
  proyectoId: string;
  onIrA: (destino: FichaDestino) => void;
}) {
  const kpis = useProjectKpis(proyectoId, null, "vigente").data;
  if (!kpis || !kpis.medible) return null;
  return (
    <>
      {kpis.tecnico && (
        <button type="button" className={CHIP_BUTTON_CLASS} onClick={() => onIrA("actividades")}>
          <SemaforoChip color={kpis.tecnico.color} prefix="Semáforo técnico" />
        </button>
      )}
      {kpis.financiero && (
        <button type="button" className={CHIP_BUTTON_CLASS} onClick={() => onIrA("finanzas")}>
          <SemaforoChip color={kpis.financiero.color} prefix="Semáforo financiero" />
        </button>
      )}
    </>
  );
}

/**
 * Acciones principales. Solo hay una con énfasis (la primera visible). «Registrar gasto» sigue la regla de
 * `ProjectGastos` (gestor o COORDINADOR integrante, con el proyecto en ejecución), que es la misma de
 * `useEjecucionPermisos`; la API sigue siendo la autoridad.
 */
function FichaAcciones({
  proyecto,
  onIrA,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: FichaDestino) => void;
}) {
  const { canWrite } = useEjecucionPermisos(proyecto.id);
  const puedeEjecutar = canWrite && proyecto.estado === "EN_EJECUCION";

  return (
    <>
      <BaselineApproval proyecto={proyecto} triggerVariant="default" />
      {puedeEjecutar && (
        <>
          <Button type="button" size="sm" onClick={() => onIrA("actividades")}>
            Registrar avance
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onIrA("finanzas")}>
            Registrar gasto
          </Button>
        </>
      )}
    </>
  );
}
