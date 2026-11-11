// «Validar gasto» panel (redesign T3, `Validar-gasto-propuesta` / `-movil-propuesta`): a full-screen dialog opened from
// «Revisar». Desktop: the «Por validar · N» list, the expense detail with its rubro balance, and the support. Phone:
// support on top, detail below, previous / next arrows in the header and a fixed action bar. Validating over the rubro
// stays blocked (open PO question 1): the balance says so and «Validar gasto» stays disabled with that reason; the API
// is still the authority (409 OVERSPEND_BLOCKED shows inline).

"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { HelpHint } from "@/components/ui/help-hint";
import { StatusChip } from "@/components/ui/status-chip";
import { useIsMobile } from "@/components/proyectos/capture-surface";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { AccionesPanelValidacion } from "@/components/proyectos/gasto-acciones";
import { TIPO_SOPORTE_LABELS } from "@/components/proyectos/gasto-form";
import { fechaDia } from "@/components/proyectos/ficha/historial/fechas";
import { InlineError } from "@/components/proyectos/ui";
import {
  downloadExpenseSoporte,
  useProjectBudget,
  type ProjectExpense,
  type ProjectExpenseEstado,
  type ProjectListRow,
} from "@/hooks/projects";
import { excederiaAsignado } from "@/lib/proyectos/ficha-financiera";
import { formatCOP, sumCents, toCents } from "@/lib/proyectos/money";
import { cn } from "@/lib/utils";
import { AYUDA_DISPONIBLE, AvisosGasto, SUPERA_ASIGNADO, monto, nombreRubro, textoIva } from "./gastos-comun";

export const SOPORTE_ERROR = "No pudimos abrir el soporte. Inténtalo de nuevo.";
const AVISO_SUPERA_BLOQUEO =
  "Este gasto deja el rubro por encima de lo asignado y por ahora no se puede validar. Puedes rechazarlo y pedir un traslado entre rubros.";

const ESTADO_TEXTO: Record<ProjectExpenseEstado, string> = {
  REGISTRADO: "por validar",
  VALIDADO: "validado",
  RECHAZADO: "rechazado",
  ANULADO: "anulado",
};

export type PanelValidacionProps = {
  proyecto: ProjectListRow;
  /** Every expense of the project (the same list the ledger reads); the panel picks the REGISTRADO ones. */
  gastos: readonly ProjectExpense[];
  gastoId: string;
  onSeleccionar: (id: string) => void;
  onCerrar: () => void;
  puedeValidar: boolean;
  usuarioId: string | null;
  nombreDe: (id: string) => string | null;
};

