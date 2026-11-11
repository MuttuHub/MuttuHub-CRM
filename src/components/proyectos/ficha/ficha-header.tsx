// Encabezado de la ficha (U2; rediseño S2/S6; T10 igual al prototipo clicable): «← Proyectos», código y el título
// «nombre · estado» (enfocable para devolverle el foco); debajo, cliente y responsable. A la derecha «Registrar
// gasto», «Registrar avance» (según la pestaña: Actividades y Finanzas solo dejan el gasto) y el menú "⋯" con
// «Cambiar estado», la exportación a Excel y la ficha imprimible. «Aprobar línea base» es la acción principal en
// BORRADOR, así que queda como botón visible. Los semáforos son opcionales: el Resumen ya los explica en sus
// cifras, así que quien monta la ficha decide en qué pestañas se muestran (`mostrarSemaforos`). En el teléfono
// las acciones de ejecución pasan a una barra inferior fija (Documentos usa la suya); se decide con `matchMedia`
// para no duplicar los botones en el DOM.

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Download, Ellipsis, Printer } from "lucide-react";
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
import { BaselineApproval } from "@/components/proyectos/baseline-approval";
import { useIsMobile } from "@/components/proyectos/capture-surface";
import { useEjecucionPermisos } from "@/components/proyectos/project-ejecucion";
import { ESTADO_PROYECTO_META } from "@/components/proyectos/project-display";
import { ProjectKpisPanel } from "@/components/proyectos/project-kpis-panel";
import { SemaforoChip } from "@/components/proyectos/semaforo-chip";
import { useProjectKpis, type ProjectListRow } from "@/hooks/projects";
import {
  AvisoCongelado,
  EstadoProyectoAcciones,
  usePuedeCambiarEstado,
} from "@/components/proyectos/estado-proyecto-acciones";
import { cn } from "@/lib/utils";

/** Pestañas a las que el encabezado puede llevar. */
export type FichaDestino = "actividades" | "finanzas";

/** Id del título de la ficha: otros bloques (p. ej. el aviso de Novedades al cerrarse) le devuelven el foco. */
export const FICHA_TITULO_ID = "ficha-titulo";

const CHIP_BUTTON_CLASS =
  "rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer";

/** The ficha's tabs, as far as the header cares (which execution actions each one keeps). */
export type FichaPestana = "resumen" | "actividades" | "finanzas" | "documentos" | "historial";

type AccionEjecucion = "gasto" | "avance";

/**
 * Execution actions per tab, as in the prototype (`headerActions`, `mobileBar`): Actividades registers avance
 * per activity, so it and Finanzas keep only «Registrar gasto»; on phones Documentos uses its own «Subir
 * documento» bar instead. Order is always gasto, then avance (the primary one).
 */
function accionesDePestana(pestana: FichaPestana, movil: boolean): AccionEjecucion[] {
  if (pestana === "actividades" || pestana === "finanzas") return ["gasto"];
  if (movil && pestana === "documentos") return [];
  return ["gasto", "avance"];
}

/**
 * Whether «Registrar gasto» is the primary (filled) button. One rule for the header and the phone bar, following
 * the prototype, which differs between them: on desktop it is primary whenever «Registrar avance» is not next to
 * it (Actividades and Finanzas); in the phone bar only Finanzas fills it, and Actividades keeps it outlined.
 */
export function gastoEsPrincipal(acciones: readonly AccionEjecucion[], movil: boolean, pestana: FichaPestana): boolean {
  if (movil) return pestana === "finanzas";
  return !acciones.includes("avance");
}

