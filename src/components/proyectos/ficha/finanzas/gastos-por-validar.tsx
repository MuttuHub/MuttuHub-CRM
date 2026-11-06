// «Gastos por validar · N · $ total» in Finanzas › Resumen (redesign T3, `Finanzas-propuesta`). Lists the project's
// REGISTRADO expenses from the same expenses query the ledger uses: a table on desktop (Gasto, Rubro, Total, Aviso,
// Soporte, Acción) and one card per expense on the phone. «Revisar» opens the «Validar gasto» panel; whoever
// registered the expense reads «Tú lo registraste» instead. With nothing pending, or on error, nothing is shown
// (same as the portfolio queue).

"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/components/proyectos/capture-surface";
import { errorMessage } from "@/components/proyectos/estructura-ui";
import { PROPIO_TEXT } from "@/components/proyectos/gasto-acciones";
import { formatFechaCalendario } from "@/components/proyectos/project-display";
import { InlineError } from "@/components/proyectos/ui";
import {
  downloadExpenseSoporte,
  useProjectExpenses,
  type ProjectExpense,
  type ProjectListRow,
} from "@/hooks/projects";
import { formatCOP, sumCents, toCents } from "@/lib/proyectos/money";
import { AvisosGasto, lineaRegistro, monto, nombreRubro, textoIva, usePermisosGastos } from "./gastos-comun";
import { SOPORTE_ERROR, ValidarGastoPanel } from "./validar-gasto-panel";

type Permisos = ReturnType<typeof usePermisosGastos>;

export function GastosPorValidar({
  proyecto,
  onVerTodos,
}: {
  proyecto: ProjectListRow;
  /** «Ver todos los gastos»: switches to Finanzas › Gastos. Without it the link is not offered. */
  onVerTodos?: () => void;
}) {
  const query = useProjectExpenses(proyecto.id);
  const permisos = usePermisosGastos(proyecto);
  const [revisando, setRevisando] = useState<string | null>(null);
  const seccionRef = useRef<HTMLElement>(null);

  const gastos = query.data?.gastos ?? [];
  const pendientes = gastos.filter((g) => g.estado === "REGISTRADO");
  if (query.isError || pendientes.length === 0) {
    return revisando ? (
      <ValidarGastoPanel
        proyecto={proyecto}
        gastos={gastos}
        gastoId={revisando}
        onSeleccionar={setRevisando}
        onCerrar={() => setRevisando(null)}
        puedeValidar={permisos.puedeValidar}
        usuarioId={permisos.usuarioId}
        nombreDe={permisos.nombreDe}
      />
    ) : null;
  }
  const total = sumCents(pendientes.map((g) => toCents(g.valor)));

  return (
    <section
      ref={seccionRef}
      tabIndex={-1}
      data-testid="gastos-por-validar"
      aria-labelledby="gastos-por-validar-titulo"
      className="flex flex-col gap-2 outline-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="gastos-por-validar-titulo" className="font-display text-[15px] font-bold text-ink-950">
          Gastos por validar · {pendientes.length} · {formatCOP(total)}
        </h3>
        {onVerTodos && (
          <Button type="button" variant="link" className="hidden md:inline-flex" onClick={onVerTodos}>
            Ver todos los gastos
          </Button>
        )}
      </div>
      <ListaPendientes proyecto={proyecto} pendientes={pendientes} permisos={permisos} onRevisar={setRevisando} />
      {onVerTodos && (
        <Button type="button" variant="link" className="self-start md:hidden" onClick={onVerTodos}>
          Ver todos los gastos
        </Button>
      )}
      {revisando && (
        <ValidarGastoPanel
          proyecto={proyecto}
          gastos={gastos}
          gastoId={revisando}
          onSeleccionar={setRevisando}
          onCerrar={() => setRevisando(null)}
          puedeValidar={permisos.puedeValidar}
          usuarioId={permisos.usuarioId}
          nombreDe={permisos.nombreDe}
        />
      )}
    </section>
  );
}