export function ValidarGastoPanel(props: PanelValidacionProps) {
  const { proyecto, gastos, gastoId, onSeleccionar, onCerrar } = props;
  const mobile = useIsMobile();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const pendientes = gastos.filter((g) => g.estado === "REGISTRADO");
  const gasto = gastos.find((g) => g.id === gastoId);
  const idx = pendientes.findIndex((g) => g.id === gastoId);

  const ir = (id: string, enfocarTitulo = true) => {
    onSeleccionar(id);
    // The heading keeps its node across expenses: move the focus to it once the new one is painted. The arrow keys
    // of the list keep the focus in the list instead.
    if (enfocarTitulo) queueMicrotask(() => tituloRef.current?.focus());
  };

  /** After validating or rejecting: the next pending expense, or close when none is left. */
  const siguiente = () => {
    const resto = pendientes.filter((g) => g.id !== gastoId);
    if (resto.length === 0) {
      onCerrar();
      return;
    }
    ir(resto[Math.min(Math.max(idx, 0), resto.length - 1)].id);
  };

  const anterior = idx > 0 ? pendientes[idx - 1] : undefined;
  const proximo = idx >= 0 ? pendientes[idx + 1] : undefined;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent
        showCloseButton={false}
        initialFocus={tituloRef}
        data-testid="validar-gasto-panel"
        className="top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">
              {mobile ? (idx >= 0 ? `Por validar · ${idx + 1} de ${pendientes.length}` : "Gasto") : "Validar gasto"}
            </DialogTitle>
            <p className="truncate text-[12px] text-ink-500">
              {proyecto.codigo} · {proyecto.nombre}
            </p>
          </div>
          {mobile && idx >= 0 && (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!anterior}
                aria-label={anterior ? `Gasto anterior: ${anterior.tercero_nombre}` : "Gasto anterior"}
                onClick={() => anterior && ir(anterior.id)}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!proximo}
                aria-label={proximo ? `Siguiente gasto: ${proximo.tercero_nombre}` : "Siguiente gasto"}
                onClick={() => proximo && ir(proximo.id)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
          <DialogClose
            render={<Button type="button" variant="ghost" size="icon" aria-label="Cerrar y volver a Finanzas" />}
          >
            <X />
          </DialogClose>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "grid gap-4 p-4",
              !mobile && "lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_minmax(0,1fr)]",
            )}
          >
            {!mobile && <ListaPorValidar pendientes={pendientes} actual={gastoId} onIr={ir} />}
            {gasto ? (
              mobile ? (
                <>
                  <SoporteGastoPanel proyectoId={proyecto.id} gasto={gasto} />
                  <DetalleGasto {...props} gasto={gasto} tituloRef={tituloRef} onHecho={siguiente} />
                </>
              ) : (
                <>
                  <DetalleGasto {...props} gasto={gasto} tituloRef={tituloRef} onHecho={siguiente} />
                  <SoporteGastoPanel proyectoId={proyecto.id} gasto={gasto} />
                </>
              )
            ) : (
              <p className="text-[13px] text-ink-600">
                <span ref={tituloRef} tabIndex={-1}>
                  No quedan gastos por validar.
                </span>
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListaPorValidar({
  pendientes,
  actual,
  onIr,
}: {
  pendientes: readonly ProjectExpense[];
  actual: string;
  onIr: (id: string, enfocarTitulo?: boolean) => void;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  function teclas(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const destino = pendientes[i + (event.key === "ArrowDown" ? 1 : -1)];
    if (!destino) return;
    onIr(destino.id, false);
    botones.current[i + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  }
  return (
    <nav aria-label="Gastos por validar" className="flex flex-col gap-2">
      <p className="text-[11px] font-bold tracking-[0.08em] text-ink-500 uppercase">Por validar · {pendientes.length}</p>
      {pendientes.length === 0 ? (
        <p className="text-[12.5px] text-ink-600">No quedan gastos por validar.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {pendientes.map((g, i) => (
            <li key={g.id}>
              <button
                ref={(el) => {
                  botones.current[i] = el;
                }}
                type="button"
                aria-current={g.id === actual ? "true" : undefined}
                onClick={() => onIr(g.id)}
                onKeyDown={(event) => teclas(event, i)}
                className={cn(
                  "flex w-full flex-col items-start gap-1 rounded-inner border border-border px-3 py-2 text-left transition-colors hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  g.id === actual && "border-primary bg-ink-50",
                )}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink-900">{g.tercero_nombre}</span>
                  <span className="shrink-0 font-mono text-[12px] text-ink-700 tabular-nums">{monto(g.valor)}</span>
                </span>
                <span className="text-[11.5px] text-ink-600">
                  {[nombreRubro(g.rubro), g.numero_documento, g.periodo_modificado ? `cuenta en ${g.periodo}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {g.alerta_sobregasto && <StatusChip dot={false} tone="destructivo">{SUPERA_ASIGNADO}</StatusChip>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11.5px] text-ink-500">{termino}</dt>
      <dd className="text-[13px] text-ink-900">{children}</dd>
    </div>
  );
}

function DetalleGasto({
  proyecto,
  gastos,
  gasto,
  puedeValidar,
  usuarioId,
  nombreDe,
  tituloRef,
  onHecho,
}: PanelValidacionProps & {
  gasto: ProjectExpense;
  tituloRef: React.RefObject<HTMLHeadingElement | null>;
  onHecho: () => void;
}) {
  const budget = useProjectBudget(proyecto.id);
  const pendiente = gasto.estado === "REGISTRADO";
  const propio = gasto.registrado_por_id === usuarioId;
  const registro = nombreDe(gasto.registrado_por_id);
  const identificacion = [gasto.tercero_tipo_id, gasto.tercero_numero_id].filter(Boolean).join(" ");

  // Same rule as the API (`excederiaAsignado` over the validated total of the rubro's line).
  const asignadoTexto = budget.data?.rubros?.find((r) => r.rubro_id === gasto.rubro.id)?.asignado;
  const asignado = asignadoTexto === undefined ? null : toCents(asignadoTexto);
  const ejecutado = sumCents(
    gastos.filter((g) => g.rubro.id === gasto.rubro.id && g.estado === "VALIDADO").map((g) => toCents(g.valor)),
  );
  const este = toCents(gasto.valor);
  const supera = pendiente && asignado !== null && excederiaAsignado({ asignado, validado: ejecutado, nuevo: este });
  const queda = asignado === null ? null : asignado - ejecutado - (pendiente ? este : BigInt(0));

  return (
    <section aria-labelledby="validar-gasto-titulo" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[12px] text-ink-600">
          {gasto.numero_documento} · {TIPO_SOPORTE_LABELS[gasto.tipo_soporte]}
        </p>
        <h3
          id="validar-gasto-titulo"
          ref={tituloRef}
          tabIndex={-1}
          className="font-display text-[19px] font-bold text-ink-950 outline-none"
        >
          {gasto.tercero_nombre}
        </h3>
        <p className="text-[13px] text-ink-700">{gasto.descripcion}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {!pendiente && <StatusChip dot={false} tone="neutro">{`Gasto ${ESTADO_TEXTO[gasto.estado]}`}</StatusChip>}
          <AvisosGasto gasto={gasto} conCuentaEn={false} />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Dato termino="Total">
          <b className="font-mono tabular-nums">{monto(gasto.valor)}</b> · {textoIva(gasto)}
        </Dato>
        <Dato termino="Fecha del documento">
          {fechaDia(gasto.fecha_documento)} · cuenta en {gasto.periodo}
        </Dato>
        <Dato termino="Identificación">{identificacion || "Sin identificación"}</Dato>
        {registro && <Dato termino="Registró">{registro}</Dato>}
        {gasto.estado === "RECHAZADO" && gasto.motivo_rechazo && (
          <Dato termino="Motivo del rechazo">{gasto.motivo_rechazo}</Dato>
        )}
      </dl>

      {asignado !== null && (
        <div data-testid="validar-gasto-rubro" className="surface-inner flex flex-col gap-2 p-3">
          <p className="flex items-center gap-1 text-[13px] text-ink-900">
            <b>Rubro {nombreRubro(gasto.rubro)}</b>
            <HelpHint label="Disponible del rubro">{AYUDA_DISPONIBLE}</HelpHint>
          </p>
          <dl className="grid grid-cols-3 gap-2">
            <Dato termino="Asignado">{formatCOP(asignado)}</Dato>
            <Dato termino="Ya ejecutado">{formatCOP(ejecutado)}</Dato>
            <Dato termino={pendiente ? "Este gasto" : "Este gasto (ya contado)"}>{formatCOP(este)}</Dato>
          </dl>
          {pendiente && queda !== null && (
            <p className={cn("text-[13px]", supera ? "font-semibold text-destructivo" : "text-ink-700")}>
              {supera ? "Si lo validas, el rubro queda en " : "Si lo validas, al rubro le quedan "}
              <b className="font-mono tabular-nums">{formatCOP(queda)}</b>
            </p>
          )}
        </div>
      )}

      {supera && (
        <p role="note" className="rounded-inner border border-border bg-panel p-2.5 text-[12.5px] text-ink-800">
          {AVISO_SUPERA_BLOQUEO}
        </p>
      )}

      {pendiente && puedeValidar && !propio ? (
        <AccionesPanelValidacion
          key={gasto.id}
          projectId={proyecto.id}
          gastoId={gasto.id}
          datosIncompletos={gasto.datos_incompletos}
          sinSoporte={gasto.soportes !== undefined && gasto.soportes.length === 0}
          superaAsignado={supera}
          onHecho={onHecho}
        />
      ) : (
        <p className="text-[12.5px] text-ink-600">
          {!pendiente
            ? `Este gasto ya está ${ESTADO_TEXTO[gasto.estado]}.`
            : propio
              ? "No puedes validar un gasto que tú registraste."
              : "Solo consulta: validar o rechazar gastos le corresponde a Gerencia o Administración (y no a quien registró el gasto)."}
        </p>
      )}
    </section>
  );
}

function SoporteGastoPanel({ proyectoId, gasto }: { proyectoId: string; gasto: ProjectExpense }) {
  const [error, setError] = useState<string | null>(null);
  async function abrir(soporteId: string) {
    setError(null);
    try {
      await downloadExpenseSoporte(proyectoId, gasto.id, soporteId);
    } catch (e) {
      setError(errorMessage(e, SOPORTE_ERROR));
    }
  }
  const soportes = gasto.soportes;
  return (
    <aside aria-label="Soporte" className="surface-inner flex min-w-0 flex-col gap-2 p-3">
      <p className="text-[13px] font-semibold text-ink-900">
        {soportes === undefined
          ? "Soporte"
          : soportes.length === 0
            ? "Soporte · sin soporte"
            : `Soporte · ${soportes.length === 1 ? soportes[0].nombre : `${soportes.length} archivos`}`}
      </p>
      {soportes === undefined ? (
        <p className="text-[12.5px] text-ink-600">Sin acceso: tu rol no recibe los soportes de los gastos.</p>
      ) : soportes.length === 0 ? (
        <p className="text-[12.5px] text-ink-600">Sin soporte. Adjunta un soporte para poder validarlo.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {soportes.map((soporte) => (
              <li key={soporte.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="max-w-full"
                  aria-label={`Ver soporte ${soporte.nombre}`}
                  onClick={() => void abrir(soporte.id)}
                >
                  <FileText />
                  <span className="truncate">{soporte.nombre}</span>
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ink-500">
            Los archivos se descargan y los enlaces se abren en otra pestaña. La vista previa dentro del panel aún no
            está disponible.
          </p>
        </>
      )}
      <InlineError message={error} />
    </aside>
  );
}
