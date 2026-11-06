// Encabezado de la ficha (U2; rediseño S2/S6): código, nombre (título de la página, enfocable para devolverle el
// foco) y estado; debajo, cliente y responsable. A la derecha las acciones principales según rol y estado y el
// menú "⋯" con la exportación a Excel y la ficha imprimible. «Aprobar línea base» es la acción principal en
// BORRADOR, así que queda como botón visible. Los semáforos son opcionales: el Resumen ya los explica en sus
// cifras, así que quien monta la ficha decide en qué pestañas se muestran (`mostrarSemaforos`). En el teléfono
// «Registrar avance» y «Registrar gasto» pasan a una barra inferior fija; se decide con `matchMedia` para no
// duplicar los botones en el DOM.

"use client";

import { useState } from "react";
import Link from "next/link";
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
import { useIsMobile } from "@/components/proyectos/capture-surface";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display";
import { ProjectKpisPanel } from "@/components/proyectos/project-kpis-panel";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { useProjectKpis, type ProjectListRow } from "@/hooks/projects";
import { AvisoCongelado, EstadoProyectoAcciones } from "@/components/proyectos/estado-proyecto-acciones";

/** Pestañas a las que el encabezado puede llevar. */
export type FichaDestino = "actividades" | "finanzas";

/** Id del título de la ficha: otros bloques (p. ej. el aviso de Novedades al cerrarse) le devuelven el foco. */
export const FICHA_TITULO_ID = "ficha-titulo";

const CHIP_BUTTON_CLASS =
  "rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer";

export function FichaHeader({
  proyecto,
  onIrA,
  onRegistrarAvance,
  onRegistrarGasto,
  mostrarSemaforos = true,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: FichaDestino) => void;
  /** Opens the «Registrar avance» dialog on top of the current tab. */
  onRegistrarAvance: () => void;
  /** Opens the «Registrar gasto» dialog on top of the current tab; without it the button only switches to Finanzas. */
  onRegistrarGasto?: () => void;
  /** The semáforo chips; the Resumen leaves them out because its figures carry the color and its reason. */
  mostrarSemaforos?: boolean;
}) {
  const estado = ESTADO_PROYECTO_META[proyecto.estado];
  const [exportando, setExportando] = useState(false);
  const movil = useIsMobile();
  // Same rule as `ProjectGastos` and the activity cards (manager or team member, project running); the API decides.
  const { canWrite } = useEjecucionPermisos(proyecto.id);
  const puedeEjecutar = canWrite && proyecto.estado === "EN_EJECUCION";
  const registrarGasto = onRegistrarGasto ?? (() => onIrA("finanzas"));

  return (
    <header
      data-testid="ficha-header"
      className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 p-5 sm:p-6"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-ink-600 tabular-nums">{proyecto.codigo}</span>
          <StatusChip tone={estado.tone}>{estado.label}</StatusChip>
        </div>
        <h1
          id={FICHA_TITULO_ID}
          tabIndex={-1}
          className="mt-0.5 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950 outline-none"
        >
          {proyecto.nombre}
        </h1>
        <p data-testid="ficha-header-cliente" className="mt-0.5 hidden text-[13px] text-ink-600 sm:block">
          {`${proyecto.cliente.nombre} · Responsable: ${proyecto.responsable?.nombre ?? "Sin asignar"}`}
        </p>
        <AvisoCongelado estado={proyecto.estado} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mostrarSemaforos && proyecto.estado !== "BORRADOR" && (
          <FichaSemaforos proyectoId={proyecto.id} onIrA={onIrA} />
        )}
        <BaselineApproval proyecto={proyecto} triggerVariant="default" />
        <EstadoProyectoAcciones proyecto={proyecto} />
        {puedeEjecutar && !movil && (
          <>
            <Button type="button" size="sm" onClick={onRegistrarAvance}>
              Registrar avance
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={registrarGasto}>
              Registrar gasto
            </Button>
          </>
        )}
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
              render={<Link href={`/proyectos/${encodeURIComponent(proyecto.id)}/imprimir`} />}
            >
              <Printer strokeWidth={1.8} />
              Imprimir / PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {puedeEjecutar && movil && (
        <BarraAcciones onRegistrarAvance={onRegistrarAvance} onRegistrarGasto={registrarGasto} />
      )}

      <Dialog open={exportando} onOpenChange={setExportando}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(560px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink-950">
              Exportar a Excel
            </DialogTitle>
            <DialogDescription>Elige hasta qué fecha calcular y con qué plan comparar, y descarga la ficha.</DialogDescription>
          </DialogHeader>
          {exportando && <ProjectKpisPanel proyecto={proyecto} soloExportar />}
        </DialogContent>
      </Dialog>
    </header>
  );
}

/**
 * Barra inferior fija del teléfono con las dos acciones de ejecución (botones de 44 px). Quien monta la ficha
 * reserva abajo su alto para que no tape la última fila.
 */
function BarraAcciones({
  onRegistrarAvance,
  onRegistrarGasto,
}: {
  onRegistrarAvance: () => void;
  onRegistrarGasto: () => void;
}) {
  return (
    <div
      data-testid="ficha-barra-acciones"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-ink-200 bg-panel px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <Button type="button" className="w-full" onClick={onRegistrarAvance}>
        Registrar avance
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={onRegistrarGasto}>
        Registrar gasto
      </Button>
    </div>
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