function ListaPendientes({
  proyecto,
  pendientes,
  permisos,
  onRevisar,
}: {
  proyecto: ProjectListRow;
  pendientes: readonly ProjectExpense[];
  permisos: Permisos;
  onRevisar: (id: string) => void;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <ul data-testid="gastos-por-validar-tarjetas" className="flex flex-col gap-2">
        {pendientes.map((gasto) => (
          <li key={gasto.id} data-testid="por-validar-fila" className="surface-inner flex flex-col gap-1.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[14px] font-semibold text-ink-950">{gasto.tercero_nombre}</p>
              <span className="flex shrink-0 flex-col items-end">
                <span className="font-mono text-[13px] font-semibold text-ink-900 tabular-nums">{monto(gasto.valor)}</span>
                <span className="text-[11.5px] text-ink-600">{textoIva(gasto)}</span>
              </span>
            </div>
            <p className="text-[12px] text-ink-600">
              {lineaRegistro(gasto, permisos.nombreDe(gasto.registrado_por_id), formatFechaCalendario(gasto.fecha_documento))}
            </p>
            <p className="text-[12.5px] text-ink-800">Rubro: {nombreRubro(gasto.rubro)}</p>
            <AvisosGasto gasto={gasto} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SoporteEnlace proyectoId={proyecto.id} gasto={gasto} />
              <AccionRevisar gasto={gasto} permisos={permisos} onRevisar={onRevisar} />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="surface overflow-x-auto">
      <Table data-testid="gastos-por-validar-tabla">
        <TableHeader>
          <TableRow>
            <TableHead>Gasto</TableHead>
            <TableHead>Rubro</TableHead>
            <TableHead numeric>Total</TableHead>
            <TableHead>Aviso</TableHead>
            <TableHead>Soporte</TableHead>
            <TableHead>Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendientes.map((gasto) => (
            <TableRow key={gasto.id} data-testid="por-validar-fila">
              <TableCell className="min-w-[200px] align-top whitespace-normal">
                <p className="text-[13px] font-semibold text-ink-950">{gasto.tercero_nombre}</p>
                <p className="text-[12px] text-ink-600">
                  {lineaRegistro(
                    gasto,
                    permisos.nombreDe(gasto.registrado_por_id),
                    formatFechaCalendario(gasto.fecha_documento),
                  )}
                </p>
              </TableCell>
              <TableCell className="align-top whitespace-normal">{nombreRubro(gasto.rubro)}</TableCell>
              <TableCell numeric className="align-top">
                <span className="font-mono font-semibold text-ink-900">{monto(gasto.valor)}</span>
                <span className="block text-[11.5px] text-ink-600">{textoIva(gasto)}</span>
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <AvisosGasto gasto={gasto} />
                {!gasto.alerta_sobregasto && !gasto.periodo_modificado && !gasto.datos_incompletos && (
                  <span className="text-ink-500">—</span>
                )}
              </TableCell>
              <TableCell className="align-top whitespace-normal">
                <SoporteEnlace proyectoId={proyecto.id} gasto={gasto} />
              </TableCell>
              <TableCell className="align-top">
                <AccionRevisar gasto={gasto} permisos={permisos} onRevisar={onRevisar} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** «Revisar» for a manager on someone else's expense; «Tú lo registraste» on one's own; nothing for the rest. */
export function AccionRevisar({
  gasto,
  permisos,
  onRevisar,
}: {
  gasto: ProjectExpense;
  permisos: Pick<Permisos, "puedeValidar" | "usuarioId">;
  onRevisar: (id: string) => void;
}) {
  if (!permisos.puedeValidar || gasto.estado !== "REGISTRADO") return null;
  if (gasto.registrado_por_id === permisos.usuarioId) {
    return <span className="text-[12px] font-semibold text-ink-500">{PROPIO_TEXT}</span>;
  }
  return (
    <Button
      type="button"
      size="sm"
      className="max-md:h-11"
      aria-label={`Revisar el gasto ${gasto.numero_documento} de ${gasto.tercero_nombre}`}
      onClick={() => onRevisar(gasto.id)}
    >
      Revisar
    </Button>
  );
}

/** The support as a link-like button («Factura FV-4007»), «Sin soporte», or «—» without access (RNF-03). */
function SoporteEnlace({ proyectoId, gasto }: { proyectoId: string; gasto: ProjectExpense }) {
  const [error, setError] = useState<string | null>(null);
  if (!gasto.soportes) return <span className="text-ink-500">—</span>;
  if (gasto.soportes.length === 0) return <StatusChip tone="alerta">Sin soporte</StatusChip>;
  const soporte = gasto.soportes[0];
  return (
    <span className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="link"
        className="h-auto min-h-11 px-0 md:min-h-0"
        aria-label={`Ver soporte ${soporte.nombre}`}
        onClick={async () => {
          setError(null);
          try {
            await downloadExpenseSoporte(proyectoId, gasto.id, soporte.id);
          } catch (e) {
            setError(errorMessage(e, SOPORTE_ERROR));
          }
        }}
      >
        <Paperclip />
        <span className="max-w-[160px] truncate">{soporte.nombre}</span>
      </Button>
      {gasto.soportes.length > 1 && (
        <span className="text-[11.5px] text-ink-500">y {gasto.soportes.length - 1} más</span>
      )}
      <InlineError message={error} />
    </span>
  );
}