export function FichaHeader({
  proyecto,
  onIrA,
  onRegistrarAvance,
  onRegistrarGasto,
  mostrarSemaforos = true,
  pestana = "resumen",
  backHref,
}: {
  proyecto: ProjectListRow;
  onIrA: (destino: FichaDestino) => void;
  /** Opens the «Registrar avance» dialog on top of the current tab. */
  onRegistrarAvance: () => void;
  /** Opens the «Registrar gasto» dialog on top of the current tab; without it the button only switches to Finanzas. */
  onRegistrarGasto?: () => void;
  /** The semáforo chips; the Resumen leaves them out because its figures carry the color and its reason. */
  mostrarSemaforos?: boolean;
  /** The active tab: it decides which execution actions the header and the phone bar keep. */
  pestana?: FichaPestana;
  /** Where «← Proyectos» goes; without it there is no back link. */
  backHref?: string;
}) {
  const estado = ESTADO_PROYECTO_META[proyecto.estado];
  const [exportando, setExportando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const movil = useIsMobile();
  // Same rule as `ProjectGastos` and the activity cards (manager or team member, project running); the API decides.
  const { canWrite } = useEjecucionPermisos(proyecto.id);
  const puedeEjecutar = canWrite && proyecto.estado === "EN_EJECUCION";
  const puedeCambiarEstado = usePuedeCambiarEstado(proyecto);
  const registrarGasto = onRegistrarGasto ?? (() => onIrA("finanzas"));
  const acciones = puedeEjecutar ? accionesDePestana(pestana, movil) : [];

  return (
    <header
      data-testid="ficha-header"
      className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 p-5 sm:p-6"
    >
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Volver a proyectos"
            className="mb-1 inline-block w-fit rounded-sm text-[13px] text-ink-700 underline underline-offset-2 outline-none hover:text-ink-950 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            ← Proyectos
          </Link>
        )}
        <span className="block font-mono text-[12px] font-semibold text-ink-600 tabular-nums">{proyecto.codigo}</span>
        {/* As in the prototype, the state is part of the title («nombre · estado») instead of a chip. */}
        <h1
          id={FICHA_TITULO_ID}
          tabIndex={-1}
          className="mt-0.5 font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950 outline-none"
        >
          <span>{proyecto.nombre}</span> · <span>{estado.label}</span>
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
        {!movil &&
          acciones.map((accion) =>
            accion === "gasto" ? (
              <Button
                key={accion}
                type="button"
                size="sm"
                variant={gastoEsPrincipal(acciones, movil, pestana) ? "default" : "outline"}
                onClick={registrarGasto}
              >
                Registrar gasto
              </Button>
            ) : (
              <Button key={accion} type="button" size="sm" onClick={onRegistrarAvance}>
                Registrar avance
              </Button>
            ),
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
            {puedeCambiarEstado && (
              <DropdownMenuItem onClick={() => setCambiandoEstado(true)}>
                <ArrowRightLeft strokeWidth={1.8} />
                Cambiar estado
              </DropdownMenuItem>
            )}
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

      {movil && acciones.length > 0 && (
        <BarraAcciones
          acciones={acciones}
          gastoPrincipal={gastoEsPrincipal(acciones, movil, pestana)}
          onRegistrarAvance={onRegistrarAvance}
          onRegistrarGasto={registrarGasto}
        />
      )}

      <EstadoProyectoAcciones proyecto={proyecto} open={cambiandoEstado} onOpenChange={setCambiandoEstado} />

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
 * Barra inferior fija del teléfono con las acciones de ejecución de la pestaña (botones de 44 px), en el orden
 * del prototipo: «Registrar gasto | Registrar avance». Quien monta la ficha reserva abajo su alto para que no
 * tape la última fila.
 */
function BarraAcciones({
  acciones,
  gastoPrincipal,
  onRegistrarAvance,
  onRegistrarGasto,
}: {
  acciones: AccionEjecucion[];
  gastoPrincipal: boolean;
  onRegistrarAvance: () => void;
  onRegistrarGasto: () => void;
}) {
  return (
    <div
      data-testid="ficha-barra-acciones"
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 grid gap-2 border-t border-ink-200 bg-panel px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        acciones.length > 1 ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      {acciones.map((accion) =>
        accion === "gasto" ? (
          <Button
            key={accion}
            type="button"
            variant={gastoPrincipal ? "default" : "outline"}
            className="w-full"
            onClick={onRegistrarGasto}
          >
            Registrar gasto
          </Button>
        ) : (
          <Button key={accion} type="button" className="w-full" onClick={onRegistrarAvance}>
            Registrar avance
          </Button>
        ),
      )}
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
